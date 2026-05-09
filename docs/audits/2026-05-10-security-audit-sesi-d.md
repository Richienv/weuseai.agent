# Security + Production-Readiness Audit (Sesi D, 2026-05-10)

**Auditor:** Sesi D (autonomous read-only sweep)
**Scope:** weuseai.agent codebase + live production state, pre first-paying-customer onboarding.
**Repo state at audit:** `origin/main` @ `e56b893` (Phase 6-1.a foundation). 858 unit tests passing.
**Methodology:** memory + git + ripgrep + targeted file reads + parallel exploration agents on auth, RLS, webhook signatures, failure modes. No live endpoint testing or destructive ops. No production data accessed.

> **Mandate clause:** findings only — no fixes. Hand-off list at end is for Sesi A.

---

## Executive summary

| Severity | Count | Theme |
|---|---|---|
| **P0** (blocking — exploit possible today) | 3 | Multi-tenant data leak via RLS `USING (true)` + publicly hardcoded anon key |
| **P1** (must fix pre-launch) | 6 | Webhook timing attacks, MVP auth fallback in prod, no refund path, no retry worker, no encryption-key rotation, payment→provisioning races |
| **P2** (nice fix pre-launch) | 7 | Defense-in-depth RLS gaps, idempotency races, watchdog/orphan tracking, smoke-test cleanup |
| **P3** (informational) | 4 | jsonb encryption-at-rest, SQL-level REVOKE on helpers, CORS regex, code logging hygiene |

**Headline:** the codebase is well-organized and the auth primitives that exist (HMAC, JWT-role pattern, pgcrypto for bot tokens) are correctly implemented. **The blast radius is the gap between primitives that exist and surfaces that use them.** Phase 5 schema migrations applied permissive `USING (true)` RLS policies on strategic-data tables — this is documented as "scope enforced at handler layer," but the anon JWT is publicly hardcoded in three landing-page HTML files, so the RLS is the actual gate, and it's wide open. Same root cause as the 2026-05-06 pairing-anon-update incident, just rediscovered on Phase 5 surfaces.

The good news: every P0 has a clean fix path (replace `USING (true)` with a customer-scoped predicate or `USING (false)` and route reads through service-role Edge Functions), and no production exploit is known to have happened yet — the first paying customer hasn't onboarded.

---

## Findings — P0 (blocking)

### P0-1 · Phase 5 strategic-data tables expose ALL customers' data to any anon-key holder

- **Category:** 2 (Data isolation)
- **Locations:**
  - [supabase/migrations/20260510100000_phase_5_master_agent_state.sql:135-151](supabase/migrations/20260510100000_phase_5_master_agent_state.sql) — three policies
  - [supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql:32-37](supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql) — fourth policy
- **Affected tables:** `business_roadmap_state`, `approval_requests`, `department_threads`, `bd_decisions_log`
- **Issue:** All four tables ship `USING (true)` SELECT policies for the `anon` role. The migration comment claims "Per-customer scoping is enforced by the handler that issues the JWT" — but the anon key is **publicly hardcoded** in [onboarding.html:597](onboarding.html), [checkout.html:765](checkout.html), and [welcome.html:189](welcome.html), and the JWT has `exp: 2093043665` (year 2036). Anyone visiting the public landing page can extract it.
- **Reproduction:**
  ```bash
  ANON=$(curl -s https://weuseai-agent.vercel.app/onboarding.html \
    | grep -oE "eyJhbGc[A-Za-z0-9._-]+" | head -1)
  curl -s "https://gtjgsligllbjcisiyrah.supabase.co/rest/v1/approval_requests?select=*" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  ```
  Returns every customer's pending `incorporate` / `contract_sign` / `regulatory_filing` / `public_emission` requests, with `action_payload` jsonb bodies.
