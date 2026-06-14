/**
 * Xendit webhook callback-token verification (signature hardening).
 *
 * Audit follow-up to CLAUDE.md § Deferred gate: the webhook MUST require a
 * valid `x-callback-token` (the `XENDIT_WEBHOOK_TOKEN` secret) on every
 * call. Xendit uses the SAME x-callback-token scheme in test and live mode
 * — verified against Xendit docs "Handling webhooks" + help.xendit.co
 * article 360038072991 "How to validate if the webhook is sent from
 * Xendit" — so these assertions hold across both modes; only the token
 * VALUE differs per environment.
 *
 * Contract pinned here:
 *   1. missing token   → rejected (401), no provisioning side effects
 *   2. wrong token     → rejected (401), no provisioning side effects
 *   3. correct token   → accepted (reaches the handler body → 200)
 *   4. blank configured token (misconfig) → rejected even with blank header
 *      (the old constantTimeEqual('', '') accepted this — regression guard)
 *   5. live mode behaves identically (same scheme, same gate)
 *
 * This test exercises ONLY the auth gate. Amounts / idempotency /
 * provisioning logic are covered by the sibling specs (wipe-stale-pair,
 * bot-token-snapshot, receipt-email) and are deliberately untouched here.
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

const WEBHOOK_TOKEN = 'xnd-verification-token-secret'

function paidRequest(
  invoiceId: string,
  opts: { token?: string | null } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  // When token is undefined → send the correct one. When null → send NO
  // header at all (missing). When a string → send that exact value.
  if (opts.token === undefined) {
    headers['x-callback-token'] = WEBHOOK_TOKEN
  } else if (opts.token !== null) {
    headers['x-callback-token'] = opts.token
  }
  return new Request('http://test.local/xendit-webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: invoiceId,
      external_id: `ext_${invoiceId}`,
      status: 'PAID',
      paid_at: '2026-06-14T07:30:00Z',
      payment_method: 'QRIS',
      amount: 799_000,
    }),
  })
}

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_under_test',
    customer_id: 'cust_under_test',
    tier: 'pro' as Tier,
    status: 'pending',
    xendit_invoice_id: 'xnd_inv_sig',
    always_on_enabled: false,
    hosting_active: false,
    next_billing_at: null,
    ...overrides,
  }
}

/**
 * Minimal store. Tracks whether any subscription mutation ran so the
 * "rejected" cases can prove the request never reached the handler body
 * (no DB writes, no provisioning) — auth fails closed.
 */
function makeStore(): IInvoiceStore & { state: { touched: boolean } } {
  const subs = [sub()]
  const state = { touched: false }
  return {
    state,
    async findCustomerByEmail() { return null },
    async findCustomerById() { return null },
    async insertCustomer({ email }) { return { id: `cust_${email}`, email } },
    async findSubscriptionByXenditInvoiceId(id) {
      state.touched = true
      return subs.find((s) => s.xendit_invoice_id === id) ?? null
    },
    async insertSubscription() { throw new Error('not used') },
    async updateSubscription(id, patch) {
      const i = subs.findIndex((s) => s.id === id)
      subs[i] = { ...subs[i], ...patch }
      return subs[i]
    },
    async insertSubscriptionInvoice() { return { id: 'si_test' } },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState() {},
    async insertConsentEvent() { return { id: 'consent_stub' } },
    async getDecryptedBotToken() { return null },
  } as IInvoiceStore & { state: { touched: boolean } }
}

const okProvisioning: IProvisioningClient & { state: { spunUp: boolean } } = {
  state: { spunUp: false },
  async spinUp() {
    this.state.spunUp = true
    return { ok: true }
  },
} as IProvisioningClient & { state: { spunUp: boolean } }

// ─── 1. Missing token → rejected ───────────────────────────────────────

