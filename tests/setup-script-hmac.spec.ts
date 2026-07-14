// Phase 5-3.c rollout: setup-script HMAC token integration tests.
//
// Asserts buildSetupScript writes HERMES_INSTANCE_TOKEN to the VPS .env
// when hermesInstanceToken is provided, and skips it for back-compat
// when absent.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSetupScript } from '../services/provisioning/src/setup-script'
import {
  signCustomerToken,
  verifyCustomerToken,
} from '../supabase/functions/_shared/hermes-instance-auth'

const HMAC_KEY = 'test-rollout-key-stable-for-snapshot'
const CUST = '11111111-1111-1111-1111-111111111111'

const baseParams = {
  customerId: CUST,
  tier: 'studio' as const,
  telegramBotToken: 'fake-bot-token',
  telegramAllowedUserIds: '12345',
  openRouterKey: 'sk-or-fake',
  agentSlug: 'business-agent',
}

// ─── Token written to env when provided ───────────────────────────

test('hermesInstanceToken provided → HERMES_INSTANCE_TOKEN line in env block', async () => {
  const token = await signCustomerToken(CUST, HMAC_KEY)
  const script = buildSetupScript({
    ...baseParams,
    hermesInstanceToken: token,
  })
  assert.match(
    script,
    new RegExp(`HERMES_INSTANCE_TOKEN=${token}`),
    'env block must contain HERMES_INSTANCE_TOKEN with the signed value',
  )
})

test('hermesInstanceToken omitted → no HERMES_INSTANCE_TOKEN line (back-compat)', () => {
  const script = buildSetupScript(baseParams)
  assert.ok(
    !script.includes('HERMES_INSTANCE_TOKEN='),
    'env block must NOT contain HERMES_INSTANCE_TOKEN when caller did not compute one',
  )
})

test('hermesInstanceToken provided alongside Telegram + OpenRouter → all 3 envs land', async () => {
  const token = await signCustomerToken(CUST, HMAC_KEY)
  const script = buildSetupScript({
    ...baseParams,
    hermesInstanceToken: token,
  })
  assert.match(script, /TELEGRAM_BOT_TOKEN=/, 'telegram env still written')
  assert.match(script, /OPENAI_API_KEY=/, 'openrouter env still written')
  assert.match(script, /HERMES_INSTANCE_TOKEN=/, 'HMAC token env added')
})

// ─── Round-trip — token written into script verifies later ───────

test('round-trip: token written to env verifies against verifyCustomerToken', async () => {
  const token = await signCustomerToken(CUST, HMAC_KEY)
  const script = buildSetupScript({
    ...baseParams,
    hermesInstanceToken: token,
  })
  // Extract token back from env line — same way Hermes-side env loader would
  const m = script.match(/HERMES_INSTANCE_TOKEN=([0-9a-f]{64})/)
  assert.ok(m, 'should find HERMES_INSTANCE_TOKEN= line with 64-hex value')
  const extracted = m![1]
  assert.equal(extracted, token, 'extracted token must equal what we signed')
  // Verify round-trips against the same key + customer_id
  assert.equal(
    await verifyCustomerToken(CUST, extracted, HMAC_KEY),
    true,
    'token from env must verify against signCustomerToken-side key',
  )
})

// ─── Cross-customer isolation ─────────────────────────────────────

test('different customers get different tokens (no cross-customer leak)', async () => {
  const tokenA = await signCustomerToken(CUST, HMAC_KEY)
  const otherCust = '22222222-2222-2222-2222-222222222222'
  const tokenB = await signCustomerToken(otherCust, HMAC_KEY)
  assert.notEqual(tokenA, tokenB)

  const scriptA = buildSetupScript({
    ...baseParams,
    customerId: CUST,
    hermesInstanceToken: tokenA,
  })
  const scriptB = buildSetupScript({
    ...baseParams,
    customerId: otherCust,
    hermesInstanceToken: tokenB,
  })

  // Each script's env block contains ONLY its own customer's token
  assert.ok(scriptA.includes(`HERMES_INSTANCE_TOKEN=${tokenA}`))
  assert.ok(!scriptA.includes(tokenB), 'scriptA must not leak tokenB')
  assert.ok(scriptB.includes(`HERMES_INSTANCE_TOKEN=${tokenB}`))
  assert.ok(!scriptB.includes(tokenA), 'scriptB must not leak tokenA')
})
