/**
 * /api/public/subscription-count — real-count source for the landing's
 * "first 100 customers" badge (honesty lock).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fetchActiveSubscriptionCount } from '../api/public/subscription-count.ts'

function fakeFetch(contentRange: string | null, status = 200): typeof fetch {
  return (async (_url: any, _init?: any) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-range' ? contentRange : null,
      },
    } as unknown as Response
  }) as typeof fetch
}

test('parses the PostgREST count header (content-range tail)', async () => {
  const n = await fetchActiveSubscriptionCount({
    supabaseUrl: 'https://x.supabase.co',
    serviceKey: 'k',
    fetchImpl: fakeFetch('0-24/137'),
  })
  assert.equal(n, 137)
})

test('zero customers parses cleanly', async () => {
  const n = await fetchActiveSubscriptionCount({
    supabaseUrl: 'https://x.supabase.co',
    serviceKey: 'k',
    fetchImpl: fakeFetch('*/0'),
  })
  assert.equal(n, 0)
})

test('HTTP failure throws (caller returns opaque 500)', async () => {
  await assert.rejects(() =>
    fetchActiveSubscriptionCount({
      supabaseUrl: 'https://x.supabase.co',
      serviceKey: 'k',
      fetchImpl: fakeFetch(null, 503),
    }),
  )
})

test('missing/garbled count header throws instead of returning NaN', async () => {
  await assert.rejects(() =>
    fetchActiveSubscriptionCount({
      supabaseUrl: 'https://x.supabase.co',
      serviceKey: 'k',
      fetchImpl: fakeFetch('garbage'),
    }),
  )
})

test('queries only status=eq.active with a HEAD count request (no row data)', async () => {
  let captured: { url?: string; method?: string; prefer?: string } = {}
  const spy: typeof fetch = (async (url: any, init?: any) => {
    captured = {
      url: String(url),
      method: init?.method,
      prefer: init?.headers?.prefer,
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => '*/5' },
    } as unknown as Response
  }) as typeof fetch
  await fetchActiveSubscriptionCount({
    supabaseUrl: 'https://x.supabase.co',
    serviceKey: 'k',
    fetchImpl: spy,
  })
  assert.match(captured.url ?? '', /status=eq\.active/)
  assert.equal(captured.method, 'HEAD')
  assert.equal(captured.prefer, 'count=exact')
})
