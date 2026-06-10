# Fable 5 system-wide audit — weuseai.agent

**Date:** 2026-06-07 (compiled 2026-06-10)
**Auditor:** Fable 5 (inaugural mission, dual mandate audit + build)
**Method:** Six parallel deep-dive passes (security, architecture/scale, reliability,
customer experience, cost efficiency, code quality) over the full monorepo, with
key findings re-verified by hand against the actual source. Test baseline at audit
time: **2089 tests, 2057 pass, 0 fail, 32 skipped** (`npm test`).

Severity key: **P0** = ship-blocker / money-or-trust loss happening now ·
**P1** = breaks at scale or on a bad day · **P2** = cleanup / hardening.

> Note on scope: a sibling session (PR2) is reworking the landing pricing +
> FOMO component. Landing-page findings below (FOMO counter) are flagged for
> that session / founder, not actioned here.

---

## The one-paragraph version

The platform is genuinely well-built for where it is: strong security gates
(ToS consent, tier-persona enforcement, X-CID isolation), disciplined drift
gates, a robust onboarding state machine, and ~2000 green tests. The weaknesses
are not in the code that exists — they are in the code that *doesn't*: the fleet
is **blind and leaky**. There is no health monitoring after provision, no
founder alerting on silent failures, the 30-day auto-suspend that the entire
unit-economics model rests on **is not implemented**, abandoned/failed VPSes
bill forever, and the LLM proxy can be made to overspend our own key. Separately,
the v1.4 pricing PR shipped new tier slugs to the backend but **left the static
onboarding persona picker on the old `starter/pro/studio` map**, so every live
v1.4 customer is mis-served at the persona step. The three most valuable
investments are: (1) a fleet lifecycle + alerting control plane, (2) fixing the
onboarding tier regression, (3) putting the 2000 tests behind a CI gate.

---

## Top findings (ranked)

