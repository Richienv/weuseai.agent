// Unit tests for the Vercel Cron `nightly-cleanup` handler.
//
// Reference: api/nightly-cleanup.ts
//
// Covers:
//  - Auth gate: requires Bearer ${CRON_SECRET}, rejects missing/wrong/empty
//  - Missing IDCH key short-circuit (500)
//  - Mock IDCH responses → assert VM cleanup + IP detection report shapes
//  - cleanup_notifications PostgREST insert called when there's something
//    to surface
//  - Telegram nudge skipped when no orphans
//
// We mock global fetch (consistent with email-delivery tests) and inject
// env via process.env mutation in beforeEach.

import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// We dynamic-import the handler so each test sees fresh module state
// (the env vars are read at module-load time).

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
      send(b: unknown) {
        _body = b
        return this
      },
    },
    inspect() {
      return { status: _status, body: _body }
    },
  }
}

const ENV_BACKUP: Record<string, string | undefined> = {}
const ENV_KEYS = [
  'CRON_SECRET',
  'IDCLOUDHOST_API_KEY',
  'IDCLOUDHOST_REGION',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPPORT_TELEGRAM_BOT_TOKEN',
  'RICHIE_CHAT_ID',
]

function backupEnv() {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = process.env[k]
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (ENV_BACKUP[k] === undefined) delete process.env[k]
    else process.env[k] = ENV_BACKUP[k]
  }
}

async function freshHandler() {
  // Re-import via cache-bust query so module-level env reads run again.
  const url = new URL('../api/nightly-cleanup.ts', import.meta.url)
  url.searchParams.set('cb', String(Math.random()))
  const m = await import(url.href)
  return m.default as (req: unknown, res: unknown) => Promise<void>
}

// ─── auth gate ──────────────────────────────────────────────────────────

describe('nightly-cleanup — auth gate', () => {
  beforeEach(backupEnv)
  afterEach(restoreEnv)

  test('rejects when CRON_SECRET env not set', async () => {
    delete process.env.CRON_SECRET
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    const { res, inspect } = makeRes()
    const handler = await freshHandler()
    await handler(reqWith('Bearer anything'), res)
    assert.deepEqual(inspect(), { status: 401, body: { error: 'unauthorized' } })
  })

  test('rejects missing Authorization header', async () => {
    process.env.CRON_SECRET = 'abc-123'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    const { res, inspect } = makeRes()
    const handler = await freshHandler()
    await handler(reqWith(null), res)
    assert.equal(inspect().status, 401)
  })

  test('rejects wrong CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'abc-123'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    const { res, inspect } = makeRes()
    const handler = await freshHandler()
    await handler(reqWith('Bearer wrong-secret'), res)
    assert.equal(inspect().status, 401)
  })

  test('accepts correct CRON_SECRET (proceeds to next gate)', async () => {
    process.env.CRON_SECRET = 'abc-123'
    delete process.env.IDCLOUDHOST_API_KEY
    const { res, inspect } = makeRes()
    const handler = await freshHandler()
    await handler(reqWith('Bearer abc-123'), res)
    // Auth passed, then we hit the IDCH-key gate (500).
    assert.equal(inspect().status, 500)
    assert.match(JSON.stringify(inspect().body), /IDCLOUDHOST_API_KEY missing/)
  })
})

// ─── happy path with mocked IDCH ────────────────────────────────────────

