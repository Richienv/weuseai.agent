// Phase 5-3.c: hermes-instance-auth tests.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractBearerToken,
  signCustomerToken,
  verifyCustomerToken,
} from '../supabase/functions/_shared/hermes-instance-auth.ts'

const KEY = 'test-hmac-key-must-be-stable'
const CUST = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

// ─── signCustomerToken ────────────────────────────────────────────

test('signCustomerToken returns 64-char lowercase hex', async () => {
  const token = await signCustomerToken(CUST, KEY)
  assert.equal(token.length, 64)
  assert.match(token, /^[0-9a-f]{64}$/)
})

test('signCustomerToken is deterministic for same (customer_id, key)', async () => {
  const a = await signCustomerToken(CUST, KEY)
  const b = await signCustomerToken(CUST, KEY)
  assert.equal(a, b)
})

test('signCustomerToken differs across customers (same key)', async () => {
  const a = await signCustomerToken(CUST, KEY)
  const b = await signCustomerToken(OTHER, KEY)
  assert.notEqual(a, b)
})

test('signCustomerToken differs across keys (same customer)', async () => {
  const a = await signCustomerToken(CUST, KEY)
  const b = await signCustomerToken(CUST, 'different-key')
  assert.notEqual(a, b)
})

test('signCustomerToken throws on empty inputs', async () => {
  await assert.rejects(() => signCustomerToken('', KEY), /customer_id required/)
  await assert.rejects(() => signCustomerToken(CUST, ''), /hmacKey required/)
})

// ─── verifyCustomerToken ──────────────────────────────────────────

test('verifyCustomerToken accepts a valid token', async () => {
  const token = await signCustomerToken(CUST, KEY)
  assert.equal(await verifyCustomerToken(CUST, token, KEY), true)
})

test('verifyCustomerToken rejects token signed for a different customer', async () => {
  const token = await signCustomerToken(OTHER, KEY)
  assert.equal(await verifyCustomerToken(CUST, token, KEY), false)
})

test('verifyCustomerToken rejects token signed with a different key', async () => {
  const token = await signCustomerToken(CUST, 'wrong-key')
  assert.equal(await verifyCustomerToken(CUST, token, KEY), false)
})

test('verifyCustomerToken rejects malformed (non-hex / wrong length) tokens', async () => {
  assert.equal(await verifyCustomerToken(CUST, 'too-short', KEY), false)
  assert.equal(
    await verifyCustomerToken(CUST, 'g'.repeat(64), KEY),
    false,
    'non-hex chars should fail',
  )
  assert.equal(
    await verifyCustomerToken(CUST, 'a'.repeat(63), KEY),
    false,
    'short hex should fail',
  )
  assert.equal(
    await verifyCustomerToken(CUST, 'a'.repeat(65), KEY),
    false,
    'long hex should fail',
  )
})

test('verifyCustomerToken accepts uppercase hex (normalized)', async () => {
  const token = (await signCustomerToken(CUST, KEY)).toUpperCase()
  assert.equal(await verifyCustomerToken(CUST, token, KEY), true)
})

test('verifyCustomerToken throws on missing hmacKey (server config bug)', async () => {
  const token = await signCustomerToken(CUST, KEY)
  await assert.rejects(
    () => verifyCustomerToken(CUST, token, ''),
    /hmacKey unset/,
  )
})

// ─── extractBearerToken ───────────────────────────────────────────

test('extractBearerToken parses standard "Bearer <token>" header', () => {
  assert.equal(extractBearerToken('Bearer abc123'), 'abc123')
  assert.equal(extractBearerToken('bearer abc123'), 'abc123', 'case-insensitive')
})

test('extractBearerToken returns null for missing or malformed headers', () => {
  assert.equal(extractBearerToken(null), null)
  assert.equal(extractBearerToken(undefined), null)
  assert.equal(extractBearerToken(''), null)
  assert.equal(extractBearerToken('Token abc123'), null)
  assert.equal(extractBearerToken('Bearer'), null)
  assert.equal(extractBearerToken('Bearer  '), null) // multiple spaces no token
})

// ─── Round-trip integration ──────────────────────────────────────

test('round-trip: sign then verify across 100 customers', async () => {
  for (let i = 0; i < 100; i++) {
    const id = `cust-${i.toString().padStart(8, '0')}-1111-1111-1111-111111111111`
    const token = await signCustomerToken(id, KEY)
    assert.equal(await verifyCustomerToken(id, token, KEY), true)
    // Cross-customer rejection
    if (i > 0) {
      const otherId = `cust-${(i - 1).toString().padStart(8, '0')}-1111-1111-1111-111111111111`
      assert.equal(
        await verifyCustomerToken(otherId, token, KEY),
        false,
        `token for ${id} should not validate for ${otherId}`,
      )
    }
  }
})
