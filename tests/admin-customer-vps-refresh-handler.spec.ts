// admin-customer-vps-refresh — pure handler tests.
//
// Track 3c (2026-05-10): manual VPS .env rescue path. Caller is admin
// (service-role JWT verified at the entry, not in this handler).

import test from 'node:test'
import assert from 'node:assert/strict'

import { handleAdminCustomerVpsRefresh } from '../supabase/functions/_shared/admin-customer-vps-refresh-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type {
  IOnboardingProvisioningClient,
  RefreshEnvInput,
  RefreshEnvResult,
  SpinUpInput,
  SpinUpResult,
} from '../supabase/functions/_shared/types.ts'

class FakeProvisioning implements IOnboardingProvisioningClient {
  refreshCalls: RefreshEnvInput[] = []
  refreshNext: RefreshEnvResult = {
    ok: true,
    vpsId: 'vps-test',
    ipAddress: '27.112.79.139',
    applied: { TELEGRAM_BOT_TOKEN: 'updated' },
    hermesRestartAt: '2026-05-10T08:00:00Z',
  }
  async spinUp(_input: SpinUpInput): Promise<SpinUpResult> {
    return { ok: false, status: 500, body: 'spinUp not used in admin tests' }
  }
  async refreshEnv(input: RefreshEnvInput): Promise<RefreshEnvResult> {
    this.refreshCalls.push(input)
    return this.refreshNext
  }
}

function makeReq(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('http://x.test/admin-customer-vps-refresh', init)
}

test('happy path: decrypts bot token, calls refreshEnv, returns ok', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'sarah@example.com' })
  await db.setBotTokenAndUsername(
    'cust-1',
    '12345:fake_token_xyz_abc',
    'sarah_bot',
  )
  const provisioning = new FakeProvisioning()

  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-1', reason: 'rescue test' }),
    { db, provisioning },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok: boolean; vps_id: string; applied: unknown }
  assert.equal(body.ok, true)
  assert.equal(body.vps_id, 'vps-test')
  // refreshEnv was called with the decrypted token.
  assert.equal(provisioning.refreshCalls.length, 1)
  assert.equal(
    provisioning.refreshCalls[0]!.envValues.TELEGRAM_BOT_TOKEN,
    '12345:fake_token_xyz_abc',
  )
  assert.equal(provisioning.refreshCalls[0]!.customerId, 'cust-1')
})

test('GET → 405', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleAdminCustomerVpsRefresh(makeReq({}, 'GET'), {
    db,
    provisioning: new FakeProvisioning(),
  })
  assert.equal(res.status, 405)
})

test('missing customer_id → 400', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleAdminCustomerVpsRefresh(makeReq({}), {
    db,
    provisioning: new FakeProvisioning(),
  })
  assert.equal(res.status, 400)
})

test('unknown customer → 404', async () => {
  const db = new FakeOnboardingStore()
  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'unknown-cid' }),
    { db, provisioning: new FakeProvisioning() },
  )
  assert.equal(res.status, 404)
})

test('customer has no bot token → 409 no_bot_token', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  // Don't seed any bot token.
  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-1' }),
    { db, provisioning: new FakeProvisioning() },
  )
  assert.equal(res.status, 409)
  const body = (await res.json()) as { error: string }
  assert.equal(body.error, 'no_bot_token')
})

test('provisioning service returns 503 → handler maps to 503', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({ id: 'cust-1', email: 'a@b.com' })
  await db.setBotTokenAndUsername('cust-1', '12345:fake', 'cust1_bot')
  const provisioning = new FakeProvisioning()
  provisioning.refreshNext = { ok: false, status: 503, body: 'ssh timeout', error: 'ssh_unreachable' }
  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-1' }),
    { db, provisioning },
  )
  assert.equal(res.status, 503)
})

// ─── Phase E (2026-05-14) Option 2 part 1 — atomic token+allowlist ──
//
// Root cause this closes: the admin path used to push only
// TELEGRAM_BOT_TOKEN. The Phase D smoke caught Renita stuck at Stage 5
// (gateway running, but `TELEGRAM_ALLOWED_USERS` unset → every /start
// from her chat_id denied). Fix: when customer.telegram_chat_id is
// present, the handler must push BOTH keys in the same envValues map,
// so the .env rewrites run in one SSH session under
// `set -euo pipefail` (no restart unless ALL writes succeed).

test('Phase E: customer with chat_id → envValues has BOTH token AND allowlist', async () => {
  const db = new FakeOnboardingStore()
  await db.seedCustomer({
    id: 'cust-renita',
    email: 'kdwb.co@gmail.com',
    telegram_chat_id: '6805409051',
  })
  await db.setBotTokenAndUsername('cust-renita', '12345:bot_token', 'kamis14maybot')
  const provisioning = new FakeProvisioning()
  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-renita', reason: 'Phase E atomic write' }),
    { db, provisioning },
  )
  assert.equal(res.status, 200)
  assert.equal(provisioning.refreshCalls.length, 1)
  const env = provisioning.refreshCalls[0]!.envValues
  // Both keys present.
  assert.equal(env.TELEGRAM_BOT_TOKEN, '12345:bot_token', 'token must be in envValues')
  assert.equal(
    env.TELEGRAM_ALLOWED_USERS,
    '6805409051',
    'allowlist must be customer.telegram_chat_id when present',
  )
})

test('Phase E: customer WITHOUT chat_id → envValues has token only (graceful fallback)', async () => {
  // New customer who paid but never paired their Telegram chat yet.
  // Pushing an empty TELEGRAM_ALLOWED_USERS would either no-op or
  // accidentally lock the bot to nobody. Don't include the key at all.
  const db = new FakeOnboardingStore()
  await db.seedCustomer({
    id: 'cust-pre-pair',
    email: 'fresh@example.com',
    // telegram_chat_id intentionally omitted (null)
  })
  await db.setBotTokenAndUsername('cust-pre-pair', '12345:bot_token', 'fresh_bot')
  const provisioning = new FakeProvisioning()
  const res = await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-pre-pair' }),
    { db, provisioning },
  )
  assert.equal(res.status, 200)
  const env = provisioning.refreshCalls[0]!.envValues
  assert.equal(env.TELEGRAM_BOT_TOKEN, '12345:bot_token')
  assert.equal(
    env.TELEGRAM_ALLOWED_USERS,
    undefined,
    'allowlist must NOT be in envValues when customer has no chat_id ' +
      '(otherwise we lock the gateway to nobody)',
  )
})

test('Phase E atomicity invariant: when token is pushed AND chat_id exists, allowlist MUST be co-pushed', async () => {
  // Drift gate. If a future refactor adds a branch that pushes the
  // token without the allowlist for a customer whose chat_id is set,
  // we land back at the Renita Stage 5 bug. This test fails
  // unambiguously in that case.
  const db = new FakeOnboardingStore()
  await db.seedCustomer({
    id: 'cust-invariant',
    email: 'invariant@example.com',
    telegram_chat_id: '9999999999',
  })
  await db.setBotTokenAndUsername('cust-invariant', '99999:tok', 'inv_bot')
  const provisioning = new FakeProvisioning()
  await handleAdminCustomerVpsRefresh(
    makeReq({ customer_id: 'cust-invariant' }),
    { db, provisioning },
  )
  const env = provisioning.refreshCalls[0]!.envValues
  if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_ALLOWED_USERS) {
    assert.fail(
      'INVARIANT VIOLATED: token pushed without allowlist while customer.telegram_chat_id ' +
        'is set. This regenerates the Renita Stage 5 bug class.',
    )
  }
})
