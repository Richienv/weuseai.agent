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
| 5.5 | Pair — validate bot token | 10s | **Pairing stages added 2026-05-15.** `POST /validate-bot-token` — Telegram getMe, set the bot webhook, persist the encrypted token. A fresh customer spins up with NO bot token (gateway installed-but-not-started); these 4 stages are the real onboarding/pairing path that starts the gateway, which is what runs bundle-pull. |
| 5.6 | Pair — rotate pairing code | 5s | `POST /rotate-pairing-code` — mint the 6-digit code. |
| 5.7 | Pair — /pair links telegram_chat_id | 5s | Synthetic `/pair <code>` update POSTed to `pair-customer-bot-webhook` with the `X-Telegram-Bot-Api-Secret-Token` — real handler, real code match. |
| 5.8 | complete-onboarding → gateway starts | 60s | `POST /complete-onboarding` — renders SOUL.md, `refreshEnv` restarts hermes-gateway WITH the bot token; the gateway's `ExecStartPre` then runs bundle-pull. |
| 6 | bundle-pull installed all tier personas | **60s** | Pro tier = 8 personas. Widened 30→60s. |
| 7 | hermes-gateway active | **60s** | Widened 30→60s. |
| 8 | Telegram getMe | **10s** | Widened 5→10s. |
| 9 | /start → first response | **manual** | **MANUAL (2026-05-16).** A /start reply can only be validated by a real Telegram USER account — the harness holds only a bot token, and a bot's `getUpdates` poll conflicts with the hermes-gateway's own long-poll. Recorded `manual` (not pass, not fail). The founder confirms by hand — the "founder personally confirms a working agent reply" half of the unlock criterion. |
| 10 | /<persona> → persona-correct response | **manual** | **MANUAL (2026-05-16).** Same reason as Stage 9 — founder sends `/the-pro` and confirms a persona-correct reply. |
| 11 | Teardown (delete VPS, cancel sub) | 30s | always runs (finally block) |

**Budget ceiling:** the 13 automated stages' budgets sum to **860s ≈ 14 min** worst-case (Stages 9-10 are `manual`, 0s). These are observational ceilings (each stage's slack-padded worst case), NOT an expected total — a stage rarely runs near its ceiling. The pass criterion is the *measured* run finishing under 15 min with every automated stage clean (pass / over_budget) and Stages 9-10 `manual`; local + deployed runs land around 7-10 min. Setup-script (Stage 5) is the long pole and its optimization is explicitly deferred to post-cascade.

---

## Locked decisions (do not re-explore)

Permanent record of findings that cost investigation time. A future agent must NOT re-litigate these.

