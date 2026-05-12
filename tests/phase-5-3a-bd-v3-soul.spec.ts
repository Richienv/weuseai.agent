// Phase 5-3.a: BD v3 SOUL.md + bd_decisions_log drift tests.
//
// Asserts the BD v3 transition is coherent:
//   - SOUL.md mentions v3, dept dispatch, approval gates, Studio gating,
//     cross-session memory.
//   - manifest version bumped to 3.0.0.
//   - bd_decisions_log migration has the locked decision_kind enum.
//   - soul-md-template.ts (default SOUL for new customers) reflects the
//     5 dept packs, not the deprecated department-task-spawner.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())

// ─── BD SOUL.md content ─────────────────────────────────────────────

test('business-director SOUL.md identifies as Business Director v3', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  assert.ok(
    /Business Director\s*\*?\*?v3\*?\*?/.test(md) || /Business Director.*v3/.test(md),
    'SOUL.md should identify as Business Director v3',
  )
})

test('BD SOUL.md documents 5 department packs', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  for (const dept of ['sales', 'marketing', 'engineering', 'legal', 'finance']) {
    assert.ok(
      md.includes(`${dept}-dispatch`),
      `BD SOUL.md should mention ${dept}-dispatch`,
    )
  }
})

test('BD SOUL.md documents approval queue + 4 action_kinds', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  assert.ok(/approval[ -_]?queue/i.test(md), 'should mention approval queue')
  for (const kind of [
    'incorporate',
    'contract_sign',
    'public_emission',
    'regulatory_filing',
  ]) {
    assert.ok(md.includes(kind), `should document action_kind: ${kind}`)
  }
})

test('BD SOUL.md documents Studio-tier + phase_5_enabled gate', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  assert.ok(/Studio/i.test(md), 'should mention Studio tier')
  assert.ok(
    /phase_5_enabled/.test(md),
    'should reference phase_5_enabled flag (Q3=A locked gate)',
  )
})

test('BD SOUL.md documents cross-session memory via bd_decisions_log', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  assert.ok(
    md.includes('bd_decisions_log'),
    'SOUL.md should reference bd_decisions_log table (Q5=C cross-session memory)',
  )
})

test('BD SOUL.md does NOT reference deprecated department-task-spawner', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/all-in-one-business-agent/SOUL.md'),
    'utf8',
  )
  assert.ok(
    !md.includes('department-task-spawner'),
    'SOUL.md should not reference removed department-task-spawner',
  )
})

// ─── BD manifest version bump ──────────────────────────────────────

test('business-director manifest version bumped to 3.0.0', () => {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'agent-packs/all-in-one-business-agent/manifest.json'),
      'utf8',
    ),
  ) as { version: string; description_id: string }
  assert.equal(m.version, '3.0.0', 'BD v3 manifest should be 3.0.0')
  assert.ok(
    /v3/.test(m.description_id),
    'manifest description_id should mention v3',
  )
})

// ─── soul-md-template.ts (new-customer SOUL bootstrap) ─────────────

test('soul-md-template.ts mentions 5 dept dispatch (not department-task-spawner)', () => {
  const ts = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/soul-md-template.ts'),
    'utf8',
  )
  assert.ok(
    !ts.includes('department-task-spawner'),
    'soul-md-template.ts should not reference removed department-task-spawner',
  )
  assert.ok(
    /5 department dispatch/i.test(ts) || /sales.*marketing.*engineering.*legal.*finance/i.test(ts),
    'soul-md-template.ts should reference the 5 dept dispatch packs',
  )
})

// ─── bd_decisions_log schema (drift defense) ───────────────────────

test('bd_decisions_log migration locks the 6 decision_kind enum members', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql'),
    'utf8',
  )
  for (const kind of [
    'stage_transition',
    'approval_outcome',
    'thread_spawn',
    'customer_commitment',
    'recommendation',
    'pivot',
  ]) {
    assert.ok(
      sql.includes(`'${kind}'`),
      `migration should include decision_kind '${kind}' in CHECK enum`,
    )
  }
})

test('bd_decisions_log migration enforces summary length cap (<=200 chars)', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql'),
    'utf8',
  )
  assert.ok(
    /length\(summary\)\s*<=\s*200/.test(sql),
    'migration should enforce summary length <= 200 chars (prompt-size budget)',
  )
})

test('bd_decisions_log has both customer-recency + per-kind indexes', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql'),
    'utf8',
  )
  assert.ok(
    sql.includes('idx_bd_decisions_customer_recent'),
    'should create idx_bd_decisions_customer_recent for session-start prepend',
  )
  assert.ok(
    sql.includes('idx_bd_decisions_kind'),
    'should create idx_bd_decisions_kind for per-kind aggregations',
  )
})

test('bd_decisions_log has RLS enabled + anon SELECT policy', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql'),
    'utf8',
  )
  assert.ok(/ENABLE ROW LEVEL SECURITY/i.test(sql), 'should enable RLS')
  assert.ok(
    /CREATE POLICY.*anon read own bd decisions/.test(sql),
    'should create anon SELECT policy',
  )
})
