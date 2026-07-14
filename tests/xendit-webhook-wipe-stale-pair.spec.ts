/**
 * HF-1 (2026-05-12): xendit-webhook wipes stale pair state when a
 * pending → active subscription transition fires.
 *
 * Trigger (founder Q1 lock): "new subscription = clean wipe".
 * Every transition from pending → active wipes the customer row's
 * pair state (bot token, username, chat id, soul, pairing code).
 *
 * Test cases pinned by founder cascade brief:
 *   1. New customer + new sub → wipe still fires (no-op since fields are NULL)
 *   2. Existing customer + new sub (email reuse) → wipe fires
 *   3. Existing customer + renewed sub after cancel → wipe fires
 *   4. Persona-refresh path (idempotent PAID on already-active sub) → NO wipe
 *      (preserves Phase 2E-2 persona-refresh fast-path)
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
      paid_at: '2026-05-12T07:30:00Z',
      payment_method: 'QRIS',
      amount: 348_000,
    }),
  })
}

function makeStore(seed: { sub: SubscriptionRow }): IInvoiceStore & {
  state: { wipes: string[] }
} {
  const subs = [seed.sub]
  const wipes: string[] = []
  return {
    state: { wipes },
    async findCustomerByEmail() { return null },
    async findCustomerById() { return null },
    async insertCustomer({ email }) { return { id: `cust_${email}`, email } },
    async findSubscriptionByXenditInvoiceId(id) {
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
    async clearStalePairState(customerId: string) {
      wipes.push(customerId)
    },
    async insertConsentEvent() {
      // Sesi D pass-3 P0 stub — webhook tests don't exercise consent.
      return { id: 'consent_stub' }
    },
    async getDecryptedBotToken() {
      // Phase E Option 2 part 2 (2026-05-14): no-op for wipe-semantics
      // tests. The dedicated snapshot tests live in
      // tests/xendit-webhook-bot-token-snapshot.spec.ts.
      return null
    },
  } as IInvoiceStore & { state: { wipes: string[] } }
}

const okProvisioning: IProvisioningClient = {
  async spinUp() { return { ok: true } },
}

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_under_test',
    customer_id: 'cust_under_test',
    tier: 'pro' as Tier,
    status: 'pending',
    xendit_invoice_id: 'xnd_inv_99',
    always_on_enabled: false,
    hosting_active: false,
    next_billing_at: null,
    ...overrides,
  }
}

// ─── Case 1: new customer + new sub → wipe fires (no-op semantically) ──

test('PAID on pending sub: clearStalePairState called with customer_id', async () => {
  const db = makeStore({ sub: sub() })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_99'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  assert.deepEqual(db.state.wipes, ['cust_under_test'])
})

// ─── Case 2: existing customer + new sub (founder's reuse case) ────────

test('PAID on pending sub for reused-email customer: wipe still fires', async () => {
  // Reused customer just means findCustomerByEmail upstream returned an
  // existing row when create-invoice was called. From the webhook's
  // perspective, this is still a pending → active transition for the
  // (new) subscription, so the wipe fires.
  const db = makeStore({
    sub: sub({ customer_id: 'cust_reused_42c024ce' }),
  })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_99'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  assert.deepEqual(db.state.wipes, ['cust_reused_42c024ce'])
})

// ─── Case 3: existing customer + renewed sub after cancel → wipe fires ──

test('PAID on renewed (post-cancel) sub: wipe fires', async () => {
  // Renewed sub: the previous sub was canceled. The renewal goes
  // through create-invoice + insertSubscription so reaches handlePaid
  // with status='pending'. Same handler path as the reuse case.
  const db = makeStore({
    sub: sub({ customer_id: 'cust_returning', xendit_invoice_id: 'xnd_inv_renewal' }),
  })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_renewal'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  assert.deepEqual(db.state.wipes, ['cust_returning'])
})

// ─── Case 4: persona-refresh path → NO wipe ────────────────────────────

test('idempotent PAID on already-active sub: NO wipe (preserves persona-refresh)', async () => {
  // Already-active sub means Xendit retried delivery of the PAID
  // webhook OR this is a re-onboarding round for persona refinement.
  // Handler short-circuits at "idempotent: true" BEFORE the wipe.
  const db = makeStore({
    sub: sub({ status: 'active', xendit_invoice_id: 'xnd_inv_99' }),
  })
  const res = await handleXenditWebhook(paidRequest('xnd_inv_99'), {
    db,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok: boolean; idempotent?: boolean }
  assert.equal(body.idempotent, true)
  assert.deepEqual(db.state.wipes, [], 'wipe must NOT fire on idempotent retry')
})

// ─── Edge case: wipe failure does NOT block the PAID transition ─────────

test('PAID: clearStalePairState throws → webhook still returns 200', async () => {
  const baseStore = makeStore({ sub: sub({ xendit_invoice_id: 'xnd_inv_wipe_fails' }) })
  const dbWithThrowingWipe: IInvoiceStore = {
    ...baseStore,
    async clearStalePairState() {
      throw new Error('connection refused')
    },
  }
  const res = await handleXenditWebhook(paidRequest('xnd_inv_wipe_fails'), {
    db: dbWithThrowingWipe,
    provisioning: okProvisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  // Wipe is best-effort — webhook must STILL ack PAID to avoid
  // Xendit retry storm.
  assert.equal(res.status, 200)
})
