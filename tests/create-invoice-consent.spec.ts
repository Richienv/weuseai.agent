/**
 * Sesi D pass-3 P0 (2026-05-13): server-side ToS / marketing consent
 * gate on create-invoice.
 *
 * Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md §P0-PASS3-1
 *
 * Test plan covers:
 *   1. Happy path: tos_accepted_at present + recent → invoice created
 *      AND ONE consent_events row inserted with consent_type='tos'.
 *   2. Happy path + marketing opt-in: BOTH tos AND marketing rows inserted.
 *   3. Missing tos_accepted_at (undefined, empty string, non-string) → 400 tos_required.
 *   4. Stale tos_accepted_at (>24h old) → 400 tos_stale.
 *   5. Future-dated tos_accepted_at (>1 min ahead, clock-skew tolerance) → 400 tos_stale.
 *   6. Stale marketing_opt_in_at while tos is fresh → 400 tos_stale.
 *   7. Consent persisted BEFORE Xendit call — handler ordering invariant.
 *   8. Consent INSERT failure → 500 consent_persist_failed, Xendit never called.
 *   9. ip_address + user_agent captured from request headers
 *      (cf-connecting-ip preferred, x-forwarded-for fallback).
 *
 * RLS coverage (anon-deny / authenticated-own-rows) lives in
 * tests/consent-events-rls-static.spec.ts — that's a source-level check
 * on the migration SQL because we don't run Supabase locally in CI.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleCreateInvoice } from '../supabase/functions/_shared/create-invoice-handler.ts'
import type {
  IInvoiceStore,
  IXenditClient,
  SubscriptionRow,
} from '../supabase/functions/_shared/types.ts'

type ErrorBody = { error?: string; detail?: string }
async function readErr(res: Response): Promise<ErrorBody> {
  return (await res.json()) as ErrorBody
}

type ConsentRow = {
  id: string
  customer_id: string
  consent_type: 'tos' | 'marketing'
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
  version?: string
}

function makeStore(opts: {
  failConsentInsert?: boolean
  trackOrder?: string[]
} = {}): IInvoiceStore & { state: { consents: ConsentRow[]; subs: SubscriptionRow[] } } {
  const consents: ConsentRow[] = []
  const subs: SubscriptionRow[] = []
  let id = 0
  const ordered = opts.trackOrder
  return {
    state: { consents, subs },
    async findCustomerByEmail() {
      return null
    },
    async findCustomerById() {
      return null
    },
    async insertCustomer({ email }) {
      return { id: `cust_${++id}`, email }
    },
    async findSubscriptionByXenditInvoiceId() {
      return null
    },
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
    async updateSubscription(id, patch) {
      const row = subs.find((s) => s.id === id)!
      Object.assign(row, patch)
      return row
    },
    async insertSubscriptionInvoice() {
      return { id: `si_${++id}` }
    },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState() {},
    async getDecryptedBotToken() {
      // Phase E Option 2 part 2 stub — consent tests don't exercise
      // bot-token snapshot.
      return null
    },
    async insertConsentEvent(input) {
      if (opts.failConsentInsert) throw new Error('simulated DB error')
      const row: ConsentRow = {
        id: `consent_${++id}`,
        customer_id: input.customer_id,
        consent_type: input.consent_type,
        accepted_at: input.accepted_at,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        version: input.version,
      }
      consents.push(row)
      ordered?.push(`consent:${input.consent_type}`)
      return { id: row.id }
    },
  } as IInvoiceStore & { state: { consents: ConsentRow[]; subs: SubscriptionRow[] } }
}

function makeXendit(opts: { trackOrder?: string[] } = {}): IXenditClient {
  return {
    async createInvoice() {
      opts.trackOrder?.push('xendit:create')
      return { invoiceId: 'inv_x', invoiceUrl: 'https://xendit.test/inv_x' }
    },
  }
}

const FIXED_NOW = new Date('2026-05-13T10:00:00Z')

function buildReq(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://edge.test/create-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function buildHappyBody(overrides: Record<string, unknown> = {}) {
  return {
    email: 'kamu@email.com',
    plan: 'pro',
    alwaysOn: false,
    methodId: 'qris',
    country: 'ID',
    tos_accepted_at: '2026-05-13T09:59:30Z',  // 30s before FIXED_NOW
    ...overrides,
  }
}

// ─── 1. Happy path: tos only ────────────────────────────────────────────

test('happy path: fresh tos_accepted_at → invoice created + 1 consent row (tos)', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(buildReq(buildHappyBody()), {
    db: store,
    xendit: makeXendit(),
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  })
  assert.equal(res.status, 200)
  assert.equal(store.state.consents.length, 1)
  assert.equal(store.state.consents[0].consent_type, 'tos')
  assert.equal(store.state.consents[0].accepted_at, '2026-05-13T09:59:30Z')
  assert.equal(store.state.consents[0].version, 'v1.0')
})

// ─── 2. Happy path: tos + marketing ─────────────────────────────────────

test('happy path + marketing opt-in: 2 consent rows (tos + marketing)', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({
      marketing_opt_in_at: '2026-05-13T09:59:30Z',
    })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 200)
  assert.equal(store.state.consents.length, 2)
  const kinds = store.state.consents.map((c) => c.consent_type).sort()
  assert.deepEqual(kinds, ['marketing', 'tos'])
})

// ─── 3. Missing tos_accepted_at ─────────────────────────────────────────

test('missing tos_accepted_at → 400 tos_required, no Xendit call, no consent row', async () => {
  const store = makeStore()
  const order: string[] = []
  const xendit = makeXendit({ trackOrder: order })
  const body = buildHappyBody()
  delete (body as Record<string, unknown>).tos_accepted_at
  const res = await handleCreateInvoice(buildReq(body), {
    db: store,
    xendit,
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  })
  assert.equal(res.status, 400)
  const j = await readErr(res)
  assert.equal(j.error, 'tos_required')
  assert.equal(store.state.consents.length, 0)
  assert.equal(order.includes('xendit:create'), false)
})

test('empty-string tos_accepted_at → 400 tos_required', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({ tos_accepted_at: '' })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_required')
})

test('non-string tos_accepted_at → 400 tos_required', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({ tos_accepted_at: 1700000000 })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_required')
})

test('unparseable tos_accepted_at → 400 tos_required', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({ tos_accepted_at: 'last tuesday' })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_required')
})

// ─── 4. Stale tos_accepted_at ───────────────────────────────────────────

test('stale tos_accepted_at (>24h before now) → 400 tos_stale', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({
      tos_accepted_at: '2026-05-12T09:00:00Z',  // 25h before FIXED_NOW
    })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_stale')
  assert.equal(store.state.consents.length, 0)
})

// ─── 5. Future-dated tos_accepted_at ────────────────────────────────────

test('future-dated tos_accepted_at (>1min ahead) → 400 tos_stale (replay defence)', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({
      tos_accepted_at: '2026-05-13T10:30:00Z',  // 30 min after FIXED_NOW
    })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_stale')
})

test('tos_accepted_at within 1min skew tolerance ahead → accepted', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({
      tos_accepted_at: '2026-05-13T10:00:30Z',  // 30s after FIXED_NOW
    })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 200)
  assert.equal(store.state.consents.length, 1)
})

// ─── 6. Stale marketing while tos is fresh ──────────────────────────────

test('marketing_opt_in_at stale while tos fresh → 400 tos_stale', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({
      marketing_opt_in_at: '2026-05-12T00:00:00Z',  // >24h before FIXED_NOW
    })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'tos_stale')
})

test('marketing_opt_in_at null → tos row inserted, no marketing row', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(
    buildReq(buildHappyBody({ marketing_opt_in_at: null })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(res.status, 200)
  assert.equal(store.state.consents.length, 1)
  assert.equal(store.state.consents[0].consent_type, 'tos')
})

// ─── 7. Handler ordering invariant ──────────────────────────────────────

test('consent_events INSERTed BEFORE Xendit invoice creation', async () => {
  const order: string[] = []
  const store = makeStore({ trackOrder: order })
  const xendit = makeXendit({ trackOrder: order })
  const res = await handleCreateInvoice(buildReq(buildHappyBody()), {
    db: store,
    xendit,
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  })
  assert.equal(res.status, 200)
  // The consent INSERT must come before the Xendit call so a failure
  // path can't leave the customer with a charge but no paper trail.
  const tosIdx = order.indexOf('consent:tos')
  const xenditIdx = order.indexOf('xendit:create')
  assert.ok(tosIdx >= 0 && xenditIdx >= 0, 'both ops fired')
  assert.ok(tosIdx < xenditIdx, `consent should precede Xendit (consent@${tosIdx}, xendit@${xenditIdx})`)
})

// ─── 8. Consent insert failure → 500, Xendit never called ───────────────

test('consent INSERT throws → 500 consent_persist_failed, Xendit never called', async () => {
  const store = makeStore({ failConsentInsert: true })
  const order: string[] = []
  const xendit = makeXendit({ trackOrder: order })
  const res = await handleCreateInvoice(buildReq(buildHappyBody()), {
    db: store,
    xendit,
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  })
  assert.equal(res.status, 500)
  assert.equal((await readErr(res)).error, 'consent_persist_failed')
  assert.equal(order.includes('xendit:create'), false, 'Xendit must not have been called')
})

// ─── 9. IP + UA captured from headers ────────────────────────────────────

test('cf-connecting-ip captured into consent_events.ip_address', async () => {
  const store = makeStore()
  await handleCreateInvoice(
    buildReq(buildHappyBody(), {
      'cf-connecting-ip': '203.194.55.66',
      'user-agent': 'Mozilla/5.0 (Test Suite)',
    }),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(store.state.consents[0].ip_address, '203.194.55.66')
  assert.equal(store.state.consents[0].user_agent, 'Mozilla/5.0 (Test Suite)')
})

test('x-forwarded-for fallback (left-most entry) when cf-connecting-ip missing', async () => {
  const store = makeStore()
  await handleCreateInvoice(
    buildReq(buildHappyBody(), {
      'x-forwarded-for': '198.51.100.7, 70.41.3.18, 150.172.238.178',
    }),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(store.state.consents[0].ip_address, '198.51.100.7')
})

test('no IP headers → ip_address null (not rejected)', async () => {
  const store = makeStore()
  const res = await handleCreateInvoice(buildReq(buildHappyBody()), {
    db: store,
    xendit: makeXendit(),
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  })
  assert.equal(res.status, 200)
  assert.equal(store.state.consents[0].ip_address, null)
  assert.equal(store.state.consents[0].user_agent, null)
})

// ─── 10. Custom policy_version flows through ────────────────────────────

test('custom policy_version flows through to consent_events row', async () => {
  const store = makeStore()
  await handleCreateInvoice(
    buildReq(buildHappyBody({ policy_version: 'v2.0' })),
    {
      db: store,
      xendit: makeXendit(),
      successRedirectBase: 'https://welcome.test',
      failureRedirectBase: 'https://checkout.test',
      now: () => FIXED_NOW,
    },
  )
  assert.equal(store.state.consents[0].version, 'v2.0')
})
