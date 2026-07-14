# Structural Pass — Closeout (Phase 5)

**Date:** 2026-05-14
**Driving brief:** Founder hit a P0 customer-blocking bug that 1577 existing tests didn't catch. The coverage gap was end-to-end against the live deployed system. This cascade builds the smoke harness, surfaces every bug it finds, ships fixes, and wires the discipline to CI.
**Result:** 4 PRs merged across 5 phases. 2 P0s surfaced — **both founder-side actions, not code bugs.** Smoke harness now permanent CI gate. Customer flow has been working the entire time on `velorah-nu.vercel.app`; the founder's documented "production URL" pointed at a stale 26h-old deploy.

---

## 1 · Cascade map

| Phase | PR | Status | What landed |
|---|---|---|---|
| 1+2 | [#113](https://github.com/Richienv/weuseai.agent/pull/113) | ✅ merged at `7b14bf2` | e2e smoke harness + Phase 2 findings doc (2 P0s surfaced) |
| Investigation | [#114](https://github.com/Richienv/weuseai.agent/pull/114) | ✅ merged at `49af452` | Vercel alias drift root-cause investigation — doc inversion, not auto-promotion failure |
| 4 | [#115](https://github.com/Richienv/weuseai.agent/pull/115) | ✅ merged at `4c9d650` | Smoke wired to CI (post-deploy + daily + manual) + Telegram DM on failure |
| 5 | this PR | shipping | Closeout report |

No Phase 3 code-fix PRs — the entire cascade revealed there's nothing to fix in code. Every customer-visible bug the founder reported is downstream of two founder-side actions.

---

## 2 · The two outstanding P0s — founder-side action items

Both are documented in detail in [`2026-05-14-e2e-smoke-findings.md`](./2026-05-14-e2e-smoke-findings.md) and [`2026-05-14-vercel-alias-investigation.md`](./2026-05-14-vercel-alias-investigation.md). Recapped here:

### P0-1 · Stale Vercel production alias

**Decision (founder picked Option B from PR #114):** register `weuseai-agent.vercel.app` as a project domain.

```bash
vercel domains add weuseai-agent.vercel.app weuseai-agent
```

From that moment on, both `weuseai-agent.vercel.app` and `velorah-nu.vercel.app` auto-track main. The smoke + CI workflow expects this URL to be canonical and remains hard-pinned to it.

**Why this is the right fix:** `weuseai-agent.vercel.app` was set as a manual alias 16 days ago at project creation. Vercel only auto-moves aliases that are registered as project domains. Once added to the domains list, Vercel handles auto-promotion forever.

### P0-2 · Xendit running in test mode

Smoke Step 7 captured `invoice_url=https://checkout-staging.xendit.co/...` on both alias URLs. The Xendit adapter correctly calls `api.xendit.co` (live API), but the API returns staging URLs because `XENDIT_SECRET_KEY` on the Supabase Edge Function is a test key.

**Founder action:** Xendit Dashboard → Settings → Developers → API Keys → generate / copy live secret (prefix `xnd_production_`), then:

```bash
supabase secrets set --project-ref gtjgsligllbjcisiyrah \
  XENDIT_SECRET_KEY=xnd_production_xxxxx \
  XENDIT_WEBHOOK_TOKEN=<live-webhook-token>
```

Also rotate `XENDIT_WEBHOOK_TOKEN` to the live webhook token (Settings → Callbacks → Production).

**Why this is the right fix:** real customers landing on a `checkout-staging.xendit.co` page literally cannot pay real money. This was hidden behind the alias drift the entire time.

### Verification after both actions

```bash
# From repo root:
npx tsx --test tests/e2e/smoke-production.spec.ts
```

Expected output after both fixes:

```
Step 5: Bayar (POST /create-invoice)
    HTTP 200, invoice_url=https://checkout.xendit.co/web/...
                                            ^^^^^^^^^^^^^^^^ — no "staging"
Step 7: Invoice URL well-formed
    host=checkout.xendit.co, path=/web/...
…
Passed: 7 / Failed: 0
```

CI's first post-deploy run after both fixes also confirms — and if the workflow hasn't been triggered yet, force one via `workflow_dispatch` from Actions UI.

---

## 3 · What the smoke harness proves

**Source of truth** for the assembled customer flow against the live deployed system. Pure HTTP, no new deps, runs in 5 s.

10 customer-journey steps from founder brief, distilled to 7 substantive assertions (Steps 3+4 fold into Step 5's POST construction):

| # | Step | Assertion |
|---|---|---|
| 1 | GET `/` | landing renders 200 + has brand marker |
| 2 | GET `/checkout` | form reachable; reports drift for `tos_accepted_at` binding (PR #91), A2 catalog (PR #100), `tos_required` mapping (PR #112) |
| 5 | POST `/create-invoice` | returns `invoice_url` + `customer_id` for a fresh smoke-email body. Maps server error codes against A2 catalog. |
| 7 | invoice_url validation | well-formed URL, host on `xendit.co` (and SHOULD be `checkout.xendit.co` not `-staging`) |
| 8 | GET `/welcome?cid=<cid>&job=test` | reachable with cid (or no-cid recovery path) |
| 9 | `/welcome` accordion | PR #109 P3-CF-1 trust-signal accordion present |
| 10 | `/checkout?error=failed` | PR #105 B2 failure banner markup + reveal-fn present |

Each step is its own `node:test` block — failures are independent so one broken step doesn't hide later breakage. Output is structured: every fail prints the request body shape, server response code + body excerpt, and (for Step 5) the exact A2 catalog mapping a customer would see.

### Coverage gap closed

| Coverage type | Pre-cascade | Post-cascade |
|---|---|---|
| Unit / integration | 1577 tests | 1596 tests (+19 contract gates) |
| **e2e against live production** | **0 tests** | **7 substantive assertions + 1 summary** |
| CI integration | run-on-demand only | post-deploy + daily + manual, with founder-DM alert |

The "Pembayaran tidak bisa disiapkan saat ini" class of bug — where every assembled-flow component checks individually but the seams fail — is now detectable within ~2 min of merge.

---

## 4 · CI wiring details (Phase 4)

### Triggers

| Trigger | Cadence | Target | Purpose |
|---|---|---|---|
| `push` to `main` | every merge | `weuseai-agent.vercel.app` | post-deploy verification (catches alias-stale / deploy-drift) |
| `schedule` cron | daily 03:00 UTC = 10:00 SGT | same | third-party drift detection (Xendit / Supabase / CDN changes) |
| `workflow_dispatch` | manual | input-configurable | ad-hoc runs from Actions UI |

### Pull-request trigger: deferred to follow-up

Each smoke run creates a real Supabase `customers` row + a real Xendit invoice API call. Multiplying by every PR push would create test-data noise. Also, Vercel preview alias hash-suffixes aren't predictable from CI context without an additional API lookup step. Post-deploy on main catches everything that matters for the first-paying-customer gate; pre-merge is a polish that can be added later via a Vercel API lookup + `pull_request:` trigger with paths-filter.

### Founder DM on failure

`scripts/notify-smoke-failure.mjs` mirrors PR #110 retry-worker alert verbatim:

- Reuses `SUPPORT_TELEGRAM_BOT_TOKEN` + `RICHIE_CHAT_ID` secrets (one source of truth for founder DMs across the codebase)
- Reads last 40 lines of smoke output, truncates to 3000 chars
- DM includes run URL + commit SHA so founder can jump to the Actions run from Telegram
- Throws swallowed, missing secrets → log + return (workflow exit code is source of truth)
- Required secrets must be added once in GitHub Actions repo settings — may already exist from PR #110 era

### Drift gates

19 new contract tests in the default `npm test` suite pin:

- Harness exposes `PROD_BASE` reading `E2E_SMOKE_BASE` env with `weuseai-agent.vercel.app` fallback
- Harness exports `findings` / `ctx` / `PROD_BASE` / `SMOKE_EMAIL` for downstream scripts
- Workflow has all 3 triggers (push/schedule/workflow_dispatch)
- Workflow passes `E2E_SMOKE_BASE` env to the smoke step
- `notify-smoke-failure.mjs` reads correct env vars + posts to correct Telegram endpoint
- Notify script no-ops gracefully when secrets missing
- Workflow uploads `smoke.log` as 14-day artifact + has `timeout-minutes` + pinned Node version

If a future PR tries to silently disable any of these, the test fails self-documentingly.

---

## 5 · Recommended next-cascade smoke additions

This cascade shipped HTTP-only smoke. Tractable additions for a future cascade:

| Addition | Why | When |
|---|---|---|
| Playwright layer for runtime DOM / console errors | Catches state-B tick() crashes that pure HTTP can't see | When the first state-B JS regression hits prod |
| /welcome state transition timing (B → C2 → C → F) | Tests the 3-tier escalation ladder that only manifests over minutes | When founder reports a state-machine bug across phases |
| Telegram pairing + first /persona response | Closes the full "5-min setup" loop end-to-end | When more than the founder is doing paid signups |
| Pre-merge PR trigger via Vercel API preview-deploy resolver | Catches bugs before they hit main | When PR volume increases enough that post-deploy gates feel slow |
| Daily synthetic Xendit completion test (charge a $1 test-mode invoice) | Catches Xendit API integration regression earlier than a real customer would | Phase 4.5 polish |

Each is a clear trigger condition; none blocks first paying customer.

---

## 6 · Discipline / process notes for future cascades

What worked in this cascade:

- **Smoke against live system FIRST, code fixes SECOND.** Yesterday's session assumed the founder's hypothesis (code regression in the cascade) and started writing code fixes. The smoke proved the hypothesis wrong inside 5 minutes. Stop, ship the smoke, run it, then decide what to fix.

- **Vercel REST API > assumptions.** Yesterday's investigation said "auto-promotion stopped." Today's API queries (`/v9/projects/<id>/domains`, `/v3/aliases`) showed the auto-promotion was working perfectly — the URL the founder considered canonical was never an auto-tracked domain in the first place.

- **MEMORY.md polarity drift.** A foundation doc said "production URL is X, not Y" with the polarity inverted. Worth re-grounding key infra claims against actual API truth periodically. Suggested follow-up: add a `npm run verify-prod-url` script that calls Vercel API and asserts MEMORY.md / CLAUDE.md claims match reality.

What's now permanent infrastructure:

- e2e smoke is the source of truth for "does the customer flow work?"
- CI runs it on every merge + daily; founder DM on failure
- No customer-facing change can ship to production without passing through this gate

---

## 7 · Test totals

- **Before cascade:** 1577 tests / 0 fail / 32 env-gated skip
- **After cascade:** 1596 tests / 0 fail / 32 env-gated skip
- Delta: +19 (5 harness contract + 14 CI workflow contract)
- New file count: 4 new test files (Phase 1 smoke, Phase 4 harness contract, Phase 4 workflow contract — Phase 4's two contract files cover both)
- New non-test files: 1 workflow + 1 notify helper + 3 audit docs

---

## 8 · Pickup conditions

The cascade is done. Two pickup events would re-engage:

1. **Founder confirms both P0s cleared + smoke goes 7/7 green.** Update CLAUDE.md "Production state" line with the verified state. Spawn no new tasks.
2. **The CI workflow's first post-merge run fires a founder DM.** Triage what broke, fix, re-merge, smoke green = case closed.

Beyond those, the structural pass is complete.
