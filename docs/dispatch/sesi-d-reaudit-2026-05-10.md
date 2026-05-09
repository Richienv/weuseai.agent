# Sesi D re-audit dispatch — pass 2 (2026-05-10)

> Stage this prompt for Sesi D. Do **not** dispatch automatically. Run
> after the first paying customer has completed end-to-end onboarding
> in production AND after the items in "What's NEW since pass 1" below
> have been verified live.

## What pass 1 found (2026-05-09 / 10)

Sesi D's first audit
(`docs/audits/2026-05-10-security-audit-sesi-d.md`) flagged 3 × P0,
6 × P1, 7 × P2, 4 × P3 findings. The P0s plus two P1s have shipped
across 5 PRs:

| Finding | PR | Status |
|---|---|---|
| P0-1 — Phase 5 tables `USING (true)` | [#43](https://github.com/Richienv/weuseai.agent/pull/43) | merged + deployed |
| P0-2 — customers PII leak | [#44](https://github.com/Richienv/weuseai.agent/pull/44) | merged + deployed |
| P0-3 — subscriptions revenue/billing leak | [#45](https://github.com/Richienv/weuseai.agent/pull/45) | merged + deployed |
| P1-1 — Telegram timing-unsafe `!==` | [#46](https://github.com/Richienv/weuseai.agent/pull/46) | merged + deployed |
| P1-6 — `BOT_TOKEN_ENC_KEY` rotation runbook | [#47](https://github.com/Richienv/weuseai.agent/pull/47) | merged (docs) |

Deferred to next cascade (founder-known):

- P1-2 (Telegram `update_id` replay protection) — requires new schema
  + new `IOnboardingStore` method + per-handler test refactor.
- P1-3 (HMAC env mandatory) — founder-blocked DO-NOT-TOUCH.
- P1-4 (Xendit refund integration) — new payment infra, audit estimates >1d.
- P1-5 (pg_cron retry worker) — depends on P1-4.
- All P2 + P3 findings — defense-in-depth, post-launch.

## Pass 2 charter

Re-audit the same surface area as pass 1, with these explicit
priorities:

### 1. Verify P0/P1 fixes hold under attack

Pass 1 was source-code reading. Pass 2 should adversarially probe the
deployed surface from outside Anthropic's infra:

- **P0-1**: For each Phase 5 table, attempt anon SELECT and confirm
  0 rows. Try column-level enumeration probes.
- **P0-2**: Hit `/rest/v1/customers` with the public anon key. Without
  X-CID header → confirm 0 rows. With X-CID matching a known-existing
  customer → confirm only allowlist columns return; PII (`email`,
  `whatsapp_number`, `soul_md_text`, `telegram_bot_token`,
  `monthly_llm_budget_cents`) must 401 or be omitted.
- **P0-3**: Same shape, against subscriptions table. Confirm `tier`,
  `xendit_invoice_id`, `next_billing_at`, `hosting_active`,
  `always_on_enabled` cannot be SELECTed.
- **P1-1**: This one is hard to test from outside (the timing leak
  requires colocated edge POP). Verify by reading the deployed
  bundles via Supabase dashboard: confirm `constantTimeEqual` import
  appears in `telegram-bot-webhook` + `pair-customer-bot-webhook` +
  `xendit-webhook` + `approval-queue` + `hermes-kanban-proxy` deploys.

If any of the above fails, the re-audit upgrades it back to P0.

### 2. Look for new gaps introduced by pass 1's fixes

Each migration changed access patterns. Re-check:

- **welcome.html / onboarding.html** still functional end-to-end
  with the X-CID header pattern? Any UI regressions hidden by RLS
  changes?
- **Admin endpoints** (`/api/admin/customers`) still able to read all
  PII via service-role? Confirm the column REVOKEs didn't accidentally
  break service-role access (unlikely — REVOKE doesn't apply to
  service_role — but verify).
- **Edge Function nested embeds** — anywhere that does
  `select=customers(...)` or `select=subscriptions(...)` from a
  service-role client. Does the new column allowlist break any join?
- **constantTimeEqual extraction (P1-1)**: unit-test coverage proves
  the helper is correct, but the four call sites' integration tests
  were not re-run for the new import path. Pass 2 should adversarially
  probe each: send a wrong secret, verify 401; send right secret,
  verify expected behavior.

### 3. Check what's NEW since pass 1 (post-paying-customer state)

By the time pass 2 runs, the codebase will likely have:

- Phase 6 admin tier-flip integration (currently DO-NOT-TOUCH)
- Phase 6-1.b pattern matcher (currently DO-NOT-TOUCH)
- Phase 6-2 workspace-setup-handler (currently DO-NOT-TOUCH)
- Possibly Phase 5-3.c HMAC env flip (P1-3, founder-only)
- Possibly retry worker / refund integration (P1-4 + P1-5 if built)

Each of these is a fresh attack surface. Apply the same 4-category
review (auth+authz, input validation, failure modes, secrets+credentials).

### 4. Validate deferred P1s in their post-cascade form

If any of P1-2/3/4/5 shipped between pass 1 and pass 2, validate the
ship. If they didn't ship, escalate as **upgrade to P0** if the
first-paying-customer flow has surfaced concrete pain (manual refunds,
silent stuck `pending_provision`, kanban-spoof reports, replay storms).

### 5. New themes to scan for

Pass 1 closing notes flagged two architectural themes worth deeper
investigation in pass 2:

- **The gap between primitives that exist and surfaces that use them.**
  Inventory every auth primitive (HMAC verifier, X-CID scoping,
  constantTimeEqual, pgcrypto helpers, signed-JWT scaffolding if any)
  and tally which surfaces actually use it vs. fall back to weaker
  patterns. Build the auth surface map (recommendation #3 in pass 1's
  architectural section).
- **Defense-in-depth fragility under public-anon-key.** The anon JWT
  is publicly hardcoded in onboarding/checkout/welcome — this is
  Phase-2B-blocked. Scan for any new endpoints that assume anon-key
  is a security boundary (it isn't).

## Output format

Write the audit to
`docs/audits/<actual-date>-security-audit-sesi-d-pass-2.md`. Mirror
pass 1's structure:

- Executive summary
- Findings P0 → P1 → P2 → P3 with reproductions
- Audit log (commands run, files read, what surfaces were probed)
- Hand-off to Sesi A — prioritized fix list
- Architectural recommendations
- Closing assessment

If a pass 1 finding is fully resolved, list it under
`## Resolved since pass 1` with PR reference and a one-line
verification note.

## Stop conditions

Sesi D should NOT proceed if any of these hold:

- First paying customer has not completed end-to-end onboarding.
- The deployed env state is unknown (Edge Functions out of sync with
  main, secrets unverified).
- Sesi D doesn't have read access to production Supabase logs and
  Edge Function source.

In any of those cases, pass back to founder with a "blocked on …" note.

## Caller (founder)

Dispatch this prompt as a fresh Sesi D session. Provide:

- Read access to production Supabase (anon key + service-role key
  for verification, not for testing-as-anon).
- Production URL: `https://weuseai-agent.vercel.app/`.
- Pass 1 audit doc path:
  `docs/audits/2026-05-10-security-audit-sesi-d.md`
- This dispatch prompt path (you're reading it).
- Any new files / migrations shipped since pass 1 — tell Sesi D to
  diff `git log --oneline 987bb33..HEAD` (P1-1 merge SHA) for the
  full delta, or pass a more recent SHA if more cascades have run.
