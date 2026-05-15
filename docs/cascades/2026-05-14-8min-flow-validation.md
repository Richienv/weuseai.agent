# 8-Min Flow Validation — Phase F Cascade Log

**Priority lock:** `feedback_8min_flow_priority_lock.md`
**Unlock criterion:** 3 consecutive Phase F runs where Stages 1-9 (payment → first `/start` response) all pass AND total chain time ≤ 8 min, **plus** founder personally confirms a working agent reply on Telegram after a fresh real payment.
**Harness:** `tests/e2e/smoke-chain.spec.ts`
**Mode:** all 3 runs on Xendit TEST mode (founder lock-in 2026-05-14, spend 0).

---

## Stage budgets

Per-stage ceiling. A stage that exceeds budget still completes but is flagged `over_budget`. Stages 1-9 sum to the 8-min unlock budget; Stages 10-11 are verification + cleanup beyond it.

| Stage | Name | Budget | Notes |
|---|---|---|---|
| 1 | Create Xendit test invoice | 5s | |
| 2 | Pay invoice + webhook delivered | 2s | |
| 3 | Customer + subscription rows created | 30s | |
| 4 | VPS provisioned (status=running) | 120s | Vultr provisions fast |
| 5 | setup-script COMPLETE marker | **360s** | **Bumped 4→6min** — reconciled vs handoff §8.6's measured 7:30 setup wall-clock |
| 6 | bundle-pull installed all tier personas | 30s | Pro tier = 8 personas |
| 7 | hermes-gateway active | 30s | |
| 8 | Telegram getMe | 5s | |
| 9 | /start → first response | **60s** | **Widened 30→60s** for Telegram long-poll warm-up |
| 10 | /<persona> → persona-correct response | **60s** | **Widened 30→60s** — beyond unlock budget |
| 11 | Teardown (delete VPS, cancel sub) | 30s | always runs (finally block) |

**Budget tension flagged up front:** summing the per-stage budgets for Stages 1-9 gives 5+2+30+120+360+30+30+5+60 = **642s = 10.7 min**, which is OVER the 8-min unlock target. The budgets are observational ceilings (what §8.6 measured), not aspirational. Run #1's ACTUAL timing is the data point that decides whether the 8-min lock is achievable as-is or whether setup-script needs optimization. This is the "cheapest data point" the Cowork consult asked to surface after run #1.

---

## Runs

Each Phase F run appends a block below automatically (the harness writes to this file). Founder reviews after run #1 before runs #2-3 proceed.

<!-- run blocks appended below by tests/e2e/smoke-chain.spec.ts -->

