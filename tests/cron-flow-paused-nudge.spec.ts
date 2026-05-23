// Unit tests for the Vercel Cron `flow-paused-nudge` handler.
//
// Reference: api/cron/flow-paused-nudge.ts
//
// Thin forwarder — validates CRON_SECRET then POSTs to the Supabase
// Edge Function `flow-paused-nudge` with the service-role JWT. The
// actual nudge logic is tested in flow-paused-nudge-handler.spec.ts.
//
// Pattern mirrors cron-flow-state-ttl-sweep.spec.ts.

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

const HANDLER_PATH = '../api/cron/flow-paused-nudge.ts'

async function importFreshHandler() {
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

// ─── auth gate ─────────────────────────────────────────────────────────

describe('cron flow-paused-nudge — auth', () => {
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
    await handler(reqWith('Bearer anything'), captured)
    assert.equal(s, 401)
  })
})

// ─── misconfig ─────────────────────────────────────────────────────────

describe('cron flow-paused-nudge — misconfig', () => {
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

// ─── forward to Edge Function ──────────────────────────────────────────

describe('cron flow-paused-nudge — forwards to Edge Function', () => {
  beforeEach(() => {
    setEnv('CRON_SECRET', 'topsecret')
    setEnv('SUPABASE_URL', 'https://abc.supabase.co')
    setEnv('SUPABASE_SECRET_KEY', 'svc-role-key')
  })
  afterEach(() => {
    restoreEnv()
    globalThis.fetch = origFetch
  })

  test('POSTs to /functions/v1/flow-paused-nudge with service-role bearer', async () => {
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response(
        JSON.stringify({ eligible_count: 0, notified_count: 0 }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
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
    assert.equal(
      calls[0].url,
      'https://abc.supabase.co/functions/v1/flow-paused-nudge',
    )
    assert.equal(calls[0].init?.method, 'POST')
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    assert.equal(headers['Authorization'], 'Bearer svc-role-key')
    assert.equal((b as { ok: boolean }).ok, true)
    assert.deepEqual((b as { nudge: unknown }).nudge, {
      eligible_count: 0,
      notified_count: 0,
    })
  })

  test('trailing slash on SUPABASE_URL is normalized', async () => {
    setEnv('SUPABASE_URL', 'https://abc.supabase.co/')
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
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
    assert.equal(
      calls[0].url,
      'https://abc.supabase.co/functions/v1/flow-paused-nudge',
    )
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
    assert.equal((b as { error: string }).error, 'nudge_http_error')
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
    assert.equal((b as { error: string }).error, 'nudge_fetch_failed')
    assert.match((b as { detail: string }).detail, /network down/)
  })

  test('reads SUPABASE_SERVICE_ROLE_KEY when SUPABASE_SECRET_KEY is unset', async () => {
    setEnv('SUPABASE_SECRET_KEY', '')
    setEnv('SUPABASE_SERVICE_ROLE_KEY', 'fallback-svc-key')
    const { fetch: rec, calls } = recordingFetch(async () => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
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
