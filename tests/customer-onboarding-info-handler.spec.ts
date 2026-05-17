// customer-onboarding-info — pure handler tests.
//
// Email-mismatch fix (2026-05-17): the onboarding form must show the
// email the customer PAID with — sourced from the customers row, X-CID
// gated — never from browser localStorage.

import test from 'node:test'
import assert from 'node:assert/strict'

import { handleCustomerOnboardingInfo } from '../supabase/functions/_shared/customer-onboarding-info-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'

const CID = '24bd612d-1111-4222-8333-444455556666'

function makeReq(
  body: unknown,
  opts: { method?: string; xcid?: string | null } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.xcid !== null && opts.xcid !== undefined) headers['x-cid'] = opts.xcid
  const init: RequestInit = { method: opts.method ?? 'POST', headers }
  if ((opts.method ?? 'POST') !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/customer-onboarding-info', init)
}

test('happy path: X-CID matches → returns the payment-record email', async () => {
  const db = new FakeOnboardingStore()
  db.seedCustomer({
    id: CID,
    email: 'kdbw.co@gmail.com',
    display_name: 'Bambang',
    whatsapp_number: '08123456789',
  })
  const res = await handleCustomerOnboardingInfo(
    makeReq({ customer_id: CID }, { xcid: CID }),
    { db },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as Record<string, unknown>
  assert.equal(body.email, 'kdbw.co@gmail.com', 'email must be the customer-row (payment) email')
  assert.equal(body.display_name, 'Bambang')
  assert.equal(body.whatsapp_number, '08123456789')
})

test('X-CID mismatch → 403 (cannot read another customer’s email)', async () => {
  const db = new FakeOnboardingStore()
  db.seedCustomer({ id: CID, email: 'kdbw.co@gmail.com' })
  // Header CID points at a DIFFERENT customer than the body.
  const res = await handleCustomerOnboardingInfo(
    makeReq({ customer_id: CID }, { xcid: '99999999-0000-4000-8000-000000000000' }),
    { db },
  )
  assert.equal(res.status, 403)
  assert.equal(((await res.json()) as { error: string }).error, 'x_cid_mismatch')
})

test('missing X-CID header → 403', async () => {
  const db = new FakeOnboardingStore()
  db.seedCustomer({ id: CID, email: 'a@b.com' })
  const res = await handleCustomerOnboardingInfo(
    makeReq({ customer_id: CID }, { xcid: null }),
    { db },
  )
  assert.equal(res.status, 403)
})

test('unknown customer → 404', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleCustomerOnboardingInfo(
    makeReq({ customer_id: CID }, { xcid: CID }),
    { db },
  )
  assert.equal(res.status, 404)
})

test('GET → 405', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleCustomerOnboardingInfo(
    makeReq({}, { method: 'GET', xcid: CID }),
    { db },
  )
  assert.equal(res.status, 405)
})

test('non-UUID customer_id → 400', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleCustomerOnboardingInfo(
    makeReq({ customer_id: 'not-a-uuid' }, { xcid: 'not-a-uuid' }),
    { db },
  )
  assert.equal(res.status, 400)
})
