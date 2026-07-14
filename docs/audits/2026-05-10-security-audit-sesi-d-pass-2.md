# Security Audit — Pass 2 (Sesi D, 2026-05-10)

**Auditor:** Sesi D (autonomous read-only sweep, follow-up to pass-1)
**Scope:** verify pass-1 fixes intact + audit new surface area shipped since pass-1 + reconfirm deferred-P1 risk profile.
**Repo state at audit:** `origin/main` @ `2bd7e21` (post-#51 welcome guard fix, post-#11 carousel rebase, post-#49 checkout accordion).
**Methodology:** read pass-1 fix migrations + diffed main, then audited `welcome.html`, `onboarding.html`, `admin/*.html`, `api/admin/*.ts`, and the new `20260510150000_phase_6_1a_cofounder_clone.sql` migration. No live endpoint testing.

> **Pass-2 charter clause:** "If P0s found: ping immediately." — **1 P0 found below**. Sesi A should run a P0-fix cascade before any paying customer onboards.

---

## Executive summary

| Severity | Count | Theme |
|---|---|---|
| **P0** (blocking, exploit possible) | **1** | Phase 6-1.a migration ships 3 NEW tables with `USING (true)` — same anti-pattern pass-1 P0-1 fixed for Phase 5, repeated on Phase 6 foundation. |
| **P1** (must fix pre-launch) | 1 | 4× Vercel admin/cron endpoints still use timing-unsafe `auth !== \`Bearer ${ADMIN_SECRET}\`` — pass-1 P1-1 fix landed in Edge Functions but didn't propagate to `api/*` Vercel functions. |
| **P2** (defense-in-depth / soft regressions) | 2 | Onboarding email field readonly+empty post-P0-2 (UX regression); onboarding step 1 has the same dual-render shape welcome.html had. |
| **P3** (informational) | 1 | Admin support-tickets.html uses fragile-but-currently-safe XSS escape pattern. |

**Pass-1 P0 verification:** all three pass-1 P0 fixes intact in main (PR #43, #44, #45). Migrations are well-commented, drift-resistant, and the pattern is consistent across the three tables (default-deny for Phase 5; X-CID-scoped + column-allowlist for customers/subscriptions). `welcome.html` and `onboarding.html` correctly send `X-CID` headers on every Supabase fetch.

**Pass-1 P1 verification:** P1-1 (timing-safe webhook secret) landed cleanly via PR #46 — `constant-time-equal.ts` is now the single source of truth, used by all 4 Edge Function callsites. P1-6 (BOT_TOKEN_ENC_KEY rotation runbook) landed via PR #47.

**Welcome.html state-machine review (pass-2 charter item 2):** **Clean.** The 30s null-grace window holds the page in state A ("checking…") for at most 30 seconds. State A's hero is the *unverified* "Sebentar — sedang memeriksa" copy, not the success messaging — so a fabricated cid that returns null cannot make the success hero appear. CSS gating via `display: none` does not leak any customer-specific content (the verified-only sections are static UX strings only). No client-side "is paid" decisions are made — all gating is server-side at PostgREST + Edge Function layer.

**Headline take:** the codebase has internalized the X-CID pattern + column-allowlist for customers/subscriptions, but the **Phase 5/6 anti-pattern** ("anon SELECT USING (true), scope enforced at handler layer") is a habit that's reasserting itself on each new feature schema. Pass-1 fixed it once for Phase 5; the Phase 6-1.a migration repeated it. A drift-test or migration-review checklist preventing `USING (true)` on customer-bound tables would catch this class permanently.

---

## Findings — P0 (blocking, ping urgently)

### P0-PASS2-1 · Phase 6-1.a migration introduces 3 new tables with `USING (true)` — recurrence of pass-1 P0-1 anti-pattern

- **Category:** 2 (Data isolation)
- **Location:** [supabase/migrations/20260510150000_phase_6_1a_cofounder_clone.sql:222-238](supabase/migrations/20260510150000_phase_6_1a_cofounder_clone.sql)
- **Live status:** migration applied to production via Supabase Mgmt API per commit message ("live") in commit `e56b893` and `36`. Tables exist; policies are in force.
- **Affected tables:**
  - `department_workspaces` — contains `simulated_team` (jsonb of personas), `charter_md` (workspace OKRs), `telegram_thread_id`
  - `approval_patterns` — contains `match_conditions` (jsonb of auto-approval rules), `reasoning_md` (customer's strategic reasoning)
  - `daily_digests` — contains `body_md` (department-by-department summaries), `pending_decisions` (jsonb of strategic links)
- **Issue:** The migration applies the *exact same* `anon read own ... USING (true)` policy that pass-1 P0-1 flagged on Phase 5 tables. Migration comments lines 220-221 even repeat the dismissed reasoning verbatim:
  > `-- anon SELECT for customer-facing reads (per-customer scoping enforced`
  > `-- by JWT-issuing handler — same as Phase 5 convention)`
  
  But there is no JWT-issuing handler — the anon JWT is publicly hardcoded in the landing pages. Pass-1 demonstrated this; the same exploit chain applies here.

- **Reproduction (will work the moment any customer enables Phase 6):**
  ```bash
  ANON=$(curl -s https://weuseai-agent.vercel.app/onboarding.html \
    | grep -oE 'eyJhbGc[A-Za-z0-9._-]+' | head -1)
  curl -s "https://gtjgsligllbjcisiyrah.supabase.co/rest/v1/department_workspaces?select=*" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  ```
  Returns every customer's `simulated_team`, `charter_md`, `telegram_thread_id`. Same pattern for `approval_patterns` and `daily_digests`.

- **Current exposure surface:** **theoretically empty today** — no customer has Phase 6 enabled yet, so the tables hold zero customer rows. The leak surface activates the moment the first customer's row is written. This is exactly the "fix before first paying customer hits prod" threshold the pass-2 charter calls out.

- **What is NOT exposed in this finding:**
  - `codebase_integrations` (line 240-243 of the migration) correctly omits an anon SELECT policy — `github_pat_encrypted` stays service-role only.
  - `persona_memories` similarly has no anon SELECT — service-role only.
  - These two demonstrate the migration author considered sensitivity for some tables but lapsed on the other three.

- **Impact:** cross-customer leak of:
  - **`department_workspaces.charter_md`** — written by BD v3 as the workspace's strategic charter. Equivalent to Phase 5's `business_roadmap_state.notes_md` exposure.
  - **`approval_patterns.match_conditions` + `reasoning_md`** — auto-approval rules are *strategic intent* (e.g., "auto-approve any public_emission to IG with audience <10000 unless contains health claims"). Cross-customer visibility = competitive intelligence on every customer's strategy posture.
  - **`daily_digests.body_md` + `pending_decisions`** — full per-customer M/W/F strategic state including pending approvals (reverse-references `approval_requests.id` which P0-1 default-deny already protects, but the digest itself contains the same data in plaintext).

- **Recommendation:** mirror the pass-1 P0-1 fix. New migration `20260512000000_sesi_d_pass2_p0_1_phase6_rls_tighten.sql`:
  ```sql
  DROP POLICY IF EXISTS "anon read own workspaces" ON public.department_workspaces;
  DROP POLICY IF EXISTS "anon read own approval patterns" ON public.approval_patterns;
  DROP POLICY IF EXISTS "anon read own digests" ON public.daily_digests;
  
  CREATE POLICY "deny anon select on department_workspaces"
    ON public.department_workspaces FOR SELECT TO anon USING (false);
  CREATE POLICY "deny anon select on approval_patterns"
    ON public.approval_patterns FOR SELECT TO anon USING (false);
  CREATE POLICY "deny anon select on daily_digests"
    ON public.daily_digests FOR SELECT TO anon USING (false);
  
  COMMENT ON POLICY "deny anon select on department_workspaces"
    ON public.department_workspaces IS
    'Sesi D pass-2 P0-1 lock 2026-05-11: default-deny. Customer reads route through service-role Edge Function. Re-introducing USING (true) is a P0 regression — see 2026-05-10-security-audit-sesi-d-pass-2.md.';
  -- (same comment shape on the other two)
  ```
  Apply via Supabase Management API, idempotent. Sesi A can ship in the same one-PR cascade as the related guardrail (below).

- **Architectural recommendation (process fix):** add a drift test + migration-author checklist preventing `USING (true)` on any table with `customer_id`. Pass-1 already left a comment block warning against this on each Phase-5 fixed table; the Phase 6 author either didn't read those comments or copy-pasted from the unfixed pre-pass-1 Phase 5 migration. Either:
  - **Drift test:** a node:test spec that greps `supabase/migrations/*.sql` for `USING (true)` and fails on any match in a file that also references a customer_id-bound table. Cheap, catches the next recurrence.
  - **Migration template:** a `supabase/migrations/_TEMPLATE.sql` skeleton with default-deny + commented X-CID-scoping option. Author opts in to a known-safe pattern.

---

## Findings — P1 (must fix pre-launch)

### P1-PASS2-1 · 4 Vercel admin/cron endpoints still use timing-unsafe `!==` for secret comparison

- **Category:** 1 (Auth + authz)
- **Locations:**
  - [api/admin/customers.ts:236](api/admin/customers.ts) — `if (auth !== \`Bearer ${ADMIN_SECRET}\`)`
  - [api/admin/support-tickets.ts:338](api/admin/support-tickets.ts) — same pattern
  - [api/admin/observability/customer.ts:92](api/admin/observability/customer.ts) — same pattern
  - [api/nightly-cleanup.ts:234](api/nightly-cleanup.ts) — `if (!CRON_SECRET || auth !== \`Bearer ${CRON_SECRET}\`)`
- **Issue:** Pass-1 P1-1 fix extracted [`constantTimeEqual` into `supabase/functions/_shared/constant-time-equal.ts`](supabase/functions/_shared/constant-time-equal.ts) and routed all 4 Edge Function secret-comparisons through it. The 4 Vercel functions under `api/` were NOT updated — they still use plain `!==` for `OBSERVABILITY_ADMIN_SECRET` / `CRON_SECRET`.
- **Threat model:** identical to pass-1 P1-1 except the attack surface is different:
  1. **Network-side timing leak**: An attacker who can reach `/api/admin/customers` (publicly-routable Vercel endpoint) and measure precise response latency could leak `OBSERVABILITY_ADMIN_SECRET` byte-by-byte. Vercel's serverless cold-start jitter makes this harder than colocated edge-POP attacks but not impossible.
  2. **XSS-side amplification**: Compounds with the existing admin pages (admin/customers.html, admin/support-tickets.html) which store the secret in `sessionStorage` (line 266 of support-tickets.html, line 177 of customers.html). Any stored XSS in admin display fields (e.g., support-ticket title rendered through the current escape chain — see P3-PASS2-1) could lift the secret directly without needing the timing channel — but the timing channel remains a backup.
- **Impact:** Admin secret recovery → full cross-customer admin access (read all customers, flip phase_5/6_enabled, set monthly_llm_budget_cents). The endpoints have full service-role authority via SUPABASE_SERVICE_ROLE_KEY.
- **Recommendation:** Replace each `auth !== \`Bearer ${SECRET}\`` with the constant-time pattern. Vercel functions are Node ESM (per `api/nightly-cleanup.ts` and observability/customer.ts ESM resolution notes), so use Node's `crypto.timingSafeEqual` directly:
  ```ts
  import { timingSafeEqual } from 'node:crypto'
  
  function safeBearerCheck(auth: string, secret: string): boolean {
    const expected = `Bearer ${secret}`
    if (auth.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  }
  ```
  Or extract to a shared `api/_shared/timing-safe-bearer.ts` mirroring the Edge-Function pattern. Either works — extracting is more drift-resistant.

---

## Findings — P2 (defense-in-depth, pre-launch nice-to-have)

### P2-PASS2-1 · Onboarding email field is readonly + empty post-P0-2 fix (UX regression)

- **Category:** 5 (Code quality / soft regression introduced by P0-2 fix)
- **Locations:**
  - [onboarding.html:506-507](onboarding.html) — `<input id="f-email" class="field-input readonly" readonly aria-readonly="true" value="" />`
  - [onboarding.html:1114](onboarding.html) — `$email.value = customer.email ?? ''` (always empty since `email` is REVOKED for anon)
  - [supabase/migrations/20260511010000_sesi_d_p0_2_customers_pii.sql:99-100](supabase/migrations/20260511010000_sesi_d_p0_2_customers_pii.sql) — comment claims "Customer re-fills via checkout/onboarding form input on each session" but no localStorage cache exists for `email` (only for `whatsapp_number` at onboarding.html:1130 / 1508)
- **Issue:** P0-2 fix correctly excludes `email` from anon SELECT allowlist. But the onboarding flow still expects to display the customer's email in Step 1 ("Konfirmasi data kamu"). Post-fix:
  - Server returns no `email` (column REVOKED)
  - Client renders `customer.email ?? ''` → empty value
  - Field is `readonly` → customer cannot type their email
  - **Result:** Step 1 shows an empty readonly email field for every customer. Looks like a bug; potentially confusing.
- **Severity:** Not security-relevant. Email is not used in form submit (verified via grep — Step 1 form only validates and submits WhatsApp; email isn't sent anywhere). But the P0-2 migration's comment on `customers.email` ("Customer re-fills via checkout/onboarding form input on each session") doesn't match what the code actually does — there's no re-fill mechanism.
- **Recommendation:** pick one:
  1. **Hide the email field** in Step 1 entirely — simplest, removes the empty readonly field.
  2. **Cache email in localStorage at checkout.html submit** alongside whatsapp_number cache, then read on onboarding boot. Mirrors the WhatsApp pattern.
  3. **Add a service-role Edge Function** that returns email scoped by X-CID. More code, more rounds; only worth it if email becomes actually functional in onboarding.
- **Mitigation note:** the `<input type="email">` enables browser validation that won't fire (since it's empty + readonly). Not exploitable, just messy.

### P2-PASS2-2 · Onboarding.html step-1-visible-by-default has the same dual-render shape welcome.html had pre-fix

- **Category:** 3 (Failure modes) + soft duplicate of pass-1's welcome.html bug class
- **Locations:**
  - [onboarding.html:486-543](onboarding.html) — `<section data-step="1">` rendered without `hidden` attribute (visible by default)
  - [onboarding.html:551, 629, 710, 769](onboarding.html) — Steps 2/3/4/E all have `hidden` attribute
  - [onboarding.html:1078-1090](onboarding.html) — `setStep()` toggles `panel.hidden = true|false`
  - [onboarding.html:1487-1537](onboarding.html) — `boot()` flow: invalid cid → `setStep('E')`; valid → `fetchCustomer()` → `setStep('1' | '4')`
- **Issue:** Same anti-pattern shape that caused the welcome.html bug fixed in PR #51:
  1. Static HTML has Step 1 visible by default
  2. JS `boot()` runs `fetchCustomer()` (async, 100s of ms typical)
  3. During the in-flight fetch, Step 1 is visible to the user
  4. If fetchCustomer throws or returns null → JS calls `setStep('E')` which hides Step 1 and shows E
- **Why this is less severe than the welcome.html bug:**
  - Step 1's static HTML contains *empty form fields* — no per-customer PII or success messaging. The user sees an empty "Konfirmasi data kamu" form briefly.
  - The "Lanjut" button submits to a JS handler that's only bound when boot completes — without JS, form submit defaults to navigation (no harmful effect).
  - No "you are paid in" or "selamat datang" messaging is shown unconditionally (unlike pre-fix welcome.html).
- **Why it's still worth flagging:**
  - The anti-pattern is the same shape. Future copy changes (e.g., adding "Lengkapi profil agent kamu" eyebrow above Step 1) could leak intent before verification.
  - If `fetchCustomer()` is slow (network-degraded customer, e.g., on bad cellular in Indonesia), the unverified state shows for many seconds. A `verified-only` / `unverified-only` CSS pattern would short-circuit this.
- **Recommendation:** add the same CSS gating pattern from welcome.html. Default state: Step E is the only thing visible (treats unbooted page as "we don't know if you're a customer yet"). On successful `fetchCustomer`, JS sets `body[data-state="step-1" | "step-4"]` and CSS reveals the matching step. Strictly UX defensive; not blocking.

---

## Findings — P3 (informational)

### P3-PASS2-1 · admin/support-tickets.html `onclick` interpolation is currently safe but fragile

- **Category:** 1 (Auth + authz, XSS surface)
- **Location:** [admin/support-tickets.html:309-318](admin/support-tickets.html)
- **Pattern:**
  ```js
  const rows = tickets.map(t => `
    <tr onclick="openEditModal(${escapeAttr(JSON.stringify(t))})" style="cursor:pointer">
      <td>${esc(t.title)}</td>
      ...
  `).join('')
  ```
- **Analysis:** I traced the escape chain. `JSON.stringify` does not escape `<` / `>` by default, but `escapeAttr` (which calls `esc` then re-escapes `"`) HTML-entity-encodes both characters. The browser decodes the entities back to `<>` *after* the HTML parser has already finished tagging — so the resulting JS sees `<` / `>` as string content inside the object literal, not as HTML. **Currently safe.**
- **Why fragile:**
  1. If a future refactor drops the double-escape (e.g., switches to `JSON.stringify` only), `<img onerror>` lifts straight into the attribute and executes.
  2. JSON.stringify of an object containing a `</script>` substring works in attribute context but breaks if the same data is ever interpolated into `<script>` content elsewhere.
  3. `esc` and `escapeAttr` are duplicate-defined at lines 419-424 — drift risk if one is updated without the other.
- **Recommendation (post-launch):** replace the template-string-with-onclick pattern with `tr.addEventListener('click', () => openEditModal(t))`. Eliminates the escaping concern entirely. Same fix on `admin/customers.html` if the pattern recurs there.
- **Severity:** P3 informational — known to be safe today, but the pattern is the kind of thing pen-test reviewers ding.

---

## Verification of pass-1 fixes (charter item 1)

| Pass-1 finding | Fix PR | Migration / file | Verified intact |
|---|---|---|---|
| **P0-1** Phase 5 RLS USING(true) | #43 | [20260511000000_sesi_d_p0_1_phase5_rls_tighten.sql](supabase/migrations/20260511000000_sesi_d_p0_1_phase5_rls_tighten.sql) | ✅ All 4 policies replaced with `USING (false)`. Drift-defense `COMMENT ON POLICY` lines clearly state "DO NOT replace with USING (true) without re-audit." |
| **P0-2** Customers RLS + PII columns | #44 | [20260511010000_sesi_d_p0_2_customers_pii.sql](supabase/migrations/20260511010000_sesi_d_p0_2_customers_pii.sql) | ✅ Anon SELECT now scoped by `X-CID` request header; `REVOKE SELECT ON customers FROM anon` then `GRANT SELECT (allowlist)` correctly orders the table-then-column pattern. The migration commit message correctly identifies that the prior Phase-2.5 telegram_bot_token REVOKE was a no-op, and this fix actually closes that older leak too. |
| **P0-3** Subscriptions RLS | #45 | [20260511020000_sesi_d_p0_3_subscriptions.sql](supabase/migrations/20260511020000_sesi_d_p0_3_subscriptions.sql) | ✅ Same X-CID + allowlist pattern. Allowlist correctly excludes tier, xendit_invoice_id, next_billing_at, hosting_active, always_on_enabled. [welcome.html:617-637](welcome.html) and [onboarding.html:918-940](onboarding.html) both correctly send the `X-CID` header. |
| **P1-1** Timing-safe webhook secret | #46 | [supabase/functions/_shared/constant-time-equal.ts](supabase/functions/_shared/constant-time-equal.ts) | ✅ Single source of truth, used by all 4 Edge Function callsites: telegram-bot-webhook-handler.ts:86, pair-customer-bot-webhook-handler.ts:73, xendit-webhook-handler.ts:34, hermes-instance-auth.ts:97. |
| **P1-6** BOT_TOKEN_ENC_KEY rotation | #47 | (docs-only — runbook) | ✅ Landed per git log; rotation procedure exists. |

**No pass-1 regressions detected.**

---

## Re-confirmation of deferred pass-1 P1s (charter item 5)

| Pass-1 P1 | Status | Re-confirm? |
|---|---|---|
| **P1-2** Telegram update_id replay protection | Still deferred — no `update_id` dedup table | ✅ Still correctly deferred. Threat model unchanged: replay-storming `/pair` is bounded by pairing_code expiry (30 min) + already-paired check; no new amplification surface introduced by recent PRs. |
| **P1-3** HERMES_INSTANCE_HMAC_KEY mandatory in prod | Code wiring shipped via PR #39 (provisioning + cloud-init); env var still unset in prod (founder-blocked) | ✅ Still correctly deferred. PR #39 closed the cloud-init gap so the next env-set will work end-to-end. **Founder-only step:** `supabase secrets set HERMES_INSTANCE_HMAC_KEY=<random>` once production is ready to enforce. |
| **P1-4** Xendit refund integration | Still no refund integration; `support_tickets.kind='billing_dispute'` exists but no automation | ✅ Still correctly deferred. New surface area (admin pages) doesn't change the threat. **Threshold:** must ship before customer #1 has a permanent provisioning failure. |
| **P1-5** Retry worker for `pending_provision` | Still no retry worker | ✅ Still correctly deferred. New `support_tickets` schema lets founder track stuck customers manually; mitigates the "no visibility" half of the issue, doesn't replace automated retry. |
| **P1-6** BOT_TOKEN_ENC_KEY rotation | **DONE** via PR #47 (runbook landed) | n/a — moves out of deferred list. |

**Net deferral risk change since pass-1:** *unchanged.* No new surface area increases the urgency of P1-2/3/4/5. P1-6 is no longer deferred.

---

## Audit log

| Item | Checked | Method |
|---|---|---|
| Pass-1 P0/P1 fix migrations | yes | Read 3 fix migrations + diff vs pre-fix |
| `welcome.html` state machine + 30s grace | yes | Full read of welcome.html (703 LOC) including the new `verified-only` / `unverified-only` CSS gating + state-A/B/C/C2/D/E/F/G transitions |
| `onboarding.html` for dual-render anti-pattern | yes | Read of step section markup + `setStep()` flow + boot() routing |
| `admin/*.html` and `api/admin/*.ts` (new since pass-1) | yes | Read of admin/customers.html, admin/support-tickets.html, api/admin/customers.ts, api/admin/support-tickets.ts, api/admin/observability/customer.ts |
| `api/nightly-cleanup.ts` (cron secret comparison) | yes | Confirmed timing-unsafe pattern same as admin endpoints |
| Phase 6-1.a migration | yes | Full read of 20260510150000_phase_6_1a_cofounder_clone.sql |
| `constant-time-equal.ts` adoption | yes | grep'd usage across all callsites |
| `HERMES_INSTANCE_HMAC_KEY` wiring | yes | grep'd code wiring in services/provisioning/ + supabase/functions/ |
| `checkout.html` post-#49 accordion change | yes | Read; only POSTs to create-invoice Edge Function, no Supabase table queries — unaffected by P0-2/P0-3 |
| Live endpoint testing | NO | Read-only audit per pass-1 convention |
| Live Supabase Mgmt API queries | NO | Migration source authoritative |

**Time elapsed:** ~75 minutes. Tighter scope than pass-1 because pass-1 mapped the auth surface; pass-2 is delta-focused.

---

## Hand-off to Sesi A

### Immediate (P0 — fix before first paying customer)

1. **Phase 6-1.a RLS tighten** — apply migration mirroring pass-1 P0-1 fix to default-deny on `department_workspaces`, `approval_patterns`, `daily_digests`. Idempotent. Apply via Supabase Mgmt API. ~30 LOC migration.
2. **Process guardrail** — add a drift test (or migration template) preventing `USING (true)` on customer_id-bound tables. Without this, the next phase migration is likely to repeat the pattern. ~50 LOC.

### Pre-launch (P1)

3. **Timing-safe admin/cron secret comparison** — replace `auth !== \`Bearer ${SECRET}\`` in 4 files (`api/admin/customers.ts:236`, `api/admin/support-tickets.ts:338`, `api/admin/observability/customer.ts:92`, `api/nightly-cleanup.ts:234`) with `crypto.timingSafeEqual` via a shared `api/_shared/timing-safe-bearer.ts` helper. ~40 LOC including extraction.

### Pre-launch (P2)

4. **Onboarding email field UX cleanup** — pick one of three options in P2-PASS2-1. Recommend option 1 (hide field) as fastest.
5. **Onboarding step-1 dual-render hardening** — apply welcome.html's `verified-only`/`unverified-only` CSS pattern to onboarding.html steps. Defensive; not blocking.

### Post-launch (P3)

6. **admin/support-tickets.html escape pattern modernization** — replace template-onclick with addEventListener. Drift-resistant; not exploitable today.

### Already-deferred (no action this audit cycle)

- P1-2 Telegram update_id replay (still bounded by pairing-code expiry)
- P1-3 HERMES_INSTANCE_HMAC_KEY env-set (founder one-time op when ready)
- P1-4 Xendit refund integration (still >1d work)
- P1-5 Retry worker for pending_provision (still >1d work)

---

## Closing — clean-bill caveat

This pass-2 is **NOT a clean bill of health** — the Phase 6-1.a P0 takes that off the table. But importantly:

- **Pass-1 fixes are intact.** No regressions.
- **The fix pattern from pass-1 is reusable** for the new finding (same migration shape, same CSS pattern for dual-render hardening, same constant-time helper for the admin endpoint timing fix).
- **The Phase 6 finding has no known exploit yet** because Phase 6 is empty in production. This buys time — but only until the first Phase-6-enabled customer onboards.

Recommend the founder dispatch a one-PR cascade for P0-PASS2-1 + P1-PASS2-1 + the process-guardrail drift test, ideally before any paying customer is onboarded into a tier that touches Phase 6. The other findings (P2/P3) can queue normally.

Re-audit (pass-3) recommended:
- After P0-PASS2-1 fix lands (verify pattern doesn't recur).
- After first paying customer flow completes end-to-end (verify no live-data pattern mismatches).
- Before Phase 6 customer-facing Edge Functions ship (so the new auth gates can be reviewed against the pattern landed in P0-PASS2-1 fix).
