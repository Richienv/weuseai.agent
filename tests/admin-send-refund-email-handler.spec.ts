// Phase A2 PR 5 — admin-send-refund-email pure handler tests.
//
// Service-role-gated POST that takes { customer_id, refund_amount_idr,
// refund_method, refund_reason, invoice_id?, eta_business_days? } and
// emails the customer the refund.md template via Resend.
//
// The Edge Function entry handles the auth check (isServiceRoleCaller)
// + CORS. This pure handler validates input shape, fetches customer
// email/display_name, renders refund.md, calls sendEmail.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleAdminSendRefundEmail,
  type AdminSendRefundEmailDeps,
  type AdminSendRefundEmailInput,
} from '../supabase/functions/_shared/admin-send-refund-email-handler.ts'
import type { SendEmailInput, SendEmailResult } from '../supabase/functions/_shared/email-delivery.ts'

function makeDeps(over: Partial<AdminSendRefundEmailDeps> = {}): AdminSendRefundEmailDeps & {
  sent: SendEmailInput[]
} {
  const sent: SendEmailInput[] = []
  return {
    sent,
    findCustomer: over.findCustomer ?? (async () => ({
      email: 'renita@example.com',
      display_name: 'Renita',
    })),
    sendEmail:
      over.sendEmail ??
      (async (input: SendEmailInput): Promise<SendEmailResult> => {
        sent.push(input)
        return { ok: true, resend_id: 'r-1' }
      }),
  }
}

function input(over: Partial<AdminSendRefundEmailInput> = {}): AdminSendRefundEmailInput {
  return {
    customer_id: '00000000-0000-0000-0000-000000000001',
    refund_amount_idr: 399000,
    refund_method: 'QRIS',
    refund_reason: 'permintaan pelanggan',
    ...over,
  }
}

// ─── happy path ─────────────────────────────────────────────────────────

test('valid input → 200, refund email shipped via sendEmail', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(input({ invoice_id: 'INV-2026-001' }), deps)
  assert.equal(r.ok, true)
  assert.equal(r.status, 200)
  assert.equal(deps.sent.length, 1)
  assert.equal(deps.sent[0].to, 'renita@example.com')
  assert.match(deps.sent[0].subject, /INV-2026-001/)
  assert.match(deps.sent[0].text, /Halo Renita,/)
  assert.match(deps.sent[0].text, /Rp 399\.000/)
  assert.match(deps.sent[0].text, /QRIS/)
})

test('invoice_id omitted → subject says "Pengembalian dana sudah kami proses — N\\/A"', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(input(), deps)
  assert.equal(r.ok, true)
  // Subject is allowed to use "N/A" fallback when invoice_id missing
  assert.match(deps.sent[0].subject, /Pengembalian dana sudah kami proses/)
})

test('eta_business_days defaults to 7 when omitted', async () => {
  const deps = makeDeps()
  await handleAdminSendRefundEmail(input(), deps)
  assert.match(deps.sent[0].text, /7 hari kerja/)
})

test('eta_business_days override is honored', async () => {
  const deps = makeDeps()
  await handleAdminSendRefundEmail(input({ eta_business_days: 14 }), deps)
  assert.match(deps.sent[0].text, /14 hari kerja/)
})

// ─── input validation ──────────────────────────────────────────────────

test('missing customer_id → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(
    { ...input(), customer_id: '' } as AdminSendRefundEmailInput,
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
  assert.equal(r.error, 'invalid_input')
  assert.match(r.detail!, /customer_id/)
  assert.equal(deps.sent.length, 0)
})

test('non-numeric refund_amount_idr → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(
    { ...input(), refund_amount_idr: 'not a number' as unknown as number },
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

test('zero or negative refund_amount_idr → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(
    { ...input(), refund_amount_idr: 0 },
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

test('empty refund_method → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendRefundEmail(
    { ...input(), refund_method: '' },
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

// ─── customer lookup ───────────────────────────────────────────────────

test('customer not found → 404 customer_not_found', async () => {
  const deps = makeDeps({ findCustomer: async () => null })
  const r = await handleAdminSendRefundEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 404)
  assert.equal(r.error, 'customer_not_found')
  assert.equal(deps.sent.length, 0)
})

test('customer with empty email → 422 customer_has_no_email', async () => {
  const deps = makeDeps({
    findCustomer: async () => ({ email: '', display_name: 'Renita' }),
  })
  const r = await handleAdminSendRefundEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 422)
  assert.equal(r.error, 'customer_has_no_email')
})

test('missing display_name → falls back to "pelanggan"', async () => {
  const deps = makeDeps({
    findCustomer: async () => ({ email: 'renita@example.com', display_name: null }),
  })
  const r = await handleAdminSendRefundEmail(input(), deps)
  assert.equal(r.ok, true)
  assert.match(deps.sent[0].text, /Halo pelanggan,/)
})

// ─── sendEmail failure ─────────────────────────────────────────────────

test('sendEmail failure → 502 email_send_failed with detail', async () => {
  const deps = makeDeps({
    sendEmail: async () => ({
      ok: false,
      error: 'resend_http_error',
      detail: 'HTTP 429: rate limit',
    }),
  })
  const r = await handleAdminSendRefundEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 502)
  assert.equal(r.error, 'email_send_failed')
  assert.match(r.detail!, /resend_http_error.*HTTP 429/)
})

// ─── IDR formatting ────────────────────────────────────────────────────

test('refund_amount_idr formats with Indonesian thousands separator', async () => {
  const deps = makeDeps()
  await handleAdminSendRefundEmail(input({ refund_amount_idr: 1290000 }), deps)
  assert.match(deps.sent[0].text, /Rp 1\.290\.000/)
})

// ─── voice rules sanity ────────────────────────────────────────────────

test('rendered body honors voice rules (no exclamation, kamu form)', async () => {
  const deps = makeDeps()
  await handleAdminSendRefundEmail(input({ invoice_id: 'INV-1' }), deps)
  const text = deps.sent[0].text
  assert.equal((text.match(/!/g) ?? []).length, 0)
  assert.match(text, /\bkamu\b/i)
  assert.doesNotMatch(text, /\bAnda\b/)
})
