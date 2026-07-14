// save-onboarding-profile edge function — pure handler tests.
//
// Wired by onboarding.html step 1 submit. Customers can complete checkout
// without filling Name and WhatsApp (Email is the only checkout-side
// required field). Step 1 is where we capture / correct missing data
// before they advance to step 2 (BotFather walkthrough).
//
// Service-role only (anon UPDATE on customers is locked down per
// Sesi D P0-2 + the prior pairing-anon-update lock-out).

import test from 'node:test'
import assert from 'node:assert/strict'

import { handleSaveOnboardingProfile } from '../supabase/functions/_shared/save-onboarding-profile-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'

function makeReq(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('http://x.test/save-onboarding-profile', init)
}

const VALID = {
  customer_id: 'cust-1',
  display_name: 'Andy Founder',
  email: 'andy@example.com',
  whatsapp_number: '+6281234567890',
}

test('happy path: persists display_name + email + whatsapp_number', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'andy@example.com' })
  const res = await handleSaveOnboardingProfile(makeReq(VALID), { db })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok: boolean }
  assert.equal(body.ok, true)
  const after = await db.findCustomerById('cust-1')
  assert.equal(after?.display_name, 'Andy Founder')
  assert.equal(after?.whatsapp_number, '+6281234567890')
})

test('GET returns 405', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleSaveOnboardingProfile(makeReq({}, 'GET'), { db })
  assert.equal(res.status, 405)
})

test('malformed JSON returns 400 invalid_json', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleSaveOnboardingProfile(makeReq('{not json'), { db })
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { error: string }).error, 'invalid_json')
})

test('missing customer_id returns 400 missing_field', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleSaveOnboardingProfile(
    makeReq({ display_name: 'A', email: 'a@b.com', whatsapp_number: '08123' }),
    { db },
  )
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { field: string }).field, 'customer_id')
})

test('empty display_name returns 400 invalid_field', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  const res = await handleSaveOnboardingProfile(
    makeReq({ ...VALID, display_name: '   ' }),
    { db },
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; field?: string }
  assert.equal(body.error, 'invalid_field')
  assert.equal(body.field, 'display_name')
})

test('invalid email returns 400 invalid_field', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  const res = await handleSaveOnboardingProfile(
    makeReq({ ...VALID, email: 'not-an-email' }),
    { db },
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; field?: string }
  assert.equal(body.field, 'email')
})

test('invalid whatsapp number returns 400 invalid_field', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  const res = await handleSaveOnboardingProfile(
    makeReq({ ...VALID, whatsapp_number: 'lol123' }),
    { db },
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; field?: string }
  assert.equal(body.field, 'whatsapp_number')
})

test('whatsapp accepts 08xxx and +62xxx forms', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  for (const wa of ['081234567890', '+6281234567890', '08-1234-567-890', '+62 812 3456 7890']) {
    const res = await handleSaveOnboardingProfile(
      makeReq({ ...VALID, whatsapp_number: wa }),
      { db },
    )
    assert.equal(res.status, 200, `whatsapp ${wa} should be accepted`)
  }
})

test('unknown customer returns 404', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleSaveOnboardingProfile(
    makeReq({ ...VALID, customer_id: 'cust-does-not-exist' }),
    { db },
  )
  assert.equal(res.status, 404)
})

test('idempotent: re-submitting same values is fine', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'andy@example.com' })
  await handleSaveOnboardingProfile(makeReq(VALID), { db })
  const res = await handleSaveOnboardingProfile(makeReq(VALID), { db })
  assert.equal(res.status, 200)
})
