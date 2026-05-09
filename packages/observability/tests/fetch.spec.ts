import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import { fetchCustomerSnapshot } from '../src/fetch.ts'

const VALID_ID = '11111111-1111-4111-8111-111111111111'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeStubFetch(routes: Record<string, unknown>): {
  fetchImpl: typeof fetch
  capturedHeaders: Record<string, string>
  callOrder: string[]
} {
  const captured: Record<string, string> = {}
  const callOrder: string[] = []
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = String(url)
    callOrder.push(u)
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        captured[k] = v
      }
    }
    for (const [needle, body] of Object.entries(routes)) {
      if (u.includes(needle)) return jsonResponse(body)
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, capturedHeaders: captured, callOrder }
}

describe('fetchCustomerSnapshot', () => {
  it('rejects malformed customer ids', async () => {
    await assert.rejects(
      () =>
        fetchCustomerSnapshot('not-a-uuid', {
          supabaseUrl: 'https://x.supabase.co',
          supabaseServiceKey: 'sb-key',
          fetchImpl: () => Promise.reject(new Error('should not be called')),
        }),
      /invalid customer id/,
    )
  })

  it('rejects missing env', async () => {
    await assert.rejects(
      () =>
        fetchCustomerSnapshot(VALID_ID, {
          supabaseUrl: '',
          supabaseServiceKey: '',
        }),
      /SUPABASE_URL/,
    )
  })

  it('sends apikey + Bearer headers + parallel selects per table', async () => {
    const { fetchImpl, capturedHeaders, callOrder } = makeStubFetch({
      '/customers?': [
        {
          id: VALID_ID,
          email: 'x@y.id',
          display_name: 'X',
          telegram_chat_id: null,
          telegram_bot_token: null,
          soul_md_text: null,
          bundle_versions: {},
          bundle_update_policy: 'pin',
          pairing_code: null,
          pairing_code_expires_at: null,
          created_at: '2026-05-10T10:00:00.000Z',
        },
      ],
      '/subscriptions?': [],
      '/subscription_invoices?': [],
      '/vps_instances?': [],
      '/bundle_pull_attempts?': [],
      '/usage_log?': [],
    })

    const snap = await fetchCustomerSnapshot(VALID_ID, {
      supabaseUrl: 'https://x.supabase.co/',
      supabaseServiceKey: 'sb-key',
      fetchImpl,
    })

    assert.equal(capturedHeaders.apikey, 'sb-key')
    assert.equal(capturedHeaders.Authorization, 'Bearer sb-key')
    assert.equal(callOrder.length, 6)
    assert.ok(callOrder.some((u) => u.includes('kind=eq.setup_first_month')))
    assert.ok(snap.customer)
    assert.equal(snap.customer?.id, VALID_ID)
  })

  it('coerces null bundle_versions to {}', async () => {
    const { fetchImpl } = makeStubFetch({
      '/customers?': [
        {
          id: VALID_ID,
          email: 'x@y.id',
          display_name: null,
          telegram_chat_id: null,
          telegram_bot_token: null,
          soul_md_text: null,
          bundle_versions: null,
          bundle_update_policy: 'pin',
          pairing_code: null,
          pairing_code_expires_at: null,
          created_at: '2026-05-10T10:00:00.000Z',
        },
      ],
      '/subscriptions?': [],
      '/subscription_invoices?': [],
      '/vps_instances?': [],
      '/bundle_pull_attempts?': [],
      '/usage_log?': [],
    })
    const snap = await fetchCustomerSnapshot(VALID_ID, {
      supabaseUrl: 'https://x.supabase.co',
      supabaseServiceKey: 'sb-key',
      fetchImpl,
    })
    assert.deepEqual(snap.customer?.bundle_versions, {})
  })

  it('returns null customer when row absent', async () => {
    const { fetchImpl } = makeStubFetch({
      '/customers?': [],
      '/subscriptions?': [],
      '/subscription_invoices?': [],
      '/vps_instances?': [],
      '/bundle_pull_attempts?': [],
      '/usage_log?': [],
    })
    const snap = await fetchCustomerSnapshot(VALID_ID, {
      supabaseUrl: 'https://x.supabase.co',
      supabaseServiceKey: 'sb-key',
      fetchImpl,
    })
    assert.equal(snap.customer, null)
  })

  it('computes firstMessageAt as oldest row + recentMessageCount as 7d slice', async () => {
    const now = Date.now()
    const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString()
    const eightDaysAgo = new Date(now - 8 * 24 * 3600 * 1000).toISOString()

    const { fetchImpl } = makeStubFetch({
      '/customers?': [
        {
          id: VALID_ID,
          email: 'x@y.id',
          display_name: null,
          telegram_chat_id: null,
          telegram_bot_token: null,
          soul_md_text: null,
          bundle_versions: {},
          bundle_update_policy: 'pin',
          pairing_code: null,
          pairing_code_expires_at: null,
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      '/subscriptions?': [],
      '/subscription_invoices?': [],
      '/vps_instances?': [],
      '/bundle_pull_attempts?': [],
      // PostgREST DESC order returns newest first.
      '/usage_log?': [
        { created_at: oneDayAgo },
        { created_at: eightDaysAgo },
      ],
    })
    const snap = await fetchCustomerSnapshot(VALID_ID, {
      supabaseUrl: 'https://x.supabase.co',
      supabaseServiceKey: 'sb-key',
      fetchImpl,
    })
    assert.equal(snap.firstMessageAt, eightDaysAgo)
    assert.equal(snap.recentMessageCount, 1)
  })

  it('throws on non-2xx responses with table label', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('boom', { status: 500 })
    await assert.rejects(
      () =>
        fetchCustomerSnapshot(VALID_ID, {
          supabaseUrl: 'https://x.supabase.co',
          supabaseServiceKey: 'sb-key',
          fetchImpl,
        }),
      /HTTP 500/,
    )
  })
})
