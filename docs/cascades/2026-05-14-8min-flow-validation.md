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
| 2 | Pay invoice + webhook delivered | **6.5s** | Synthetic invoice.paid POST to xendit-webhook (founder decision 2026-05-15) — Xendit has no server-side invoice-pay API. **Recalibrated 2→6.5s after run #1** (Cowork consult 2026-05-15): decomposes into *webhook delivery <500ms* + *synchronous spin-up kick <6s* — the handler `await`s `provisioning.spinUp` before returning, so run #1's measured 6.7s is the real shape, not an anomaly. |
| 3 | Customer + subscription rows created | **5s** | **Recalibrated 30→5s after run #1** (Cowork consult 2026-05-15): run #1's 37.2s was the malformed `in.()`-subquery harness bug, not real latency. The corrected two-query lookup (customer-by-email, then subscriptions-by-customer_id) returns sub-second; 5s is the observational ceiling allowing for one poll cycle of replication lag. |
| 4 | VPS provisioned (status=running) | 120s | Vultr provisions fast |
| 5 | setup-script COMPLETE marker | **360s** | **Bumped 4→6min** — reconciled vs handoff §8.6's measured 7:30 setup wall-clock |
| 6 | bundle-pull installed all tier personas | 30s | Pro tier = 8 personas |
| 7 | hermes-gateway active | 30s | |
| 8 | Telegram getMe | 5s | |
| 9 | /start → first response | **60s** | **Widened 30→60s** for Telegram long-poll warm-up |
| 10 | /<persona> → persona-correct response | **60s** | **Widened 30→60s** — beyond unlock budget |
| 11 | Teardown (delete VPS, cancel sub) | 30s | always runs (finally block) |

**Budget tension flagged up front:** summing the per-stage budgets for Stages 1-9 gives 5+6.5+5+120+360+30+30+5+60 = **621.5s = 10.4 min**, which is OVER the 8-min unlock target. The budgets are observational ceilings (what §8.6 measured), not aspirational. Run #1's ACTUAL timing is the data point that decides whether the 8-min lock is achievable as-is or whether setup-script needs optimization. This is the "cheapest data point" the Cowork consult asked to surface after run #1.

---

## Locked decisions (do not re-explore)

Permanent record of findings that cost investigation time. A future agent must NOT re-litigate these.

- **Xendit v2 invoices have no server-side payment-simulation API.** An invoice never materializes a payable instrument until a human picks a method on the hosted checkout page. `available_banks` carries bank codes only (no VA number); `POST /pool_virtual_accounts/simulate_payment` 400s for lack of a `fullPaymentCode`. The VA-simulate route is dead. Phase F Stage 2 therefore POSTs a synthetic `invoice.paid` event straight to `xendit-webhook` (founder decision 2026-05-15).
- **Xendit emits `payment_method: "QR_CODE"` for QRIS payments, NOT `"QRIS"`.** `"QRIS"` is the `payment_channel`, not the `payment_method`. Stage 2's synthetic body (`XENDIT_INVOICE_PAID_TEMPLATE` in the harness) is locked to `QR_CODE`, captured verbatim from a real Xendit API response for invoice `6a0570080168694c2c2d0ceb` (the founder's real test-mode payment 2026-05-14). Do not re-explore.

---

## Runs

Each Phase F run appends a block below automatically (the harness writes to this file). Founder reviews after run #1 before runs #2-3 proceed.

<!-- run blocks appended below by tests/e2e/smoke-chain.spec.ts -->


### Run `deployed-1778821590954` — 2026-05-15T05:07:19.589Z

- target: `deployed`
- email: `e2e-chain-1778821590954@weuseai.test`
- customer: `—` · subscription: `—` · vps: `—`
- Stages 1-9 all pass: **NO**
- chain time (Stages 1-9): **0.81 min** (budget 8.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 4.7s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 6.7s | 2s | over_budget |
| 3 | Customer + subscription rows created | 37.2s | 30s | fail |
| 4 | VPS provisioned (status=running) | 0.0s | 120s | skipped |
| 5 | setup-script COMPLETE marker | 0.0s | 360s | skipped |
| 6 | bundle-pull installed all tier personas | 0.0s | 30s | skipped |
| 7 | hermes-gateway active | 0.0s | 30s | skipped |
| 8 | Telegram getMe | 0.0s | 5s | skipped |
| 9 | /start → first response | 0.0s | 60s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 60s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 0.0s | 30s | pass |
