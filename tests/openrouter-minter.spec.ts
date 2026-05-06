/**
 * OpenRouterKeyMinter — POSTs to /api/v1/keys with provisioning key auth.
 * Tests use a mocked global fetch.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { OpenRouterKeyMinter } from '../services/provisioning/src/llm/openrouter-minter.ts'

type FetchCall = { url: string; init: RequestInit }

function makeFetchMock(response: { status?: number; body: unknown }): {
  fn: typeof fetch
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  const fn: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    const status = response.status ?? 200
    return new Response(
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      { status, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fn, calls }
}

function withMockedFetch<T>(mock: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch
  globalThis.fetch = mock
  return fn().finally(() => {
    globalThis.fetch = orig
  })
}

test('mint: POST /api/v1/keys with bearer auth + correct body', async () => {
  const { fn, calls } = makeFetchMock({
    status: 201,
    body: {
      key: 'sk-or-v1-real-secret',
      data: { hash: 'abc123hash', name: 'weuseai-customer-cust-1', limit: 5.0 },
    },
  })
  await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'pk-xyz' })
    return m.mint({ name: 'weuseai-customer-cust-1', limitUsdCents: 500 })
  })

  assert.equal(calls.length, 1)
  const c = calls[0]
  assert.equal(c.url, 'https://openrouter.ai/api/v1/keys')
  assert.equal(c.init.method, 'POST')
  const headers = c.init.headers as Record<string, string>
  assert.equal(headers['Authorization'], 'Bearer pk-xyz')
  assert.equal(headers['Content-Type'], 'application/json')

  const body = JSON.parse(c.init.body as string)
  assert.equal(body.name, 'weuseai-customer-cust-1')
  // Limit must be in USD (number), not cents — OpenRouter uses USD floats.
  assert.equal(body.limit, 5.0)
})

test('mint: returns key + hash + limit from response', async () => {
  const { fn } = makeFetchMock({
    status: 201,
    body: {
      key: 'sk-or-v1-actual-key',
      data: { hash: 'h-from-server', name: 'x', limit: 3.0 },
    },
  })
  const r = await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'pk' })
    return m.mint({ name: 'x', limitUsdCents: 300 })
  })
  assert.equal(r.key, 'sk-or-v1-actual-key')
  assert.equal(r.hash, 'h-from-server')
  assert.equal(r.limitUsdCents, 300)
})

test('mint: error response throws with status + body', async () => {
  const { fn } = makeFetchMock({ status: 401, body: { error: 'invalid provisioning key' } })
  await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'bad' })
    await assert.rejects(
      () => m.mint({ name: 'x', limitUsdCents: 100 }),
      /OpenRouter mint -> 401.*invalid provisioning key/,
    )
  })
})

test('revoke: DELETE /api/v1/keys/{hash} with bearer auth', async () => {
  const { fn, calls } = makeFetchMock({ status: 200, body: { deleted: true } })
  const r = await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'pk-xyz' })
    return m.revoke('h-abc')
  })
  assert.equal(r.ok, true)
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/keys/h-abc')
  assert.equal(calls[0].init.method, 'DELETE')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers['Authorization'], 'Bearer pk-xyz')
})

test('revoke: error response throws (lets caller decide retry policy)', async () => {
  const { fn } = makeFetchMock({ status: 500, body: { error: 'internal' } })
  await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'pk' })
    await assert.rejects(
      () => m.revoke('h-abc'),
      /OpenRouter revoke -> 500/,
    )
  })
})

test('mint: cents-to-usd conversion handles 300 → 3.00 correctly', async () => {
  const { fn, calls } = makeFetchMock({
    status: 201,
    body: { key: 'k', data: { hash: 'h', name: 'x', limit: 3.0 } },
  })
  await withMockedFetch(fn, async () => {
    const m = new OpenRouterKeyMinter({ provisioningKey: 'pk' })
    return m.mint({ name: 'x', limitUsdCents: 300 })
  })
  const body = JSON.parse(calls[0].init.body as string)
  // 300 cents → 3.00 USD (not 0.03)
  assert.equal(body.limit, 3)
})