- **Impact:** Cross-customer leak of:
  - `approval_requests.action_payload` — incorporation paperwork, contract terms, regulatory filings (BPJS / DJP / PPN), broadcast campaign drafts. Includes legal NPWP, NIB-pending data once a customer onboards.
  - `bd_decisions_log.payload` + `summary` — full strategic decision history (stage transitions, approval outcomes, pivots) for every Studio customer.
  - `business_roadmap_state.notes_md` — free-form founder notes (BD v3 reads/writes via service-role).
  - `department_threads.initiative_summary` — competitive intelligence on every customer's product/sales/legal initiatives.
- **Recommendation:** Replace `USING (true)` with `USING (false)` and route customer reads through service-role Edge Functions that gate on the new HMAC token. The `roadmap-state` and `approval-queue` Edge Functions already exist — wire their `verifyToken` path on by setting `HERMES_INSTANCE_HMAC_KEY` in prod and have them be the only reader. Document the same pattern for any future Phase 6 tables.

---

### P0-2 · `customers` table SELECT-all leaks PII + soul_md_text + pairing_code to any anon

- **Category:** 2 (Data isolation)
- **Locations:**
  - [supabase/migrations/20260506000000_onboarding.sql:48-52](supabase/migrations/20260506000000_onboarding.sql) — `"anon can read own customer onboarding state"` policy with `USING (true)`
  - [supabase/migrations/20260509200000_telegram_bot_per_customer.sql:97](supabase/migrations/20260509200000_telegram_bot_per_customer.sql) — column-level REVOKE on `telegram_bot_token` (the only mitigation)
