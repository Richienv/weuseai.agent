// Unit tests for the Vercel Cron `flow-state-ttl-sweep` handler.
//
// Reference: api/cron/flow-state-ttl-sweep.ts
//
// This Vercel function is a thin forwarder — it validates CRON_SECRET
// then POSTs to the Supabase Edge Function `flow-state-ttl-sweep` with
// the service-role JWT. Tests cover the gates + the forward shape;
// the actual sweep logic is tested in
// flow-state-ttl-sweep-handler.spec.ts.
//
// Pattern matches nightly-cleanup.spec.ts: mock global fetch, dynamic-
// import the handler per test so env vars re-read at module load.

import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

type CapturedFetch = Array<{ url: string; init?: RequestInit }>

function recordingFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch; calls: CapturedFetch } {
  const calls: CapturedFetch = []
  const f: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return responder(String(url), init)
  }
  return { fetch: f, calls }
}

function reqWith(authHeader: string | null) {
  return {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader }
      : ({} as Record<string, string>),
  }
}

function makeRes() {
  let _status = 200
  let _body: unknown = null
  let _headers: Record<string, string> = {}
  return {
    res: {
      status(c: number) {
        _status = c
        return this
      },
      json(b: unknown) {
        _body = b
        return this
      },
      setHeader(name: string, value: string) {
        _headers[name] = value
      },
    },
    get status() {
      return _status
    },
    get body() {
      return _body as Record<string, unknown> | null
    },
    get headers() {
      return _headers
    },
  }
}

const HANDLER_PATH = '../api/cron/flow-state-ttl-sweep.ts'

async function importFreshHandler() {
  // Bust module cache so env reads happen on every import.
  // Node 18+ test runner: appending a query string forces re-evaluation.
  const url = new URL(HANDLER_PATH, import.meta.url)
  url.searchParams.set('_t', String(Math.random()))
  const mod = await import(url.href)
  return mod.default as (req: unknown, res: unknown) => Promise<void>
}

const origFetch = globalThis.fetch
const origEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in origEnv)) origEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function restoreEnv() {
  for (const [k, v] of Object.entries(origEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const k of Object.keys(origEnv)) delete origEnv[k]
}

// ─── auth gate ─────────────────────────────────────────────────────────────

describe('cron flow-state-ttl-sweep — auth', () => {
  beforeEach(() => {
    setEnv('CRON_SECRET', 'topsecret')
    setEnv('SUPABASE_URL', 'https://x.supabase.co')
    setEnv('SUPABASE_SECRET_KEY', 'svc-role-key')
  })
  afterEach(() => {
    restoreEnv()
    globalThis.fetch = origFetch
  })

  test('rejects when Authorization header is missing', async () => {
    const handler = await importFreshHandler()
    const { res, status: _s, body: _b } = makeRes()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith(null), captured)
    assert.equal(s, 401)
    assert.deepEqual(b, { error: 'unauthorized' })
  })

  test('rejects when bearer does not match CRON_SECRET', async () => {
    const handler = await importFreshHandler()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer wrong'), captured)
    assert.equal(s, 401)
  })

  test('rejects when CRON_SECRET is empty (fail-closed)', async () => {
    setEnv('CRON_SECRET', '')
    const handler = await importFreshHandler()
    let s = 0
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json() {
        return captured
      },
      setHeader() {},
    }
    // Even with a non-empty bearer, empty secret must fail.
    await handler(reqWith('Bearer anything'), captured)
    assert.equal(s, 401)
  })
})

// ─── misconfig ─────────────────────────────────────────────────────────────

describe('cron flow-state-ttl-sweep — misconfig', () => {
  beforeEach(() => {
    setEnv('CRON_SECRET', 'topsecret')
  })
  afterEach(() => {
    restoreEnv()
    globalThis.fetch = origFetch
  })

  test('500 when SUPABASE_URL is unset', async () => {
    setEnv('SUPABASE_URL', '')
    setEnv('SUPABASE_SECRET_KEY', 'svc-role-key')
    const handler = await importFreshHandler()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(s, 500)
    assert.equal((b as { error: string }).error, 'misconfigured')
  })

  test('500 when SUPABASE_SECRET_KEY is unset', async () => {
    setEnv('SUPABASE_URL', 'https://x.supabase.co')
    setEnv('SUPABASE_SECRET_KEY', '')
    setEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const handler = await importFreshHandler()
    let s = 0
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json() {
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(s, 500)
  })
})

// ─── forward to Edge Function ──────────────────────────────────────────────

describe('cron flow-state-ttl-sweep — forwards to Edge Function', () => {
  beforeEach(() => {
    setEnv('CRON_SECRET', 'topsecret')
    setEnv('SUPABASE_URL', 'https://abc.supabase.co')
    setEnv('SUPABASE_SECRET_KEY', 'svc-role-key')
  })
  afterEach(() => {
    restoreEnv()
    globalThis.fetch = origFetch
  })

  test('POSTs to /functions/v1/flow-state-ttl-sweep with service-role bearer', async () => {
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response(JSON.stringify({ swept_count: 0, notified_count: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    globalThis.fetch = rec
    const handler = await importFreshHandler()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(s, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://abc.supabase.co/functions/v1/flow-state-ttl-sweep')
    assert.equal(calls[0].init?.method, 'POST')
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    assert.equal(headers['Authorization'], 'Bearer svc-role-key')
    assert.equal((b as { ok: boolean }).ok, true)
    assert.deepEqual(
      (b as { sweep: unknown }).sweep,
      { swept_count: 0, notified_count: 0 },
    )
  })

  test('trailing slash on SUPABASE_URL is normalized', async () => {
    setEnv('SUPABASE_URL', 'https://abc.supabase.co/')
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    globalThis.fetch = rec
    const handler = await importFreshHandler()
    const captured = {
      status() {
        return captured
      },
      json() {
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(calls[0].url, 'https://abc.supabase.co/functions/v1/flow-state-ttl-sweep')
  })

  test('502 when the Edge Function returns non-2xx', async () => {
    const { fetch: rec } = recordingFetch(async () => {
      return new Response('boom', { status: 500 })
    })
    globalThis.fetch = rec
    const handler = await importFreshHandler()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(s, 502)
    assert.equal((b as { error: string }).error, 'sweep_http_error')
  })

  test('502 when the Edge Function fetch throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as typeof globalThis.fetch
    const handler = await importFreshHandler()
    let s = 0
    let b: unknown = null
    const captured = {
      status(c: number) {
        s = c
        return captured
      },
      json(x: unknown) {
        b = x
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    assert.equal(s, 502)
    assert.equal((b as { error: string }).error, 'sweep_fetch_failed')
    assert.match((b as { detail: string }).detail, /network down/)
  })

  test('reads SUPABASE_SERVICE_ROLE_KEY when SUPABASE_SECRET_KEY is unset', async () => {
    setEnv('SUPABASE_SECRET_KEY', '')
    setEnv('SUPABASE_SERVICE_ROLE_KEY', 'fallback-svc-key')
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    globalThis.fetch = rec
    const handler = await importFreshHandler()
    const captured = {
      status() {
        return captured
      },
      json() {
        return captured
      },
      setHeader() {},
    }
    await handler(reqWith('Bearer topsecret'), captured)
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    assert.equal(headers['Authorization'], 'Bearer fallback-svc-key')
  })
})
