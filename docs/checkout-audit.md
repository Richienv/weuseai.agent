# Day 1 audit — `checkout.html` + Xendit integration map

**Audited file:** `checkout.html` (808 lines, last modified 2026-04-29)
**Audit date:** 2026-04-30
**Verdict:** Payment gateway **NOT YET WIRED**. Front-end is a Stripe-style design mockup with a placeholder submit handler. Integration plan documented inline (lines 785–791) but no server endpoint exists yet.

---

## 1. Xendit integration pattern

| Question | Finding |
|---|---|
| Pattern intended | **Hosted Invoice API** (per inline TODO at lines 785–791): server creates `Xendit.Invoice`, redirects browser to `invoice_url` |
| Currently wired | **No.** Form submit (lines 792–804) is a stub: shows "Processing…" → "Payment gateway not connected yet" → re-enables button. No network call. |
| URL endpoint POSTed to | None today. Planned: `POST /api/create-invoice` — does not exist anywhere in the repo (`vercel.json` has no functions, no `/api/` folder, no Supabase function yet) |
| Public vs secret key in front-end | **Neither.** Clean — there are zero Xendit references in the HTML/JS. `.env.example` (root) lists secret key, server-side, which is correct. |

**Implication:** the audit's most important finding — **everything below this point describes intended state vs current state, because the only Xendit logic that exists is the inline TODO comment.**

---

## 2. Customer data collection

### Currently collected on the form

| Field | DOM | Required | Notes |
|---|---|---|---|
| Email | `#email` | yes | Native HTML `required` |
| Country | `#country` | (default `ID`) | Select with 7 options |
| Postal code | `#postal` | no | Free text |
| Card number | `#cardNumber` | only if method=card/cicilan | Visual formatting only |
| Card exp | `#exp` | only if card | Visual formatting only |
| Card CVC | `#cvc` | only if card | Digit-only mask |
| Card name | `#cardName` | only if card | — |

### Carried through URL (read by `readURL()` line 618)

| Param | Purpose | Default |
|---|---|---|
| `?plan=starter\|pro\|studio` | Tier selection | `pro` |
| `?alwaysOn=1\|true` | Always-On add-on toggle | `false` |

### Carried through page state (`state` object line 612)

- `state.planKey` — from URL
- `state.methodId` — payment method radio (default `qris`)
- `state.alwaysOn` — toggle on the page also writes back to URL (`writeAlwaysOnToURL()` line 628)

### Metadata to Xendit

**Not implemented.** TODO inline at line 785 mentions `payment_methods` mapping (e.g. `qris -> ['QRIS']`, `va -> ['BCA','MANDIRI','BNI','BRI','PERMATA']`) and `fees: [{ type: 'ADMIN', value: fee }]` but no `external_id`, no `description`, no custom `metadata`.

---

## 3. Callback / redirect flow

| Hook | Status |
|---|---|
| Success URL | **Not configured.** TODO doesn't mention. Xendit Invoice API supports `success_redirect_url`. |
| Failure URL | **Not configured.** Xendit supports `failure_redirect_url`. |
| Webhook URL | **Not configured.** Per `NEXT.md` Day 2, target is Supabase Edge Function `supabase/functions/xendit-webhook/`. Doesn't exist yet (folder is empty placeholder). |

---

## 4. Tier handling

### Tiers — 3 plans, hardcoded in `PLANS` object (lines 542–567)

| Key | Setup price (display) | Old price (struck-through) |
|---|---|---|
| `starter` | Rp 299.000 | Rp 588.000 |
| `pro` | Rp 1.200.000 | Rp 3.500.000 |
| `studio` | Rp 4.900.000 | Rp 9.900.000 |

Detection: `?plan=` URL query param, validated against `PLANS` keys, falls back to `pro` if missing/invalid.

> **Brand-model alignment note.** Setup prices match `CLAUDE.md` Business Model v1.1 (Starter Rp 299k, Pro Rp 1.2jt, Studio Rp 4.9jt) — **good**.

### Always-On toggle

- **Carry-over from pricing page**: yes — read from `?alwaysOn=1`
- **Toggle on checkout page**: also yes — `#aoCheckbox` on left summary pane. Customer can flip at checkout, change syncs back to URL via `replaceState`.
- **Implication for Edge Function**: server must accept `alwaysOn: boolean` from the form payload as authoritative (URL is just UI state).

### Setup + hosting + Always-On — combined or split?

**Combined into one invoice.** `chargeBeforeFee()` (line 636) computes:

```
firstChargeIDR = setupPrice + 99_000 + (alwaysOn ? 49_000 : 0)
```

