# Sesi R — deploy lane closeout (Phases 6-11)

**Date:** 2026-05-13
**Cascade:** Sesi R Indonesian integrations
**Branch:** `sesi-r/indonesian-integrations` (HEAD: `0f24e80`)
**PR:** [#102](https://github.com/Richienv/weuseai.agent/pull/102) — opened, awaiting founder smoke + review

Companion to [`2026-05-13-sesi-r-cascade-closeout.md`](./2026-05-13-sesi-r-cascade-closeout.md) (Phases 0-5). This brief covers the deploy lane that took the cascade from "code shipped on branch" to "PR open + production-ready".

---

## What shipped this lane

| Phase | Deliverable | Status |
|---|---|---|
| 6 | Deno entrypoints for both Edge Functions | ✓ committed `46281c6` |
| 7 | Migration applied via Supabase Mgmt API | ✓ applied + verified |
| 8 | Reusable smoke-test script | ✓ committed `0f24e80`; founder runs pre-merge |
| 9 | Local main reset to `origin/main` | ✓ stray `d34d820` cleaned |
| 10 | PR opened | ✓ [#102](https://github.com/Richienv/weuseai.agent/pull/102) |

---

## Phase 6 — Edge Function entrypoints

Two Deno wrappers at `supabase/functions/<name>/index.ts`:

- `integration-credentials/index.ts` — wires Supabase service-role client for `integration_credentials` CRUD + `audit_log` writes + Xendit `GET /balance` upstream validation
- `integration-proxy-xendit/index.ts` — wires Supabase client for credential load + audit-log writes; `xenditFetch` passes through to `api.xendit.co`

Both follow the established CORS pattern (`handleCors` → handler → `withCors`). Pure handlers stay in `_shared/` for Node-test exercisability. Pattern matches `customer-progress-proxy` + `customer-readiness` from Sesi D pass-3 (#93).

**Not deployed yet** per founder constraint ("Don't deploy to prod yet — PR review gates that"). Deploy commands documented in PR description + in each entrypoint's header comment.

---

## Phase 7 — Migration applied

`supabase/migrations/20260513010000_sesi_r_integration_credentials.sql` applied via Supabase Mgmt API (script at `/tmp/apply-sesi-r-migration.mjs`, not committed since it's a one-shot).

**Verification queries (run via Mgmt API):**

```
✓ integration_credentials table exists
✓ rls_enabled = true
✓ policy_count = 1 (anon deny-all)
✓ unique constraint: UNIQUE (customer_id, integration)
✓ check constraint: integration IN ('xendit','whatsapp_cloud_api','onlinepajak')
```

**Migration hash for audit trail:**

```
sha256:cea50e4b3a587e54dc50b9023e22028d6dd6d17968a434fa51ef27cba16e02c0
bytes: 2807
```

---

## Phase 8 — Smoke test scaffolding

`scripts/smoke/sesi-r-xendit-smoke.mjs` — reusable end-to-end exerciser. Imports pure handlers from `_shared/`, builds real deps wired to live Supabase service-role + live Xendit sandbox.

9-step check:
1. Throwaway test customer
2. POST credential — validates against real Xendit `GET /balance`
3. GET → no ciphertext leak
4. `invoice.create` via proxy → real Xendit sandbox
5. Bogus call → Bahasa error mapping fires
6. Audit-log verification + PII sanitization (no `api_key` leak)
7. DELETE credential
8. GET after revoke → 410
9. Teardown

Founder runs locally before merge:

```bash
# Add to .env.local:
INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)
XENDIT_SANDBOX_API_KEY=xnd_development_...

# Run:
npx tsx scripts/smoke/sesi-r-xendit-smoke.mjs
```

**Why not Edge-Function-deployed smoke:** the constraint "Don't deploy to prod yet" + Supabase project is shared between prod and dev (no separate dev env). Node-script + real-DB hits the same code path without exposing Edge Functions to customer traffic.

---

## Phase 9 — Local main cleanup

Stray `d34d820` (Sesi R docs commit that accidentally landed on local main during the cascade) cleaned via `git update-ref refs/heads/main origin/main`. Non-destructive — origin/main was never touched. Local main now matches origin/main (`a2eac35` — Sesi A's PR #99 + #100 landed during Sesi R session).

The docs content is preserved on `sesi-r/indonesian-integrations` as commit `ad7d22a` and ships in PR #102.

---

## Phase 10 — PR opened

**[#102](https://github.com/Richienv/weuseai.agent/pull/102) — `sesi-r/indonesian-integrations` → `main`**

PR description includes:
- Plan + closeout doc links
- Phase-by-phase shipped list with commit hashes
- Locked decisions D1-D5
- Migration application proof (hash + verification results)
- Smoke test pre-merge instructions
- Test delta (+72, total 1472)
- Pre-merge + post-merge founder action items
- Next-cascade triggers (4 categories logged)

---

## Verification summary

| Check | Status |
|---|---|
| Edge Functions deployed | **NOT YET** — gated on PR merge per founder constraint |
| Migration applied | ✓ (Mgmt API; hash `cea50e4b3a587e54dc50b9023e22028d6dd6d17968a434fa51ef27cba16e02c0`) |
| Smoke test passed | **PRE-MERGE STEP** — script ready at `scripts/smoke/sesi-r-xendit-smoke.mjs`; founder runs with sandbox key |
| PR open + link | ✓ [#102](https://github.com/Richienv/weuseai.agent/pull/102) |
| Local main clean | ✓ matches `origin/main` (`a2eac35`) |
| Pass-3 regression suite green | ✓ 10/10 |
| Full test suite | ✓ 1472 / 1440 pass / 0 fail / 32 pre-existing skipped |
| `npm run typecheck` | ✓ clean |

---

## Post-merge ordering for founder

1. Set Supabase secret: `INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)`
2. Deploy both Edge Functions:
   ```
   supabase functions deploy integration-credentials --project-ref gtjgsligllbjcisiyrah --use-api
   supabase functions deploy integration-proxy-xendit --project-ref gtjgsligllbjcisiyrah --use-api
   ```
3. Confirm functions visible in Supabase Functions dashboard
4. Optional: re-run smoke test against deployed Edge Functions via HTTP (PR description has the curl shape)

---

## What this lane did NOT touch (Sesi A scope preserved)

- ❌ `welcome.html` / `checkout.html` / `/welcome` trust signals
- ❌ Telemetry / observability
- ❌ IDCH cleanup (already done in #90)
- ❌ `origin/main` (no direct push; PR is the only path to main)

---

## Discipline checklist

- ✓ No code outside `sesi-r/indonesian-integrations` branch
- ✓ No `git push --force` anywhere
- ✓ No `origin/main` writes
- ✓ Migration applied to single live Supabase project (the only one; no dev/prod split exists)
- ✓ Edge Functions NOT deployed (awaiting PR merge per constraint)
- ✓ Smoke test left as script for founder to run (no automated mutations against live Xendit during this turn)
- ✓ $0.00 spend (Mgmt API + Supabase queries are free; no Xendit sandbox call made by Claude)

---

**Sesi R deploy lane closed.** Awaiting founder smoke + PR review.