describe('nightly-cleanup — VM cleanup track', () => {
  beforeEach(backupEnv)
  afterEach(restoreEnv)

  test('detects + deletes a stale smoke VM (named with old YYYYMMDD)', async () => {
    process.env.CRON_SECRET = 'sec'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    process.env.IDCLOUDHOST_REGION = ''
    delete process.env.SUPABASE_URL
    delete process.env.SUPPORT_TELEGRAM_BOT_TOKEN

    const ageDays = 5
    const oldDate = new Date(Date.now() - ageDays * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '')
    const staleVm = {
      uuid: 'vm-old-1',
      name: `weuseai-smoke-2e2-${oldDate}`,
      status: 'stopped',
    }
    const todayDate = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const freshVm = {
      uuid: 'vm-new-1',
      name: `weuseai-smoke-2e2-${todayDate}`,
      status: 'running',
    }

    const originalFetch = globalThis.fetch
    const { fetch: stubbed, calls } = recordingFetch((url) => {
      if (url.endsWith('/vm/list')) {
        return new Response(JSON.stringify([staleVm, freshVm]), { status: 200 })
      }
      if (url.includes('/vm?uuid=vm-old-1')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.endsWith('/network/ip_addresses')) {
        return new Response('[]', { status: 200 })
      }
      return new Response('not mocked', { status: 599 })
    })
    globalThis.fetch = stubbed
    try {
      const { res, inspect } = makeRes()
      const handler = await freshHandler()
      await handler(reqWith('Bearer sec'), res)
      const out = inspect()
      assert.equal(out.status, 200)
      const body = out.body as {
        ok: boolean
        vm: { scanned: number; deleted_count: number; errors: string[] }
        ip: { total: number; orphan_count: number }
      }
      assert.equal(body.ok, true)
      assert.equal(body.vm.scanned, 2)
      assert.equal(body.vm.deleted_count, 1)
      assert.deepEqual(body.vm.errors, [])
      // Confirm only the stale UUID got DELETE'd, not the fresh one.
      const deleteUrls = calls
        .filter((c) => c.init?.method === 'DELETE')
        .map((c) => c.url)
      assert.equal(deleteUrls.length, 1)
      assert.match(deleteUrls[0], /uuid=vm-old-1/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('nightly-cleanup — IP detection track', () => {
  beforeEach(backupEnv)
  afterEach(restoreEnv)

  test('flags only unassigned + post-grace orphan IPs', async () => {
    process.env.CRON_SECRET = 'sec'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    delete process.env.SUPABASE_URL
    delete process.env.SUPPORT_TELEGRAM_BOT_TOKEN

    const oldUnassigned = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()  // 4h ago
    const recentUnassigned = new Date(Date.now() - 5 * 60 * 1000).toISOString()    // 5m ago

    const ips = [
      // Attached → keep
      {
        uuid: 'ip-attached',
        address: '203.0.113.1',
        type: 'public',
        enabled: true,
        is_deleted: false,
        assigned_to: 'vm-1',
        assigned_to_resource_type: 'virtual_machine',
        unassigned_at: null,
      },
      // Soft-deleted → ignore
      {
        uuid: 'ip-deleted',
        address: '203.0.113.2',
        type: 'public',
        enabled: true,
        is_deleted: true,
        assigned_to: null,
        unassigned_at: oldUnassigned,
      },
      // Orphan (4h since unassigned, past 30-min grace) → flag
      {
        uuid: 'ip-orphan',
        address: '203.0.113.3',
        type: 'public',
        enabled: true,
        is_deleted: false,
        assigned_to: null,
        assigned_to_resource_type: null,
        unassigned_at: oldUnassigned,
      },
      // Recent (5m since unassigned, within grace) → keep
      {
        uuid: 'ip-grace',
        address: '203.0.113.4',
        type: 'public',
        enabled: true,
        is_deleted: false,
        assigned_to: null,
        assigned_to_resource_type: null,
        unassigned_at: recentUnassigned,
      },
    ]

    const originalFetch = globalThis.fetch
    const { fetch: stubbed } = recordingFetch((url) => {
      if (url.endsWith('/vm/list')) return new Response('[]', { status: 200 })
      if (url.endsWith('/network/ip_addresses')) {
        return new Response(JSON.stringify(ips), { status: 200 })
      }
      return new Response('not mocked', { status: 599 })
    })
    globalThis.fetch = stubbed
    try {
      const { res, inspect } = makeRes()
      const handler = await freshHandler()
      await handler(reqWith('Bearer sec'), res)
      const body = inspect().body as {
        ip: { total: number; orphan_count: number }
      }
      assert.equal(body.ip.total, 4)
      assert.equal(body.ip.orphan_count, 1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

// ─── audit + Telegram ───────────────────────────────────────────────────

describe('nightly-cleanup — audit + Telegram', () => {
  beforeEach(backupEnv)
  afterEach(restoreEnv)

  test('inserts cleanup_notifications + sends Telegram nudge when orphans exist', async () => {
    process.env.CRON_SECRET = 'sec'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
    process.env.SUPPORT_TELEGRAM_BOT_TOKEN = 'fake-bot-token'
    process.env.RICHIE_CHAT_ID = '12345'

    const oldUnassigned = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    const ips = [
      {
        uuid: 'ip-1',
        address: '1.2.3.4',
        type: 'public',
        enabled: true,
        is_deleted: false,
        assigned_to: null,
        assigned_to_resource_type: null,
        unassigned_at: oldUnassigned,
      },
    ]

    const originalFetch = globalThis.fetch
    const { fetch: stubbed, calls } = recordingFetch((url) => {
      if (url.endsWith('/vm/list')) return new Response('[]', { status: 200 })
      if (url.endsWith('/network/ip_addresses')) {
        return new Response(JSON.stringify(ips), { status: 200 })
      }
      if (url.startsWith('https://api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/rest/v1/cleanup_notifications')) {
        return new Response('', { status: 201 })
      }
      return new Response('not mocked', { status: 599 })
    })
    globalThis.fetch = stubbed
    try {
      const { res, inspect } = makeRes()
      const handler = await freshHandler()
      await handler(reqWith('Bearer sec'), res)
      assert.equal(inspect().status, 200)
      // Telegram nudge sent.
      const tgCall = calls.find((c) => c.url.startsWith('https://api.telegram.org'))
      assert.ok(tgCall, 'Telegram nudge should have fired')
      const tgBody = JSON.parse(String(tgCall!.init?.body ?? '{}'))
      assert.equal(tgBody.chat_id, '12345')
      assert.match(tgBody.text, /1\.2\.3\.4/)
      assert.match(tgBody.text, /orphan Floating IP/i)
      // PostgREST insert fired with correct shape.
      const restCall = calls.find((c) => c.url.includes('/rest/v1/cleanup_notifications'))
      assert.ok(restCall, 'PostgREST insert should have fired')
      const restBody = JSON.parse(String(restCall!.init?.body ?? '{}'))
      assert.equal(restBody.resource_type, 'orphan_floating_ip')
      assert.equal(restBody.count_flagged, 1)
      assert.equal(restBody.notified_via, 'telegram')
      // PostgREST headers correct.
      const restHeaders = restCall!.init?.headers as Record<string, string>
      assert.equal(restHeaders.Authorization, 'Bearer sb_secret_test')
      assert.equal(restHeaders.apikey, 'sb_secret_test')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('skips Telegram + audit when nothing to surface', async () => {
    process.env.CRON_SECRET = 'sec'
    process.env.IDCLOUDHOST_API_KEY = 'fake'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
    process.env.SUPPORT_TELEGRAM_BOT_TOKEN = 'fake-bot-token'
    process.env.RICHIE_CHAT_ID = '12345'

    const originalFetch = globalThis.fetch
    const { fetch: stubbed, calls } = recordingFetch((url) => {
      if (url.endsWith('/vm/list')) return new Response('[]', { status: 200 })
      if (url.endsWith('/network/ip_addresses')) return new Response('[]', { status: 200 })
      return new Response('not mocked', { status: 599 })
    })
    globalThis.fetch = stubbed
    try {
      const { res, inspect } = makeRes()
      const handler = await freshHandler()
      await handler(reqWith('Bearer sec'), res)
      assert.equal(inspect().status, 200)
      // No Telegram, no PostgREST insert when nothing flagged.
      assert.equal(calls.filter((c) => c.url.startsWith('https://api.telegram.org')).length, 0)
      assert.equal(calls.filter((c) => c.url.includes('/rest/v1/cleanup_notifications')).length, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