- **Xendit v2 invoices have no server-side payment-simulation API.** An invoice never materializes a payable instrument until a human picks a method on the hosted checkout page. `available_banks` carries bank codes only (no VA number); `POST /pool_virtual_accounts/simulate_payment` 400s for lack of a `fullPaymentCode`. The VA-simulate route is dead. Phase F Stage 2 therefore POSTs a synthetic `invoice.paid` event straight to `xendit-webhook` (founder decision 2026-05-15).
- **Xendit emits `payment_method: "QR_CODE"` for QRIS payments, NOT `"QRIS"`.** `"QRIS"` is the `payment_channel`, not the `payment_method`. Stage 2's synthetic body (`XENDIT_INVOICE_PAID_TEMPLATE` in the harness) is locked to `QR_CODE`, captured verbatim from a real Xendit API response for invoice `6a0570080168694c2c2d0ceb` (the founder's real test-mode payment 2026-05-14). Do not re-explore.
- **`vps_instances.status='running'` means the SSH setup-script has FINISHED — not that the VM is up.** The provisioning service (`services/provisioning/src/customer-flow.ts`) sets `status='running'` only after the setup-script exits 0, and `status='failed'` on error. The VM-booted signal is `ip_address` being non-null (set much earlier). Harness Stage 4 polls `ip_address`; Stage 5 polls `status='running'`. Run #1-retry (2026-05-15) failed because Stage 4 wrongly waited for `status='running'` at a 120s budget.
- **The Vultr API key's IP allowlist is IPv4-only.** Node Happy-Eyeballs intermittently egressed IPv6 from the Fly provisioning machine → Vultr `401 Unauthorized IP address`, flaking spin-up + tear-down. Fix: `services/provisioning/src/index.ts` forces IPv4 egress (`dns.setDefaultResultOrder('ipv4first')` + `net.setDefaultAutoSelectFamily(false)`); `vultr-vps.ts` logs the resolved IP family per call as regression evidence.
- **The harness ssh() MUST pin `UserKnownHostsFile=/dev/null`.** Vultr recycles public IPs across runs; each fresh VPS has a different host key. A shared `~/.ssh/known_hosts` then hits a CHANGED-key mismatch — which `StrictHostKeyChecking=no` does NOT bypass (it triggers the MITM warning + flaky connections). `/dev/null` makes every ephemeral VPS simply "new".
- **Stages 9-10 (/start + /<persona> replies) are `manual`, not automated — do not try to automate them.** Validating a bot's reply needs a real Telegram USER account; the harness holds only a bot token (a bot can't `/start` a bot, and the bot's own `getUpdates` poll conflicts with the hermes-gateway's long-poll). Recorded as status `manual` (not pass, not fail). The founder confirms /start + persona replies by hand — which is already the "founder personally confirms a working agent reply" half of the unlock criterion. Founder decision 2026-05-16.

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

### Run `deployed-1778829149015` — 2026-05-15T07:18:57.191Z

