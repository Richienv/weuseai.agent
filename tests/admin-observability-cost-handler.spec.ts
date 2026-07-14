// Integration tests for api/_shared/observability/cost.ts (moved 2026-06-11, Hobby function-cap consolidation).
//
// Exercises the request lifecycle except the live network round-trips
// (PostgREST + OpenRouter): auth check → env validation → 502 on
// unreachable backend. The fetch/derive logic itself is unit-tested in
// tests/llm-cost-fetch.spec.ts and tests/llm-cost-derive.spec.ts.
//
// Each test resets process.env and re-imports the handler module so the
// module-scope `const ADMIN_SECRET = process.env...` picks up new values.

import { describe, it, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'

function fakeRes() {
  const out: {
    status: number
    body: unknown
    headers: Record<string, string>
  } = { status: 0, body: null, headers: {} }
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.body = body
      return res
    },
    setHeader(k: string, v: string) {
      out.headers[k] = v
    },
  }
  return { res, out }
}

async function loadHandler() {
  const url = new URL(
    '../api/_shared/observability/cost.ts?bust=' + Date.now(),
    import.meta.url,
  ).href
  const mod = (await import(url)) as { default: Function }
  return mod.default
}

describe('api/_shared/observability/cost — auth & env validation', () => {
  beforeEach(() => {
    delete process.env.OBSERVABILITY_ADMIN_SECRET
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.OPENROUTER_PROVISIONING_KEY
  })

  it('500 misconfigured when OBSERVABILITY_ADMIN_SECRET unset', async () => {
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer x' } }, res)
    assert.equal(out.status, 500)
    assert.deepEqual(out.body, {
      error: 'misconfigured',
      detail: 'OBSERVABILITY_ADMIN_SECRET unset',
    })
  })

  it('405 method_not_allowed on POST', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer right' } }, res)
    assert.equal(out.status, 405)
  })

  it('401 unauthorized on wrong bearer', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res)
    assert.equal(out.status, 401)
  })

  it('500 misconfigured when SUPABASE creds missing', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer right' } }, res)
    assert.equal(out.status, 500)
    const body = out.body as { detail?: string }
    assert.match(body.detail ?? '', /SUPABASE_URL/)
  })

  it('502 fetch_failed when the backend is unreachable', async () => {
    process.env.OBSERVABILITY_ADMIN_SECRET = 'right'
    process.env.SUPABASE_URL = 'http://127.0.0.1:1' // closed port
    process.env.SUPABASE_SECRET_KEY = 'sb-key'
    const handler = await loadHandler()
    const { res, out } = fakeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer right' } }, res)
    assert.equal(out.status, 502)
    const body = out.body as { error?: string }
    assert.equal(body.error, 'fetch_failed')
  })
})