So the **first invoice** charges setup-fee + bulan-1 hosting + bulan-1 Always-On (if opted) as a **single payment**. UI explicitly shows "Setup + bulan pertama hosting · {tier}" subline (line 361) and a "Recurring tiap bulan: Rp 99k/bulan" informational footer (line 437–446).

---

## 5. Subscription handling

| Layer | Wired? | Detail |
|---|---|---|
| Setup fee one-time | ❌ stub | UI computes correct amount; no actual Xendit invoice call |
| Month-1 hosting (Rp 99k) | ❌ stub | Bundled into the same one-time invoice |
| Month-1 Always-On (Rp 49k) | ❌ stub | Bundled into the same one-time invoice |
| **Month-2+ hosting recurring** | **❌ MISSING** | No subscription/recurring logic anywhere. UI shows a "Recurring tiap bulan" note but it's display-only. |
| **Month-2+ Always-On recurring** | **❌ MISSING** | Same — display-only |

> **Critical gap** vs business model v1.1: hosting is positioned as "Rp 99k/bulan flat, stop kapan saja" (utility framing). The implementation today only collects month-1 with the setup fee. **Months 2+ have no billing path.**

### Recurring options for Xendit

Xendit has two relevant primitives we'll need to choose between:

1. **Recurring Payments API** (formerly "Subscriptions") — server-side schedule, Xendit auto-charges customer's saved payment method (card / e-wallet). Best UX, but card-on-file flow is more complex.
2. **Manual monthly invoice** — cron sends a fresh Invoice URL each month via email. Simpler, friction higher (customer clicks pay button monthly).
3. **Hybrid** — Recurring for card/e-wallet methods, manual for VA/QRIS (which don't support card-on-file).

**Recommendation:** Phase 1 = **manual monthly invoice via Supabase scheduled function**. Reason: simplest, doesn't require card-on-file flow, fits "stop kapan saja" framing (no auto-charge surprise). Phase 2 (after 10+ paying customers): add Recurring Payments for retained users who opt in.

---

## 6. Gaps / issues to fix for v1.1 alignment

### 🔴 Critical (blocking launch)

1. **No actual Xendit call.** `payForm.submit` is a stub (line 792). Need server endpoint that creates Xendit Invoice and returns `invoice_url`.
2. **No `/api/create-invoice` endpoint.** Repo has no `/api/` folder. Two architectural options:
   - **Vercel serverless function** at `/api/create-invoice.ts` next to the static landing (simplest, ships with current Vercel deploy)
   - **Supabase Edge Function** at `supabase/functions/create-invoice/` (cleaner separation, same place as `xendit-webhook`)
   - **Recommendation:** put `create-invoice` next to `xendit-webhook` in Supabase Edge Functions — both deal with Xendit, share signature-verify helpers, single deploy unit.
3. **No webhook handler.** `supabase/functions/xendit-webhook/` folder is empty placeholder. Day 2 task.
4. **No customer record creation.** Form has no path to insert into Supabase `customers` table → no way to link invoice to customer → webhook can't tell who to provision.
5. **No recurring billing.** Months 2+ hosting / Always-On have no billing mechanism. Display says "recurring" but back-end is one-shot.

### 🟡 Important (must fix during Day 2-5)

6. **Customer name not collected.** Only email. Needed for Xendit invoice (`payer_email` + `should_send_email`) and Telegram welcome message.
7. **Telegram bot token / chat ID not collected.** Per `CLAUDE.md` agent runtime: customer BYO bot token. Onboarding must capture this. Could be on a post-payment `/welcome` page (after VPS spawn) rather than checkout — keep checkout slim.
8. **No `external_id` / metadata.** Xendit Invoice needs `external_id` (our internal customer/invoice ID) so the webhook can route. Recommend: `external_id = inv_<customer_uuid>_<timestamp>`, plus `metadata: { customer_id, tier, always_on, kind: 'setup_first_month' }`.
9. **Tier comes from client URL — not server-validated.** Customer could `?plan=studio&plan_price_override=1`. Server must re-derive prices from `PLANS` table on the server, not trust the client.
10. **No success/failure redirect URLs.** Need `/welcome?cid=...` (success — already mentioned in `NEXT.md.platform` Day 2-3) and `/checkout?error=...` (failure).
11. **No idempotency key.** If customer double-clicks Pay, we'll create two invoices. Use `Idempotency-key` header on Xendit API call, derived from `(customer_id, plan, methodId)` hash.
12. **Tax = "Rp 0" hardcoded** (line 430). Indonesian VAT (PPN 11%) may or may not apply to digital services. **Founder confirm needed** before launch — flag in `NEXT.md`.

### 🟢 Cosmetic / Phase 2

13. **Promo code UI exists, no handler** (`#promoToggle` line 451, listener line 768). Skip until needed.
14. **Card fields in form for `card`/`cicilan` methods** but checkout flow goes to **Xendit hosted invoice** — these fields will be ignored on submit (Xendit collects card data on its own page). Either remove or keep purely cosmetic. **Recommend remove** for Phase 1 to avoid customer confusion.
15. **Country select includes US/UK/AU/JP** but business model is Indonesia-focused. Either restrict to ID or accept that international customers are out of scope but still see the option.

---

## 7. Recommended Edge Function design (input for Day 2)

Two functions, both at `supabase/functions/`:

### `create-invoice`

```
POST /create-invoice
Body: { plan: 'starter'|'pro'|'studio', alwaysOn: boolean, methodId: string,
        email: string, name: string, country: string, postal?: string }

1. Validate plan ∈ PLANS, methodId ∈ METHODS
2. Look up or create customers row by email → customer_id (uuid)
3. Compute server-authoritative amount: plan.price + 99_000 + (alwaysOn ? 49_000 : 0)
   + payment-method fee (re-derive — don't trust client fee)
4. Insert invoices row { id, customer_id, plan, always_on, amount_idr, status: 'pending' }
5. Call Xendit Create Invoice:
     external_id: inv_<customer_id>_<invoice_id>
     amount: <server-computed>
     payer_email: email
     description: "weuseai.agent · {tier} setup + bulan-1 hosting"
     payment_methods: <map from methodId>
     fees: [{ type: 'ADMIN', value: fee }]
     success_redirect_url: https://weuseai-agent.vercel.app/welcome?cid={customer_id}
     failure_redirect_url: https://weuseai-agent.vercel.app/checkout.html?plan={plan}&error=failed
     metadata: { customer_id, plan, always_on, kind: 'setup_first_month' }
6. Update invoices row with xendit_invoice_id
7. Return { invoice_url } to client
```

Idempotency: use `Idempotency-key: <customer_id>:<plan>:<methodId>:<day>` so retries within same day don't double-create.

### `xendit-webhook`

```
POST /xendit-webhook
Headers: x-callback-token: <Xendit signature>

1. Verify x-callback-token === XENDIT_WEBHOOK_TOKEN (constant-time compare)
2. Parse event { id, external_id, status, paid_at, payment_method, ... }
3. Idempotency: check invoices.status — if already 'paid', return 200 OK
4. Update invoices.status = 'paid' (or 'expired'/'failed')
5. On status='paid':
   - Insert subscription row { customer_id, plan, always_on, started_at, next_billing_at: +30 days }
   - POST to provisioning /spin-up { customerId, tier, alwaysOn }
6. Return 200 OK
```

### Recurring (separate, Day 6+ task)

`supabase/functions/_scheduled/monthly-billing` — runs daily, finds subscriptions where `next_billing_at < now() AND status = 'active'`, creates a fresh hosting/Always-On invoice via `create-invoice` internal call, emails customer the new invoice link.

---

## 8. checkout.html itself — what to change Day 2

Once Edge Function exists, swap the stub `payForm.submit` listener with:

```js
const res = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice`, {
  method: 'POST',
  headers: { 'content-type': 'application/json',
             'authorization': `Bearer ${SUPABASE_ANON_KEY}` },
  body: JSON.stringify({
    plan: state.planKey, alwaysOn: state.alwaysOn, methodId: state.methodId,
    email: form.email.value, name: form.name?.value,
    country: form.country.value, postal: form.postal.value,
  }),
})
const { invoice_url, error } = await res.json()
if (invoice_url) window.location.href = invoice_url
else showError(error)
```

Anon key can be public — it's protected by Supabase RLS + the Edge Function's own validation. Confirm with founder before exposing.

**Add to checkout.html:**
- `name` field (currently missing, but trivial to add)
- Submit error display (`<div id="payError">`)
- Remove or hide card detail fields (Xendit collects on its own hosted page)

**No structural changes** — current state.shape and PLAN/METHODS objects are already the right server contract.

---

## Audit summary table

| Concern | Today | After Day 2 (target) |
|---|---|---|
| Xendit call | none | hosted Invoice API via `create-invoice` Edge Function |
| Customer record | none | inserted on first invoice attempt |
| Webhook | none | `xendit-webhook` updates invoice + triggers provisioning |
| Setup + month-1 invoice | UI only | one Xendit invoice, server-computed amount |
| Months 2+ recurring | display only | manual monthly via scheduled function (Phase 1) |
| Telegram bot token | not captured | post-payment `/welcome` page (Day 4-5) |
| Tax | hardcoded Rp 0 | TBD — founder confirm PPN |

---

*End of audit. Ready for founder review before Day 2 implementation.*
