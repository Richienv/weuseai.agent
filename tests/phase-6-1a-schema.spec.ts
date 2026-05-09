// Phase 6-1.a: schema drift tests.
//
// Asserts the Phase 6-1.a migration content matches Q1-Q6 LOCKED picks
// (C, C, A, A, B, A). Drift between this file and the migration fails
// the test, surfacing schema-vs-policy disconnects at PR review.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260510150000_phase_6_1a_cofounder_clone.sql',
)

const sql = (() => {
  if (!fs.existsSync(MIGRATION_PATH)) {
    throw new Error(`migration missing: ${MIGRATION_PATH}`)
  }
  return fs.readFileSync(MIGRATION_PATH, 'utf8')
})()

// ─── File exists + key tables present ─────────────────────────────

test('migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH))
})

test('migration creates all 5 Phase 6-1 tables', () => {
  for (const table of [
    'department_workspaces',
    'approval_patterns',
    'daily_digests',
    'codebase_integrations',
    'persona_memories',
  ]) {
    assert.ok(
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`).test(sql),
      `migration missing CREATE TABLE for ${table}`,
    )
  }
})

// ─── Q1=C drift: created_via column on approval_patterns ──────────

test('Q1=C: approval_patterns.created_via column with manual|suggested CHECK', () => {
  assert.ok(
    /created_via\s+text\s+not\s+null\s+check\s*\(\s*created_via\s+in\s*\(\s*'manual',\s*'suggested'\s*\)/.test(
      sql,
    ),
    'approval_patterns.created_via must have CHECK (manual|suggested) per Q1=C',
  )
  // Default 'manual' (Phase 6-1 ships manual only; suggested in Phase 6.5+)
  assert.ok(
    /created_via[\s\S]+default\s+'manual'/.test(sql),
    'approval_patterns.created_via must default to manual',
  )
})

// ─── Q2=C drift: persona_naming_mode column ───────────────────────

test('Q2=C: department_workspaces.persona_naming_mode with indonesian|generic CHECK', () => {
  assert.ok(
    /persona_naming_mode\s+text\s+not\s+null\s+check\s*\(\s*persona_naming_mode\s+in\s*\(\s*'indonesian',\s*'generic'\s*\)/.test(
      sql,
    ),
    'department_workspaces.persona_naming_mode must have CHECK (indonesian|generic) per Q2=C',
  )
  assert.ok(
    /persona_naming_mode[\s\S]+default\s+'indonesian'/.test(sql),
    'persona_naming_mode must default to indonesian',
  )
})

// ─── Q3=A drift: daily_digests has unique (customer_id, digest_date) ──

test('Q3=A: daily_digests has unique constraint on (customer_id, digest_date)', () => {
  // Fixed M/W/F cadence enforces at most one row per customer per date.
  assert.ok(
    /unique\s*\(\s*customer_id,\s*digest_date\s*\)/.test(sql),
    'daily_digests must have unique (customer_id, digest_date) per Q3=A',
  )
})

// ─── Q4=A drift: codebase_integrations defaults to 'active' (no pending) ─

test('Q4=A: codebase_integrations.status defaults active (no pending state)', () => {
  // Q4=A: opt-in is binary; customer explicitly connects → row insert
  // with status='active' immediately. No 'pending' state needed.
  assert.ok(
    /codebase_integrations[\s\S]+status\s+text\s+not\s+null[\s\S]+default\s+'active'/.test(
      sql,
    ),
    'codebase_integrations.status must default active per Q4=A',
  )
  // Negative assertion: codebase_integrations CHECK constraint must NOT
  // include 'pending' status. Restricted to the CHECK clause only — the
  // CREATE block's prose comments may legitimately reference 'pending'
  // explaining its absence.
  const checkClause = sql.match(
    /codebase_integrations[\s\S]+?status\s+text\s+not\s+null\s+check\s*\(\s*status\s+in\s*\(([^)]+)\)/,
  )
  assert.ok(checkClause, 'should find codebase_integrations status CHECK clause')
  const enumMembers = checkClause![1]
  assert.ok(
    !enumMembers.includes("'pending'"),
    'codebase_integrations status CHECK enum must not include pending per Q4=A',
  )
})

// ─── Q5=B drift: hermes_kanban_tasks.last_renewed_at + stall index ─

test('Q5=B: hermes_kanban_tasks.last_renewed_at column added', () => {
  assert.ok(
    /ALTER TABLE public\.hermes_kanban_tasks[\s\S]+ADD COLUMN IF NOT EXISTS last_renewed_at/.test(
      sql,
    ),
    'hermes_kanban_tasks.last_renewed_at must be added per Q5=B',
  )
})

test('Q5=B: stall-detection partial index on last_renewed_at', () => {
  assert.ok(
    /idx_hermes_kanban_tasks_stall[\s\S]+last_renewed_at[\s\S]+WHERE\s+status\s+NOT\s+IN/.test(
      sql,
    ),
    'must have partial index on last_renewed_at excluding done/blocked tasks per Q5=B',
  )
})

// ─── Q6=A drift: monthly_llm_budget_cents column with $50 default ──

test('Q6=A: customers.monthly_llm_budget_cents column added with 5000-cent default', () => {
  assert.ok(
    /ALTER TABLE public\.customers[\s\S]+ADD COLUMN IF NOT EXISTS monthly_llm_budget_cents\s+integer\s+not\s+null\s+default\s+5000/.test(
      sql,
    ),
    'customers.monthly_llm_budget_cents must default 5000 ($50) per Q6=A',
  )
})

// ─── customers.phase_6_enabled gate (column added) ────────────────

test('customers.phase_6_enabled column added (gates Cofounder-Clone features)', () => {
  assert.ok(
    /ALTER TABLE public\.customers[\s\S]+ADD COLUMN IF NOT EXISTS phase_6_enabled\s+boolean\s+not\s+null\s+default\s+false/.test(
      sql,
    ),
    'customers.phase_6_enabled must be added with default false',
  )
})

// ─── persona_memories enum coverage ───────────────────────────────

test('persona_memories has 6-member memory_kind enum', () => {
  for (const kind of ['lead', 'contact', 'project', 'commitment', 'preference', 'recall']) {
    assert.ok(sql.includes(`'${kind}'`), `persona_memories missing memory_kind '${kind}'`)
  }
})

test('persona_memories.body_md has length cap (≤1000 chars)', () => {
  assert.ok(
    /body_md\s+text\s+not\s+null\s+check\s*\(length\(body_md\)[\s>=<]+0[\s\S]+length\(body_md\)\s*<=\s*1000\)/.test(
      sql,
    ),
    'persona_memories.body_md must have length cap ≤1000 chars (prompt-size budget)',
  )
})

// ─── approval_patterns.action_kind matches Phase 5 enum ──────────

test('approval_patterns.action_kind enum matches approval_requests Phase 5-1.a', () => {
  // Q1=C requires patterns to match against the same action_kind enum
  // that approval_requests uses (Phase 5-1.a).
  for (const kind of ['incorporate', 'contract_sign', 'public_emission', 'regulatory_filing']) {
    assert.ok(
      sql.includes(`'${kind}'`),
      `approval_patterns.action_kind missing ${kind}`,
    )
  }
})

// ─── RLS ──────────────────────────────────────────────────────────

test('RLS enabled on all 5 new Phase 6-1 tables', () => {
  for (const table of [
    'department_workspaces',
    'approval_patterns',
    'daily_digests',
    'codebase_integrations',
    'persona_memories',
  ]) {
    assert.ok(
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`).test(sql),
      `RLS not enabled on ${table}`,
    )
  }
})