test('missing x-callback-token → 401, no DB/provisioning side effects', async () => {
  const db = makeStore()
  const prov = { ...okProvisioning, state: { spunUp: false } }
  const res = await handleXenditWebhook(paidRequest('xnd_inv_sig', { token: null }), {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 401)
  const body = (await res.json()) as { error?: string }
  assert.equal(body.error, 'unauthorized')
  assert.equal(db.state.touched, false, 'must reject before touching the DB')
  assert.equal(prov.state.spunUp, false, 'must not provision on a rejected webhook')
})

test('empty x-callback-token header → 401', async () => {
  const db = makeStore()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_sig', { token: '' }), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 401)
  assert.equal(db.state.touched, false)
})

// ─── 2. Wrong token → rejected ─────────────────────────────────────────

test('wrong x-callback-token → 401, no DB/provisioning side effects', async () => {
  const db = makeStore()
  const prov = { ...okProvisioning, state: { spunUp: false } }
  const res = await handleXenditWebhook(
    paidRequest('xnd_inv_sig', { token: 'not-the-real-token' }),
    { db, provisioning: prov, webhookToken: WEBHOOK_TOKEN },
  )
  assert.equal(res.status, 401)
  const body = (await res.json()) as { error?: string }
  assert.equal(body.error, 'unauthorized')
  assert.equal(db.state.touched, false, 'must reject before touching the DB')
  assert.equal(prov.state.spunUp, false)
})

test('wrong token of equal length → 401 (constant-time path)', async () => {
  // Same length as the real token but different bytes — exercises the
  // constant-time compare branch rather than the length-mismatch fast path.
  const db = makeStore()
  const sameLenWrong = 'x'.repeat(WEBHOOK_TOKEN.length)
  assert.equal(sameLenWrong.length, WEBHOOK_TOKEN.length)
  const res = await handleXenditWebhook(
    paidRequest('xnd_inv_sig', { token: sameLenWrong }),
    { db, provisioning: okProvisioning, webhookToken: WEBHOOK_TOKEN },
  )
  assert.equal(res.status, 401)
  assert.equal(db.state.touched, false)
})

// ─── 3. Correct token → accepted ───────────────────────────────────────

test('correct x-callback-token → accepted (reaches handler, 200)', async () => {
  const db = makeStore()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_sig'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  assert.equal(db.state.touched, true, 'valid token must reach the handler body')
})

// ─── 4. Misconfig guard: blank configured token rejects even blank header ─

test('blank configured webhookToken → 401 even with blank header (no open webhook)', async () => {
  // Regression guard. The prior inline check did
  // constantTimeEqual('', '') === true, so a deploy that forgot to set
  // XENDIT_WEBHOOK_TOKEN would have accepted any caller sending a blank
  // (or absent) x-callback-token. The hardened gate rejects this.
  const db = makeStore()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_sig', { token: '' }), {
    db,
    provisioning: okProvisioning,
    webhookToken: '', // misconfigured / unset secret
  })
  assert.equal(res.status, 401)
  assert.equal(db.state.touched, false, 'unconfigured token must never authenticate')
})

test('blank configured webhookToken → 401 even with a non-empty header', async () => {
  const db = makeStore()
  const res = await handleXenditWebhook(
    paidRequest('xnd_inv_sig', { token: 'anything' }),
    { db, provisioning: okProvisioning, webhookToken: '' },
  )
  assert.equal(res.status, 401)
  assert.equal(db.state.touched, false)
})

// ─── 5. Live (prod) mode: same scheme, same gate ───────────────────────

test('live mode: correct token accepted (same x-callback-token scheme)', async () => {
  // When XENDIT_API_KEY rotates to xnd_production_*, index.ts passes
  // keyMode:'live'. The token check is identical — Xendit's scheme is
  // mode-agnostic; only the token value rotates per environment.
  const db = makeStore()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_sig'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
    keyMode: 'live',
  })
  assert.equal(res.status, 200)
  assert.equal(db.state.touched, true)
})

test('live mode: wrong token still rejected (401)', async () => {
  const db = makeStore()
  const res = await handleXenditWebhook(
    paidRequest('xnd_inv_sig', { token: 'wrong-in-prod' }),
    { db, provisioning: okProvisioning, webhookToken: WEBHOOK_TOKEN, keyMode: 'live' },
  )
  assert.equal(res.status, 401)
  assert.equal(db.state.touched, false)
})
