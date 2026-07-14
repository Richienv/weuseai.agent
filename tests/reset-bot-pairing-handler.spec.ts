// reset-bot-pairing edge function — pure handler tests.
//
// Used by onboarding.html step 3 "Bukan bot kamu — Ganti bot" recovery
// link. Clears the customer's telegram_bot_token, telegram_bot_username,
// and telegram_chat_id so they can re-paste a different bot token in
// step 2 and start the validate-bot-token flow over.
//
// Service-role only (anon UPDATE on customers is locked down per
// Sesi D P0-2 + the prior pairing-anon-update lock-out).

import test from 'node:test'
import assert from 'node:assert/strict'

import { handleResetBotPairing } from '../supabase/functions/_shared/reset-bot-pairing-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'

function makeReq(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('http://x.test/reset-bot-pairing', init)
}

test('reset clears bot fields on a customer with paired bot', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({
    id: 'cust-1',
    email: 'one@example.com',
    telegram_bot_username: 'something_old_bot',
    telegram_chat_id: '1234567890',
  })
  // Seed a paired bot token so we can verify it was wiped.
  await db.setBotTokenAndUsername('cust-1', '123456:fake_bot_token_xyz', 'something_old_bot')

  const res = await handleResetBotPairing(
    makeReq({ customer_id: 'cust-1' }),
    { db },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok?: boolean; error?: string }
  assert.equal(body.ok, true)

  const after = await db.findCustomerById('cust-1')
  assert.equal(after?.telegram_bot_username, null)
  assert.equal(after?.telegram_chat_id, null)
  // Encrypted token is wiped via the same updateCustomer call setting
  // telegram_bot_token to null. Verified through getDecryptedBotToken.
  assert.equal(await db.getDecryptedBotToken('cust-1'), null)
})

test('reset is idempotent (no-op when bot already cleared)', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-2', email: 'two@example.com' })
  const res = await handleResetBotPairing(
    makeReq({ customer_id: 'cust-2' }),
    { db },
  )
  assert.equal(res.status, 200)
})

test('GET method returns 405', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleResetBotPairing(makeReq({}, 'GET'), { db })
  assert.equal(res.status, 405)
})

test('malformed JSON returns 400 invalid_json', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleResetBotPairing(makeReq('{not json'), { db })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { ok?: boolean; error?: string }
  assert.equal(body.error, 'invalid_json')
})

test('missing customer_id returns 400 missing_field', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleResetBotPairing(makeReq({}), { db })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { ok?: boolean; error?: string }
  assert.equal(body.error, 'missing_field')
})

test('unknown customer_id returns 404', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleResetBotPairing(
    makeReq({ customer_id: 'cust-does-not-exist' }),
    { db },
  )
  assert.equal(res.status, 404)
})
