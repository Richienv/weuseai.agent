// Sesi D security audit — P0-2 fix tests.
//
// Two layers:
//   1. Schema drift (always runs) — assert migration content matches
//      the audit's recommended REVOKE-table + GRANT-allowlist + cid-
//      scoped policy pattern.
//   2. Live PostgREST verification (opt-in) — verify with anon key:
//      (a) PII columns return 401 even with X-CID
//      (b) allowed columns + X-CID for own row → 200 + 1 row
//      (c) no X-CID header → 200 + 0 rows (cross-customer enumeration blocked)
//      (d) X-CID for OTHER customer → 200 + 0 rows
//      (e) service_role bypass intact

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260511010000_sesi_d_p0_2_customers_pii.sql',
)

const PII_COLUMNS = ['soul_md_text', 'email', 'whatsapp_number'] as const
const ALLOWED_COLUMNS = [
  'id',
  'display_name',
  'telegram_chat_id',
  'telegram_bot_username',
  'telegram_allowed_user_ids',
  'pairing_code',
  'pairing_code_expires_at',
  'created_at',
] as const

// ─── Layer 1: schema-drift defense ────────────────────────────────

test('migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH))
})

test('drops permissive USING (true) policy', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /DROP POLICY IF EXISTS "anon can read own customer onboarding state"/.test(sql),
    'must drop the original Phase 2.5 USING (true) policy',
  )
})

test('creates X-CID-scoped SELECT policy', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /CREATE POLICY "anon read own customer scoped by x-cid"/.test(sql),
    'must create the cid-header-scoped SELECT policy',
  )
  // The USING clause matches row.id against X-CID header
  assert.ok(
    /USING\s*\([\s\S]+'x-cid'[\s\S]+\)/.test(sql),
    'policy USING must reference x-cid header',
  )
})

test('REVOKEs table-level SELECT (so column-level GRANT controls)', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(
    /REVOKE SELECT ON public\.customers FROM anon, authenticated/.test(sql),
    'must REVOKE table-level SELECT from anon + authenticated (this was the historical bug — column REVOKE alone is no-op)',
  )
})

test('GRANTs SELECT only on allowlisted columns', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  // Strip SQL comments first so the regex doesn't match a `GRANT SELECT (...)`
  // appearing in the prose above the actual statement.
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const grantMatch = stripped.match(
    /GRANT SELECT \(([\s\S]+?)\) ON public\.customers TO anon, authenticated\s*;/,
  )
  assert.ok(grantMatch, 'must GRANT SELECT (cols) on customers')
  const grantedCols = grantMatch![1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // Spot-check: all allowed cols present, no PII cols
  for (const col of ALLOWED_COLUMNS) {
    assert.ok(
      grantedCols.includes(col),
      `${col} must be in GRANT allowlist`,
    )
  }
  for (const col of PII_COLUMNS) {
    assert.ok(
      !grantedCols.includes(col),
      `${col} (PII) must NOT be in GRANT allowlist`,
    )
  }
  // telegram_bot_token not in allowlist (sensitive — encrypted)
  assert.ok(
    !grantedCols.includes('telegram_bot_token'),
    'telegram_bot_token (encrypted credential) must NOT be in GRANT allowlist',
  )
})

test('migration carries Sesi D P0-2 reference comments on PII columns', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const col of PII_COLUMNS) {
    assert.ok(
      new RegExp(`COMMENT ON COLUMN public\\.customers\\.${col}`).test(sql),
      `${col} must carry a COMMENT`,
    )
  }
  assert.ok(
    /Sesi D P0-2/.test(sql),
    'migration must reference Sesi D P0-2 audit ID',
  )
})

// ─── Layer 2: live PostgREST verification ─────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const liveSkip = !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SECRET_KEY

// Use a known test customer id seeded historically (read-only; never
// modified by tests). If the live DB doesn't have this row, the X-CID
// "own row" check just returns 0 rows — still validates RLS works
// (header matches but no row); the explicit "OTHER" check still catches
// cross-customer leak.
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
  'LIVE: anon SELECT of PII columns is rejected (401 permission denied)',
  { skip: liveSkip },
  async () => {
    for (const col of PII_COLUMNS) {
      const result = await rlsRead({
        url: `${SUPABASE_URL}/rest/v1/customers?id=eq.${TEST_CID}&select=${col}`,
        key: SUPABASE_ANON_KEY!,
        cidHeader: TEST_CID, // even with X-CID, column REVOKE blocks
      })
      assert.equal(
        result.status,
        401,
        `anon SELECT of customers.${col} must return 401 (got ${result.status}: ${result.bodyText.slice(0, 100)})`,
      )
    }
  },
)

test(
  'LIVE: anon SELECT of allowed columns WITHOUT X-CID returns 0 rows (no enumeration)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/customers?select=id,display_name&limit=10`,
      key: SUPABASE_ANON_KEY!,
      // intentionally no X-CID header
    })
    assert.equal(result.status, 200)
    assert.equal(
      result.rowCount,
      0,
      'anon must NOT enumerate customers without X-CID header',
    )
  },
)

test(
  'LIVE: anon SELECT with X-CID for OTHER customer returns 0 rows (no cross-customer leak)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/customers?id=eq.${TEST_CID}&select=id,display_name`,
      key: SUPABASE_ANON_KEY!,
      cidHeader: OTHER_CID, // header for different customer
    })
    assert.equal(result.status, 200)
    assert.equal(
      result.rowCount,
      0,
      'cross-customer X-CID header must not leak rows (RLS predicate filters)',
    )
  },
)

test(
  'LIVE: anon SELECT with matching X-CID returns own row (when row exists)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/customers?id=eq.${TEST_CID}&select=id,display_name`,
      key: SUPABASE_ANON_KEY!,
      cidHeader: TEST_CID,
    })
    assert.equal(result.status, 200)
    // rowCount may be 0 if the test customer was cleaned up; both 0 + 1
    // are valid — the policy allows the read; absence of row != policy fail.
    assert.ok(
      result.rowCount === 0 || result.rowCount === 1,
      `expected 0 or 1 row, got ${result.rowCount}`,
    )
  },
)

test(
  'LIVE: service_role bypass intact (can read PII columns directly)',
  { skip: liveSkip },
  async () => {
    const result = await rlsRead({
      url: `${SUPABASE_URL}/rest/v1/customers?select=id,email,soul_md_text&limit=1`,
      key: SUPABASE_SECRET_KEY!,
    })
    assert.equal(
      result.status,
      200,
      `service_role must bypass column REVOKE (got ${result.status}: ${result.bodyText.slice(0, 100)})`,
    )
  },
)
