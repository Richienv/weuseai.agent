# Go-live readiness — the ultimate checklist (2026-06-18)

Ultracode audit `w9gn56t3i` (7 agents, 6 layers, 57 items, 25 P0/blockers), grounded in the real code.

## Verdict: ⛔ NOT ready to take real money today

**What's solid (verified, prod-grade):** payment *capture* + webhook auth.
- Webhook signature (`x-callback-token`) is constant-time, fail-closed, mode-agnostic for prod (`xendit-webhook-handler.ts:381-412`).
- Idempotency is layered: active-sub short-circuit + idempotent UPDATE + the `vps_instances_one_active_per_customer` unique index (migration `20260614010000`).
- Charge integrity: server recomputes the amount from the locked catalog; the client cannot set a price (`create-invoice-handler.ts:166`, `pricing.ts`). Legacy slugs normalized before pricing.
- ToS consent written before the Xendit call (`create-invoice-handler.ts:135-162`).
- A real payment WILL be captured + recorded correctly.

**Why it's still NOT safe:** everything AFTER capture — the *paid-but-provisioning-failed recovery chain* — is broken in **4 compounding ways**. The first customer whose Vultr spin-up hiccups pays real money, gets no agent, is never auto-recovered, and silently accrues orphan VMs.

---

## P0 blockers

### Recovery chain (Claude can fix — backend code, no money, no prod secrets)
1. **Auto-retry worker is dead.** `retry-pending-provisions/index.ts:159-165` calls `decrypt_bot_token` with a non-existent `cust_id` param → every retry silently fails. Its 18/18 green test is a **false positive** — it mocks `buildSpinUpInput` and never imports the real edge fn (`tests/retry-pending-provisions-handler.spec.ts:114`). Fix: mirror the proven call sites (SELECT ciphertext, then rpc with `{encrypted, enc_key}`) + a test that imports the real fn.
2. **Retry cron POSTs to a NULL url.** `app.retry_pending_provisions_url/token` GUCs are never set — `deploy-all.sh:44-47` sets `fleet_sentinel`/`library_refine` but omits the retry ones. Fix: add them to the GUC heredoc (Claude writes, founder applies the JWT SQL).
3. **Failed-provision VM is never deleted.** `customer-flow.ts:430,464` flips `status='failed'` but the only `delete()` is at `:514` → an orphan VM bills ~$5/mo forever after a paid-but-failed provision. Fix: best-effort `deps.vps.delete(vps.uuid)` in both failure handlers + a test.
4. **Retry stacks a NEW VM per attempt.** `findActiveVPSByCustomer` filters `status in ('provisioning','running')` (`supabase-store.ts:61`) so failed rows are invisible and each retry stacks another VM. Fix: reuse-or-reap failed rows.

### Delivery (Claude can fix)
5. **No customer-facing BYOK key-swap.** When starter LLM credits drain, the customer silently 402s within days with no self-serve recovery. Fix: an X-CID-authed edge fn that validates a key + `refreshEnv` to rewrite the LLM key + restart hermes, plus a field in chat/onboarding.

### Founder-only
6. **Xendit prod rotation.** Rotate `XENDIT_API_KEY` (`xnd_development_*`→`xnd_production_*`) AND `XENDIT_WEBHOOK_TOKEN` (→ live Verification Token) **together, in one command** — rotating only one strands either the charge (still test mode) or the webhook (401 → paid-but-never-provisioned).
7. **Prod-mode body/signature unproven byte-for-byte.** The first real payment is the only proof. Tail `xendit-webhook` logs live within the 15-min window; watch for `callback-token rejected mode=live` or `ignored:'unknown_invoice'`.

---

## P1 (should-fix before scaling)
- **Price-rise wiring (799→999 after 1000):** founder already chose to make it real (so it's honest now), but it's UNWIRED — needs the cap-flip in charge logic + inverting the `plans-v14` "never charged" test. (Claude prepares the diff; founder confirms.)
- **The 1000 counter must count the right thing** — `subscription-count` counts `status=active` only; the batch trigger needs the correct definition (paid, not just active).
- DO failover may be silently OFF if the Fly `DIGITALOCEAN_API_KEY` is unset (Vultr-only).
- Founder-alert channels + sentinel cron GUCs may be unset (silent no-op) → failures fail silently.
- Confirm RLS/consent migrations are APPLIED in prod (not just green in tests).
- `support@weuseai.agent` likely bounces (`.agent` invalid TLD → `support@weuseai.id`); refund flow is fully manual.
- Webhook doesn't assert `event.amount == stored amount_idr` (cheap guard).

---

## Go-live runbook (ordered)
0. Founder: confirm the price-rise plan (DONE — make it real, 799→999 after batch 1).
1. **Claude:** land the 4 recovery-chain P0 fixes + BYOK + amount-guard on a branch, with real tests (no secrets, no money).
2. Founder: confirm prod prerequisites are actually set (DO key, alert GUCs, migrations applied).
3. Claude writes / founder applies the retry + sentinel pg_cron GUCs.
4. Claude redeploys all edge functions so deployed == main (the stale-deploy CORS lesson).
5. Claude runs the `:deployed` smokes against live functions (still TEST mode).
6. **Founder:** rotate Xendit to PROD (both secrets, one command) + redeploy.
7. Founder: stage the rollback plan BEFORE the first sale.
8. **Founder:** take ONE small real payment, watch the 15-min window live.
9. Hold at low volume until the recovery chain is proven on a REAL failure.

## Biggest risks
1. The broken recovery chain (4 compounding bugs) — first failed provision = paid customer with no agent + no recovery + orphan VMs.
2. **False-green tests** masking the worst P0 (the retry suite mocks the thing it should test).
3. Prod-mode webhook body shape unproven (nested `event.id` in a real prod body → `ignored:unknown_invoice`).
4. BYOK has no surface → paying customers silently 402 within days.
5. Several guards are "set manually, can't verify from repo" (DO failover, alert channels, retry GUCs).
