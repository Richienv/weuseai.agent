/**
 * rotate-pairing-code-handler tests.
 *
 * Walks the rotate flow: fresh rotate, reuse non-expired, expire+rotate,
 * cid validation, unique-collision retry, error mapping.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleRotatePairingCode } from '../supabase/functions/_shared/rotate-pairing-code-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'

function buildReq(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/rotate-pairing-code', init)
}

async function readJson(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

function setup() {
  const db = new FakeOnboardingStore()
  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
  })
  db.seedSubscription({
    id: 'sub-1',
    customer_id: 'cust-1',
    tier: 'pro',
    status: 'pending_provision',
  })
  return { db }
}

// ─── happy path ────────────────────────────────────────────────────

test('rotate (fresh): mints a new 6-digit code, persists, returns 200', async () => {
  const { db } = setup()
  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, now: () => Date.parse('2026-05-06T10:00:00Z') },
  )
  assert.equal(res.status, 200)
  const data = await readJson(res)
  assert.match(data.code, /^\d{6}$/)
  assert.equal(data.expires_at, '2026-05-06T10:30:00.000Z')
  assert.equal(data.reused, undefined)

  // Persisted on the customer row
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.pairing_code, data.code)
  assert.equal(c?.pairing_code_expires_at, data.expires_at)
})

test('reuse: returns existing non-expired code instead of rotating', async () => {
  const { db } = setup()
  // Seed an existing fresh code.
  await db.updateCustomer('cust-1', {
    pairing_code: '654321',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, now: () => Date.parse('2026-05-06T10:00:00Z') },
  )
  assert.equal(res.status, 200)
  const data = await readJson(res)
  assert.equal(data.code, '654321')
  assert.equal(data.expires_at, '2099-01-01T00:00:00.000Z')
  assert.equal(data.reused, true)

  // Customer row UNCHANGED
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.pairing_code, '654321')
})

test('rotate after expiry: replaces the old expired code', async () => {
  const { db } = setup()
  await db.updateCustomer('cust-1', {
    pairing_code: '111111',
    pairing_code_expires_at: '2020-01-01T00:00:00.000Z', // long past
  })

  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, now: () => Date.parse('2026-05-06T10:00:00Z') },
  )
  assert.equal(res.status, 200)
  const data = await readJson(res)
  assert.notEqual(data.code, '111111')
  assert.equal(data.reused, undefined)

  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.pairing_code, data.code)
})

// ─── input validation ─────────────────────────────────────────────

test('missing customer_id: 400', async () => {
  const { db } = setup()
  const res = await handleRotatePairingCode(buildReq({}), { db })
  assert.equal(res.status, 400)
})

test('invalid JSON: 400', async () => {
  const { db } = setup()
  const res = await handleRotatePairingCode(buildReq('not json'), { db })
  assert.equal(res.status, 400)
})

test('GET: 405', async () => {
  const { db } = setup()
  const res = await handleRotatePairingCode(buildReq({}, 'GET'), { db })
  assert.equal(res.status, 405)
})

// ─── lookup failures ──────────────────────────────────────────────

test('unknown cid: 404', async () => {
  const { db } = setup()
  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-MISSING' }),
    { db },
  )
  assert.equal(res.status, 404)
})

test('cid with no paid subscription: 404', async () => {
  const db = new FakeOnboardingStore()
  db.seedCustomer({ id: 'cust-NS', email: 'ns@example.com' })
  // No subscription seeded.
  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-NS' }),
    { db },
  )
  assert.equal(res.status, 404)
})

// ─── retry on unique collision ────────────────────────────────────

test('unique-violation: retries until success', async () => {
  const { db } = setup()
  let calls = 0
  const original = db.updateCustomer.bind(db)
  db.updateCustomer = async function (id, patch) {
    calls++
    if (calls < 3) {
      throw new Error(
        'duplicate key value violates unique constraint "customers_pairing_code_active_idx" (SQLSTATE 23505)',
      )
    }
    return original(id, patch)
  }

  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, maxRetries: 5 },
  )
  assert.equal(res.status, 200)
  assert.ok(calls >= 3, `expected ≥3 calls, got ${calls}`)
})

test('unique-violation forever: gives up after maxRetries', async () => {
  const { db } = setup()
  db.updateCustomer = async function () {
    throw new Error('duplicate key value violates unique constraint (23505)')
  }
  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, maxRetries: 3 },
  )
  assert.equal(res.status, 500)
  const data = await readJson(res)
  assert.equal(data.error, 'internal')
})

test('non-unique DB error: 500 immediately, no retry', async () => {
  const { db } = setup()
  let calls = 0
  db.updateCustomer = async function () {
    calls++
    throw new Error('connection refused')
  }
  const res = await handleRotatePairingCode(
    buildReq({ customer_id: 'cust-1' }),
    { db, maxRetries: 5 },
  )
  assert.equal(res.status, 500)
  assert.equal(calls, 1, 'should not retry non-unique errors')
})