| # | Sev | Area | Finding | Evidence |
|---|-----|------|---------|----------|
| 1 | P0 | Cost / Business | **Auto-suspend (30-day inactive) is not implemented.** The "survival mechanism" in CLAUDE.md (Rp 145k → Rp 17k storage-only) exists only as prose. No cron, no Edge Function, no Vultr halt call. Every idle VPS bills $5/mo forever. | No `suspend`/`inactive` lifecycle logic anywhere in `services/` or `supabase/` (only Vultr's `status` enum string). Est. leak: ~$3,000/yr at 50 dormant customers. |
| 2 | P0 | CX / Revenue | **Onboarding persona picker is broken for all v1.4 tiers.** `fetchTier()` accepts only `starter\|pro\|studio` and returns `null` otherwise; `customerTier` then defaults to `'starter'`. A `library-full` buyer (10 personas) sees 3; `bare` (0 personas) is shown 3 and will hit the server's 403 `tier_does_not_grant_persona`. | `onboarding.html:1194` + `:2159` + `TIER_PERSONAS` map `:1028`. No drift gate covers this file's tier map. |
| 3 | P0 | Reliability | **No fleet health monitoring + no founder alerting on silent failures.** Once a VPS is marked `running`, nothing checks it is alive. A dead agent is discovered only by customer complaint. Greeting-send failures, bundle-pull failures, and `notifyVpsReady` failures all log-and-continue with no alert channel. | `complete-onboarding-handler.ts` greeting path (log-only); `bundle-pull-script.ts` exits 0 on every failure; founder Telegram alert wired only for provision-retry exhaustion. |
| 4 | P1 | Cost | **LLM proxy can overspend our key.** Balance gate only checks `<= 0`; the debit is fire-and-forget via `ctx.waitUntil`, so N concurrent requests all pass the gate before any debit lands. No `max_tokens` default cap, no per-customer rate limit. Starter credits are *our* DeepSeek key. | `services/proxy/src/index.ts:67-101`. |
| 5 | P1 | Code quality | **CI does not run the test suite or typecheck.** The ~2000 tests + `typecheck:all` run only locally. CI workflows are post-deploy smoke, manual Fly deploy, and the docker harness — none gate a PR. | `.github/workflows/` (no `npm test` / `tsc` step on push or PR). |
| 6 | P1 | Reliability / Cost | **Failed-provision orphans bill forever.** If Vultr create succeeds but SSH setup fails midway, there is no teardown; the VPS keeps running and billing, and the row can be left mid-state. | `customer-flow.ts` setup path: `status:'running'` only written on success; no `tearDownCustomer` on SSH failure. |
| 7 | P2 | Security | **`/spin-up` `customerId` is unvalidated and flows unescaped into a generated bash script** (JSON heredoc + shell interpolation). Server-controlled today (our UUID, behind `PROVISIONING_AUTH_TOKEN`), so it's defense-in-depth, but UUID validation is cheap insurance against token leak / malformed input. | `spin-up-helpers.ts:38-45`; `bundle-pull-script.ts:131-143`. |
| 8 | P1 | Brand / Honesty | **Landing FOMO counter is fabricated and claims to be real.** `useState(247)` + random decrement, with footer copy "Counter update real-time tiap ada yang sukses bayar". Violates the CLAUDE.md honesty lock ("the counter MUST read a real subscription count"). | `index.html:7554-7614`. **Deferred to the PR2 landing session / founder.** |

---

## 1. Security

**Solid:** Xendit webhook uses constant-time token compare + idempotency; admin
dashboard uses HttpOnly/Secure/SameSite cookie with timing-safe compare; PII
columns (`email`, `whatsapp_number`, `soul_md_text`, bot token) are REVOKE'd from
anon/authenticated and the bot token is encrypted at rest; OpenRouter keys are
stored as hash only; tier-persona enforcement and X-CID gates are correctly
placed. No hardcoded secrets in the repo; the only `eyJ…` in client HTML is the
anon key (correct).

**Findings:**
- **P2 — `/spin-up` input validation.** `parseSpinUpRequest` accepts any
  non-empty string as `customerId` (`spin-up-helpers.ts:38`). It is interpolated
  unescaped into the generated bundle-pull bash (`bundle-pull-script.ts:131-143`,
  a JSON heredoc). In normal flow `customerId` is our own Supabase UUID, so this
  is gated behind `PROVISIONING_AUTH_TOKEN` — defense-in-depth, not an open hole.
  **Fix:** UUID-format check in `parseSpinUpRequest`; JSON-escape values in the
  script. Low effort.
- **P1 — `workflow-execute` does not bind the JWT subject to `customer_id`.** It
  looks up the customer + tier but never checks `auth.uid() === body.customer_id`;
  it relies on the X-CID RLS policy on `customers`. Add an explicit subject check
  for defense-in-depth. (`supabase/functions/workflow-execute/index.ts`.)
- **P2 — `bundle-pull-record` trusts `customer_id` from the body** (service-role
  insert, RLS-bypassing). Today only the VPS posts here; a forged body would
  pollute telemetry for another customer. Add an `x-customer-id` assertion.

**Checked and clean:** RLS X-CID scoping on `customers`; consent_events
append-only RLS; no SQL string-concatenation (all PostgREST); no stack-trace /
secret leakage in the ~10 error paths sampled.

## 2. Architecture & scale

**Solid:** `IVPSProvider` / `IPaymentProvider` ports are respected (no Vultr
calls leaking into business logic); `/spin-up` idempotency checks an existing
VPS row; drift gates keep the 3-way tier-catalog mirror in lockstep; SSH spawns
all have timeouts + SIGKILL fallback.

**Findings:**
- **P1 — N+1 in `retry-pending-provisions`.** One query returns the stale set,
  then per-row `findLatestAttempt` + `buildSpinUpInput` fire individually
  (`retry-pending-provisions-handler.ts`). At a few hundred pending rows this is
  ~1500 queries per 3-min tick. Batch with joins.
- **P1 — Sequential SSH loop in `bundle-version-bump-broadcast`.** `await
  triggerRestart` per customer serializes 5-30s SSH calls; ~20 customers can blow
  the Edge Function timeout. Parallelize with a bounded `Promise.all`.
- **P1 — Missing indexes** for the hot query shapes: `subscriptions(status,
  started_at)` (pending-provision sweep), `provision_retry_attempts(subscription_id,
  attempted_at DESC)`, `vps_instances(provider, vps_id)`. Full-table scans grow
  with the fleet.
- **P1 — Un-gated duplicated constant: `TIER_LLM_LIMIT_CENTS`**
  (`customer-flow.ts`) is a pricing-shaped constant with no drift gate, and the
  `features.voice/web_app` flags in `api/_shared/tier-catalog.ts` are not parity-
  checked against `tier-personas.ts`. Drift = wrong credit budget / wrong feature
  unlock minted silently.
- **P1 — Hermes installer is fetched from upstream `main`, not a pinned commit.**
  Only the *output* version is pinned (`HERMES_VERSION`); an upstream change to
  the installer's CLI flags breaks 100% of new provisions. (`setup-script.ts`.)
- **P2 — Module-level in-flight `Map` for `/refresh-env` assumes a single Fly
  machine.** Correct under `max=1`, races if ever scaled out. Move dedup to a DB
  unique constraint if scale-out is ever needed.
- **P2 — Dead code:** `cloud-init.ts` (IDCH-era) is imported nowhere; archive or
  delete to avoid a new engineer patching the wrong path.

## 3. Reliability (what fails silently)

**Solid:** Xendit webhook idempotency; provision-retry worker with exponential
backoff + exhaustion alert + 24h setup-help email + append-only audit; the
multi-stage readiness probe; `properDeleteWebhook` retry + verify; bot-token
snapshot-before-wipe.

**Findings:**
- **P0 — No post-provision health monitoring; no general founder-alert channel.**
  See top-table #3. Greeting failure, bundle-pull failure, and `notifyVpsReady`
  failure are all log-and-continue. A VPS that dies a week later is invisible
  until the customer complains.
- **P1 — Failed-provision orphan billing** (top-table #6).
- **P1 — Bundle-pull failure is silent per-boot** with no aggregate alert. A
  Storage outage leaves customers' VPSes booting skill-less; only the per-boot
  log records it. Add a cron that alerts on sustained `storage_unavailable`.
- **P1 — Proxy debits on upstream error if `usage` is present**, and passes 5xx
  straight through to the customer with no classification.
- **P2 — Greeting double-send window:** the only de-dupe is the
  `!greeting_sent_at` guard; if `markGreetingSent` fails after a successful send,
  a second finisher can re-greet. Needs a unique constraint / ON CONFLICT.

## 4. Customer experience

**Solid:** the `welcome.html` A–G state machine prevents stuck/backward states;
error copy is localized Bahasa with no jargon and a clean error map; wrong-bot-
token recovery; re-onboarding persona refinement via SOUL.md hash; no banned
brand words or stray exclamation marks found in customer-facing copy.

**Findings:**
- **P0 — v1.4 onboarding persona picker regression** (top-table #2). This is the
  highest-impact CX bug: it mis-serves *every* paying v1.4 customer at the
  persona step and hard-blocks `bare`. Fixed in this mission's PR A.
- **P1 — Capacity-error copy promises auto-retry** ("kami coba lagi setiap 3
  menit"). The retry worker *does* exist (verified — `retry-pending-provisions`),
  so the promise is now honoured; the earlier audit note that it was founder-
  manual is stale. Copy is fine **as long as the cron is actually scheduled** —
  confirm the pg_cron schedule is live.
- **P1 — Invalid LLM key gives a generic error.** `complete-onboarding` returns
  `llm_mint_failed`; onboarding.html has no specific branch, so the customer sees
  "Ada kendala teknis" instead of "check your OpenRouter key". Add a branch.
- **P1 — FOMO counter** (top-table #8) — deferred to the landing session.

## 5. Cost efficiency

**Solid:** balance-checked-before-call on the proxy; atomic `greatest(0, …)`
credit floor; per-customer OpenRouter sub-keys with hard caps; the fleet Groq
key can't be drained by one customer's quota.

**Findings:**
- **P0 — Auto-suspend not implemented** (top-table #1) — the single largest
  recurring leak.
- **P1 — Proxy overspend vectors** (top-table #4): no `max_tokens` cap, no rate
  limit, concurrent-request debit race.
- **P1 — Admin cost monitoring has no delivery.** `admin/cost.html` shows a 70%
  alert, but it is poll-only — no Telegram/email push. A 3am runaway burns
  unnoticed until the founder logs in. Wire alerts to a channel.
- **P1 — STT (Groq Whisper) is unmetered per-customer.** A voice-transcription
  loop on one customer burns the shared fleet key with zero visibility until the
  monthly invoice. `voice-rates.ts` itself notes there is "no seam to count
  minutes per customer."

## 6. Code quality

**Solid:** comprehensive handler-level tests for the critical chain (webhook,
create-invoice, complete-onboarding, bundle-fetch, tier-bump, spin-up); strong
drift-gate culture; clean handler/entrypoint separation.

**Findings:**
- **P1 — No CI test/typecheck gate** (top-table #5).
- **P1 — `as any` on untyped external JSON** at `services/proxy/src/index.ts:89,158`
  (upstream LLM response + usage) and unvalidated `as XenditInvoiceEvent` /
  `as CreateInvoiceBody` casts — runtime shape changes fail silently. Add
  narrow runtime validation.
- **P2 — Onboarding TIER_PERSONAS has no drift gate** (root cause of finding #2).
  Added in PR A.
- **P2 — CLAUDE.md repo-path is stale** (`weuseai.agent/velorah/` — files are at
  repo root). README is correct.
- **P2 — Agent-pack manifest `version` is unchecked** against dir / semver
  ordering.

---

## What this mission actions

| Finding | Action | Where |
|---------|--------|-------|
| #2 onboarding v1.4 regression | **Fixed** — full v1.4 tier map + `fetchTier` + bare empty-state + drift gate | PR A |
| #1 auto-suspend missing | **Built** — Fleet Sentinel lifecycle (idle → suspend → resume) | PR B |
| #3 no health monitoring / alerting | **Built** — Fleet Sentinel health + founder Telegram alerts, deduped | PR B |
| #6 orphan billing | **Built** — Fleet Sentinel flags + reaps failed provisions | PR B |
| #4 proxy overspend | **Fixed** — `max_tokens` cap + no-charge-on-error + size guard | PR B |
| #5 no CI gate | **Recommended** — add `npm test` + `typecheck:all` workflow (founder: needs CI minutes budget call) | see spec |
| #8 FOMO honesty | **Deferred** — landing PR2 session / founder | — |

Everything else above is logged here for the founder's prioritization; none of
it is a same-day fire except where actioned.

---

# Appendix — Mission 2 delta audit (2026-06-10)

Scope per the Mission 2 brief: (a) round-1 findings flagged-not-actioned,
(b) changes on main since 2026-06-07, (c) the dimension round 1
underweighted — **the customer's first 48 hours of actual agent usage**.

## (c) First-48-hours usage — promise sold vs experience delivered

This is the most important finding of Mission 2. Round 1 audited the path TO
a running agent; this pass walked what the agent actually does afterward.

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| U1 | **P0** | **The #1 sold feature — "briefing pagi tiap hari jam 7 WIB" — never delivers what's promised.** The only scheduled job on a customer VPS is a generic 5-headline news cron (`setup-script.ts` "daily-news cron"); the full `morning-briefing-cycle` playbook the SOUL.md + manifest promise is never fired by anything. | `setup-script.ts` gateway-start block (single `hermes cron add`, prompt = daily news); `agent-packs/the-pro/manifest.json` (`"Cron 07:00 WIB default"` is prose, not config) |
| U2 | **P0** | **End-of-day summary (18:00 WIB) never fires at all.** No cron exists; the playbook is installed but unreachable proactively. | no 18:00 cron anywhere in `setup-script.ts` |
| U3 | **P1** | **3 of the-pro's 5 skills are dead code.** `execution: "hermes-skill"` playbooks (morning-briefing-cycle, customer-reply, end-of-day-summary) have no implemented dispatch — `workflow-execute-handler.ts` returns "not implemented in 2E-1" for non-edge-fn handlers. | `workflow-execute-handler.ts:196-215` |
| U4 | **P1** | **The daily-briefing edge skill serves MOCK calendar/email as if real.** `templates_used: mocks/calendar/typical-day.json` — a customer asking "briefing pagi" gets five canned meetings that do not exist. SKILL.md itself admits "masih mock fixture (Phase 2C-2 wires real Gmail/Calendar MCP)". This is fabricated data shown to a paying customer — honesty-lock class. | `daily-briefing-handler/index.ts:60-74`; `the-pro/manifest.json:11-12` |
| U5 | **P1** | **"Ingatan lintas sesi" rests on Hermes defaults.** Zero memory configuration is written to config.yaml at provision; cross-session recall is sold on the landing but not explicitly provisioned. | `setup-script.ts` config blocks (no memory section) |
| U6 | **P1** | Voice tiers can silently fail STT: the voice config block is written even when no STT key is supplied, so a voice note can no-op. | `setup-script.ts:166-173, 254-280` |
| U7 | **P2** | No skill discovery: only `/start` is installed as a meta-skill; there is no `/help`, and playbooks have no documented conversational triggers. | `setup-script.ts` start-skill block |
| U8 | **P2** | done-for-you's `web_app` feature flag has no customer-visible surface at all — paid for, never redeemable. | `tier-personas.ts` features vs (no UI anywhere) |

**What works:** `/start` → SOUL first-contact greeting; the 07:00 news cron
does fire (mechanism proven — `hermes cron add --deliver telegram` works);
conversational skill routing; per-tier bundle install.

**Root cause:** SOUL.md + manifests were written as design intent; the
provisioning layer shipped a thinner product. The cron mechanism works —
it's just pointed at a generic prompt instead of the briefing the customer
was sold.

**Actioned by Mission 2 (Phase 2 build):** U1 is fixed by the Pagi Briefing
build (real 07:00 WIB briefing cron, honest data, personalized at runtime
via SOUL); U2 gets the same rail (18:00 cron). U4's mock-data honesty issue
is mitigated in the new briefing prompt (it never claims calendar/email
data we don't have) — full fix (real connectors or skill retirement) is a
founder roadmap call. U3/U5–U8 are logged for the founder's prioritization.

## (a) Round-1 flagged-not-actioned — status

- **CI gate:** SHIPPED (#228). `test-and-typecheck` runs on every PR + push
  to main; all latent typecheck errors fixed (`typecheck:all` clean for the
  first time). Founder one-minute action: mark it Required in branch
  protection (docs/runbooks/ci-gate.md).
- **FOMO counter honesty:** backend SHIPPED (#229) —
  `/api/public/subscription-count` returns the real active-subscription
  count. Frontend wiring is in the held funnel PR (PR2 conflict surface).
- **checkout v1.4 latent break:** backend SHIPPED (#229) — create-invoice
  accepts canonical slugs at locked v1.4 prices; legacy slugs frozen at
  displayed v1.2 prices (display==charge invariant, pinned by test).
  Frontend flip held until PR2 lands.
- **Fleet Sentinel deploy:** NOT DEPLOYABLE from this session — the
  container has no Supabase Mgmt/Fly/service-role secrets (verified: env is
  empty of them; no CLIs). Runbook is turnkey; founder (or a
  secrets-bearing session) executes. Dry-run report therefore cannot be
  produced honestly from here — the savings math: each suspended idle VPS
  saves ~$5/mo (Vultr vc2-1c-1gb compute) less storage retention; at N
  idle VPSes the projection is N × $5/mo. The sentinel's first dry-run
  tick DMs the actual candidate list.
- **Legacy `starter` price/feature mismatch (new, found this pass):** the
  live legacy checkout sells `starter` at Rp 399k, but the v1.4 alias maps
  starter → voice-starter (sold at Rp 599k) — so today a URL-crafted (or
  organic) legacy purchase gets voice-starter features for 200k less. The
  held funnel PR closes this by retiring legacy slugs from the UI;
  create-invoice keeps honoring them only while the legacy page is live.

## (b) Main since 2026-06-07

Only #227 (round 1), #228, #229 (this mission). PR2 (landing FOMO redesign)
has NOT landed — funnel frontend work is held accordingly.
