/**
 * ILlmKeyMinter — OpenRouter (or any future OpenAI-compatible provider)
 * key minting port. Lets customer-flow mint a scoped per-customer LLM key
 * at provision time and revoke on tear-down.
 *
 * Mock impl: in-memory recorder + deterministic returned key.
 * Real impl: services/provisioning/src/llm/openrouter-minter.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  type ILlmKeyMinter,
  type MintKeyOpts,
  type MintKeyResult,
} from '../services/provisioning/src/llm-key-minter.ts'
import { MockLlmKeyMinter } from '../services/provisioning/src/llm/mock-minter.ts'

test('mock minter: records call + returns deterministic key + hash', async () => {
  const m = new MockLlmKeyMinter()
  const r = await m.mint({
    name: 'weuseai-customer-cust-1',
    limitUsdCents: 500,
  })
  assert.equal(r.key.startsWith('sk-or-v1-mock-'), true, 'deterministic mock key')
  assert.ok(r.hash, 'hash present')
  assert.equal(r.limitUsdCents, 500)

  assert.equal(m.calls.length, 1)
  assert.equal(m.calls[0].name, 'weuseai-customer-cust-1')
  assert.equal(m.calls[0].limitUsdCents, 500)
})

test('mock minter: revoke records hash, returns ok', async () => {
  const m = new MockLlmKeyMinter()
  const minted = await m.mint({ name: 'x', limitUsdCents: 100 })
  const r = await m.revoke(minted.hash)
  assert.equal(r.ok, true)
  assert.equal(m.revokes.length, 1)
  assert.equal(m.revokes[0], minted.hash)
})

test('mock minter: failure injection — mint throws', async () => {
  const m = new MockLlmKeyMinter({ shouldFailMint: true })
  await assert.rejects(
    () => m.mint({ name: 'x', limitUsdCents: 100 }),
    /mock mint failure/,
  )
})

test('mock minter: ILlmKeyMinter type satisfied', () => {
  const m: ILlmKeyMinter = new MockLlmKeyMinter()
  assert.equal(typeof m.mint, 'function')
  assert.equal(typeof m.revoke, 'function')
})

test('mock minter: each mint returns distinct hash', async () => {
  const m = new MockLlmKeyMinter()
  const a = await m.mint({ name: 'a', limitUsdCents: 100 })
  const b = await m.mint({ name: 'b', limitUsdCents: 100 })
  assert.notEqual(a.hash, b.hash, 'distinct hashes per mint')
  assert.notEqual(a.key, b.key, 'distinct keys per mint')
})