- target: `deployed`
- email: `e2e-chain-1778829149015@weuseai.test`
- customer: `834a82aa-c903-475f-89ce-efefd0f03d0e` · subscription: `babbfcd6-e60e-4091-ab3f-fbaf77d2ad6f` · vps: `932bf125-8e69-41b3-b36f-d27f51ba64cd`
- all 11 stages clean (no fail/skip): **NO**
- chain time (Stages 1-9): **6.42 min** (budget 15.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 3.5s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 7.0s | 10s | pass |
| 3 | Customer + subscription rows created | 1.1s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 48.4s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 322.5s | 480s | pass |
| 6 | bundle-pull installed all tier personas | 2.8s | 60s | fail |
| 7 | hermes-gateway active | 0.0s | 60s | skipped |
| 8 | Telegram getMe | 0.0s | 10s | skipped |
| 9 | /start → first response | 0.0s | 90s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 2.9s | 30s | pass |

### Run `deployed-1778834122615` — 2026-05-15T08:42:27.835Z

- target: `deployed`
- email: `e2e-chain-1778834122615@weuseai.test`
- customer: `a6c264d8-8990-4981-ab2d-a9faacfa2fa2` · subscription: `1d673597-6afa-4999-817c-1d070d63f4c8` · vps: `ceaaa734-f00e-4697-91ae-02fb494a1d91`
- all 15 stages clean (no fail/skip): **NO**
- chain time (Stages 1-9): **7.01 min** (budget 15.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 4.3s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 7.3s | 10s | pass |
| 3 | Customer + subscription rows created | 1.0s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 13.4s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 344.2s | 480s | pass |
| 5.5 | Pair — validate bot token | 7.5s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 3.0s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.8s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 33.9s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 4.8s | 60s | pass |
| 7 | hermes-gateway active | 0.6s | 60s | fail |
| 8 | Telegram getMe | 0.0s | 10s | skipped |
| 9 | /start → first response | 0.0s | 90s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 4.4s | 30s | pass |

### Run `deployed-1778834969861` — 2026-05-15T08:59:28.880Z

- target: `deployed`
- email: `e2e-chain-1778834969861@weuseai.test`
- customer: `0f08bbcd-7ee7-4296-ade5-123e8dd0e248` · subscription: `ff652ae8-ba7b-441c-a76a-e73a0aa8fea4` · vps: `1f985253-5256-4cf6-97b8-3fb612dfd299`
- all 15 stages clean (no fail/skip): **NO**
- chain time (Stages 1-9): **9.82 min** (budget 15.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 3.0s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 5.5s | 10s | pass |
| 3 | Customer + subscription rows created | 1.0s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 22.6s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 395.0s | 480s | pass |
| 5.5 | Pair — validate bot token | 3.0s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 0.9s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.7s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 28.1s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 2.3s | 60s | pass |
| 7 | hermes-gateway active | 2.7s | 60s | pass |
| 8 | Telegram getMe | 1.4s | 10s | pass |
| 9 | /start → first response | 123.0s | 90s | fail |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 10.0s | 30s | fail |

### Run `deployed-1778895246823` — 2026-05-16T01:41:10.132Z

- target: `deployed`
- email: `e2e-chain-1778895246823@weuseai.test`
- customer: `4421cf70-3a2f-412e-ae07-1b88ed57639f` · subscription: `322b7a87-51bc-424a-996d-d77c0b8f2096` · vps: `30c9d37c-824d-4e58-a66e-38fad64b8887`
- all 15 stages clean (no fail/skip): **YES**
- chain time (Stages 1-9): **7.01 min** (budget 15.00 min → UNDER)
- unlock-eligible: **YES**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 6.0s | 5s | over_budget |
| 2 | Pay invoice + webhook delivered | 9.5s | 10s | pass |
| 3 | Customer + subscription rows created | 1.0s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 7.1s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 354.1s | 480s | pass |
| 5.5 | Pair — validate bot token | 4.4s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 3.3s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 2.7s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 28.0s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 1.6s | 60s | pass |
| 7 | hermes-gateway active | 1.9s | 60s | pass |
| 8 | Telegram getMe | 1.0s | 10s | pass |
| 9 | /start → first response | 0.0s | 90s | manual |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | manual |
| 11 | Teardown (delete VPS, cancel sub) | 2.9s | 30s | pass |

### Run `deployed-1778895705602` — 2026-05-16T01:44:15.774Z

- target: `deployed`
- email: `e2e-chain-1778895705602@weuseai.test`
- customer: `bacb6455-a992-421e-8c64-47d741f647d8` · subscription: `d3dc9160-cfff-4060-bd15-4373eb2bdafd` · vps: `e4a69c24-b0b2-4e8b-98e1-121d01aca92b`
- all 15 stages clean (no fail/skip): **NO**
- chain time (Stages 1-9): **2.49 min** (budget 15.00 min → UNDER)
- unlock-eligible: **NO**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 2.7s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 6.4s | 10s | pass |
| 3 | Customer + subscription rows created | 0.9s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 14.1s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 125.3s | 480s | fail |
| 5.5 | Pair — validate bot token | 0.0s | 10s | skipped |
| 5.6 | Pair — rotate pairing code | 0.0s | 5s | skipped |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.0s | 5s | skipped |
| 5.8 | complete-onboarding → hermes-gateway starts | 0.0s | 60s | skipped |
| 6 | bundle-pull installed all tier personas | 0.0s | 60s | skipped |
| 7 | hermes-gateway active | 0.0s | 60s | skipped |
| 8 | Telegram getMe | 0.0s | 10s | skipped |
| 9 | /start → first response | 0.0s | 90s | skipped |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | skipped |
| 11 | Teardown (delete VPS, cancel sub) | 0.8s | 30s | pass |

### Run `deployed-1778897729613` — 2026-05-16T02:22:16.265Z

- target: `deployed`
- email: `e2e-chain-1778897729613@weuseai.test`
- customer: `2c8480a7-4cea-443c-ad76-7964865279e0` · subscription: `92fd7e5f-109c-4042-ac7c-f99faa8f483b` · vps: `496dc0a5-2dc1-4a11-b668-be1ca77666c9`
- all 15 stages clean (no fail/skip): **YES**
- chain time (Stages 1-9): **6.72 min** (budget 15.00 min → UNDER)
- unlock-eligible: **YES**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 3.4s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 7.1s | 10s | pass |
| 3 | Customer + subscription rows created | 1.0s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 15.9s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 341.5s | 480s | pass |
| 5.5 | Pair — validate bot token | 2.6s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 0.7s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.8s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 26.2s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 1.1s | 60s | pass |
| 7 | hermes-gateway active | 2.1s | 60s | pass |
| 8 | Telegram getMe | 1.1s | 10s | pass |
| 9 | /start → first response | 0.0s | 90s | manual |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | manual |
| 11 | Teardown (delete VPS, cancel sub) | 3.2s | 30s | pass |

### Run `deployed-1778898155812` — 2026-05-16T02:29:21.800Z

- target: `deployed`
- email: `e2e-chain-1778898155812@weuseai.test`
- customer: `68eff8d4-67c1-454e-84c3-56add6dffbcc` · subscription: `53a60e4f-e557-4fc5-bcca-4864fac19544` · vps: `2dcdf976-c16e-4cb1-ac57-0c0642f30a23`
- all 15 stages clean (no fail/skip): **YES**
- chain time (Stages 1-9): **6.68 min** (budget 15.00 min → UNDER)
- unlock-eligible: **YES**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 2.3s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 7.1s | 10s | pass |
| 3 | Customer + subscription rows created | 0.7s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 20.3s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 334.0s | 480s | pass |
| 5.5 | Pair — validate bot token | 2.9s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 0.7s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.8s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 27.6s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 1.9s | 60s | pass |
| 7 | hermes-gateway active | 1.1s | 60s | pass |
| 8 | Telegram getMe | 1.4s | 10s | pass |
| 9 | /start → first response | 0.0s | 90s | manual |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | manual |
| 11 | Teardown (delete VPS, cancel sub) | 5.4s | 30s | pass |

### Run `deployed-1778898587659` — 2026-05-16T02:36:34.439Z

- target: `deployed`
- email: `e2e-chain-1778898587659@weuseai.test`
- customer: `711bbc78-01b4-41f2-a37a-4c27216a2b12` · subscription: `fd6d6fe2-a93c-45a2-a209-10ed45c25dc6` · vps: `0375a4fe-709a-4cba-a227-833a005b2eea`
- all 15 stages clean (no fail/skip): **YES**
- chain time (Stages 1-9): **6.72 min** (budget 15.00 min → UNDER)
- unlock-eligible: **YES**

| Stage | Name | Elapsed | Budget | Status |
|---|---|---|---|---|
| 1 | Create Xendit test invoice | 3.6s | 5s | pass |
| 2 | Pay invoice + webhook delivered | 5.7s | 10s | pass |
| 3 | Customer + subscription rows created | 1.1s | 5s | pass |
| 4 | VPS provisioned (ip_address assigned) | 7.4s | 120s | pass |
| 5 | setup-script COMPLETE (status=running) | 349.2s | 480s | pass |
| 5.5 | Pair — validate bot token | 3.3s | 10s | pass |
| 5.6 | Pair — rotate pairing code | 0.9s | 5s | pass |
| 5.7 | Pair — /pair message links telegram_chat_id | 0.8s | 5s | pass |
| 5.8 | complete-onboarding → hermes-gateway starts | 26.3s | 60s | pass |
| 6 | bundle-pull installed all tier personas | 2.6s | 60s | pass |
| 7 | hermes-gateway active | 1.0s | 60s | pass |
| 8 | Telegram getMe | 1.2s | 10s | pass |
| 9 | /start → first response | 0.0s | 90s | manual |
| 10 | /<persona> → persona-correct response | 0.0s | 90s | manual |
| 11 | Teardown (delete VPS, cancel sub) | 3.6s | 30s | pass |
