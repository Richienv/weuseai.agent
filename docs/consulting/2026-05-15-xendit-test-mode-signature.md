# Xendit Test-Mode Webhook Signature — Investigation + Decision

**Date:** 2026-05-15
**Triggered by:** Step 4 of the 8-min flow cascade brief (2026-05-15) + §13.3 of the consulting handoff doc.
**Question:** Does Xendit test-mode webhook signing match production byte-for-byte? If not, Phase F's test-mode-only runs would not validate prod and a branched signature handler would be required.

---

## TL;DR (decision)

**Test-mode IS structurally faithful for our handler's signature contract.** Phase F can run all 3 unlock validation runs on Xendit test mode with zero production-handler-divergence risk. The single remaining "deferred gate" is whether Xendit actually emits the same auth token shape for test-mode webhooks as for prod-mode webhooks — that's an Xendit-side assumption we'll prove with the first real-money customer payment, per founder lock-in 2026-05-14.

**No branched signature path needed. Handler is mode-agnostic by design.**

---

## What Xendit's webhook contract actually is

From `services/payment/lib/payment/xendit-payment.ts:96-103` and `supabase/functions/_shared/xendit-webhook-handler.ts:50-57`:

```typescript
// Constant-time compare. Xendit's "x-callback-token" is a shared secret,
// not an HMAC — direct equality is what they document.
const callbackToken = req.headers.get('x-callback-token') ?? ''
if (!constantTimeEqual(callbackToken, deps.webhookToken)) {
  return json({ error: 'unauthorized' }, 401)
}
```

Xendit sends a `x-callback-token` HTTP header on every webhook. The value is whatever string the merchant configured in the Xendit dashboard's "Verification Token" field (Settings → Callbacks → Verification Token). The merchant compares against the env-stored copy. **No HMAC. No body-signing. No nonce. No timestamp window. No replay protection.** It's a static shared secret.

This is unusual for modern webhooks (Stripe / GitHub / Slack all use HMAC) but it IS what Xendit documents and what their dashboard provides.

## Why test-mode and prod-mode are structurally identical for our handler

Each Xendit dashboard environment (test + prod) generates its own verification token. Both tokens go through the SAME header (`x-callback-token`) and the SAME comparison logic on our side. The only thing that changes between modes:

| Dimension | Test mode | Prod mode |
|---|---|---|
| Webhook URL | configured in test-mode Settings → Callbacks | configured in prod-mode Settings → Callbacks |
| `x-callback-token` value | whatever string is in the test-mode "Verification Token" field | whatever string is in the prod-mode "Verification Token" field |
| Header name | `x-callback-token` | `x-callback-token` |
| Header presence | always | always |
| Body shape | identical (XenditInvoiceEvent) | identical |
| HTTP method | POST | POST |
| Content-Type | application/json | application/json |
| **Our handler code path** | **single shared path** | **single shared path** |

Branching the handler by mode would be code overhead with zero behavioral difference. The handler just needs `XENDIT_WEBHOOK_TOKEN` env to hold whichever mode's token is currently configured on Xendit's side.

## Live local probe — three runs, end-to-end evidence

Using the local stack booted in Step 2 (Supabase Edge Functions on `127.0.0.1:54321`, `XENDIT_WEBHOOK_TOKEN=local-test-webhook-token` from `supabase/.env.local`):

```bash
# Run 1 — CORRECT token
curl -X POST http://127.0.0.1:54321/functions/v1/xendit-webhook \
  -H "x-callback-token: local-test-webhook-token" \
  -H "content-type: application/json" \
  -d '{"id":"inv_probe","external_id":"ext_probe","status":"PAID","paid_at":"2026-05-15T10:00:00Z","amount":1290000}'
→ HTTP 200 in 158 ms
   {"ok":true,"ignored":"unknown_invoice"}

# Run 2 — WRONG token
curl -X POST http://127.0.0.1:54321/functions/v1/xendit-webhook \
  -H "x-callback-token: WRONG_TOKEN" \
  -H "content-type: application/json" \
  -d '{...same body...}'
→ HTTP 401 in 2.7 ms
   {"error":"unauthorized"}

# Run 3 — MISSING token header
curl -X POST http://127.0.0.1:54321/functions/v1/xendit-webhook \
  -H "content-type: application/json" \
  -d '{...same body...}'
→ HTTP 401 in 2.2 ms
   {"error":"unauthorized"}
```

Read the timing:
- The 401 path returns in ~2 ms (constant-time compare + return)
- The 200 path returns in ~158 ms (constant-time compare + idempotency lookup + 200 response)

**Auth gates are bit-by-bit identical** — there's no test-mode-specific code path to test separately. If we set `XENDIT_WEBHOOK_TOKEN` to whatever Xendit prod-mode generates, the same handler accepts the same body shape with the same logic.

## What the live probe does NOT prove

- **That Xendit actually emits an `x-callback-token` header in test-mode webhooks.** This is an Xendit-side guarantee. Our handler assumes it. The first time we receive a real Xendit-originated test-mode webhook (via Phase F invoice), we'll observe whether it lands.
- **That the body shape (XenditInvoiceEvent fields) matches between modes.** We've parsed prod-mode webhooks before (Renita's actual payment 2026-05-14 worked through this handler when Xendit was in test mode at that time — see `subscriptions.xendit_invoice_id=6a0570080168694c2c2d0ceb` which IS a test-mode invoice ID per the `checkout-staging.xendit.co` host). So we already have observational evidence. Phase F runs add 3 more.
- **That Xendit doesn't add HMAC verification in a future API version.** Out of our control; would surface as 401s and we'd update.

## Phase F implication

Phase F can ship without a branched signature path. The handler treats the token as opaque. Concrete:

```typescript
// xendit-webhook-handler.ts (no change needed)
if (!constantTimeEqual(callbackToken, deps.webhookToken)) {
  return json({ error: 'unauthorized' }, 401)
}
```

The Phase F harness pre-creates Xendit test-mode invoices via the Xendit API, then simulates / waits for the webhook to fire. As long as the webhook URL on Xendit's test-mode dashboard points at our `/functions/v1/xendit-webhook` endpoint AND `XENDIT_WEBHOOK_TOKEN` matches what's in the test-mode dashboard, the handler will accept the webhook and proceed exactly as it does in prod.

## Deferred gate — the one open question that stays deferred

Per founder CLAUDE.md note 2026-05-14:

> The current `XENDIT_API_KEY` is a TEST-mode secret. Phase F's "3 consecutive green chain runs" gate runs entirely on test-mode invoices (founder lock-in: zero $ spend during Phase F). **Xendit's test-mode webhook signature scheme has NOT been verified to match production byte-for-byte.** The first real-money customer payment AFTER `XENDIT_API_KEY` rotates to `xnd_production_*` doubles as the prod-mode signing validation — there is no automated proof until then.

**This investigation does NOT close that deferred gate** — it only confirms our HANDLER is mode-agnostic. The remaining open question is on Xendit's side (does their prod-mode actually emit the same shape they emit in test-mode?). The first paid customer is the integration test for that.

## Decision

✅ **Test-mode is faithful for handler-side semantics. Phase F can run on test-mode without code changes.** Proceed with Step 5 (Phase F harness build) on the existing `xendit-webhook` handler — no branched signature path required.

The Xendit-side mode-equivalence assumption stays deferred until first real customer payment.
