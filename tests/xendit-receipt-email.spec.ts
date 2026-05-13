/**
 * Sesi B P0 #7 — payment receipt email wiring.
 *
 * Verifies xendit-webhook's PAID path triggers a receipt email through
 * the new (optional) deps.sendReceiptEmail hook. Email send is best-effort
 * — webhook still returns 200 even if the send fails — but on success the
 * builder produces the expected BI-language subject + body shape.
 *
 * Stub mode (no RESEND_API_KEY) is handled by email-delivery.ts itself
 * and is covered by tests/email-delivery.spec.ts; here we only verify
 * the integration call shape.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleXenditWebhook } from '../supabase/functions/_shared/xendit-webhook-handler.ts'
import type {
  IInvoiceStore,
  IProvisioningClient,
  SubscriptionRow,
  Tier,
} from '../supabase/functions/_shared/types.ts'
import {
  buildPaymentReceiptEmailBody,
} from '../supabase/functions/_shared/email-delivery.ts'

const WEBHOOK_TOKEN = 'test-webhook-secret'

function paidRequest(invoiceId: string): Request {
  return new Request('http://test.local/xendit-webhook', {
    method: 'POST',
    headers: {
      'x-callback-token': WEBHOOK_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: invoiceId,
      external_id: `ext_${invoiceId}`,
      status: 'PAID',
      paid_at: '2026-05-12T03:00:00Z',
      payment_method: 'QRIS',
      amount: 348_000,
    }),
  })
}

function fakeStore(seed: { sub: SubscriptionRow; customerEmail?: string | null }): IInvoiceStore & {
  state: { receiptCustomerLookups: string[] }
} {
  const subs = [seed.sub]
  const receiptCustomerLookups: string[] = []
  return {
    state: { receiptCustomerLookups },
    async findCustomerByEmail() {
      return null
    },
    async findCustomerById(customerId: string) {
      receiptCustomerLookups.push(customerId)
      if (seed.customerEmail === undefined) return null
      if (seed.customerEmail === null) return null
      return { id: customerId, email: seed.customerEmail, display_name: null }
    },
    async insertCustomer({ email }) {
      return { id: `cust_${email}`, email }
    },
    async findSubscriptionByXenditInvoiceId(id) {
      return subs.find((s) => s.xendit_invoice_id === id) ?? null
    },
    async insertSubscription() {
      throw new Error('not used')
    },
    async updateSubscription(id, patch) {
      const i = subs.findIndex((s) => s.id === id)
      subs[i] = { ...subs[i], ...patch }
      return subs[i]
    },
    async insertSubscriptionInvoice() {
      return { id: 'si_test' }
    },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState() {},
    async insertConsentEvent() {
      // Sesi D pass-3 P0 stub — receipt-email tests don't exercise consent.
      return { id: 'consent_stub' }
    },
  }
}

const okProvisioning: IProvisioningClient = {
  async spinUp() {
    return { ok: true }
  },
}

function pendingSub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_1',
    customer_id: 'cust_123',
    tier: 'starter' as Tier,
    status: 'pending',
    xendit_invoice_id: 'xnd_inv_42',
    always_on_enabled: false,
    hosting_active: false,
    next_billing_at: null,
    ...overrides,
  }
}

// ─── builder shape ──────────────────────────────────────────────────────

test('buildPaymentReceiptEmailBody: BI subject + body covers all key facts', () => {
  const { subject, text } = buildPaymentReceiptEmailBody({
    invoice_id: 'xnd_inv_42',
    tier: 'pro',
    amount_idr: 1_398_723,
    payment_method: 'QRIS',
    paid_at_iso: '2026-05-12T03:00:00Z',
  })
  assert.match(subject, /weuseai\.agent/i)
  assert.match(subject, /pembayaran|bukti|invoice/i, 'subject mentions payment receipt in BI')
  assert.ok(text.includes('xnd_inv_42'), 'body contains invoice id')
  // Indonesian Rp formatting uses '.' as thousands separator
  assert.ok(text.includes('Rp 1.398.723'), 'body contains formatted IDR total')
  assert.ok(text.includes('QRIS'), 'body contains payment method')
  // CLAUDE.md voice rules
  assert.ok(!text.includes('!'), 'no exclamation marks in body')
  assert.ok(!/basically|just|literally|honestly|10x|revolutionary/i.test(text), 'no banned marketing words')
})

test('buildPaymentReceiptEmailBody: includes refund-policy reference for trust', () => {
  const { text } = buildPaymentReceiptEmailBody({
    invoice_id: 'x',
    tier: 'starter',
    amount_idr: 348_000,
    payment_method: 'QRIS',
    paid_at_iso: '2026-05-12T03:00:00Z',
  })
  assert.match(text, /refund-policy|pengembalian/i, 'body references refund policy')
})

// ─── integration ────────────────────────────────────────────────────────

test('PAID: when sendReceiptEmail dep + customer email present → email sent with right args', async () => {
  const db = fakeStore({
    sub: pendingSub(),
    customerEmail: 'pelanggan@contoh.id',
  })
  const sends: { to: string; subject: string; text: string }[] = []
  const res = await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
    sendReceiptEmail: async (args) => {
      sends.push(args)
      return { ok: true }
    },
  })
  assert.equal(res.status, 200)
  assert.equal(sends.length, 1, 'sendReceiptEmail called once')
  assert.equal(sends[0].to, 'pelanggan@contoh.id')
  assert.match(sends[0].subject, /weuseai\.agent/i)
  assert.ok(sends[0].text.includes('xnd_inv_42'))
  // Customer lookup happened with customer_id from the subscription row
  assert.deepEqual(db.state.receiptCustomerLookups, ['cust_123'])
})

test('PAID: when customer email missing → no send attempt, webhook still 200', async () => {
  const db = fakeStore({
    sub: pendingSub({ id: 'sub_2', xendit_invoice_id: 'xnd_inv_43', customer_id: 'cust_no_email' }),
    customerEmail: null,
  })
  const sends: unknown[] = []
  const res = await handleXenditWebhook(paidRequest('xnd_inv_43'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
    sendReceiptEmail: async (args) => {
      sends.push(args)
      return { ok: true }
    },
  })
  assert.equal(res.status, 200)
  assert.equal(sends.length, 0, 'no send attempted')
})

test('PAID: sendReceiptEmail throws → still returns 200 (best-effort)', async () => {
  const db = fakeStore({
    sub: pendingSub({ id: 'sub_3', xendit_invoice_id: 'xnd_inv_44' }),
    customerEmail: 'a@b.id',
  })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_44'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
    sendReceiptEmail: async () => {
      throw new Error('resend dropped the call')
    },
  })
  assert.equal(res.status, 200, 'email failure does not break webhook')
})

test('PAID: no sendReceiptEmail dep provided → handler tolerates absence (backwards-compat)', async () => {
  const db = fakeStore({
    sub: pendingSub({ id: 'sub_4', xendit_invoice_id: 'xnd_inv_45' }),
    customerEmail: 'a@b.id',
  })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_45'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
})
