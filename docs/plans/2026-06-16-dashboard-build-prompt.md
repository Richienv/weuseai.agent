# Dashboard build prompt — "Chat dengan agent kamu"

> Generated 2026-06-16 by a 10-agent ultracode workflow (6 architects + 3 adversarial critics + synthesis), grounded in the transport spike. Hand this to a fresh Opus 4.8 + ultracode session. Builds DARK behind a flag — not wired to live customers until the throwaway-VPS spike (G1–G6) passes.

# THE PERFECT BUILD PROMPT — "Chat dengan agent kamu" web dashboard

> Hand this to a fresh Opus 4.8 + ultracode session. It is self-contained. Read the cited files before asserting; every path is absolute under `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/`. Do not start coding before reading §2 (THE HARD GATE) and §11 (open decisions) — two forks need a founder answer, but the build proceeds dark regardless.

---

## 1. Goal + one-paragraph architecture

Build a customer-facing, dark-themed, chat-style web dashboard ("chat with your agent") that lets a hosted-Hermes customer talk to *their own* agent in a browser, reusing the exact same DeepSeek-pinned model and the same single minted OpenRouter sub-key the Telegram channel already uses — **no new key, no new budget, never Opus**. The transport is a four-hop relay that never exposes the VPS IP or any key to the browser:

```
browser (chat.html, ?cid=<uuid>, X-CID gate, CORS-locked to our Vercel origin)
  → Supabase Edge Function  agent-chat-relay   (verify_jwt=false; X-CID + active-sub gate; durable per-cid rate/budget; STRIPS `model`; decrypts per-customer API_SERVER_KEY; resolves nothing to the browser)
  → Fly provisioning service  POST /agent-chat  (Bearer PROVISIONING_AUTH_TOKEN; the ONLY hop that can SSH; opens `ssh -N -L <ephemeralPort>:127.0.0.1:8642 <user>@<ip>`; FORCE-PINS `model`; streams SSE back)
  → Hermes API Server on the VPS loopback 127.0.0.1:8642  (OpenAI-compatible; inherits config.yaml model.default = deepseek/deepseek-v4-pro; bills the customer's existing OpenRouter sub-key, same cap as Telegram)
```

The dashboard is a second *door* onto one *room*. The cost surface is unchanged **conditional on both relays neutralizing the request-body `model` field** — the single highest-risk requirement in this build.

---

## 2. THE HARD GATE — read this twice, it gates everything ⛔

**The transport is paper-verified, NOT live-validated.** Nothing in the live repo references `API_SERVER`, port `8642`, or `aiohttp` — this entire transport is net-new and has never run against a real box. Therefore:

