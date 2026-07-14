// Integration tests for api/_shared/observability/customer.ts (moved 2026-06-11, Hobby function-cap consolidation).
//
// Exercises the request lifecycle end-to-end except for the actual
// PostgREST round-trip: auth check → arg validation → snapshot fetch →
// derive → respond. Each test resets process.env and re-imports the
// handler module so `const ADMIN_SECRET = process.env...` picks up new
// values per test.

import { describe, it, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'

const VALID_ID = '11111111-1111-4111-8111-111111111111'

function fakeRes() {
  const out: {
    status: number
    body: unknown
    headers: Record<string, string>
    sent: 'json' | 'send' | null
  } = { status: 0, body: null, headers: {}, sent: null }
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.body = body
      out.sent = 'json'
      return res
    },
    send(body: unknown) {
      out.body = body
      out.sent = 'send'
      return res
    },
    setHeader(k: string, v: string) {
      out.headers[k] = v
    },
  }
  return { res, out }
}

async function loadHandler() {
  // Cache-bust: add a query string so subsequent imports re-evaluate.
  const url = new URL(
    '../api/_shared/observability/customer.ts?bust=' + Date.now(),
    import.meta.url,
  ).href
  const mod = (await import(url)) as { default: Function }
  return mod.default
}

describe('api/_shared/observability/customer — auth & arg validation', () => {
  beforeEach(() => {
    delete process.env.OBSERVABILITY_ADMIN_SECRET
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('500 misconfigured when OBSERVABILITY_ADMIN_SECRET unset', async () => {
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer x' }, query: { id: VALID_ID } },
      res,
    )
    assert.equal(out.status, 500)
    assert.deepEqual(out.body, {
      error: 'misconfigured',
      detail: 'OBSERVABILITY_ADMIN_SECRET unset',
    })
  })

  it('401 unauthorized on wrong bearer', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer wrong' }, query: { id: VALID_ID } },
      res,
    )
    assert.equal(out.status, 401)
  })

  it('405 method not allowed on POST', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer right' }, query: { id: VALID_ID } },
      res,
    )
    assert.equal(out.status, 405)
  })

  it('500 misconfigured when SUPABASE creds missing', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer right' }, query: { id: VALID_ID } },
      res,
    )
    assert.equal(out.status, 500)
    const body = out.body as { detail?: string }
    assert.match(body.detail ?? '', /SUPABASE_URL/)
  })

  it('400 missing_id', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer right' }, query: {} },
      res,
    )
    assert.equal(out.status, 400)
    assert.deepEqual(out.body, { error: 'missing_id' })
  })

  it('400 bad_id on non-uuid', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer right' },
        query: { id: 'not-a-uuid' },
      },
      res,
    )
    assert.equal(out.status, 400)
    assert.deepEqual(out.body, { error: 'bad_id' })
  })

  it('400 bad_format on unknown format', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer right' },
        query: { id: VALID_ID, format: 'pdf' },
      },
      res,
    )
    assert.equal(out.status, 400)
  })
})

describe('api/_shared/observability/customer — fetch failures bubble as 502', () => {
  it('502 fetch_failed when PostgREST is unreachable', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'http://127.0.0.1:1' // closed port
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer right' },
        query: { id: VALID_ID },
      },
      res,
    )
    assert.equal(out.status, 502)
    const body = out.body as { error?: string }
    assert.equal(body.error, 'fetch_failed')
  })
})
