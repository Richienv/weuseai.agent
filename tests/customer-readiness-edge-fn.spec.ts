// supabase/functions/customer-readiness — pure handler tests.
//
// Track 1 of post-pair UX polish (2026-05-10). Edge Fn wrapper that
// proxies welcome.html readiness polls to the Fly /customer-readiness-probe
// endpoint. Validates UUID format + customer-exists + optional X-CID
// consistency before forwarding.

import test from 'node:test'
import assert from 'node:assert/strict'

import { handleCustomerReadiness } from '../supabase/functions/_shared/customer-readiness-handler.ts'

const VALID_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/customer-readiness', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function makeFakeFetch(opts: {
  status?: number
  body?: string
  capturedRequests?: Array<{ url: string; init: RequestInit | undefined }>
}): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => {
    if (opts.capturedRequests) {
      opts.capturedRequests.push({ url: String(url), init })
    }
    return Promise.resolve(
      new Response(opts.body ?? '{"ok":true,"ready":true}', {
        status: opts.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof fetch
}

test('rejects non-POST', async () => {
  const req = new Request('https://example.com/x', { method: 'GET' })
  const r = await handleCustomerReadiness(req, {
    provisioningUrl: 'https://fly',
    provisioningAuthToken: 'tok',
    validateCustomerExists: async () => true,
    fetchImpl: makeFakeFetch({}),
  })
  assert.equal(r.status, 405)
})

test('rejects malformed JSON body', async () => {
  const req = new Request('https://example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not-json',
  })
  const r = await handleCustomerReadiness(req, {
    provisioningUrl: 'https://fly',
    provisioningAuthToken: 'tok',
    validateCustomerExists: async () => true,
    fetchImpl: makeFakeFetch({}),
  })
  assert.equal(r.status, 400)
})

test('rejects missing customer_id', async () => {
  const r = await handleCustomerReadiness(makeReq({}), {
    provisioningUrl: 'https://fly',
    provisioningAuthToken: 'tok',
    validateCustomerExists: async () => true,
    fetchImpl: makeFakeFetch({}),
  })
  assert.equal(r.status, 400)
  const j = (await r.json()) as { error: string; field: string }
  assert.equal(j.error, 'invalid_field')
  assert.equal(j.field, 'customer_id')
})

test('rejects non-UUID customer_id', async () => {
  const r = await handleCustomerReadiness(
    makeReq({ customer_id: 'not-a-uuid' }),
    {
      provisioningUrl: 'https://fly',
      provisioningAuthToken: 'tok',
      validateCustomerExists: async () => true,
      fetchImpl: makeFakeFetch({}),
    },
  )
  assert.equal(r.status, 400)
})

test('rejects when X-CID header conflicts with body customer_id', async () => {
  const otherCid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const r = await handleCustomerReadiness(
    makeReq({ customer_id: VALID_CID }, { 'x-cid': otherCid }),
    {
      provisioningUrl: 'https://fly',
      provisioningAuthToken: 'tok',
      validateCustomerExists: async () => true,
      fetchImpl: makeFakeFetch({}),
    },
  )
  assert.equal(r.status, 400)
  const j = (await r.json()) as { error: string }
  assert.equal(j.error, 'cid_mismatch')
})

test('returns 404 when customer does not exist', async () => {
  const r = await handleCustomerReadiness(
    makeReq({ customer_id: VALID_CID }),
    {
      provisioningUrl: 'https://fly',
      provisioningAuthToken: 'tok',
      validateCustomerExists: async () => false,
      fetchImpl: makeFakeFetch({}),
    },
  )
  assert.equal(r.status, 404)
})

test('proxies to Fly with bearer + forwards body verbatim on success', async () => {
  const captured: Array<{ url: string; init: RequestInit | undefined }> = []
  const r = await handleCustomerReadiness(
    makeReq({ customer_id: VALID_CID }, { 'x-cid': VALID_CID }),
    {
      provisioningUrl: 'https://fly.dev',
      provisioningAuthToken: 'super-secret-token',
      validateCustomerExists: async () => true,
      fetchImpl: makeFakeFetch({
        status: 200,
        body: '{"ok":true,"ready":true,"checks":{"hermes_systemd_active":true}}',
        capturedRequests: captured,
      }),
    },
  )
  assert.equal(r.status, 200)
  const j = (await r.json()) as { ok: boolean; ready: boolean; checks: Record<string, boolean> }
  assert.equal(j.ready, true)
  assert.equal(j.checks.hermes_systemd_active, true)

  // Verify proxy request shape.
  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, 'https://fly.dev/customer-readiness-probe')
  const headers = captured[0].init?.headers as Record<string, string>
  assert.equal(headers['authorization'], 'Bearer super-secret-token')
  assert.equal(headers['content-type'], 'application/json')
  assert.equal(captured[0].init?.body, JSON.stringify({ customer_id: VALID_CID }))
})

test('returns 503 when Fly is unreachable', async () => {
  const failFetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch
  const r = await handleCustomerReadiness(
    makeReq({ customer_id: VALID_CID }),
    {
      provisioningUrl: 'https://fly',
      provisioningAuthToken: 'tok',
      validateCustomerExists: async () => true,
      fetchImpl: failFetch,
    },
  )
  assert.equal(r.status, 503)
  const j = (await r.json()) as { error: string }
  assert.equal(j.error, 'provisioning_unreachable')
})
