// Sesi D security audit — P0-1 fix tests.
//
// Two test layers:
//   1. Schema drift (always runs; no network) — assert migration file
//      contains correct USING (false) policies and explicit comments.
//   2. Live RLS (opt-in via env) — actually hit PostgREST with anon vs
//      service_role keys and verify enforcement.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260511000000_sesi_d_p0_1_phase5_rls_tighten.sql',
)

const PHASE_5_TABLES = [
  'business_roadmap_state',
  'approval_requests',
  'department_threads',
  'bd_decisions_log',
] as const

// ─── Layer 1: schema-drift defense (always runs) ─────────────────

test('migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH))
})

test('migration drops the 4 permissive Phase 5 policies', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const pol of [
    'anon read own roadmap state',
    'anon read own approvals',
    'anon read own dept threads',
    'anon read own bd decisions',
  ]) {
    assert.ok(
      sql.includes(`DROP POLICY IF EXISTS "${pol}"`),
      `migration must DROP "${pol}"`,
    )
  }
})

test('migration replaces with default-deny USING (false) policies', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const table of PHASE_5_TABLES) {
    const re = new RegExp(
      `CREATE POLICY[\\s\\S]+?ON public\\.${table}[\\s\\S]+?USING\\s*\\(\\s*false\\s*\\)`,
    )
    assert.ok(
      re.test(sql),
      `${table} must have a CREATE POLICY ... USING (false)`,
    )
  }
})

test('all 4 deny policies have audit-ID comments (drift defense)', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const table of PHASE_5_TABLES) {
    assert.ok(
      sql.includes(`COMMENT ON POLICY "deny anon select on ${table}"`),
      `${table} deny policy must carry COMMENT ON POLICY`,
    )
  }
  // Audit ID present
  assert.ok(
    /Sesi D P0-1/.test(sql),
    'comments must reference "Sesi D P0-1" so future audits trace the source',
  )
})

// ─── Layer 2: live PostgREST verification (opt-in via env) ───────
//
// Skips when SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SECRET_KEY not set
// (e.g. CI without secrets). Founder runs locally with .env.local
// loaded for full coverage.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const liveSkip = !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SECRET_KEY

async function rlsRead(table: string, key: string): Promise<{ status: number; rowCount: number }> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=10`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: 'application/json',
      },
    },
  )
  if (!r.ok) return { status: r.status, rowCount: 0 }
  const body = (await r.json()) as unknown[]
  return { status: r.status, rowCount: body.length }
}

for (const table of PHASE_5_TABLES) {
  test(
    `LIVE: anon SELECT on ${table} returns 0 rows (USING (false) enforced)`,
    { skip: liveSkip },
    async () => {
      const result = await rlsRead(table, SUPABASE_ANON_KEY!)
      assert.equal(
        result.status,
        200,
        'PostgREST returns 200 even when policy denies — body is empty array',
      )
      assert.equal(
        result.rowCount,
        0,
        `anon must NOT read any rows from ${table} (Sesi D P0-1)`,
      )
    },
  )

  test(
    `LIVE: service_role SELECT on ${table} succeeds (RLS bypass)`,
    { skip: liveSkip },
    async () => {
      const result = await rlsRead(table, SUPABASE_SECRET_KEY!)
      assert.equal(result.status, 200)
      // Row count may be 0 (no live customers yet) or >0 — both valid.
      // Goal here: prove service_role isn't blocked by the deny policy.
    },
  )
}
