/**
 * Library-full 799→999 batch price-flip (founder decision 2026-06-18,
 * honesty lock follow-up — CLAUDE.md "Launch FOMO").
 *
 * The landing advertises "naik ke Rp 999rb setelah 1.000 pertama". For that
 * claim to stay honest, create-invoice must charge the anchor (setupOldIdr,
 * 999k) once paid customers (subscriptions status='active' — the SAME
 * definition as /api/public/subscription-count) reach 1000.
 *
 * Contract:
 *   1. library-full + paid < 1000  → launch price   (base 898k, qris total 904.286)
 *   2. library-full + paid ≥ 1000  → anchor price   (base 1.098k, qris total 1.105.686)
 *   3. count query THROWS          → launch price   (fail-open — never overcharge)
 *   4. dep absent (older wiring)   → launch price
 *   5. other tiers                 → unaffected AND the count is never queried
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleCreateInvoice,
  LIBRARY_FULL_BATCH_LIMIT,
} from '../supabase/functions/_shared/create-invoice-handler.ts'
import type {
  IInvoiceStore,
  IXenditClient,
  SubscriptionRow,
} from '../supabase/functions/_shared/types.ts'

const FIXED_NOW = new Date('2026-07-04T10:00:00Z')

function makeStore(): IInvoiceStore {
  let id = 0
  const subs: SubscriptionRow[] = []
  return {
    async findCustomerByEmail() { return null },
    async findCustomerById() { return null },
    async insertCustomer({ email }) { return { id: `cust_${++id}`, email } },
    async findSubscriptionByXenditInvoiceId() { return null },
    async insertSubscription(input) {
      const row = {
        id: `sub_${++id}`,
        customer_id: input.customer_id,
        tier: input.tier,
        status: input.status,
        xendit_invoice_id: input.xendit_invoice_id ?? null,
        always_on_enabled: input.always_on_enabled,
        hosting_active: false,
        next_billing_at: null,
      } as SubscriptionRow
      subs.push(row)
      return row
    },
    async updateSubscription(sid, patch) {
      const row = subs.find((s) => s.id === sid)!
      Object.assign(row, patch)
      return row
    },
    async insertSubscriptionInvoice() { return { id: `si_${++id}` } },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState() {},
    async getDecryptedBotToken() { return null },
    async insertConsentEvent() { return { id: `consent_${++id}` } },
  } as IInvoiceStore
}

/** Xendit mock that records the charged amount. */
function makeXendit(): IXenditClient & { charged: number[] } {
  const charged: number[] = []
  return {
    charged,
    async createInvoice(input: { amount: number }) {
      charged.push(input.amount)
      return { invoiceId: 'inv_x', invoiceUrl: 'https://xendit.test/inv_x' }
    },
  } as IXenditClient & { charged: number[] }
}

function buildReq(body: Record<string, unknown>): Request {
  return new Request('https://edge.test/create-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function body(plan: string) {
  return {
    email: 'kamu@email.com',
    plan,
    alwaysOn: false,
    methodId: 'qris',
    country: 'ID',
    tos_accepted_at: '2026-07-04T09:59:30Z', // 30s before FIXED_NOW
  }
}

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    db: makeStore(),
    xendit: makeXendit(),
    successRedirectBase: 'https://x/welcome',
    failureRedirectBase: 'https://x/checkout.html',
    now: () => FIXED_NOW,
    ...over,
  }
}

// launch price:  (799.000 + 99.000) × 1.007  = 904.286
const LAUNCH_TOTAL = 904_286
// anchor price:  (999.000 + 99.000) + round(1.098.000 × 0.7%) = 1.105.686
const ANCHOR_TOTAL = 1_105_686

test(`library-full below the batch limit charges the launch price`, async () => {
  const xendit = makeXendit()
  const deps = makeDeps({ xendit, countActiveSubscriptions: async () => LIBRARY_FULL_BATCH_LIMIT - 1 })
  const res = await handleCreateInvoice(buildReq(body('library-full')), deps as never)
  assert.equal(res.status, 200)
  assert.deepEqual(xendit.charged, [LAUNCH_TOTAL])
})

test(`library-full at/after the batch limit charges the 999k anchor`, async () => {
  const xendit = makeXendit()
  const deps = makeDeps({ xendit, countActiveSubscriptions: async () => LIBRARY_FULL_BATCH_LIMIT })
  const res = await handleCreateInvoice(buildReq(body('library-full')), deps as never)
  assert.equal(res.status, 200)
  assert.deepEqual(xendit.charged, [ANCHOR_TOTAL])
})

test(`count failure fails OPEN to the launch price (never overcharge)`, async () => {
  const xendit = makeXendit()
  const deps = makeDeps({ xendit, countActiveSubscriptions: async () => { throw new Error('db down') } })
  const res = await handleCreateInvoice(buildReq(body('library-full')), deps as never)
  assert.equal(res.status, 200)
  assert.deepEqual(xendit.charged, [LAUNCH_TOTAL])
})

test(`missing countActiveSubscriptions dep (older wiring) keeps the launch price`, async () => {
  const xendit = makeXendit()
  const deps = makeDeps({ xendit }) // no count dep
  const res = await handleCreateInvoice(buildReq(body('library-full')), deps as never)
  assert.equal(res.status, 200)
  assert.deepEqual(xendit.charged, [LAUNCH_TOTAL])
})

test(`other tiers are unaffected and never query the count`, async () => {
  const xendit = makeXendit()
  let counted = 0
  const deps = makeDeps({ xendit, countActiveSubscriptions: async () => { counted++; return 5000 } })
  const res = await handleCreateInvoice(buildReq(body('solo')), deps as never)
  assert.equal(res.status, 200)
  // solo: (399.000 + 99.000) × 1.007 = 501.486 — untouched by the flip
  assert.deepEqual(xendit.charged, [501_486])
  assert.equal(counted, 0, 'the paid count must only be queried for library-full')
})