test('codebase_integrations + persona_memories have NO anon SELECT policy (sensitive data)', () => {
  // codebase_integrations contains encrypted PAT; persona_memories has
  // free-form business context. Both should be service-role only.
  assert.ok(
    !/CREATE POLICY[\s\S]+codebase_integrations FOR SELECT\s+TO anon/.test(sql),
    'codebase_integrations must NOT have anon SELECT (sensitive PAT)',
  )
  assert.ok(
    !/CREATE POLICY[\s\S]+persona_memories FOR SELECT\s+TO anon/.test(sql),
    'persona_memories must NOT have anon SELECT (sensitive business context)',
  )
})

test('department_workspaces / approval_patterns / daily_digests have anon SELECT policies', () => {
  for (const table of ['department_workspaces', 'approval_patterns', 'daily_digests']) {
    // Policy name varies but should mention the table + "SELECT TO anon"
    assert.ok(
      new RegExp(`CREATE POLICY[\\s\\S]+ON public\\.${table} FOR SELECT[\\s\\S]+TO anon`).test(sql),
      `${table} missing anon SELECT policy`,
    )
  }
})

// ─── Indexes for query performance ────────────────────────────────

test('all 5 tables have at least 1 customer-scoped index', () => {
  // Each Phase 6-1 table is per-customer scoped; queries always filter
  // on customer_id (or workspace_id which scopes to customer). Without
  // these indexes, a 100-customer prod scale would table-scan.
  for (const idx of [
    'idx_dept_workspaces_customer',
    'idx_approval_patterns_active',
    'idx_daily_digests_recent',
    'idx_codebase_integrations_active',
    'idx_persona_memories_workspace_recent',
  ]) {
    assert.ok(
      sql.includes(idx),
      `missing index ${idx}`,
    )
  }
})

// ─── Spec coherence: lock markers + no DRAFT ──────────────────────

test('Phase 6 spec doc identifies as LOCKED', () => {
  const spec = fs.readFileSync(
    path.join(ROOT, 'docs/plans/2026-05-10-phase-6-spec.md'),
    'utf8',
  )
  assert.ok(/LOCKED 2026-05-10/.test(spec), 'spec must show LOCKED 2026-05-10')
  assert.ok(
    /Q1-Q6 picks.*C,\s*C,\s*A,\s*A,\s*B,\s*A/.test(spec),
    'spec must show locked picks C, C, A, A, B, A',
  )
})

test('Phase 6 spec has no DRAFT markers in header', () => {
  const spec = fs.readFileSync(
    path.join(ROOT, 'docs/plans/2026-05-10-phase-6-spec.md'),
    'utf8',
  )
  // First 30 lines should be lock-clean
  const header = spec.split('\n').slice(0, 30).join('\n')
  assert.ok(
    !header.includes('DRAFT'),
    'spec header should not contain DRAFT after lock',
  )
})
