# Security Audit — Pass 3 (Sesi D, 2026-05-13)

**Auditor:** Sesi D (autonomous read-only sweep, follow-up to pass-2).
**Scope:** new surface area shipped since pass-2 (PRs #69, #80–#87): ToS consent, multi-persona MVP, real-time progress streaming, Resend transactional emails, restart-hermes route, Docker test harness.
**Repo state at audit:** `origin/main` @ `4bed233` (post-#87 Docker harness).
**Methodology:** memory + git + targeted file reads. No live endpoint testing, no production access, no code changes.

> **Charter clause:** "If P0 found, ping founder immediately, halt other cascades." — **1 P0 found below**. The customer onboarding flow ships ToS-acceptance only as client-side localStorage — no server-side audit trail — which fails UU PDP record-keeping requirements and leaves the founder exposed to payment-processor disputes.

---

## Executive summary

| Severity | Count | Theme |
|---|---|---|
| **P0** (blocking, fix before launch) | **1** | ToS-acceptance is localStorage-only — never transmitted to server, never persisted, never available for legal record. UU PDP + Xendit dispute exposure. |
| **P1** (must fix pre-launch) | 2 | (a) bundle-fetch handler does NOT enforce tier-personas → Starter customer can download Studio-tier persona bundles (IP / prompt leakage). (b) customer-progress-proxy + customer-readiness lack X-CID enforcement → cross-customer VPS-info leak to any anon+cid holder. |
| **P2** (defense-in-depth) | 2 | progress_lines forwarded raw from setup-script log; `customer_not_found` 404 leaks customer existence vs constant-time response. |
| **P3** (informational) | 3 | setup-script-harness workflow missing explicit `permissions: contents: read`; marketing opt-in client-side-only (mirrors P0 root cause); SSH tmpfile lifetime. |

**Pass-2 fixes verification:**

- ✅ Phase 6 RLS `USING (false)` policies still live (`pg_policy` shape unchanged in migrations).
- ✅ Drift test (`tests/rls-anti-pattern-drift.spec.ts`) still in place — the new Phase 6 migration `20260512080000_bundle_version_broadcasts.sql` (added by PR #81) was checked and contains no `USING (true)` on customer-scoped tables; the gate would have caught it if it had.
- ✅ `api/_shared/timing-safe-bearer.ts` still in use across the 4 callsites; PR #80–#87 did not add any new `api/admin/*` or `api/nightly-cleanup.ts` endpoints, so no regression on the timing-safe gate.

**Headline:** the pass-2 RLS fixes hold, but the new surfaces (consent capture, progress streaming, tier-based persona access) re-introduce trust assumptions that bypass the RLS layer. The pattern is consistent with the original pass-1 "primitives exist but surfaces don't use them" diagnosis — X-CID is now enforced on the `customers` and `subscriptions` tables but ignored on the new Edge Functions that proxy customer-scoped reads. Same root cause, new instances.

---

## Findings — P0 (ping immediately)

### P0-PASS3-1 · ToS-acceptance stored client-side only — no server-side audit trail

- **Category:** consent / legal compliance.
- **Locations:**
  - [checkout.html:614–626](checkout.html) — checkbox UI markup with `required` attribute and JS validation
  - [checkout.html:994–1009](checkout.html) — client-side ToS validation block
  - [checkout.html:1028–1037](checkout.html) — `localStorage.setItem('onboarding_accept_tos_at', ...)` and `onboarding_accept_marketing` write
  - [checkout.html:1037–1052](checkout.html) — `create-invoice` POST body that **omits** the consent flag
  - [supabase/functions/_shared/create-invoice-handler.ts:21–28](supabase/functions/_shared/create-invoice-handler.ts) — `CreateInvoiceBody` type has no `tosAcceptedAt` / `marketingOptIn` field
- **Issue:** PR #80 ships a ToS-acceptance checkbox at checkout (`<input type="checkbox" id="acceptTos" required>`). On submit, the client validates the box, stamps `localStorage.setItem('onboarding_accept_tos_at', new Date().toISOString())`, then POSTs to `create-invoice` — but the consent flag is **NEVER sent to the server**. No DB column exists for it. No audit trail. The comment at [checkout.html:1031–1035](checkout.html) is explicit: *"Backend create-invoice does not yet read these; storing here means future Resend marketing pipeline can pick the consent flag without a schema migration."*
- **Reproduction:**
  ```bash
  # 1. Visit https://weuseai-agent.vercel.app/checkout
  # 2. Open DevTools → Sources → checkout.html → set breakpoint at line 1000
  # 3. Skip the ToS check by stepping over `if (!tosInp.checked)`
  # 4. Submit form → Xendit invoice created, customer pays, no consent record
  # OR
  # 1. Same flow, accept ToS
  # 2. Clear localStorage / use different browser for support contact
  # 3. Customer can plausibly deny they ever accepted (no record)
  ```
- **Impact:**
  - **UU PDP non-compliance**: Indonesian Personal Data Protection Law (UU 27/2022) Article 22(1) requires data controllers to demonstrate the data subject's consent. localStorage is customer-controllable + ephemeral + not transmittable; it's not a record.
  - **Xendit dispute risk**: chargebacks and refund disputes routinely require evidence of customer ToS acceptance. The founder has none.
  - **Marketing opt-in**: same root cause. `localStorage.setItem('onboarding_accept_marketing', acceptMarketing ? '1' : '0')` — never reaches the server, can't be revoked across devices, can't be honored in Resend marketing pipeline (which the comment claims to be the future use case, but the data isn't there to be picked up).
  - **Reputation cost**: first paying customer who disputes "I never agreed to that" wins by default.
- **Recommendation:** Sesi A fix cascade should land before any further paying-customer onboarding:
  1. **Schema migration**: add `customers.tos_accepted_at timestamptz` and `customers.marketing_opt_in boolean default false` (or, more auditably, a separate `consent_events` append-only table keyed on customer_id with `kind`, `accepted_at`, `ip_address`, `user_agent`, `policy_version`).
  2. **Schema**: extend `CreateInvoiceBody` with required `tosAcceptedAt: string` and optional `marketingOptIn: boolean`. Server-side validate `tosAcceptedAt` is parseable + within 1h of `now()`.
  3. **Server-side enforcement**: `create-invoice` MUST reject requests where `tosAcceptedAt` is missing — return 400 with a clear error. This closes the DevTools bypass.
  4. **Persist on customer insert/update**: `db.insertCustomer` writes `tos_accepted_at` + `marketing_opt_in` to the customers row.
  5. **Audit doc update**: link the consent column from `/terms` and `/privacy` pages so customers can verify their own record (via the future X-CID-scoped customer-state Edge Function).
- **Severity rationale:** P0 because (a) it's a regulatory compliance gap that activates the moment Indonesian customers onboard; (b) it's not gated by any other surface — the moment a customer hits "pay", the gap is real; (c) the fix is well-scoped (one migration + one schema field + one validation line). This is exactly the "fix before first paying customer" threshold pass-2 used.

---

## Findings — P1 (must fix pre-launch)

### P1-PASS3-1 · `bundle-fetch` handler does NOT enforce tier-based persona access

- **Category:** authorization / tier privilege escalation.
- **Locations:**
  - [supabase/functions/_shared/bundle-fetch-handler.ts:107–197](supabase/functions/_shared/bundle-fetch-handler.ts) — handler body
  - [supabase/functions/_shared/tier-personas.ts:30–60](supabase/functions/_shared/tier-personas.ts) — TIER_PERSONAS map (defines the constraint)
  - [supabase/functions/bundle-fetch/index.ts:60–75](supabase/functions/bundle-fetch/index.ts) — entry-point auth check (subscription must be `active`)
- **Issue:** The handler validates `agent_slug` is in `KNOWN_PERSONA_SLUGS` (catches typos) and resolves the customer's tier via `customerLookup` — but never cross-checks `agent_slug` against `personasForTier(customer.tier)`. Any customer with an active subscription at ANY tier can request a signed URL for ANY persona bundle, including Studio-only `web-app-builder` and `business-agent`.
- **Reproduction:**
  ```bash
  ANON=$(curl -s https://weuseai-agent.vercel.app/onboarding.html \
    | grep -oE 'eyJhbGc[A-Za-z0-9._-]+' | head -1)
  
  # Sign up as Starter customer (Rp 399k). Get their cid.
  # Then:
  curl -X POST "https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/bundle-fetch" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"<starter-cid>","agent_slug":"web-app-builder"}'
  # → returns signed URL for bundles/web-app-builder/1.0.0.tar.gz
  # Bundle contains SKILL.md (the actual prompt instructions).
  # Repeat for business-agent, deep-researcher, trade-pro, etc. — get the full Studio library for Rp 399k.
  ```
- **Impact:**
  - **IP/prompt content leak**: SKILL.md files are the product. Studio tier costs Rp 5.9M ($380); Starter is Rp 399k ($26). A Starter customer (or competitor signing up as Starter) can download the full Studio prompt library — the actual intellectual property.
  - **Tier-revenue protection bypass**: the entire tier model exists to differentiate value. Bundle-fetch is the choke point and it isn't checking.
  - **Defense layers that exist but don't catch this**:
    - VPS-side `bundle-pull-script.ts` only iterates `WEUSEAI_AGENT_SLUGS` (set by setup-script based on `subscription.tier`) → bundle-pull on the VPS won't request out-of-tier slugs. **But the attacker doesn't need the VPS — they can `curl` the Edge Function directly.**
    - Tier-filter inside the bundle (`apply_tier_filter` Python block) only filters which SKILLs inside the bundle get installed, AFTER the bundle is already downloaded. It does NOT gate the download.
- **Recommendation:** Add a single check in `bundleFetchHandler`, right after `customerLookup` succeeds:
  ```ts
  import { personasForTier } from './tier-personas.ts'
  // ...
  const allowed = personasForTier(customer.tier)
  if (!allowed.includes(input.agent_slug)) {
    return {
      ok: false,
      status: 403,
      error: 'agent_slug_not_in_tier',
      detail: `customer tier "${customer.tier}" does not include "${input.agent_slug}"`,
    }
  }
  ```
  This is a 6-line fix. Test coverage: extend `tests/bundle-fetch-handler.spec.ts` with one Starter-requesting-Studio-slug fixture asserting 403.
- **Severity rationale:** P1 (not P0) because (a) exploit requires an active paid subscription — the floor is ~Rp 399k per attack instance; (b) the leaked content is product (SKILL.md), not customer PII — so the threat is competitive intel + revenue loss, not data-breach disclosure. Should still ship before launch because the tier model is the founder's revenue moat.

---

### P1-PASS3-2 · `customer-progress-proxy` (and `customer-readiness`) lack X-CID enforcement — cross-customer VPS info leak

- **Category:** authorization / cross-customer info leak.
- **Locations:**
  - [supabase/functions/_shared/customer-progress-proxy-handler.ts:42–58](supabase/functions/_shared/customer-progress-proxy-handler.ts) — `customer_id` from input body, `customerExists` via service-role (RLS-bypassing)
  - [supabase/functions/customer-progress-proxy/index.ts:43–53](supabase/functions/customer-progress-proxy/index.ts) — `customerExists` uses `.from('customers').select('id').eq('id', customerId)` with the service-role client
  - [supabase/functions/customer-readiness/index.ts](supabase/functions/customer-readiness/index.ts) — same pattern (anon-callable, customer_id from body, validated via service-role lookup that bypasses RLS)
  - [welcome.html:894–907](welcome.html) — sends `X-CID: cid` header *and* `customer_id: cid` body
- **Issue:** Pass-1 P0-2 established `X-CID` as the cross-customer-access gate on PostgREST direct reads. The new progress-proxy and readiness Edge Functions accept `X-CID` from welcome.html but never validate it. They look up the customer via `customer_id` in the request body using a service-role client — which bypasses RLS entirely. **Anyone with the publicly-hardcoded anon JWT + any cid can poll any customer's VPS progress** (including `ip_address`, `vps_id`, last 10 lines of `/var/log/weuseai-setup.log`, and heartbeat timing).
- **Reproduction:**
  ```bash
  ANON=$(curl -s https://weuseai-agent.vercel.app/onboarding.html \
    | grep -oE 'eyJhbGc[A-Za-z0-9._-]+' | head -1)
  curl -X POST "https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/customer-progress-proxy" \
    -H "Authorization: Bearer $ANON" \
    -H "X-CID: WRONG-CID-OR-OMITTED" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"<known-target-cid>"}'
  # → returns {ip_address, vps_id, progress_lines: [...], inferred_stage, heartbeat_age_sec}
  # The X-CID header value is irrelevant; the body wins.
  ```
- **Impact:**
  - **VPS IP leak**: `ip_address` is the customer's VPS public IP. Combined with the SSH port (default 22) being open during provisioning, an attacker can begin probing. Customer SSH keys are managed (fleet key); attacker can't easily SSH in, but reconnaissance is now trivial.
  - **VPS UUID + provisioning state leak**: internal infrastructure IDs leaked.
  - **Setup log leak**: last 10 non-empty lines of `/var/log/weuseai-setup.log` are forwarded raw. Contents typically benign (apt-get status, install exit codes), but error messages can include paths, package versions, and occasionally hostnames. P2 amplifier finding below.
  - **Threat model gap**: the cid is a 128-bit UUID, unguessable by brute force, but it leaks via browser history (URL contains `?cid=`), referer headers, support-ticket screenshots, localStorage cached on shared devices. The cid functions as a long-lived bearer token — pass-2 P0-2 noted Phase 2B signed-JWT will replace this; until that ships, this proxy expands the cid-as-bearer attack surface from "read subscription status" to "read VPS internal state."
- **Recommendation:** two-layer fix:
  1. **Validate X-CID matches request body** at the proxy entry — if `req.headers.get('x-cid') !== customer_id`, return 400. This makes the cid an explicit credential the caller has to assert in both places, closing the "I just need the body cid" attack.
  2. **Long-term**: replace cid-as-bearer with a short-lived signed token (the long-promised Phase 2B JWT). Welcome.html mints the token after successful payment confirmation; progress-proxy validates the JWT signature instead of trusting the cid.
- **Severity rationale:** P1 (not P0) because (a) the cid is still unguessable, so opportunistic enumeration doesn't work; (b) the leak is VPS-state metadata, not customer PII; (c) the broader fix (signed-JWT) is already on the Phase 2B roadmap. But it's a P1, not P2, because the new surface area significantly expands what the cid grants access to — a cid leak in support tickets is now a much bigger deal than before pass-3.

---

## Findings — P2 (defense-in-depth)

### P2-PASS3-1 · `progress_lines` forwarded raw — minor info leak amplifier

- **Category:** info leak.
- **Locations:**
  - [services/provisioning/src/routes/customer-progress.ts](services/provisioning/src/routes/customer-progress.ts) — reads last 10 lines of `/var/log/weuseai-setup.log` via SSH and returns them
  - [supabase/functions/_shared/customer-progress-proxy-handler.ts:96](supabase/functions/_shared/customer-progress-proxy-handler.ts) — forwards `progress_lines` unchanged
- **Issue:** The proxy returns whatever the setup-script last logged. setup-script avoids logging secrets directly (no env values, no API keys), but error messages from `apt-get`, `pip`, and `hermes install` can include package paths, hostnames, or third-party error strings that aren't intentional outputs. Combined with P1-PASS3-2 above, this is a per-customer log tail that's accessible cross-customer.
- **Recommendation:** Either (a) emit a curated `inferred_stage` enum and **drop progress_lines** from the response; or (b) keep progress_lines but redact paths matching common secret-shapes (`/api/v1/.+/key`, `Authorization: Bearer .+`, etc.) before forwarding. Option (a) is simpler and the inferred_stage label is what welcome.html actually renders to users.

### P2-PASS3-2 · `customer_not_found` 404 leaks customer existence

- **Category:** info leak.
- **Location:** [supabase/functions/_shared/customer-progress-proxy-handler.ts:51–56](supabase/functions/_shared/customer-progress-proxy-handler.ts) and [customer-readiness-handler.ts](supabase/functions/_shared/customer-readiness-handler.ts)
- **Issue:** The handler comment says *"Don't leak whether the customer exists — return 404 either way"*, but in practice it returns `error: 'customer_not_found'` when the customer row is absent, and a different error code path when the customer exists but the VPS isn't yet provisioned. A timing-based or error-code-based attacker can distinguish "valid cid, no VPS" from "invalid cid."
- **Recommendation:** unify the error responses. If the customer doesn't exist, return the same status + error as the "VPS not yet provisioned" path (or vice versa). Constant-time response shape closes the existence oracle.

---

## Findings — P3 (informational)

### P3-PASS3-1 · `setup-script-harness.yml` workflow missing explicit `permissions:` block

- **Category:** CI hardening.
- **Location:** [.github/workflows/setup-script-harness.yml](.github/workflows/setup-script-harness.yml)
- **Issue:** No `permissions:` block. GitHub Actions default for new repos is conservative (`contents: read` only), but the explicit declaration is best practice — it ensures the workflow doesn't accidentally gain write permissions if the repo default is ever flipped.
- **Recommendation:** add at top of workflow:
  ```yaml
  permissions:
    contents: read
  ```
  Three lines. Defense-in-depth.

### P3-PASS3-2 · Marketing opt-in is client-side-only (mirrors P0 root cause)

- **Category:** consent storage.
- **Location:** [checkout.html:1033–1035](checkout.html)
- **Issue:** Same shape as the ToS P0 — `localStorage.setItem('onboarding_accept_marketing', acceptMarketing ? '1' : '0')`. The marketing opt-in is theoretically less regulated than ToS acceptance, but UU PDP Article 24 still requires explicit, recorded consent for marketing communications.
- **Recommendation:** roll into the P0 fix cascade. Same `consent_events` table can hold both ToS and marketing flags. Cheap to add now, painful to add post-Resend-pipeline.

### P3-PASS3-3 · SSH private key tmpfile lifetime — defense-in-depth opportunity

- **Category:** secret handling.
- **Locations:** [services/provisioning/src/routes/restart-hermes.ts:113–146](services/provisioning/src/routes/restart-hermes.ts), [services/provisioning/src/customer-flow.ts:264–290](services/provisioning/src/customer-flow.ts)
- **Issue:** Fleet SSH private key is written to a `mkdtempSync(tmpdir())` file with `0o600` perms, used for one SSH call, then `rmSync` in `finally`. Same trust boundary as the env var itself, but if the Fly worker is compromised between write and unlink, the key sits readable on disk. Modern Linux supports `O_TMPFILE` for files that exist only as fd, never on the filesystem — Node doesn't expose this directly, but the key could instead be passed to `ssh` via `ssh-add` stdin or `-i /dev/stdin` if portable.
- **Recommendation:** low priority. Current implementation is reasonable; the threat model (worker compromise mid-execution) is narrow. Note for the security backlog only.

---

## Verification of pass-2 fixes (still intact in main)

| Pass-2 finding | Fix shipped | Status in main @ `4bed233` |
|---|---|---|
| **P0-PASS2-1** Phase 6 RLS `USING (true)` recurrence | [PR #53](https://github.com/Richienv/weuseai.agent/pull/53), migration `20260512000000_sesi_d_pass2_p0_1_phase6_rls_tighten.sql` | ✅ migration unchanged; new Phase 6 migration `20260512080000_bundle_version_broadcasts.sql` introduced by PR #81 does not add anon SELECT policies on customer-scoped tables (drift gate would have caught) |
| **Process guardrail** drift test | [PR #54](https://github.com/Richienv/weuseai.agent/pull/54), `tests/rls-anti-pattern-drift.spec.ts` | ✅ still in `tests/` and `npm test` includes it; live drift count: 0 findings |
| **P1-PASS2-1** Timing-safe bearer in `api/*` | [PR #55](https://github.com/Richienv/weuseai.agent/pull/55), `api/_shared/timing-safe-bearer.ts` | ✅ all 4 callsites still import + use `isValidBearer`; no new `api/admin/*` endpoints added since pass-2 |

**No pass-2 regressions detected.** The Track 2 drift test in particular is doing its job — it would have failed if PR #81's new Phase 6 migration tried to add `USING (true)` on customer-scoped tables.

---

## Pass-2 deferred P1 re-confirmation

| Pass-1/2 P1 | Re-confirm? | Notes |
|---|---|---|
| **P1-2** Telegram update_id replay protection | ✅ still correctly deferred | Threat model unchanged. Multi-persona webhook doesn't change replay surface (server-to-server bearer-gated). |
| **P1-3** `HERMES_INSTANCE_HMAC_KEY` env-set in prod | ✅ still correctly deferred (founder-blocked) | PR #81's restart-hermes is a *different* surface (Fly→VPS SSH) — doesn't need the HMAC token. The Hermes-side approval-queue + kanban-proxy HMAC path is unchanged. |
| **P1-4** Xendit refund integration | ⚠️ **deferral risk grew** | Now that ToS + receipt emails ship, the contract has implicitly tightened with the customer. The first refund request without an automated refund path will be even more painful than at pass-2. Recommend prioritizing this within the next 2 weeks if any paying customer onboards. |
| **P1-5** Retry worker for `pending_provision` | ✅ still correctly deferred | Customer-progress streaming (PR #86) mitigates the "no visibility" half of the issue — founder + customer can both see when something stalls. Doesn't replace automated retry, but reduces urgency. |
| **P1-6** BOT_TOKEN_ENC_KEY rotation runbook | n/a — DONE in pass-2 ([PR #47](https://github.com/Richienv/weuseai.agent/pull/47)) | — |

---

## Acknowledgement of pass-2 fixes still in effect

Pass-2 closed 3 P0s + 1 P1 + landed a drift-test guardrail. All four still hold in main today:

1. Phase 5 + Phase 6 strategic-data tables remain default-deny for anon SELECT.
2. `customers` + `subscriptions` tables remain X-CID-scoped with column-allowlist REVOKE/GRANT pattern.
3. Welcome.html + onboarding.html continue to send `X-CID` on PostgREST reads — verified at [welcome.html:804](welcome.html), [onboarding.html:934](onboarding.html), [welcome.html:853](welcome.html), [welcome.html:988](welcome.html).
4. `api/*` admin/cron endpoints continue to use `isValidBearer` for timing-safe secret comparison.

The drift test deserves a specific shout-out: it would have caught a regression in PR #81's new Phase 6 migration if one had been introduced. Process guardrails work.

---

## Audit log

| Item | Checked | Method |
|---|---|---|
| PR #69 welcome.html state machine | yes | Full file read (1177 LOC); state-A/B/C/C2/D/E/F/G transitions; verified `verified-only` / `unverified-only` CSS gating still correct |
| PR #80 consent + Resend | yes | checkout.html consent block, create-invoice handler, email-delivery.ts (text-only emails, no HTML), buildWelcomeEmailBody + buildPaymentReceiptEmailBody |
| PR #81/82/85 multi-persona | yes | tier-personas.ts, bundle-fetch-handler.ts, bundle-fetch/index.ts, bundle-pull-script.ts (VPS-side tier filter), bundle-version-bump-broadcast-handler.ts, restart-hermes.ts |
| PR #86 progress streaming | yes | customer-progress.ts (Fly route), customer-progress-proxy-handler.ts + entry, welcome.html overlay |
| PR #83/84/85 setup-script hardening | yes | Spot-checked setup-script.ts for secret-logging (none found); restart-hermes SSH key normalization confirmed |
| PR #87 Docker test harness | yes | `.github/workflows/setup-script-harness.yml`, `tests/setup-script-docker/Dockerfile.testbed` |
| Pass-2 drift test still active | yes | Verified scanner walks new Phase 6 migration without flagging |
| **Live endpoint testing** | NO | Read-only audit per pass-1/2 convention |
| **Production Supabase Mgmt API queries** | NO | Migration source authoritative |

**Time elapsed:** ~90 minutes. Tighter scope than pass-1 because pass-1/2 mapped the auth surface comprehensively; pass-3 is delta-focused on the new surfaces.

---

## Hand-off to Sesi A

### Immediate (P0 — ping urgently, fix before next paying customer)

1. **P0-PASS3-1**: schema migration for consent_events table + extend `create-invoice` to require + persist `tosAcceptedAt`. ~50 LOC + 1 migration. Recommended cascade order:
   - Migration first (add `consent_events` table — RLS default-deny, service-role writes only)
   - Update `CreateInvoiceBody` type + handler validation
   - Update checkout.html to POST `tosAcceptedAt: new Date().toISOString()`
   - Backfill: any future support ticket asking "did this customer accept ToS" can query the consent_events table.
   - Mirror for `marketingOptIn` (P3-PASS3-2 same cascade).

### Pre-launch (P1)

2. **P1-PASS3-1**: 6-line tier-personas check in `bundleFetchHandler` + extend the existing spec to cover the regression. ~20 LOC.
3. **P1-PASS3-2**: X-CID-vs-body validation in `customer-progress-proxy` and `customer-readiness` entry points. ~10 LOC each. Long-term: Phase 2B signed-JWT.

### Pre-launch (P2)

4. **P2-PASS3-1**: drop `progress_lines` from the proxy response, keep `inferred_stage`. Single-file change. Welcome.html UI already prefers `inferred_stage` for the visible label.
5. **P2-PASS3-2**: unify `customer_not_found` and `vps_not_provisioned` error shapes in both proxies.

### Post-launch (P3)

6. **P3-PASS3-1**: add `permissions: contents: read` to `setup-script-harness.yml`. 3 lines.
7. **P3-PASS3-3**: SSH tmpfile lifetime — security-backlog note.

### Already-deferred (no action this audit cycle)

- P1-2 Telegram update_id replay
- P1-3 HERMES_INSTANCE_HMAC_KEY env-set (founder one-time op)
- P1-4 Xendit refund integration ⚠️ **(deferral risk grew with ToS consent gap — prioritize after P0 lands)**
- P1-5 Retry worker for pending_provision

---

## Updated pass-4 re-audit triggers

Re-audit when **any** of:

1. **P0-PASS3-1 fix lands** — verify consent record is captured server-side end-to-end (checkout submit → DB write → query path).
2. **First paying customer onboards end-to-end** — verify (a) consent record exists; (b) bundle-fetch tier check works; (c) progress proxy + readiness probe don't leak across customers via cid swap.
3. **HERMES_INSTANCE_HMAC_KEY gets set in prod** — pending pass-1 P1-3 still applies.
4. **Phase 2B signed-JWT ships** — major surface change, full re-audit of all cid-bearer paths (welcome.html, onboarding.html, customer-progress-proxy, customer-readiness, all bundle-* endpoints).
5. **Xendit refund integration ships** — money-mutation surface, threat-model review.
6. **First Phase-6-enabled customer** writes to `department_workspaces` / `approval_patterns` / `daily_digests` — verify the (TBD) service-role Edge Function reader correctly scopes per-customer.
7. **New email surface ships** — current Resend integration is text-only; if HTML email lands, full XSS audit on customer-controlled fields (display_name, bot_username) needed.

If none of those land within ~30 days, schedule a calendar-time pass-4 in mid-June to catch drift in surfaces this audit cycle didn't touch (services/proxy/, observability dashboards, Cloudflare worker LLM routing).

---

## Closing

Pass-3 finds **1 P0, 2 P1, 2 P2, 3 P3**. The pass-2 RLS + timing-safe-bearer + drift-test guardrail all hold cleanly. The new surfaces (consent capture, multi-persona, progress streaming) re-introduce the same root cause that pass-1 first diagnosed: primitives that exist (X-CID, RLS, tier-personas map) but surfaces that don't use them.

The P0 is well-scoped (one schema migration + one validation line) and the P1s are similarly small. The cascade can be one PR or three; either way it should land before the next paying customer hits checkout.
