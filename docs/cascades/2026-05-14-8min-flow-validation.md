# 8-Min Flow Validation — Phase F Cascade Log

**Priority lock:** `feedback_8min_flow_priority_lock.md`
**Unlock criterion (RELAXED 2026-05-15 — founder priority reframe):** 3 consecutive Phase F runs where **every stage passes** (no skips, no failures, no orphaned VPSes, no flake) AND the Stages 1-9 flow (payment → first `/start` response) finishes **under 15 min**, **plus** founder personally confirms a working agent reply on Telegram after a fresh real payment.
**Reliability > speed.** A clean 12-13 min run is a PASS; a fast run that fails any stage is a FAIL. Setup-script optimization, bundle-pull caching, warm-pool VPSes, pre-baked AMIs — ALL deferred to post-cascade. The founder's real pain is the chain *breaking*, not being slow.
**Harness:** `tests/e2e/smoke-chain.spec.ts`
**Mode:** all 3 runs on Xendit TEST mode (founder lock-in 2026-05-14, spend 0).

---

## Stage budgets

Per-stage ceiling. A stage that exceeds budget still completes but is flagged `over_budget`. **RELAXED 2026-05-15** (founder priority reframe): ~20% slack on every stage vs §8.6 measured values — reliability over tightness.

| Stage | Name | Budget | Notes |
|---|---|---|---|
| 1 | Create Xendit test invoice | 5s | |
| 2 | Pay invoice + webhook delivered | **10s** | Synthetic invoice.paid POST to xendit-webhook (founder decision 2026-05-15) — Xendit has no server-side invoice-pay API. Widened 6.5→10s: the handler `await`s `provisioning.spinUp` synchronously, run #1-retry measured 8.8s. |
| 3 | Customer + subscription rows created | **5s** | Two-query lookup (customer-by-email, then subscriptions-by-customer_id) — PostgREST `in.()` takes no subquery. Sub-second in practice. |
| 4 | VPS provisioned (ip_address assigned) | 120s | **Polls `vps_instances.ip_address` present** = VM booted + IP assigned. NOT `status=running` — the provisioning service only sets that after the whole setup-script (Stage 5's signal). Bug A fix 2026-05-15. |
| 5 | setup-script COMPLETE (status=running) | **480s** | **Polls `vps_instances.status='running'`** — the provisioning service sets that the moment the SSH setup-script exits 0 (`customer-flow.ts`). Widened 360→480s for setup-script reliability (§8.6 measured 7:30). Bails fast on `status='failed'`. |
| 6 | bundle-pull installed all tier personas | **60s** | Pro tier = 8 personas. Widened 30→60s. |
| 7 | hermes-gateway active | **60s** | Widened 30→60s. |
| 8 | Telegram getMe | **10s** | Widened 5→10s. |
| 9 | /start → first response | **90s** | Widened 60→90s for Telegram long-poll warm-up. |
| 10 | /<persona> → persona-correct response | **90s** | Widened 60→90s. |
| 11 | Teardown (delete VPS, cancel sub) | 30s | always runs (finally block) |

**Budget ceiling:** summing all 11 per-stage budgets = 5+10+5+120+480+60+60+10+90+90+30 = **960s = 16 min** worst-case ceiling; target completion **under 15 min** for the Stages 1-9 flow (1-9 budgets sum to 840s = 14 min). The relaxed budgets are deliberate — the cascade now validates that the chain *completes reliably*, not that it is fast. Setup-script (Stage 5) is the long pole and its optimization is explicitly deferred to post-cascade.

---

## Locked decisions (do not re-explore)

Permanent record of findings that cost investigation time. A future agent must NOT re-litigate these.

- **Xendit v2 invoices have no server-side payment-simulation API.** An invoice never materializes a payable instrument until a human picks a method on the hosted checkout page. `available_banks` carries bank codes only (no VA number); `POST /pool_virtual_accounts/simulate_payment` 400s for lack of a `fullPaymentCode`. The VA-simulate route is dead. Phase F Stage 2 therefore POSTs a synthetic `invoice.paid` event straight to `xendit-webhook` (founder decision 2026-05-15).
- **Xendit emits `payment_method: "QR_CODE"` for QRIS payments, NOT `"QRIS"`.** `"QRIS"` is the `payment_channel`, not the `payment_method`. Stage 2's synthetic body (`XENDIT_INVOICE_PAID_TEMPLATE` in the harness) is locked to `QR_CODE`, captured verbatim from a real Xendit API response for invoice `6a0570080168694c2c2d0ceb` (the founder's real test-mode payment 2026-05-14). Do not re-explore.
- **`vps_instances.status='running'` means the SSH setup-script has FINISHED — not that the VM is up.** The provisioning service (`services/provisioning/src/customer-flow.ts`) sets `status='running'` only after the setup-script exits 0, and `status='failed'` on error. The VM-booted signal is `ip_address` being non-null (set much earlier). Harness Stage 4 polls `ip_address`; Stage 5 polls `status='running'`. Run #1-retry (2026-05-15) failed because Stage 4 wrongly waited for `status='running'` at a 120s budget.
- **The Vultr API key's IP allowlist is IPv4-only.** Node Happy-Eyeballs intermittently egressed IPv6 from the Fly provisioning machine → Vultr `401 Unauthorized IP address`, flaking spin-up + tear-down. Fix: `services/provisioning/src/index.ts` forces IPv4 egress (`dns.setDefaultResultOrder('ipv4first')` + `net.setDefaultAutoSelectFamily(false)`); `vultr-vps.ts` logs the resolved IP family per call as regression evidence.

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

### Run `deployed-1778822779333` — 2026-05-15T05:26:24.365Z

- target: `deployed`
- email: `e2e-chain-1778822779333@weuseai.test`
- customer: `—` · subscription: `—` · vps: `—`
- Stages 1-9 all pass: **NO**
- chain time (Stages 1-9): **0.08 min** (budget 8.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 5.0s | 5s | fail |
| 2 | Pay invoice + webhook delivered | 0.0s | 7s | skipped |
| 3 | Customer + subscription rows created | 0.0s | 5s | skipped |
| 4 | VPS provisioned (status=running) | 0.0s | 120s | skipped |
| 5 | setup-script COMPLETE marker | 0.0s | 360s | skipped |
| 6 | bundle-pull installed all tier personas | 0.0s | 30s | skipped |
| 7 | hermes-gateway active | 0.0s | 30s | skipped |
| 8 | Telegram getMe | 0.0s | 5s | skipped |
| 9 | /start → first response | 0.0s | 60s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 60s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 0.0s | 30s | pass |

### Run `deployed-1778826775403` — 2026-05-15T06:35:25.396Z

- target: `deployed`
- email: `e2e-chain-1778826775403@weuseai.test`
- customer: `9bf6e8bd-5aa5-47ea-ae2f-554dc438d061` · subscription: `528fd081-e155-41f2-a06b-8a3561353169` · vps: `—`
- Stages 1-9 all pass: **NO**
- chain time (Stages 1-9): **2.45 min** (budget 8.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 2.8s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 8.8s | 7s | over_budget |
| 3 | Customer + subscription rows created | 1.0s | 5s | pass |
| 4 | VPS provisioned (status=running) | 134.6s | 120s | fail |
| 5 | setup-script COMPLETE marker | 0.0s | 360s | skipped |
| 6 | bundle-pull installed all tier personas | 0.0s | 30s | skipped |
| 7 | hermes-gateway active | 0.0s | 30s | skipped |
| 8 | Telegram getMe | 0.0s | 5s | skipped |
| 9 | /start → first response | 0.0s | 60s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 60s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 2.8s | 30s | fail |