> **Every component ships DARK behind a feature flag (default OFF, on BOTH edge and Fly, independent kill-switches). The flag is checked BEFORE authz so a dark route is a 404, not a probe surface. It is NOT wired to a single live customer until a throwaway-VPS spike — run FROM the Fly service itself (it holds the IP-allowlisted Vultr egress; the founder's local egress rotates and is blocked) — records ALL of the following:**

| # | Must measure on a real provisioned box | Pass condition |
|---|---|---|
| **G1** | `:8642` binds | `ss -ltn` shows `127.0.0.1:8642` listening and **nothing** on `0.0.0.0`/public IP. A deliberately-misconfigured `API_SERVER_HOST=0.0.0.0` box trips the provision-time exit-12 assertion. |
| **G2** | SSH user authenticates | `ssh <user>@<ip> -N -L` with the fleet key **actually connects**. Test `weuseai@` FIRST (architecturally correct — no `sudo` needed for a forward); if it fails, fall back to `root@`. **This is unverified today and was missed by 4 specs — the fleet pubkey is in `weuseai`'s authorized_keys (`setup-script.ts:918-925`) but every existing route connects as `root@`.** |
| **G3** | DeepSeek-not-Opus end-to-end | Send `model:"anthropic/claude-opus-4-8"` through the full chain; assert (a) first SSE chunk `model` starts with `deepseek/`, AND (b) the OpenRouter spend delta via `GET /api/v1/keys/{hash}` (`packages/observability/src/llm-cost.ts:208`) matches **DeepSeek pricing, not Opus**. "200 OK" is NOT sufficient — only the billing delta proves routing. |
| **G4** | SSE first-token latency over the SSH forward | Measure p50/p95. Target p95 < ~2.5s. If it misses, ship **buffered** (one env flip, no logic redeploy) and keep streaming behind a sub-flag. |
| **G5** | Tunnel lifecycle on the 256MB box | `N` concurrent masters + `N` SSE pipes fit under 256MB RSS; idle-reap fires; a killed-mid-stream VPS triggers exactly one EPIPE re-establish then fails closed; characterize interaction with Fly `soft_limit=50`. |
| **G6** | Abort-on-disconnect | Close the browser tab mid-generation; assert the VPS stops generating promptly (not run-to-`max_tokens`) — this is a **cost** fail-safe (abandoned streams bill the shared cap). |

**Until G1–G6 are recorded, the build is complete and ready-to-flip, not flipped.** G1, G2, and G3 cannot be satisfied by unit tests; they require the live spike.

---

## 3. Component-by-component build spec

### 3.0 Reconciled cross-component decisions (LOCKED — these resolve every spec/critique mismatch; do not re-litigate)

| Concern | LOCKED decision | Why (critique) |
|---|---|---|
| Edge fn name | **`agent-chat-relay`** | 3 specs voted it; UI's `chat-relay` and edge spec's `customer-chat-relay` are wrong — a name mismatch is a silent 404 → `error-offline`. |
| Fly route | **`POST /agent-chat`** | Component 3's name. |
| Session-mint fn (Phase 2) | **`agent-chat-session`** | Only if §11 fork chooses session tokens. |
| SSH user | **`weuseai@` pending G2; `root@` fallback** | No `sudo` needed for a forward → `weuseai` is least-privilege-correct, but **unverified** against the fleet key. |
| Crypto scheme | **AES-256-GCM via `_shared/integration-credential-crypto.ts`**, column **`api_server_key_cipher jsonb`** (`{ciphertext,iv,auth_tag,key_version}`), secret **`CHAT_KEY_ENCRYPTION_KEY`** (NEW, separate from `INTEGRATION_ENCRYPTION_KEY`), **decrypted at the EDGE** | One scheme, one column, one type, one location. Edge-decrypt keeps the key off Fly (matches the "dumb pipe" pivot). Resolves the 3-way jsonb-vs-text / pgcrypto-vs-AES / edge-vs-Fly split. |
| Rate/budget state | **One durable Postgres table `agent_chat_usage`**, atomic `SECURITY DEFINER` RPC, **authoritative**. Fly in-memory = optional fast-path concurrency only. | Fly `min=1` but a deploy/OOM resets in-memory state → bypassable. Durable is the ceiling. Resolves the 3-table / 3-RPM-default conflict. |
| Day boundary | **`(now() at time zone 'Asia/Jakarta')::date`, computed INSIDE the RPC** | Three specs used `current_date` vs `utc` vs "Jakarta" — pick one, compute server-side, not in app. |
| Auth v1 | **X-CID-only + durable rate/budget as the PRIMARY cap.** Real session token = Phase 2 (§11). | `signCustomerToken` has **no exp** and uses a per-VPS shared key — cannot be made short-lived as specced. Honest position: the chain is cid-as-bearer until real login; rate/budget bounds blast radius. |
| Request wire schema | Browser sends **only** `{ customer_id, messages, stream }`. No `model`, `temperature`, `max_tokens`, `top_p`, `stop`, `n`. | One schema; clamps live server-side only. |
| `persona_slug` source | Relay reads **`customers.agent_slug`** (default `the-pro`), returns it to the UI **as `persona_slug`** in the meta response. | Column is `agent_slug`, not `persona_slug` — name the mapping explicitly or the header renders blank. |
| Body construction | **Explicit field-by-field assignment from validated locals at BOTH hops.** Never spread the client body, never `delete`. | An allowlist-by-picking misses a future OpenRouter key (`provider`/`models`/`route`/`transforms`/`preset`). |
| Logging | **`redactForLog(err)` helper, unit-tested.** `slog` does NOT allowlist. | `structured-log.ts` spreads `fields` raw — "slog with allowlist" is fiction; raw stderr leaks the VPS IP. |

---

### 3.1 Component A — Dashboard UI (`velorah/chat.html`)

**Files:** create `velorah/chat.html` (vanilla JS, sibling to `welcome.html`). Confirm `cleanUrls:true` in `vercel.json` already resolves `/chat` (no change needed for the `?cid=` form). **Also create the entry-point link** — this is net-new and unowned in the specs: add a "Buka chat" button on `welcome.html` state F and on `onboarding.html` completion that constructs `/chat?cid=<uuid>` (grep confirms **no `/chat` link exists today**).

**Build (must-haves):**
- **Vanilla JS only** (the funnel is NOT React — `welcome.html`/`onboarding.html`/`checkout.html` build DOM with template strings + `createElement`). No build step, no npm, no markdown lib. Copy `:root` tokens + font block + `.pill`/`.btn-primary`/`pulseDot` verbatim from `welcome.html:20-31,117-132,195-198`.
- `cid` from `?cid=` (`new URLSearchParams(location.search).get('cid')`).
- **State machine on `body[data-state]`** with a **default branch → `error-offline`** (fail closed, never render a raw upstream message). States + exact Bahasa copy below.
- **Single relay call** (§4 contract). **Never sends `model`.** Code-review grep must return **zero** hits for `ip_address` / `8642` / `api_server_key`.
- **SSE reader** (`response.body.getReader()`, decode `data:` lines, `choices[0].delta.content`, stop on `data:[DONE]`) **+ buffered-JSON fallback** (`application/json` → `choices[0].message.content`). First-token soft (12000ms → patient sub-line) / hard (45000ms → error) timeouts as top-of-file constants.
- **Markdown:** ~40-line **HTML-escape-FIRST, format-SECOND** helper (paragraphs, `**bold**`, inline `` `code` ``, fenced blocks, `- ` bullets). Accumulate raw text in a JS string; re-render the whole bubble from the escaped+formatted string each flush (throttle to animation frames). **Never `innerHTML +=` raw deltas** — agent output is attacker-influenceable via tool results.
- **`PERSONA_META` slug→label map** copied from `onboarding.html:1092-1103` (`the-pro`→"The Pro", etc.), default `the-pro`.
- **Stop-square** (AbortController) to abort a stream — must propagate to the network (the abort is the §A6/G6 cost fail-safe).
- **A11y/mobile:** `100dvh`, `role="log"` + `aria-live="polite"` + `aria-relevant="additions"` (announce per completed message on `[DONE]`, not token-by-token), 44px touch targets, 16px textarea (no iOS zoom), `env(safe-area-inset-bottom)`, `@media (prefers-reduced-motion: reduce)` guard, sticky header + composer, transcript is the only scroll region, auto-scroll only if within ~80px of bottom (else show "↓ pesan baru").
- **Feature flag (client side):** read `chat_enabled` from the meta call; **absence/false/any error = OFF** (default-closed). When OFF: render `flag-off`, **do not render the composer, do not open any stream, do not call the chat endpoint.** `?flag=on` honored **only when `location.hostname === 'localhost'` (exact match — NOT substring `vercel.app`, because the prod apex `weuseai-agent.vercel.app` would match)**, and even then it may only render static states against a hard-coded mock that physically cannot reach `supabase.co`. **Test: `?flag=on` triggers zero network calls.**

**States + copy** (Bahasa, `kamu`, zero `!`, no banned words: basically/just/literally/revolutionary/disrupt/10x/game-changer/next-level):

| State | Trigger | Copy |
|---|---|---|
| `flag-off` | flag off | **Judul** "Chat lagi disiapkan" · **Body** "Fitur chat web masih kami rapikan. Untuk sekarang, agent kamu tetap aktif di Telegram." · CTA "Buka panduan Telegram" |
| `empty` | first visit, reachable | Greeting "Halo, aku agent kamu. Mau mulai dari mana?" + chips "Ringkas dokumen" / "Bantu balas email" / "Rencanakan minggu ini" |
| `sending` | awaiting first token | typing dots |
| `streaming` | tokens arriving | live content; composer shows stop-square |
| `slow` | first token > soft timeout | dots + "Agent kamu lagi mikir, sebentar ya." |
| `error-offline` | 502 / unreachable / 8642 down / **any unrecognized code** | **Judul** "Agent kamu belum bisa dihubungi" · **Body** "Sambungan ke agent kamu lagi terputus. Coba lagi sebentar." · CTA "Coba lagi" |
| `provisioning-not-ready` | **NEW** — relay `not_ready` (VPS still provisioning) | **Judul** "Agent kamu lagi dibangun" · **Body** "Agent kamu belum selesai disiapkan. Kami kabari begitu siap." · CTA "Cek status" |
| `error-suspended` | 409 `vps_suspended` | **Judul** "Agent kamu lagi istirahat" · **Body** "Hosting agent kamu sedang dijeda. Aktifkan lagi dari dashboard untuk lanjut chat." · CTA "Aktifkan agent" |
| `error-rate` | 429 | **Judul** "Sebentar dulu ya" · **Body** "Kamu lagi cepat banget. Tunggu {n} detik sebelum kirim lagi." (read `retry_after_seconds`) |
| `error-budget` | 402 `budget_exceeded` | **Judul** "Kuota chat kamu sudah penuh" · **Body** "Pemakaian agent kamu sudah mencapai batas paket. Tambah kuota atau tunggu siklus berikutnya." · CTA "Lihat paket" (NOTE: copy says "siklus", NOT "bulan ini" — the cap is per-key-lifetime, not monthly) |
| `error-auth` | 403 `x_cid_mismatch` | **Judul** "Tautan ini sudah tidak berlaku" · **Body** "Buka chat lewat tautan terbaru dari halaman setup kamu." · CTA "Ke halaman setup" |
| `reconnect` | stream dropped mid-response (incl. Fly deploy → retryable 503) | keep partial text · **Body** "Sambungan terputus. Lanjutkan?" · CTA "Lanjutkan" (manual re-send) |

> **Budget-code reconciliation (critique fix):** the daily-token-budget trip returns **429 `rate_limited`** (→ `error-rate`), the OpenRouter-cap trip returns **402 `budget_exceeded`** (→ `error-budget`). Two distinct ceilings, two distinct screens, no overlap.

---

### 3.2 Component B — Browser-facing edge relay (`agent-chat-relay`)

**Files:**
```
supabase/functions/agent-chat-relay/index.ts                    # Deno.serve + env/service-role + DI
supabase/functions/_shared/agent-chat-relay-handler.ts          # pure, testable handler (returns Response, for streaming)
supabase/functions/_shared/agent-chat-rate-limiter.ts           # wraps the atomic RPC
supabase/functions/_shared/redact-for-log.ts                    # NEW — tested IP/key/stderr scrubber
supabase/config.toml                                            # add [functions.agent-chat-relay] verify_jwt=false
tests/agent-chat-relay-handler.spec.ts
tests/redact-for-log.spec.ts
```

**Control flow (fail cheapest + most opaque first; resolve crown-jewel LAST):**
1. **CORS preflight** via `handleCors(req)` (reuse `_shared/cors.ts` unchanged; `PROJECT_ORIGIN_RE` already locks `*.vercel.app`; `x-cid` already in `ALLOWED_HEADERS`).
2. **FLAG:** `AGENT_CHAT_ENABLED!=='true'` (and, while dark, `cid ∈ AGENT_CHAT_CID_ALLOWLIST`) → **404** (indistinguishable from no route).
3. **METHOD:** non-POST → 405. (Endpoint is **POST-only** — keep `ALLOWED_METHODS='POST, OPTIONS'`. **The meta call is ALSO a POST** with `{customer_id, meta:true}`, NOT a GET — a GET would fail CORS preflight.)
4. **PARSE+VALIDATE:** bad JSON → 400 `invalid_json`; `customer_id` must match `UUID_RE`; `messages` array len 1..40, each `{role∈{system,user,assistant}, content:string ≤8000}`, total serialized ≤24KB → else 400 `invalid_field`.
5. **X-CID gate:** `x-cid` present AND `=== body.customer_id` → else 403 `x_cid_mismatch`. (The proven gate at `customer-progress-proxy-handler.ts:74` is a plain `!==`; upgrade to `_shared/constant-time-equal.ts` to avoid a UUID-probing timing oracle.)
6. **RATE/BUDGET** (single atomic RPC) → 429 `rate_limited` (+ `retry_after_seconds`, `Retry-After` header) or 402 `budget_exceeded`. **This runs BEFORE the active-sub DB read** (critique: the cheap-DoS shield must not sit behind a DB round-trip). Pre-charge the **clamped `max_tokens`** (worst case), refund on commit — never pre-charge an estimate and commit-actual (fails open on a dropped commit).
7. **ACTIVE-SUB** (single bool, collapsed): customer exists AND subscription active AND a **`status='running'`** VPS row exists. **Distinguish `provisioning` → 503 `not_ready`** (→ `provisioning-not-ready` UI), not 403. Else 403 `not_active`.
8. **RESOLVE (LATE, NARROW):** a **NEW** query — `vps_instances WHERE customer_id=$cid AND status='running' AND api_server_key_cipher IS NOT NULL` single-row. **Do NOT reuse `findActiveVPSByCustomer`** (`refresh-env-supabase-store.ts:48` matches `provisioning` too, orders `limit(1)`, and `maybeSingle()` throws on dupes). 0 rows → 503 `agent_unavailable`; >1 → log `chat.vps_ambiguous`, fail closed. Decrypt `api_server_key_cipher` with `CHAT_KEY_ENCRYPTION_KEY` via `decryptCredential` — wrap so a throw → 502 `upstream_unavailable` (opaque). IP+key live in locals only, fall out of scope at request end, **never logged**.
9. **FORWARD** to Fly: build the body **field-by-field** (`{customer_id, ip_address, api_server_key, messages, stream, max_tokens_ceiling}`) — `model` OMITTED. Wire `req.signal` → Fly fetch `signal`.
10. **RETURN:** `stream:true` → pipe SSE through unbuffered (below); `stream:false` → `await flyRes.json()`, redact `model`, read `usage.total_tokens`, return JSON.
11. **METER:** commit actual tokens (refund the pre-charge delta). **Incomplete-stream metering (critique fix):** on a mid-stream drop there is no `usage` frame — count SSE delta tokens via `tee()` so an early-killed stream is still debited (closes the "kill stream early, repeat" cap-drain).

**SSE passthrough (the latency-critical path):**
```ts
const flyRes = await deps.callFlyRelay(payload, { stream: true, signal: req.signal })
if (!flyRes.ok || !flyRes.body) return jsonError(mapUpstreamStatus(flyRes.status))
const [toClient, toMeter] = flyRes.body.tee()
countSseTokensInBackground(toMeter, cid, deps.rateLimiter)   // fire & forget; abort with req.signal
return withCors(new Response(toClient, { status: 200, headers: {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
}}), req)
```
- **Never `await flyRes.text()` on the stream path** — that is the latency-killing mistake.
- **`tee()` + abort (critique fix):** when `req.signal` aborts, abort BOTH branches and the upstream fetch — the meter branch must not keep the upstream alive after the client leaves (that defeats the cost control the abort exists for).

**Error shaping:** all errors are JSON `{ ok:false, error:"<code>" }` through `withCors`. **NO `detail` field on ANY branch reaching the browser** — the cloned `customer-progress-proxy-handler.ts:103,128` *does* echo `detail`; override to nothing. Test: feed an upstream error body containing an IP and an OpenRouter URL; assert the browser response contains neither, only `{ok:false, error}`. Use `redactForLog` (not raw `slog`) for all internal logging.

---

### 3.3 Component C — Fly tunnel relay (`POST /agent-chat`)

**Files:**
```
services/provisioning/src/routes/agent-chat.ts        # handler owns res (streams SSE)
services/provisioning/src/tunnel/tunnel-pool.ts        # pool keyed by VPS_ID (not IP)
services/provisioning/src/tunnel/tunnel.ts             # ControlMaster master + ephemeral port
services/provisioning/src/tunnel/model-guard.ts        # the Opus guardrail
services/provisioning/src/index.ts                     # register behind AGENT_CHAT_ENABLED, inside the existing Bearer middleware (index.ts:156-163)
tests/agent-chat-handler.spec.ts
tests/agent-chat-model-guard.spec.ts
tests/tunnel-pool.spec.ts
```

**Auth:** inside the existing `PROVISIONING_AUTH_TOKEN` middleware (unauthenticated → 401 before handler). Handler **takes `res` directly** to stream (no precedent — every existing route returns buffered `res.json()`; SSE is net-new Express plumbing: `res.flushHeaders()`, chunked `res.write()`, backpressure on `drain`).

**SSH (clone the tmpfile-key pattern from `restart-hermes.ts:109-150`):**
```
ssh -N -L 127.0.0.1:<ephemeralPort>:127.0.0.1:8642 <user>@<ip>
  -i <0600 tmpfile fleet key in /dev/shm>   # RAM, not disk, on the 256MB box; rm in finally{}
  -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new       # see host-key note below
  -o ConnectTimeout=10
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3   # ADD EXPLICITLY — restart-hermes.ts does NOT have these; a long-lived forward needs keepalive or a middlebox silently drops it mid-stream
  -o ExitOnForwardFailure=yes               # the :8642-bind canary → fast 503, not a hang
  -o ControlMaster=auto -o ControlPath=/dev/shm/weuseai-cm-<vpsIdHash> -o ControlPersist=60
```
- `<user>` = `weuseai` pending **G2**, `root` fallback.
- **Then** `POST http://127.0.0.1:<localPort>/v1/chat/completions` with `Authorization: Bearer <api_server_key>`. **Capture `localPort` as a request-scoped const** — never re-read it from the pool Map (an EPIPE re-establish mutates the Map mid-flight → wrong port). 
- The `try` opens **before** resolution so the tmpfile-`rmSync` `finally` runs even if anything throws before the spawn (no leaked 0600 key on the small box).
- **Wire the inbound request's `close`/`aborted` → an `AbortController` on the outbound 8642 fetch** (G6 — a closed tab must stop generation, else it bills the cap into a dead socket). An aborted stream must NOT trigger EPIPE-reestablish.

**THE OPUS GUARDRAIL (`model-guard.ts`) — force-pin, build the body fresh:**
```ts
export const PINNED_MODEL = 'deepseek/deepseek-v4-pro'   // drift-gate test asserts === setup-script.ts OPENROUTER_DEFAULT_MODEL (imported, not re-typed)
export function buildUpstreamBody(client) {
  return {                                  // explicit assignment ONLY — no spread, no delete
    model: PINNED_MODEL,                     // ALWAYS overwritten; client.model never read
    messages: sanitizeMessages(client.messages),
    stream: client.stream !== false,
    max_tokens: clamp(client.max_tokens, 1, Math.min(client.max_tokens_ceiling ?? MAX_TOKENS_CAP, MAX_TOKENS_CAP)),
    temperature: clampFloat(client.temperature, 0, 2, 0.7),
  }   // nothing else — no provider/models/route/transforms/n/top_p/preset can survive
}
```
- **Defense-in-depth assert** before write: `body.model === PINNED_MODEL` AND `Object.keys(body)` ⊆ allowlist → else 500 (a regression, fail closed).
- **Response-side verification:** inspect the **first** SSE chunk; if `chunk.model` doesn't start with `deepseek/` → abort, 502, emit `pin_violation` telemetry. **Per-frame error interception (critique fix):** scan EVERY frame for an upstream `error` object (OpenRouter error frames leak the provider/config/model slug); on any, abort and emit a single sanitized `data:{"error":"upstream_unavailable"}` + `[DONE]` — never pass an upstream error frame through.
- **Test matrix (all must pass before flip):** `model:"claude-opus-4-8"`, `"openai/gpt-4o"`, `models:["claude-…"]`, `model_override`, `provider`, `route`, `transforms`, `preset`, `model_group`, nested `model` in `messages[].content`, missing `model`, `model:""`, casing tricks → forwarded body has `model:"deepseek/deepseek-v4-pro"` and **key-set EXACTLY equals the allowlist** (so a future passthrough regression fails). Plus: first-chunk non-`deepseek/` echo → 502 `pin_violation`.

**Tunnel pool (256MB box):**
- **Keyed by `vps_id`, NOT IP** (critique: Vultr reuses IPs on teardown → an IP-keyed stale master cross-bleeds a recycled IP into a new customer). `Map<vpsId, {localPort, masterProc, keyDir, refCount, lastUsedAt, controlPath}>`.
- **Evict on teardown** — the teardown/refresh flow signals the pool to kill any master for that `vps_id`.
- **Host key:** `accept-new` + `UserKnownHostsFile=/dev/null` = **zero host-key verification**, a real downgrade for a long-lived bearer-carrying data tunnel. **Recommended:** capture the VPS host key at provision, store it, use a per-VPS `known_hosts` with `StrictHostKeyChecking=yes`. At minimum flag this to the founder.
- Idle-reap every 30s (`refCount===0 && idle>90s` → SIGTERM + rm keyDir/controlPath), belt-and-suspendered by `ControlPersist=60`. EPIPE → evict + re-establish once, then 503.
- SSE heartbeat `: keepalive\n\n` every ~15s (the UI SSE parser must ignore comment frames, not treat them as first content — G4 note).
- **Global concurrency cap `N`** (fail closed → 503 `tunnel_unavailable`); reconcile `N` with Fly **`soft_limit=50`** (each SSE stream holds a request slot — `N` ≤ a fraction of 50).

> **Fly reality (critique correction):** `fly.toml:52-54` is `auto_stop_machines=off`, `min_machines_running=1` — the box is **always-on**, NOT `min=0/max=1` (that's a stale comment at `fly.toml:5-6`). So the SPOF is a **deploy/OOM-kill** (drops all tunnels + in-memory state at once), not auto-stop. `strategy="immediate"` on one machine = a brief total-outage deploy window → a wave of mid-stream retryable 503s → the UI `reconnect` state. Durable rate/budget (Postgres) survives this; in-memory does not.

**Errors:** opaque codes only; **drop `detail` entirely** (the leak originates here where the IP is in scope). Use `redactForLog` — strip IPv4/IPv6 + stderr before logging. **Never** `console.log(req.body)` (it holds the plaintext `api_server_key` + IP) — register a body-redacting Express error handler; CI-grep fails on any `console.log(req.body)`; assert no request-logging middleware is mounted on `/agent-chat`.

---

### 3.4 Component D — VPS-side enablement (provisioning)

**Files:** `services/provisioning/src/setup-script.ts` (env block + assertion), `services/provisioning/src/routes/refresh-env.ts` (`ALLOWED_ENV_KEYS`).

**`.env` additions** (into the existing `WEUSEAI_ENV_EOF` heredoc at `setup-script.ts:1062`, already `chmod 0600` + `chown weuseai`):
```
API_SERVER_ENABLED=true
API_SERVER_KEY=<per-customer random hex, minted+encrypted — see §3.7>
API_SERVER_HOST=127.0.0.1
```
Add a gated `apiServerEnvLines` builder (mirror `telegramEnvLines`/`hmacEnvLines`), emitted **only** when `p.apiServerEnabled && p.apiServerKey` (key-but-no-flag or flag-but-no-key emits nothing — no half-enabled server). `API_SERVER_HOST=127.0.0.1` pins loopback at the source (a future upstream default of `0.0.0.0` on a firewall-less VPS = fleet-wide exposure).

**Provision-time assertion** (new exported `apiServerListenAssertShellBlock()`, wired into step 8 after `${hermesGatewayBlock}`, gated on `hasTelegram && p.apiServerEnabled && p.apiServerKey` — the gateway must be running to bind 8642). Two FATAL checks, before the step-9 `ready` marker:
- **(a) bound at all:** retry ~20s for `ss -ltn | grep '127.0.0.1:8642'`; absent → `log "✗ FATAL"` + `exit 11`.
- **(b) loopback-ONLY:** any `:8642` listener NOT on `127.0.0.1`/`::1` → `exit 12`. **This converts a silent fleet-wide exposure into a loud provision failure — do not ship without exit-12 (G1).**

Add `iproute2` to the step-2 `apt-get install` line (1046) to make `ss` explicit. Exits 11/12 are distinct from existing 5-10 so the SSH-stdout parser attributes failures precisely.

**Existing-VPS path:** add `API_SERVER_ENABLED`, `API_SERVER_KEY`, `API_SERVER_HOST` to `refresh-env.ts ALLOWED_ENV_KEYS` (it refuses unlisted keys). refresh-env already atomically rewrites `.env`, `chmod 600`, restarts `hermes-gateway`, asserts `is-active`. **The bind assertion is NOT in refresh-env** — run the §3.3 `ss` two-check as a separate read-only verification SSH from the rollout tooling *after* the refresh-env 200, and only mark the customer dashboard-enabled if it passes (keeps refresh-env's single responsibility clean).

This touches **no upstream code, no `config.yaml` model shape, no fork** — the gateway reads `.env` at run time (`setup-script.ts:745`).

---

### 3.5 Component E — Security / auth / rollout (cross-cutting)

**Auth chain invariant:** IP + `API_SERVER_KEY` are resolved together at exactly one place (now the **edge**, which decrypts; Fly receives plaintext over the Bearer-auth'd TLS channel), as late+narrow as possible, never logged, never in a response body. Credentials per hop: browser holds only its own `cid` + `X-CID` (cannot forge); `PROVISIONING_AUTH_TOKEN` (edge→Fly) and `FLEET_SSH_PRIVATE_KEY` + per-customer `API_SERVER_KEY` (Fly→VPS) and the OpenRouter sub-key (VPS→LLM) are **never** seen by the browser.

**Migrations:**
```sql
-- <ts>_agent_chat.sql
alter table vps_instances
  add column if not exists api_server_key_cipher jsonb,           -- {ciphertext,iv,auth_tag,key_version}
  add column if not exists api_server_enabled boolean default false;
revoke select (api_server_key_cipher) on vps_instances from anon;  -- defense-in-depth

create table if not exists agent_chat_usage (
  customer_id  uuid primary key references customers(id) on delete cascade,
  window_start timestamptz not null default now(),
  req_count    int  not null default 0,
  jkt_day      date not null default (now() at time zone 'Asia/Jakarta')::date,
  tokens_today bigint not null default 0,
  updated_at   timestamptz not null default now()
);
alter table agent_chat_usage enable row level security;
create policy "agent_chat_usage anon deny" on agent_chat_usage for all to anon using (false) with check (false);

-- atomic check-and-increment; SECURITY DEFINER MUST set search_path (privesc fix)
create or replace function public.agent_chat_rate_check(p_cid uuid, p_est_tokens int)
returns table(allowed boolean, retry_after int, reason text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  -- upsert row; roll 60s window if now-window_start>60s; roll tokens if jkt_day<today
  -- reject if req_count+1>RPM or tokens_today+p_est_tokens>DAILY; else increment; return verdict
end; $$;
```
**Limits** (env-tunable, conservative): **10 req/min**, **concurrent in-flight 1**, **`max_tokens` clamp 2048**, **60k tokens/day** per cid. Fail-closed (DB error → 429, never allow). Durable RPM is authoritative (Fly in-memory is bypassable by restart).

**`redactForLog` (NEW, tested):** strips `ip`/`apiKey`/`Authorization`/key material, strips IPv4/IPv6 + `203.0.113.*`-shaped tokens from any stderr, logs only `{cid, event, exitCode, status}`. Unit test: a sample SSH stderr containing an IP produces a log line with no IP. **This replaces the fictional "slog with allowlist"** — `structured-log.ts` spreads fields raw.

**Rollout (default-OFF everywhere):**
| Var | Where | Default |
|---|---|---|
| `AGENT_CHAT_ENABLED` | edge + Fly (independent) | `false` → 404 |
| `AGENT_CHAT_CID_ALLOWLIST` | edge | empty = deny-all |
| `AGENT_CHAT_ALLOW_ALL` | edge | unset (GA requires explicit `true` so an empty allowlist fails CLOSED) |
| `CHAT_KEY_ENCRYPTION_KEY` | edge/Supabase | unset (64-hex, AES-256-GCM; separate from `INTEGRATION_ENCRYPTION_KEY`) |
| `API_SERVER_ENABLE_DASHBOARD` | provisioning | `false` |

**Top risks (ranked, mitigated):** (1) Fly compromise = crown-jewel — resolve late+narrow, never log, edge-decrypt keeps the key off Fly; (2) `model`→Opus 5× — force-pin both hops + drift-gate + echo + spend-delta GATE; (3) X-CID cross-customer spend — rate/budget is the PRIMARY cap (cid is public); (4) new abuse surface — durable rate/budget day one; (5) IP/key leak — `redactForLog`, no `detail`, per-frame error interception; (6) tunnel cross-bleed — `vps_id`-keyed pool + host-key pin + request-scoped port.

---

### 3.6 Component F — LLM cost / metering

- **Proof of free reuse:** one minted OpenRouter sub-key, written once to the VPS `.env` (4 vars from one key, `setup-script.ts:514-541`), hash-only persisted (`customer-flow.ts:239-244`); the DeepSeek pin is in `config.yaml` (channel-agnostic, hard-validated `setup-script.ts:235-247`); the dashboard hits the **same** Hermes runtime. No new key/budget/provider/Opus — **conditional on the `model`-strip**.
- **Attribution:** add `usage_log.channel` (additive migration); the Fly route writes a `channel='dashboard'` row per completion (`prompt_tokens`/`completion_tokens` from `usage`). `usage_log` is the existing observability read path (`packages/observability/src/fetch.ts`). NOTE: Telegram doesn't write `usage_log` today, so the channel *comparison* needs a separate gateway change — ship the dashboard rows now (incremental cost is the answer to "is the dashboard starving Telegram").
- **Remaining-budget UI:** a NEW X-CID-gated endpoint mirroring `customer-progress-proxy`; service-role resolves `openrouter_key_hash`, calls `fetchOpenRouterUsageCents(hash)` (`llm-cost.ts:208`), caches ~60s, returns **only** `{remaining_pct, remaining_label}` — never the hash/cap/IP/key. **Read the OpenRouter sub-key (`customer_openrouter_keys` + live `data.usage`), NOT the DEAD `credits`/`credit_topups` table** (Cloudflare-proxy-era, replaced by `20260504210000_phase2a_openrouter_keys.sql`).
- **Observability:** extend `deriveLlmCostReport` with `dashboard_cost_usd_cents` (one additive field; the 70% `alert_70` already exists).

---

### 3.7 The orphaned prerequisite NO component owned — ASSIGN IT HERE

**Five specs each punted `API_SERVER_KEY` minting to "another component." It is hereby owned by the provisioning customer-flow.** On a successful VPS spin-up, `customer-flow.ts` must, **transactionally with the `.env` write**:
1. `crypto.randomBytes(32).toString('base64url')` — a **random** per-customer key (NOT a deterministic HMAC; a single `.env` leak must compromise exactly one customer).
2. Pass it as `p.apiServerKey` into the setup-script `.env` heredoc (plaintext over SSH, same trust shape as `telegramBotToken`).
3. `encryptCredential(key, CHAT_KEY_ENCRYPTION_KEY)` → write the cipher to `vps_instances.api_server_key_cipher`, set `api_server_enabled=true` — **only after** the box reaches `running` and the §3.4 bind assertion passed.
4. **Backfill** existing VPSes via the refresh-env path (§3.4) + the post-refresh verification SSH.

The chat relay is **inert until this populates `api_server_key_cipher`** (resolver §B-8 requires `IS NOT NULL`).

---

## 4. Exact end-to-end contracts (zero-seam)

**Hop 1 — browser → edge** `POST ${SUPABASE_URL}/functions/v1/agent-chat-relay`
```
Headers: apikey:<ANON>, Authorization:Bearer <ANON>, X-CID:<cid>, Content-Type:application/json, Accept:text/event-stream
Body:    { "customer_id":"<cid>", "messages":[{"role":"user","content":"…"}], "stream":true }   // NO model/temperature/max_tokens/top_p/stop/n
Meta:    same endpoint, POST { "customer_id":"<cid>", "meta":true }  → { "chat_enabled":bool, "persona_slug":"the-pro", "remaining_pct":number }
Success (stream): 200 text/event-stream, OpenAI delta SSE, terminated by data:[DONE]
Success (buffered): 200 application/json, OpenAI completion (model redacted)
Errors: { "ok":false, "error":"<code>" [,"retry_after_seconds":n] }  — NO detail, ever
Codes→UI: x_cid_mismatch(403)→error-auth · not_active(403)→error-suspended · not_ready(503)→provisioning-not-ready · agent_unavailable/upstream_unavailable(502/503)→error-offline · rate_limited(429)→error-rate · budget_exceeded(402)→error-budget · feature_disabled→404(dark) · default→error-offline
```

**Hop 2 — edge → Fly** `POST ${PROVISIONING_URL}/agent-chat`, `Authorization: Bearer ${PROVISIONING_AUTH_TOKEN}`
```
Body: { "customer_id":"<cid>", "ip_address":"<resolved>", "api_server_key":"<decrypted plaintext>",
        "messages":[…], "stream":true, "max_tokens_ceiling":2048 }   // model OMITTED; Fly force-pins
Success: 200 text/event-stream (passthrough) | application/json (buffered)
Errors:  { "ok":false, "error":"<code>" } — opaque, NO detail, NO ip/key/stderr
```

**Hop 3 — Fly → VPS** `POST http://127.0.0.1:<localPort>/v1/chat/completions`, `Authorization: Bearer <api_server_key>`
```
Body: { "model":"deepseek/deepseek-v4-pro", "messages":[…], "stream":true, "max_tokens":≤2048, "temperature":0..2 }  // built fresh, never spread
Response: OpenAI SSE (data:{chat.completion.chunk}…data:[DONE]) | JSON. Fly inspects every frame (echo + error interception).
```

---

## 5. Phased build plan (smallest shippable vertical slice first)

> Each phase is independently verifiable. Phases 1–4 need **no live VPS** (mock the transport). The live spike is Phase 6. ~5 small additive PRs to a proven transport.

1. **Phase 1 — UI shell + mock relay, no network spend.** Build `chat.html` full state machine against a **mock relay** (a static JSON/SSE fixture served locally). Verify all §3.1 states, streaming render, buffered fallback, markdown escaping, a11y, `?flag=on` localhost-only. Add the `/chat` entry-point links. **Ship-able behind flag-off (renders `flag-off`).**
2. **Phase 2 — Edge relay, buffered only, mocked Fly.** Build `agent-chat-relay` + handler + `redact-for-log` + migrations + `config.toml`. Mock `callFlyRelay`. Verify flag-404, X-CID 403, validation 400s, rate-limit 429 (durable RPC), budget 402, `not_ready` vs `not_active`, **no `model`/`detail`/IP in any output**. `curl`-driven, no UI.
3. **Phase 3 — Fly route, force-pin + buffered passthrough, mocked 8642.** Build `/agent-chat` + `model-guard` against an **echo mock** of the Hermes API server. Run the full §3.3 model-strip test matrix. **No pool, no streaming yet** — buffered only. This is the cost-guardrail proof in CI.
4. **Phase 4 — wire UI→edge→Fly→mock, buffered, one allowlisted cid.** End-to-end through all three hops against the 8642 mock. Prove flag + X-CID + force-pin + the wire contracts with zero live infra.
5. **Phase 5 — streaming + pool + abort.** Add SSE passthrough (both hops), `tee()` metering, `vps_id`-keyed pool, EPIPE re-establish, heartbeats, `req.signal`→outbound abort. Verify against a streaming 8642 mock. Add VPS-side §3.4 setup-script changes + §3.7 minting (still flag-off → no real provision touched).
6. **Phase 6 — the live spike (THE HARD GATE).** Provision ONE throwaway VPS from the Fly service. Record G1–G6 (§2): bind+loopback (exit-12), `weuseai@` SSH (G2), DeepSeek-not-Opus by **billing delta** (G3), SSE p50/p95 (G4 → streaming-vs-buffered decision), 256MB headroom + reap + EPIPE (G5), tab-close abort (G6). Tear down.
7. **Phase 7 — flag-flip, allowlisted.** `AGENT_CHAT_ENABLED=true` on Fly + edge, `AGENT_CHAT_CID_ALLOWLIST=<founder cid>`. Validate against the founder's real box. Widen one or two friendly customers; watch `agent_chat_usage` + `customer_llm_cost`. GA = explicit `AGENT_CHAT_ALLOW_ALL=true`.

---

## 6. Test + verification plan

**Unit / mocked (now, no VPS):**
- Model-guard matrix (§3.3) — every smuggle case → forwarded `model:"deepseek/deepseek-v4-pro"` and **key-set exactly equals the allowlist**.
- Drift-gate: `PINNED_MODEL === OPENROUTER_DEFAULT_MODEL` (imported from `setup-script.ts:190`, not re-typed).
- X-CID: header ≠ body → **403 `x_cid_mismatch`**; constant-time compare.
- Rate limit: 11th req in 60s → **429 `rate_limited`** + `retry_after_seconds`; daily token over → 429; OpenRouter cap → **402 `budget_exceeded`**. Fail-closed: DB error → 429.
- **No-leak:** upstream error body with an IP + OpenRouter URL → browser response contains neither, only `{ok:false, error}`; `redactForLog` test scrubs an IP from sample SSH stderr.
- `?flag=on` → **zero network calls**; honored only on `hostname==='localhost'`.
- Incomplete-stream metering: kill stream early → tokens still debited.
- Buffered fallback renders; default error branch → `error-offline`.
- Provision-time: exit-11 (not bound) and exit-12 (non-loopback) trip on the right `ss` outputs.
- `tee()` + abort: `req.signal` aborts → upstream fetch aborted (no orphaned generation).
- Tunnel pool: reuse, idle-reap, EPIPE re-establish-once-then-503, `vps_id`-keying, request-scoped port.
- `SECURITY DEFINER` RPC has `SET search_path`.

**Requires the live VPS (Phase 6 only — cannot be faked):**
- **G3 DeepSeek-not-Opus:** OpenRouter spend delta matches DeepSeek pricing after an Opus-smuggle attempt (the echo check is necessary-but-not-sufficient; billing is the truth).
- **G1** loopback-only bind; **G2** `weuseai@` SSH; **G4** first-token p50/p95; **G5** 256MB headroom; **G6** tab-close stops generation.

---

## 7. Open decisions for the founder (genuine forks — build proceeds dark either way)

1. **Auth: X-CID-only (v1) vs minted session token.** *Recommend X-CID-only for v1*, with durable rate/budget as the PRIMARY cap (honest: the chain is cid-as-bearer until real login; the rate/budget bounds blast radius). The specs' "reuse `signCustomerToken`" is **impossible** — it has no exp and uses a per-VPS shared key. A real exp-bearing `agent-chat-session` (new signer, Supabase-only `CHAT_SESSION_HMAC_KEY`, 15-min TTL, `sessionStorage`) is the recommended **Phase 2** — build `chat.html` to read `sessionStorage` first, X-CID fallback, so flipping needs no frontend rewrite.
2. **Streaming vs buffer-first.** *Recommend: ship streaming if G4 p95 < ~2.5s, else buffered* — both paths built; the switch is an env flip (`AGENT_CHAT_STREAM_MODE=buffer`), no logic redeploy.
3. **Enable on existing VPSes vs new-only.** *Recommend new-only for the dark/allowlist phase* (zero blast radius); backfill existing boxes via refresh-env + verification SSH only at wider rollout (a restart is a ~2s Telegram blip — schedule off-peak WIB).
4. **SSH host-key pinning.** *Recommend pinning* (capture host key at provision, per-VPS `known_hosts`, `StrictHostKeyChecking=yes`) instead of `UserKnownHostsFile=/dev/null` — the latter gives zero verification on a long-lived bearer tunnel and is unsafe under Vultr IP reuse. If deferred, must be a tracked follow-up.
5. **Second Fly machine for GA.** The box is `min=1` single-machine, `strategy="immediate"` → a deploy is a brief total outage. *Recommend evaluating a 2nd machine before GA* (changes the 256MB single-box cost story) — irrelevant while dark.

---

## 8. Constraints + non-goals

- **No fork** of upstream Hermes — config/env/middleware only. **No `config.yaml` model-shape change.** **No new npm packages/frameworks without a founder sign-off** (no React-via-CDN, no markdown lib — vanilla JS + a ~40-line escape helper; Web Crypto is built-in).
- **Brand voice:** Bahasa Indonesia, `kamu`, calm-premium, **zero exclamation marks** in body, dark theme (`#0a0a0a` / `#f5f5f5` / signal-red `#E5322D`), Inter + Instrument Serif. **Banned:** basically/just/literally/revolutionary/disrupt/10x/game-changer/next-level. Run the brand-string check.
- **DeepSeek, never Opus** — the relay must strip/force-pin `model` at **both** hops; the VPS-side default stays DeepSeek regardless.
- **Never expose the VPS IP or any key to the browser** — grep `chat.html` for `ip_address`/`8642`/`api_server_key` must return zero; no `detail` in any browser error; `redactForLog` everywhere; never `console.log(req.body)` on Fly.
- **Do NOT go live** until the throwaway-VPS spike records G1–G6. Build it ready-to-flip, **not flipped**.
- **Out of scope (named, not built here):** real Supabase Auth/login; cross-channel Telegram metering (needs a separate gateway `usage_log` write); dropping the dead `credits`/`credit_topups` tables (separate cleanup PR).

**Key files to read before coding (all under `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/`):** `welcome.html` (tokens/CID/X-CID 1707-1717), `onboarding.html:1092-1103` (PERSONA_META), `vercel.json`, `supabase/functions/_shared/{cors.ts,customer-progress-proxy-handler.ts:74/103/128,integration-credential-crypto.ts,constant-time-equal.ts,structured-log.ts,hermes-instance-auth.ts}`, `supabase/config.toml`, `services/provisioning/{fly.toml:52-54,src/index.ts:156-163,src/routes/restart-hermes.ts:109-150,src/routes/tier-bump.ts,src/ssh/exec-ssh-provisioner.ts:44-45,src/setup-script.ts:190/235-247/514-541/745/918-925/1046/1062,src/stores/refresh-env-supabase-store.ts:48,src/routes/refresh-env.ts:68}`, `packages/observability/src/llm-cost.ts:208`, migrations `20260504210000`/`20260514*`/`20260518000000`/`20260614010000`.