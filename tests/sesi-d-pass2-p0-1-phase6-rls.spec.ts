// Sesi D pass-2 security audit — P0-1 fix tests.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md
//   "Phase 6-1.a migration introduces 3 new tables with USING (true) —
//    recurrence of pass-1 P0-1 anti-pattern"
//
// Mirrors the test structure of tests/sesi-d-p0-1-phase5-rls.spec.ts:
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
  'supabase/migrations/20260512000000_sesi_d_pass2_p0_1_phase6_rls_tighten.sql',
)

const PHASE_6_TABLES = [
  'department_workspaces',
  'approval_patterns',
  'daily_digests',
] as const

// ─── Layer 1: schema-drift defense (always runs) ─────────────────

test('pass-2 P0-1 migration file exists', () => {
  assert.ok(
    fs.existsSync(MIGRATION_PATH),
    `expected migration at ${MIGRATION_PATH}`,
  )
})

test('pass-2 P0-1 migration drops the 3 permissive Phase 6 policies', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const pol of [
    'anon read own workspaces',
    'anon read own approval patterns',
    'anon read own digests',
  ]) {
    assert.ok(
      sql.includes(`DROP POLICY IF EXISTS "${pol}"`),
      `migration must DROP "${pol}"`,
    )
  }
})

test('pass-2 P0-1 migration replaces with default-deny USING (false) policies', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const table of PHASE_6_TABLES) {
    const re = new RegExp(
      `CREATE POLICY[\\s\\S]+?ON public\\.${table}[\\s\\S]+?USING\\s*\\(\\s*false\\s*\\)`,
    )
    assert.ok(
      re.test(sql),
      `${table} must have a CREATE POLICY ... USING (false)`,
    )
  }
})

test('pass-2 P0-1 deny policies carry audit-ID comments (drift defense)', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  for (const table of PHASE_6_TABLES) {
    assert.ok(
      sql.includes(`COMMENT ON POLICY "deny anon select on ${table}"`),
      `${table} deny policy must carry COMMENT ON POLICY`,
    )
  }
  // Audit ID present
  assert.ok(
    /Sesi D pass-2 P0-1/.test(sql),
    'comments must reference "Sesi D pass-2 P0-1" so future audits trace the source',
  )
})

test('pass-2 P0-1 migration is idempotent (uses IF EXISTS / DROP-then-CREATE)', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  // Each DROP must use IF EXISTS so re-applying doesn't fail.
  const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) ?? []).length
  assert.equal(
    dropCount,
    3,
    'expected exactly 3 idempotent DROP POLICY IF EXISTS statements',
  )
})

// ─── Layer 2: live PostgREST verification (opt-in via env) ───────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const liveSkip = !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SECRET_KEY

async function rlsRead(
  table: string,
  key: string,
): Promise<{ status: number; rowCount: number }> {
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

for (const table of PHASE_6_TABLES) {
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
        `anon must NOT read any rows from ${table} (Sesi D pass-2 P0-1)`,
      )
    },
  )

  test(
    `LIVE: service_role SELECT on ${table} succeeds (RLS bypass)`,
    { skip: liveSkip },
    async () => {
      const result = await rlsRead(table, SUPABASE_SECRET_KEY!)
      assert.equal(result.status, 200)
      // Row count may be 0 (no live Phase 6 customers yet) or >0 — both
      // valid. Goal: prove service_role isn't blocked by the deny policy.
    },
  )
}
