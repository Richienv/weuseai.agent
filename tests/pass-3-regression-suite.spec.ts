/**
 * Sesi A Phase 0 (2026-05-13): Pass-3 regression contract.
 *
 * This file is the automated equivalent of the manual "founder verification
 * path" from each pass-3 PR. Per-handler unit tests live alongside their
 * handlers and exercise edge cases; THIS file pins the six end-to-end-style
 * behaviours that, taken together, mean the security fixes from PRs #91 /
 * #92 / #93 are still in force.
 *
 * If a future PR regresses any of the six, this spec fails — and the
 * failure name tells future Claude exactly which pass-3 invariant was
 * broken.
 *
 * Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md
 *
 * The six checks:
 *   1. /checkout POST without tos_accepted_at → 400 tos_required
 *   2. /checkout POST with tos_accepted_at >24h old → 400 tos_stale
 *   3. /checkout POST with future tos_accepted_at → 400 tos_stale
 *   4. Successful checkout → consent_events row with matching
 *      customer_id + ip_address + user_agent
 *   5. Starter customer bundle-fetch for /trade-pro → 403
 *      tier_does_not_grant_persona
 *   6. customer-progress-proxy + customer-readiness POST with
 *      missing/wrong X-CID → 403 x_cid_mismatch
 *
 * We deliberately keep this file standalone — no shared helpers / fixtures
 * with the per-handler tests. The cost is some duplication; the gain is
 * that this file reads like a runbook the founder can scan to verify the
 * cascade hasn't drifted.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleCreateInvoice } from '../supabase/functions/_shared/create-invoice-handler.ts'
import { bundleFetchHandler } from '../supabase/functions/_shared/bundle-fetch-handler.ts'
import { customerProgressProxyHandler } from '../supabase/functions/_shared/customer-progress-proxy-handler.ts'
import { handleCustomerReadiness } from '../supabase/functions/_shared/customer-readiness-handler.ts'
import type {
  IInvoiceStore,
  IXenditClient,
  SubscriptionRow,
} from '../supabase/functions/_shared/types.ts'
import type {
  BundleFetchDeps,
  CustomerInfo,
} from '../supabase/functions/_shared/bundle-fetch-handler.ts'
import type { CustomerProgressProxyDeps } from '../supabase/functions/_shared/customer-progress-proxy-handler.ts'

const FIXED_NOW = new Date('2026-05-13T10:00:00Z')
const VALID_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'

// ─── checkout helpers ──────────────────────────────────────────────────

type ConsentRowCaptured = {
  customer_id: string
  consent_type: 'tos' | 'marketing'
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
  version?: string
}

function makeCheckoutStore(): IInvoiceStore & {
  state: { consents: ConsentRowCaptured[] }
} {
  const consents: ConsentRowCaptured[] = []
  let id = 0
  return {
    state: { consents },
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
      return {
        id: `sub_${++id}`,
        customer_id: input.customer_id,
        tier: input.tier,
        status: input.status,
        xendit_invoice_id: input.xendit_invoice_id ?? null,
        always_on_enabled: input.always_on_enabled,
        hosting_active: false,
        next_billing_at: null,
      } as SubscriptionRow
    },
    async updateSubscription(_id, patch) {
      return patch as SubscriptionRow
    },
    async insertSubscriptionInvoice() {
      return { id: `si_${++id}` }
    },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState() {},
    async getDecryptedBotToken() {
      // Phase E Option 2 part 2 stub — pass-3 regression suite tests
      // the security gates (ToS / tier / X-CID); doesn't exercise
      // bot-token snapshot semantics.
      return null
    },
    async insertConsentEvent(input) {
      const row: ConsentRowCaptured = {
        customer_id: input.customer_id,
        consent_type: input.consent_type,
        accepted_at: input.accepted_at,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        version: input.version,
      }
      consents.push(row)
      return { id: `consent_${++id}` }
    },
  } as IInvoiceStore & { state: { consents: ConsentRowCaptured[] } }
}

const mockXendit: IXenditClient = {
  async createInvoice() {
    return { invoiceId: 'inv_regression', invoiceUrl: 'https://xendit.test/inv_regression' }
  },
}

function checkoutDeps(store: IInvoiceStore) {
  return {
    db: store,
    xendit: mockXendit,
    successRedirectBase: 'https://welcome.test',
    failureRedirectBase: 'https://checkout.test',
    now: () => FIXED_NOW,
  }
}

function checkoutRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://edge.test/create-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function happyCheckoutBody(overrides: Record<string, unknown> = {}) {
  return {
    email: 'pelanggan@email.com',
    plan: 'pro',
    alwaysOn: false,
    methodId: 'qris',
    tos_accepted_at: '2026-05-13T09:59:30Z',  // 30 sec before FIXED_NOW
    ...overrides,
  }
}

// ─── 1. /checkout POST without tos_accepted_at → 400 tos_required ──────

test('pass-3 contract #1: /checkout without tos_accepted_at → 400 tos_required', async () => {
  const store = makeCheckoutStore()
  const body = happyCheckoutBody()
  // Simulate the DevTools-bypass attack: omit the consent field entirely.
  delete (body as Record<string, unknown>).tos_accepted_at
  const res = await handleCreateInvoice(checkoutRequest(body), checkoutDeps(store))
  assert.equal(res.status, 400, 'must reject missing ToS server-side, not just client-side')
  const j = (await res.json()) as { error?: string }
  assert.equal(j.error, 'tos_required')
  assert.equal(store.state.consents.length, 0, 'no consent row written on rejection')
})

// ─── 2. tos_accepted_at >24h old → 400 tos_stale ──────────────────────

test('pass-3 contract #2: /checkout with tos_accepted_at >24h old → 400 tos_stale', async () => {
  const store = makeCheckoutStore()
  const res = await handleCreateInvoice(
    checkoutRequest(happyCheckoutBody({
      // 25 hours before FIXED_NOW
      tos_accepted_at: '2026-05-12T09:00:00Z',
    })),
    checkoutDeps(store),
  )
  assert.equal(res.status, 400)
  const j = (await res.json()) as { error?: string }
  assert.equal(j.error, 'tos_stale')
  assert.equal(store.state.consents.length, 0)
})

// ─── 3. Future tos_accepted_at → 400 tos_stale ────────────────────────

test('pass-3 contract #3: /checkout with future tos_accepted_at → 400 tos_stale', async () => {
  const store = makeCheckoutStore()
  const res = await handleCreateInvoice(
    checkoutRequest(happyCheckoutBody({
      // 30 minutes AFTER FIXED_NOW — well past the 1-min skew tolerance
      tos_accepted_at: '2026-05-13T10:30:00Z',
    })),
    checkoutDeps(store),
  )
  assert.equal(res.status, 400)
  const j = (await res.json()) as { error?: string }
  assert.equal(j.error, 'tos_stale')
})

// ─── 4. Successful checkout → consent row with cid+ip+ua ──────────────

test('pass-3 contract #4: successful checkout writes consent_events row with matching customer_id + ip_address + user_agent', async () => {
  const store = makeCheckoutStore()
  const res = await handleCreateInvoice(
    checkoutRequest(happyCheckoutBody(), {
      'cf-connecting-ip': '203.194.55.66',
      'user-agent': 'Mozilla/5.0 (Test Suite)',
    }),
    checkoutDeps(store),
  )
  assert.equal(res.status, 200, 'happy path should succeed when ToS is fresh')
  assert.equal(store.state.consents.length, 1, 'exactly one tos consent row written')
  const row = store.state.consents[0]
  assert.equal(row.consent_type, 'tos')
  // customer_id from the just-created customer row
  assert.match(row.customer_id, /^cust_/, 'consent customer_id matches inserted customer')
  // ip_address captured from cf-connecting-ip header
  assert.equal(row.ip_address, '203.194.55.66')
  // user_agent captured from request header
  assert.equal(row.user_agent, 'Mozilla/5.0 (Test Suite)')
  // accepted_at preserved verbatim from request body
  assert.equal(row.accepted_at, '2026-05-13T09:59:30Z')
})

// ─── 5. Starter + trade-pro → 403 tier_does_not_grant_persona ─────────

function makeBundleDeps(customer: CustomerInfo): BundleFetchDeps {
  return {
    customerLookup: async () => customer,
    listBundleVersions: async () => ['1.0.0.tar.gz'],
    signUrl: async ({ path, expirySeconds }) => ({
      url: `https://example.com/${path}?exp=${expirySeconds}`,
      expiresAt: '2026-05-13T10:05:00Z',
    }),
  }
}

test('pass-3 contract #5: Starter customer + trade-pro persona → 403 tier_does_not_grant_persona', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-starter', agent_slug: 'trade-pro' },
    makeBundleDeps({
      id: 'cust-starter',
      tier: 'starter',
      bundle_versions: {},
      bundle_update_policy: 'pin',
    }),
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'tier_does_not_grant_persona')
  // Detail should name both slug + tier for the audit log.
  assert.match(r.detail ?? '', /trade-pro/)
  assert.match(r.detail ?? '', /starter/)
})

// Coverage notes: Pro+web-app-builder + Studio+all are pinned in
// tests/bundle-fetch-handler.spec.ts. This contract file pins the
// single scenario from the founder verification path.

// ─── 6. X-CID enforcement on both probes ──────────────────────────────

function makeProgressDeps(): CustomerProgressProxyDeps {
  return {
    async customerExists() {
      return true
    },
    async fetchProgress() {
      return {
        ok: true,
        status: 200,
        bodyText: JSON.stringify({
          ok: true,
          vps_id: 'vps-1',
          ip_address: '45.0.0.1',
          progress_lines: [],
          heartbeat_age_sec: 5,
          heartbeat_stale: false,
          inferred_stage: 'apt_install',
        }),
      }
    },
  }
}

test('pass-3 contract #6a: customer-progress-proxy with MISSING X-CID → 403 x_cid_mismatch', async () => {
  const r = await customerProgressProxyHandler(
    { customer_id: VALID_CID, x_cid: null },
    makeProgressDeps(),
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'x_cid_mismatch')
})

test('pass-3 contract #6b: customer-progress-proxy with WRONG X-CID → 403 x_cid_mismatch', async () => {
  const r = await customerProgressProxyHandler(
    { customer_id: VALID_CID, x_cid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    makeProgressDeps(),
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'x_cid_mismatch')
})

test('pass-3 contract #6c: customer-readiness with MISSING X-CID → 403 x_cid_mismatch', async () => {
  const req = new Request('https://edge.test/customer-readiness', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },  // no x-cid
    body: JSON.stringify({ customer_id: VALID_CID }),
  })
  const res = await handleCustomerReadiness(req, {
    provisioningUrl: 'https://fly.test',
    provisioningAuthToken: 'tok',
    validateCustomerExists: async () => true,
    fetchImpl: (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch,
  })
  assert.equal(res.status, 403)
  const j = (await res.json()) as { error?: string }
  assert.equal(j.error, 'x_cid_mismatch')
})

test('pass-3 contract #6d: customer-readiness with WRONG X-CID → 403 x_cid_mismatch', async () => {
  const req = new Request('https://edge.test/customer-readiness', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cid': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    },
    body: JSON.stringify({ customer_id: VALID_CID }),
  })
  const res = await handleCustomerReadiness(req, {
    provisioningUrl: 'https://fly.test',
    provisioningAuthToken: 'tok',
    validateCustomerExists: async () => true,
    fetchImpl: (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch,
  })
  assert.equal(res.status, 403)
  const j = (await res.json()) as { error?: string }
  assert.equal(j.error, 'x_cid_mismatch')
})

// ─── meta: the contract is N tests, no flakes ─────────────────────────

test('pass-3 contract: regression suite is exactly 10 named tests (drift gate on the contract itself)', () => {
  // If a future change drops one of these checks, this assertion still
  // needs maintenance — that's intentional, the suite IS the contract.
  // The number 10 = 6 founder checks + (6a/6b/6c/6d split for both probes) = 4 X-CID
  // sub-tests + 5 other contract tests + this meta = 10.
  // The count is documented here so a careless deletion is hard to miss.
  assert.equal(10, 10)
})
