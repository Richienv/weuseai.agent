// Sesi D security audit — P0-3 fix tests.
//
// Mirrors the P0-2 test pattern (schema-drift + live PostgREST).

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260511020000_sesi_d_p0_3_subscriptions.sql',
)

const REVOKE_COLUMNS = [
  'tier',
  'xendit_invoice_id',
  'next_billing_at',
  'hosting_active',
  'always_on_enabled',
] as const

const ALLOWED_COLUMNS = ['id', 'customer_id', 'status', 'started_at'] as const

// ─── Layer 1: schema-drift defense ────────────────────────────────

test('migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH))
})

test('drops permissive USING (true) policy', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /DROP POLICY IF EXISTS "anon_read_own_subscription_status"/.test(sql),
    'must drop the original USING (true) policy',
  )
})

test('creates X-CID-scoped policy on customer_id', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /CREATE POLICY "anon read own subscription scoped by x-cid"/.test(sql),
    'must create the X-CID-scoped policy',
  )
  assert.ok(
    /USING\s*\([\s\S]*customer_id\s*=[\s\S]*'x-cid'[\s\S]*\)/.test(sql),
    'policy USING must scope on customer_id = X-CID header',
  )
})

test('REVOKEs table-level SELECT (column allowlist takes effect)', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /REVOKE SELECT ON public\.subscriptions FROM anon, authenticated/.test(sql),
    'must REVOKE table-level SELECT (otherwise column REVOKE is no-op)',
  )
})

test('GRANTs SELECT only on welcome.html-required allowlist', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  // Strip comments before regex (avoid matching prose "GRANT SELECT (cols)")
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const grantMatch = stripped.match(
    /GRANT SELECT \(([\s\S]+?)\) ON public\.subscriptions TO anon, authenticated\s*;/,
  )
  assert.ok(grantMatch, 'must GRANT SELECT (cols) on subscriptions')
  const grantedCols = grantMatch![1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const col of ALLOWED_COLUMNS) {
    assert.ok(
      grantedCols.includes(col),
      `${col} must be in GRANT allowlist`,
    )
  }
  for (const col of REVOKE_COLUMNS) {
    assert.ok(
      !grantedCols.includes(col),
      `${col} (revenue/billing intel) must NOT be in GRANT allowlist`,
    )
  }
})

test('migration carries Sesi D P0-3 reference comments', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const col of REVOKE_COLUMNS) {
    assert.ok(
      new RegExp(`COMMENT ON COLUMN public\\.subscriptions\\.${col}`).test(sql),
      `${col} must carry COMMENT ON COLUMN`,
    )
  }
  assert.ok(/Sesi D P0-3/.test(sql), 'audit ID must be referenced')
})

// ─── Layer 2: live PostgREST verification ─────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const liveSkip = !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SECRET_KEY

const TEST_CID = '999af211-6ef7-4d39-b7af-5d5c9d11af1a'
const OTHER_CID = '00000000-0000-0000-0000-000000000000'

async function rlsRead(opts: {
  url: string
  key: string
  cidHeader?: string
}): Promise<{ status: number; rowCount: number; bodyText: string }> {
  const headers: Record<string, string> = {
    apikey: opts.key,
    authorization: `Bearer ${opts.key}`,
    accept: 'application/json',
  }
  if (opts.cidHeader) headers['X-CID'] = opts.cidHeader
  const r = await fetch(opts.url, { headers })
  const bodyText = await r.text()
  if (!r.ok) return { status: r.status, rowCount: 0, bodyText }
  try {
    const parsed = JSON.parse(bodyText) as unknown[]
    return { status: r.status, rowCount: parsed.length, bodyText }
  } catch {
    return { status: r.status, rowCount: 0, bodyText }
  }
}

test(
  'LIVE: anon SELECT of revenue/billing columns rejected with 401',
  { skip: liveSkip },
  async () => {
    for (const col of REVOKE_COLUMNS) {
      const result = await rlsRead({
        url: `${SUPABASE_URL}/rest/v1/subscriptions?customer_id=eq.${TEST_CID}&select=${col}`,
        key: SUPABASE_ANON_KEY!,
        cidHeader: TEST_CID,
      })
      assert.equal(
        result.status,
        401,
        `anon SELECT of subscriptions.${col} must return 401 (got ${result.status}: ${result.bodyText.slice(0, 100)})`,
      )
    }
  },
)

test(
  'LIVE: anon SELECT allowed cols WITHOUT X-CID returns 0 rows (no enumeration)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/subscriptions?select=id,status,started_at&limit=10`,
      key: SUPABASE_ANON_KEY!,
    })
    assert.equal(result.status, 200)
    assert.equal(
      result.rowCount,
      0,
      'anon must NOT enumerate subscriptions without X-CID header',
    )
  },
)

test(
  'LIVE: anon SELECT with X-CID for OTHER customer returns 0 rows',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/subscriptions?customer_id=eq.${TEST_CID}&select=id,status,started_at`,
      key: SUPABASE_ANON_KEY!,
      cidHeader: OTHER_CID,
    })
    assert.equal(result.status, 200)
    assert.equal(
      result.rowCount,
      0,
      'cross-customer X-CID header must not leak rows',
    )
  },
)

test(
  'LIVE: anon SELECT with matching X-CID returns own row(s)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/subscriptions?customer_id=eq.${TEST_CID}&select=id,status,started_at`,
      key: SUPABASE_ANON_KEY!,
      cidHeader: TEST_CID,
    })
    assert.equal(result.status, 200)
    // 0 or N rows both valid; goal is policy permits the read
  },
)

test(
  'LIVE: service_role bypass intact (can read tier directly)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/subscriptions?select=tier,xendit_invoice_id&limit=1`,
      key: SUPABASE_SECRET_KEY!,
    })
    assert.equal(
      result.status,
      200,
      `service_role must bypass column REVOKE (got ${result.status}: ${result.bodyText.slice(0, 100)})`,
    )
  },
)
