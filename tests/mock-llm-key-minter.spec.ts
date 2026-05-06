/**
 * MockLlmKeyMinter contract tests.
 *
 * Exercises the same surface area the real OpenRouterKeyMinter must
 * uphold so the swap (Phase 2A merge) is a drop-in.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MockLlmKeyMinter } from '../supabase/functions/_shared/mock-llm-key-minter.ts'

test('mint: returns a key + hash + the requested credit limit', async () => {
  const m = new MockLlmKeyMinter()
  const r = await m.mint({ name: 'cust-123', limitUsdCents: 500 })
  assert.match(r.key, /^sk-mock-cust-123-[0-9a-f]+$/)
  assert.match(r.hash, /^hash-cust-123-[0-9a-f]+$/)
  assert.equal(r.limitUsdCents, 500)
})

test('mint: two calls for the same name return distinct keys', async () => {
  const m = new MockLlmKeyMinter()
  const a = await m.mint({ name: 'cust-1', limitUsdCents: 300 })
  const b = await m.mint({ name: 'cust-1', limitUsdCents: 300 })
  assert.notEqual(a.key, b.key)
  assert.notEqual(a.hash, b.hash)
})

test('mint: tracks every mint in `minted` for assertion', async () => {
  const m = new MockLlmKeyMinter()
  await m.mint({ name: 'cust-A', limitUsdCents: 300 })
  await m.mint({ name: 'cust-B', limitUsdCents: 3000 })
  assert.equal(m.minted.length, 2)
  assert.equal(m.minted[0].limitUsdCents, 300)
  assert.equal(m.minted[1].limitUsdCents, 3000)
})

test('revoke: returns ok and remembers what was revoked', async () => {
  const m = new MockLlmKeyMinter()
  const minted = await m.mint({ name: 'cust-X', limitUsdCents: 500 })
  assert.equal(m.wasRevoked(minted.hash), false)

  const r = await m.revoke(minted.hash)
  assert.equal(r.ok, true)
  assert.equal(m.wasRevoked(minted.hash), true)
})

test('revoke: idempotent for the same hash', async () => {
  const m = new MockLlmKeyMinter()
  const minted = await m.mint({ name: 'cust-Y', limitUsdCents: 300 })
  const a = await m.revoke(minted.hash)
  const b = await m.revoke(minted.hash)
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(m.wasRevoked(minted.hash), true)
})