- **Issue:** Same `USING (true)` pattern on the `customers` table. The only protection is a column-level `REVOKE SELECT (telegram_bot_token) FROM anon`. **Every other column is readable by anyone with the (publicly hardcoded) anon key**: `email`, `display_name`, `whatsapp_number`, `telegram_chat_id`, `telegram_allowed_user_ids`, `pairing_code`, `pairing_code_expires_at`, `soul_md_text`, `telegram_bot_username`, `phase_5_enabled`.
- **Impact:**
  - **PII leak**: customer email + WhatsApp + display name across all customers. UU PDP / Indonesian privacy law exposure.
  - **soul_md_text leak**: this is the customer's full persona contract (per-pelanggan business strategy + tone + restricted topics). Each `soul_md` is up to ~10kB of strategic narrative. Cross-customer leak = full competitive intelligence + bypass of the "private hosting" value proposition.
  - **pairing_code leak**: when active, an unguessed-cid attacker plus a paired Telegram chat could DM the customer's bot with `/pair <leaked_code>` and claim the pairing — but only if the customer hasn't paired yet AND attacker has the bot token (which is encrypted, REVOKE'd from anon). So pairing_code leak is **defended** by the bot-token encryption. Reduced to "code visible until rotated."
  - **phase_5_enabled** + **telegram_bot_username** leak gives competitor intel on Studio-tier customers.
- **Recommendation:** Two layered fixes:
  1. Tighten the SELECT policy to only return rows where `id::text = current_setting('request.jwt.claim.sub', true)` once Phase 2B signed-JWT tokens ship. Until then, narrow the policy to `USING (id = (current_setting('request.headers')::json->>'x-cid')::uuid)` if a cid header pattern is acceptable, OR move all reads to service-role Edge Functions and flip to `USING (false)`.
  2. Add column-level `REVOKE SELECT (soul_md_text, email, whatsapp_number)` on customers from anon as defense-in-depth, mirroring the existing `telegram_bot_token` revoke.

---

### P0-3 · `subscriptions` table SELECT-all leaks tier/billing across customers

- **Category:** 2 (Data isolation)
- **Location:** [supabase/migrations/20260506130000_anon_read_subscription_status.sql:30-35](supabase/migrations/20260506130000_anon_read_subscription_status.sql)
- **Issue:** `"anon_read_own_subscription_status"` uses `USING (true)`. Documented as Phase-2B-revisit ("UUIDs are unguessable, status text is non-sensitive"), but **status is not the only column** — anon can also read `tier`, `xendit_invoice_id`, `next_billing_at`, `hosting_active`, `always_on_enabled`, `started_at` for every subscription.
- **Impact:** Revenue intelligence (count Studio customers, tier distribution, churn signals via `status='canceled'` rows). `xendit_invoice_id` enables xendit-side enumeration. `next_billing_at` lets a competitor time poaching campaigns.
- **Recommendation:** Either tighten to a column-allowlist via per-column REVOKE (status + started_at only — what welcome.html actually polls) OR ship Phase 2B's signed-JWT model now. The migration's own comment flags this as "tighten to signed-JWT in Phase 2B" — that work is overdue.

---

## Findings — P1 (must fix pre-launch)

### P1-1 · Telegram webhook secret-token comparison is timing-unsafe

- **Category:** 1 (Auth + authz)
- **Locations:**
  - [supabase/functions/_shared/telegram-bot-webhook-handler.ts:84](supabase/functions/_shared/telegram-bot-webhook-handler.ts) — `sentToken !== deps.webhookSecret`
  - [supabase/functions/_shared/pair-customer-bot-webhook-handler.ts:71](supabase/functions/_shared/pair-customer-bot-webhook-handler.ts) — same pattern
- **Issue:** Plain `!==` short-circuits on first byte mismatch. A high-precision attacker (e.g., colocated on the same edge POP) could leak the webhook secret one byte at a time via response-time differential.
- **Impact:** Webhook-secret recovery → forge Telegram updates → trigger arbitrary `/pair <code>` from forged chat IDs (limited blast radius because pair flow still requires a live valid pairing_code). On the platform `@weuseaibot` flow, arbitrary chat-id pairing could let an attacker bind their own chat to a victim customer's bot if pairing_code happens to be leaked simultaneously.
- **Recommendation:** Use the existing `constantTimeEqual()` helper from [supabase/functions/_shared/hermes-instance-auth.ts:120-127](supabase/functions/_shared/hermes-instance-auth.ts) (already correctly implemented). The xendit-webhook handler's `safeEqual()` at [supabase/functions/_shared/xendit-webhook-handler.ts:144-149](supabase/functions/_shared/xendit-webhook-handler.ts) is also OK once both sides are length-validated, but length is leaked first; consider rewriting to also use the shared helper.

### P1-2 · Telegram + Xendit webhooks have no replay protection

- **Category:** 1 (Auth + authz)
- **Locations:**
  - [supabase/functions/_shared/telegram-bot-webhook-handler.ts:73-145](supabase/functions/_shared/telegram-bot-webhook-handler.ts) — no `update_id` dedup
  - [supabase/functions/_shared/pair-customer-bot-webhook-handler.ts](supabase/functions/_shared/pair-customer-bot-webhook-handler.ts) — same
- **Issue:** A captured signed Telegram update can be replayed indefinitely. The xendit handler has natural replay protection via invoice-state idempotency (line 53), but Telegram doesn't.
- **Impact:** Replay of a captured `/pair 123456` callback creates duplicate writes / DB churn. Combined with the concurrent-pair race (P2-3), an attacker who captures a pair callback packet could replay-storm to win the race against the legitimate user.
- **Recommendation:** Add an `update_id` dedup table or in-memory bloom filter scoped to recent updates (TTL ~15min). Trivial schema: `(bot_token_hash, update_id, seen_at)` with a unique constraint.

### P1-3 · Phase 5-3.c HMAC verification is opt-in via env, currently UNSET in prod

- **Category:** 1 (Auth + authz)
- **Locations:**
  - [supabase/functions/approval-queue/index.ts:176-180](supabase/functions/approval-queue/index.ts) — verifier wired conditionally on `HERMES_INSTANCE_HMAC_KEY`
  - [supabase/functions/hermes-kanban-proxy/index.ts](supabase/functions/hermes-kanban-proxy/index.ts) — same
  - [supabase/functions/_shared/hermes-kanban-proxy-handler.ts:230-238](supabase/functions/_shared/hermes-kanban-proxy-handler.ts) — fallback when verifier omitted
- **Issue:** Per memory `weuseai_active_dev_state.md` line 110: "HMAC enforcement tested end-to-end on prod (set key → 401 / 201 → unset)". The key was set during smoke test then unset for cost discipline. **Production currently runs in MVP-fallback mode** where the only multi-tenant gate is `customerExists(customer_id)` — i.e., anyone who guesses or enumerates a valid customer UUID can write kanban boards or create approval requests on behalf of any customer.
- **Reproduction:**
  ```bash
  curl -X POST "https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/hermes-kanban-proxy" \
    -H "Authorization: Bearer <any-anon-or-service-bearer>" \
    -H "Content-Type: application/json" \
    -d '{"hermes_version":"v0.13.0","board":{"id":"<uuid>","customer_id":"<known-cid>","title":"x","columns":[],"tasks":{},"created_at":"...","updated_at":"..."}}'
  ```
  With customer UUIDs leakable via P0-2/P0-3, the attacker has both ingredients.
- **Impact:** Kanban-board write spoofing (attacker plants false tasks in a customer's mirrored board → BD v3 reads them at session start → poisoned context). Approval-request creation spoofing (attacker injects fake `incorporate`/`contract_sign` rows that get auto-dispatched to the customer's Telegram).
- **Recommendation:** Make `HERMES_INSTANCE_HMAC_KEY` mandatory in production. Either set it now (the env-gated rollout is conservative but the cost is zero — just a `supabase secrets set`) or remove the fallback path so the function returns 503 when the key is missing. Memory should be updated to reflect "key is set" once landed.

### P1-4 · No Xendit refund integration — paid-but-unprovisioned customers cannot be refunded automatically

- **Category:** 3 (Failure modes)
- **Location:** zero matches for `refund` in `services/payment/` or `supabase/functions/`. The `support_tickets` enum has `'billing_dispute'` ([supabase/migrations/20260510140000_admin_support_tickets.sql:20](supabase/migrations/20260510140000_admin_support_tickets.sql)) but no automation behind it.
- **Issue:** When [supabase/functions/_shared/xendit-webhook-handler.ts:113-126](supabase/functions/_shared/xendit-webhook-handler.ts) hits the `pending_provision` branch (Fly.io down, IDCloudHost rejects, DNS fails), the customer is charged, the webhook returns 200 (correctly, to stop Xendit retries), and the only recourse is a Telegram alert to the founder. There is no `IXenditClient.createRefund` method, no `services/payment/src/xendit-refund.ts`, no admin endpoint for refund-on-failure.
- **Impact:** First paying customer hits a transient provisioning failure → charged → no service → support ticket → manual founder Xendit-dashboard refund → reputation cost. Worse if multiple customers hit at once during an IDCloudHost outage.
- **Recommendation:** Add `IXenditClient.createRefund(invoice_id, amount, reason)` and an admin Edge Function `xendit-refund` (gated by `isServiceRoleCaller`) with a corresponding row in `support_tickets`. Hook into a retry-worker (see P1-5): after N failed retries, auto-trigger refund + close ticket. Surfaces are: charged → provision-fail → escalate to retry → if retry exhausts → refund + tier=canceled + Telegram apology message.

### P1-5 · No retry worker / watchdog for `pending_provision` subscriptions

- **Category:** 3 (Failure modes)
- **Location:** `subscriptions.status = 'pending_provision'` is set in [supabase/functions/_shared/xendit-webhook-handler.ts:113-117](supabase/functions/_shared/xendit-webhook-handler.ts) and [supabase/functions/_shared/complete-onboarding-handler.ts](supabase/functions/_shared/complete-onboarding-handler.ts) but no consumer.
- **Issue:** Subscriptions parked in `pending_provision` depend entirely on manual founder response to the Telegram alert. No SLA-tracked watchdog re-invokes spin-up, no max-retry counter, no auto-escalation. If the founder is asleep / on a flight / Telegram alerts get lost, customer is silently stuck.
- **Impact:** Customer-visible — paid, no service, no recovery. If multiple customers hit at once (e.g., Fly.io outage), founder may not see all alerts.
- **Recommendation:** pg_cron job or scheduled Edge Function (every 5 min) that selects `pending_provision` subscriptions older than 2 minutes and re-invokes `spinUp`, with exponential backoff and a `provision_attempts` counter. After ~6 attempts (~30 min), flip to `failed` + auto-trigger refund (see P1-4) + Telegram-message the customer.

### P1-6 · `BOT_TOKEN_ENC_KEY` has no rotation procedure and is shared across all customers

- **Category:** 4 (Secrets + credentials)
- **Locations:** [supabase/migrations/20260509200000_telegram_bot_per_customer.sql:55-103](supabase/migrations/20260509200000_telegram_bot_per_customer.sql) (helpers); migration comment lines 33-39 acknowledge the gap ("long-term we should migrate to Supabase Vault").
- **Issue:** Single shared symmetric key encrypts every customer's bot token. If the key leaks (ex-employee with prior secret access, Supabase Vault breach, env-var dump in logs), all customer bot tokens are compromised. No documented rotation: rotation requires dump → decrypt with old key → re-encrypt with new key → bulk-UPDATE → flip env var, all coordinated to keep Edge Functions running.
- **Impact:** Single compromise = all customers' bots impersonatable. Indonesian UU PDP rotation expectations not met.
- **Recommendation:** Document a rotation runbook now (even before the first paying customer). Add a `BOT_TOKEN_ENC_KEY_NEXT` env var path in the helpers so the helper attempts decryption with current then NEXT key, allowing rolling rotation. Track in NEXT.md "Phase 6 hardening" alongside the Vault migration.

---

## Findings — P2 (defense-in-depth, pre-launch nice-to-have)

### P2-1 · RLS disabled on financial / audit tables (defense-in-depth gap)

- **Category:** 2 (Data isolation)
- **Tables (per parallel-agent survey):** `customer_openrouter_keys`, `llm_usage_snapshots`, `bundle_pull_attempts_summary`, `customer_persona_audit`, `tier_change_events`, `cleanup_notifications`
- **Issue:** Service-role-only by convention (Edge Functions read/write), but RLS is OFF — if a default-grant change in Supabase or a misconfigured client somehow gets `authenticated` access, these tables are wide open.
- **Recommendation:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all six. Add no policies — RLS-on-with-no-policy means anon/authenticated cannot read; service-role still bypasses. Pure safety net.

### P2-2 · Concurrent `/pair <code>` race (already-paired check before DB write)

- **Category:** 3 (Failure modes)
- **Location:** [supabase/functions/_shared/pair-customer-bot-webhook-handler.ts:101-135](supabase/functions/_shared/pair-customer-bot-webhook-handler.ts) (per parallel-agent finding)
- **Issue:** Already-paired check reads `telegram_chat_id` BEFORE the update. Two concurrent `/pair` requests can both pass the check and both write — last-write-wins. Combined with replay (P1-2), can cause skew.
- **Recommendation:** Conditional update: `UPDATE customers SET telegram_chat_id = $1, ... WHERE id = $cid AND telegram_chat_id IS NULL` then check `rowCount > 0`.

### P2-3 · `customer-tier-bump` does not check VPS readiness before re-provisioning

- **Category:** 3 (Failure modes)
- **Location:** [supabase/functions/_shared/customer-tier-bump-handler.ts:128-137](supabase/functions/_shared/customer-tier-bump-handler.ts) (per parallel-agent finding)
- **Issue:** Skips provisioning if `vps_host` is null but does not check `subscription.status = 'pending_provision'` or `hosting_active = false`. A tier-bump fired during initial provisioning can write a higher tier on a half-ready VPS.
- **Recommendation:** Gate on `subscription.status === 'active' && hosting_active === true` before invoking provisioning client.

### P2-4 · Cloud-init / bundle-pull has no watchdog for hung VPS

- **Category:** 3 (Failure modes)
- **Location:** Hermes install runs on the customer VPS via cloud-init; no health check or timeout reporting back to platform.
- **Issue:** VPS spawned, cloud-init starts, apt-get hangs / disk full / bundle-fetch 5xx → VPS sits idle indefinitely. Customer sees `hosting_active=false` but no diagnostic.
- **Recommendation:** Add a "last-checkin" timestamp via `bundle-pull-record` + a 15-minute watchdog (cron or scheduled function) that flips `vps_instances.status='failed'` with a diagnostic if no checkin received post-spawn. Surfaces a clear failure mode to the retry worker (P1-5).

### P2-5 · Smoke-test floating-IP orphans accumulate (~Rp 40k/month each)

- **Category:** 3 (Failure modes) + 5 (cost-leak tech debt)
- **Location:** [scripts/cleanup-orphan-vms.ts](scripts/cleanup-orphan-vms.ts) (per parallel-agent finding); IDCloudHost API `DELETE /v1/network/ip_addresses` returns 405 (provider gap).
- **Issue:** VM teardown succeeds, IP allocation orphans. Manual dashboard cleanup required. No alert on threshold.
- **Recommendation:** Add a daily cron job that counts orphan IPs and Telegram-alerts the founder when `orphan_count > 5` OR cumulative cost exceeds Rp 100k. Document the manual-dashboard cleanup as a runbook in `docs/troubleshooting.md`.

### P2-6 · Phase 5 jsonb payloads stored unencrypted at rest

- **Category:** 4 (Secrets) + 2 (Data isolation)
- **Tables:** `approval_requests.action_payload`, `bd_decisions_log.payload`, `business_roadmap_state.notes_md`
- **Issue:** Each contains potentially sensitive data (regulatory filings, contract terms, decision rationale, founder notes). Stored as plaintext jsonb. Even with proper RLS (which P0-1 fixes), a Supabase service-role bearer leak or a database backup leak exposes this.
- **Recommendation:** Add pgcrypto helpers `encrypt_payload()` / `decrypt_payload()` mirroring the bot-token pattern, called by the same Edge Functions that own the writes. Lower priority than P0-1 because RLS fix is the dominant gate.

### P2-7 · `complete-onboarding` partial-failure idempotency gaps

- **Category:** 3 (Failure modes)
- **Location:** [supabase/functions/_shared/complete-onboarding-handler.ts:98-217](supabase/functions/_shared/complete-onboarding-handler.ts) (per parallel-agent finding)
- **Issue:** Customer + SOUL.md persisted before provisioning. Provisioning fails post-LLM-key-mint → key revoked → status flipped to pending_provision. Retry path has to re-mint key (idempotent UPSERT on customer_openrouter_keys, OK) but webhook-on-customer-bot is only set on success path — retry doesn't re-create it.
- **Recommendation:** Move the webhook setup outside the success-only branch: idempotent `setWebhook` (Telegram allows re-setting same webhook URL). Add an explicit `customer.onboarding_step` enum so retries pick up exactly where they left off.

---

## Findings — P3 (informational)

### P3-1 · pgcrypto helper functions lack `REVOKE EXECUTE` on anon/authenticated

- **Category:** 2 (Data isolation, defense-in-depth)
- **Location:** [supabase/migrations/20260509200000_telegram_bot_per_customer.sql:55-103](supabase/migrations/20260509200000_telegram_bot_per_customer.sql)
- **Issue:** `encrypt_bot_token` and `decrypt_bot_token` are SECURITY DEFINER but no `REVOKE EXECUTE FROM anon, authenticated`. They require `enc_key` to be passed by caller, so without the secret they're harmless — but defense-in-depth says revoke anyway.
- **Recommendation:** `REVOKE ALL ON FUNCTION encrypt_bot_token(text, text), decrypt_bot_token(text, text) FROM PUBLIC, anon, authenticated;` mirroring the `aggregate_bundle_pull_attempts` pattern.

### P3-2 · CORS regex permits any subdomain matching `weuseai-agent-*.vercel.app`

- **Category:** 1 (Auth + authz)
- **Location:** [supabase/functions/_shared/cors.ts:26-27](supabase/functions/_shared/cors.ts)
- **Issue:** Regex `weuseai-agent(?:-[a-z0-9]+(?:-[a-z0-9-]+)?)?\.vercel\.app` permits subdomains beyond the project's own. Mostly safe because Vercel scopes preview hashes to projects, but a tighter regex anchored on the known org-suffix would be safer.
- **Recommendation:** Anchor to `richies-projects-6f212435` suffix: `weuseai-agent(?:-[a-z0-9]+-richies-projects-6f212435)?\.vercel\.app`.

### P3-3 · Logging in `approval-queue` includes customer_id (debugging-friendly, audit-friendly, no leak)

- **Category:** 4 (Secrets) — informational
- **Location:** [supabase/functions/approval-queue/index.ts:230-234](supabase/functions/approval-queue/index.ts)
- **Issue:** `console.error` logs `approval_id` + `customer_id` on telegram dispatch failure. **This is fine** — UUIDs aren't secrets, this is the right level of detail for debugging. Calling out only because audit demanded a full sweep of console logs.

### P3-4 · `as any` / `@ts-ignore` count is low

- **Category:** 5 (Code quality)
- **Survey result:** 4 hits across `supabase/functions/_shared/*.ts`. Mostly `@ts-ignore` for the `Deno` global declaration in entry files — necessary, harmless. No `as any` workarounds masking type unsafety.
- **Recommendation:** None. Maintain the discipline.

---

## Audit log

| Item | Checked | Method | Time |
|---|---|---|---|
| Memory + project context | yes | Read MEMORY.md, weuseai_active_dev_state.md, feedback_minimize_founder_touch.md, CLAUDE.md | ~5 min |
| Git history (last 50 commits + branches) | yes | `git log --oneline`, `git branch -a`, fast-forward pull from origin/main | ~3 min |
| Edge Function auth gating (21 functions) | yes | Parallel Explore agent + direct read of `admin-auth.ts`, `cors.ts`, `hermes-instance-auth.ts`, two entry points | ~25 min |
| RLS policies (18 migrations) | yes | Parallel Explore agent + direct grep for `USING (true)` + read of 5 migration files | ~20 min |
| Webhook signature verification (3 webhooks) | yes | Parallel Explore agent + direct read of telegram + xendit handlers | ~15 min |
| Production failure modes | yes | Parallel Explore agent traced 6 critical paths | ~20 min |
| Secret leak / credential hygiene | yes | grep for SUPABASE_ANON_KEY, refund, console.log; .gitignore review | ~10 min |
| Code quality (any/ignore counts) | quick scan | grep | ~2 min |
| **Live endpoint testing (curl)** | **NO** | Skipped — read-only audit, did not want to trip rate limits or alerts. P0-1/P1-3 reproductions are described but not executed. | — |
| **Production Supabase Mgmt API queries** | **NO** | Skipped — would have cross-checked applied RLS policies vs. migration files. Migration source is authoritative for this report. | — |
| **Live function logs** | **NO** | Out of scope; would require interactive sampling. | — |
| Total elapsed | — | — | ~100 min |

**What was NOT audited (out of scope or deferred):**

- Frontend XSS surfaces (HTML files, react-via-CDN). Bundle-fetch + CORS already prevent CSRF. A separate frontend audit recommended.
- `services/provisioning/` Express server internals (cloud-init contents, SSH-pivot details). The parallel agent flagged retry-worker and orphan-IP gaps but did not deep-dive provisioning code.
- Hermes upstream (NousResearch/hermes-agent) — explicitly out of scope per CLAUDE.md ("we don't fork").
- Vercel function `/api/admin/observability/customer` — admin auth pattern documented in memory; not deep-read.
- npm dependency CVE scan (`npm audit`) — recommend running before launch.
- Test-suite coverage holes — not a security category but worth a pass before launch.

---

## Hand-off to Sesi A — prioritized fix list

### Immediate (P0 — block first paying customer onboarding)

1. **Replace `USING (true)` on 5 tables.** [supabase/migrations](supabase/migrations) — write migration `20260511000000_rls_tighten_phase_5.sql` that drops the four Phase 5 anon-SELECT policies and the `customers`/`subscriptions` policies, replacing with `USING (false)` (default-deny). Move customer reads to Edge Functions: extend `roadmap-state` / `approval-queue` / add `customer-state` Edge Function for `customers` row reads. Wire `HERMES_INSTANCE_HMAC_KEY` (P1-3 fix) at the same time so the new endpoints have their gate.
2. **Set `HERMES_INSTANCE_HMAC_KEY` in production Supabase secrets** (P1-3). One-line `supabase secrets set HERMES_INSTANCE_HMAC_KEY=<random-64-hex-bytes>` + bump customer VPS Hermes cloud-init template to mint tokens with the matching key. Required for #1 above to hold.
3. **Add column-level REVOKE on customers** for `soul_md_text`, `email`, `whatsapp_number` (P0-2 mitigation while #1 is in flight).

### Pre-launch (P1)

4. Switch Telegram + pair-customer webhook secret comparison to `constantTimeEqual` (P1-1).
5. Add `update_id` dedup table + lookup in Telegram webhooks (P1-2).
6. Implement `IXenditClient.createRefund` + `xendit-refund` admin Edge Function (P1-4).
7. Implement retry-worker for `pending_provision` (P1-5).
8. Document `BOT_TOKEN_ENC_KEY` rotation runbook + add `_NEXT` parallel-decrypt path (P1-6).

### Pre-launch (P2)

9. ENABLE RLS on the 6 financial/audit tables (P2-1).
10. Conditional UPDATE on `/pair` flow (P2-2).
11. Tier-bump VPS-readiness gate (P2-3).
12. Cloud-init watchdog (P2-4).
13. Orphan-IP cron + alert (P2-5).
14. Encrypt Phase 5 jsonb payloads (P2-6).
15. complete-onboarding idempotency cleanup (P2-7).

### Post-launch (P3)

16. REVOKE EXECUTE on pgcrypto helpers (P3-1).
17. Tighten CORS regex (P3-2).

---

## Architectural recommendations (beyond individual findings)

1. **Default-deny RLS pattern.** New tables should ship with `ENABLE ROW LEVEL SECURITY` and zero policies. Any anon/authenticated access must come via explicit Edge Function with explicit auth. The `USING (true)` "scoping enforced at handler layer" pattern is repeatedly being misused — twice now (pairing-anon-update incident in May 6, Phase 5 tables today). Treat `USING (true)` as a code-review red flag, period.

2. **Phase 2B signed-JWT migration is overdue.** Three separate migrations comment "tighten in Phase 2B" with no shipping date. Status polling, subscription reads, customer onboarding state — all depend on it. Consolidate into a single Phase 2B sprint after this audit's P0s land.

3. **Auth surface map.** Add a single source-of-truth table (markdown or schema-doc) listing every table + every endpoint + which auth pattern gates it (HMAC / JWT-role / customer_id-existence / signed-JWT). Useful for future audits and for catching regressions when adding tables.

4. **Refund + retry as platform features, not customer-support workarounds.** Indonesia customers (per CLAUDE.md target audience) will not be patient with manual refund cycles. Building these as first-class platform features is launch-blocking.

---

## Closing

Codebase quality is high — auth primitives are sound, code is well-commented, tests are extensive (858 passing). The audit findings cluster around two themes: **(a) the gap between primitives that exist and surfaces that use them** (HMAC verifier built but not wired in prod; pgcrypto helpers deployed but jsonb left plaintext; constant-time helper available but Telegram comparison still uses `!==`); and **(b) defense-in-depth fragility** (anon key publicly hardcoded → permissive RLS → multi-tenant leak chain).

No P0 finding requires architectural redesign. Each is one migration or one env-var away from resolution. Sesi A can ship #1-#3 from the hand-off list as a single PR and resolve every blocking finding before the first paying customer onboards.

Recommend rerunning this audit as `2026-05-XX-security-audit-sesi-d-pass-2.md` after the P0s land + once first paying customer flow has run end-to-end on production.
