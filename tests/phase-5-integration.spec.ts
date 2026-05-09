// Phase 5 Days 9-10: cross-cutting integration + drift sweep.
//
// Asserts the full Phase 5 surface is internally coherent — the four
// action_kinds, the five stages, the five dept packs, the 20 deliverable
// IDs, and the BD v3 SOUL.md all reference each other consistently.
//
// This is the "no silent drift" defense: rename anything in one place
// without updating the others, and a test here fails.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())

// Canonical sources of truth (per Phase 5 spec lock 2026-05-09 Q1-Q5)
const STAGES = ['idea', 'setup', 'identity', 'build', 'sell'] as const
const ACTION_KINDS = [
  'incorporate',
  'contract_sign',
  'public_emission',
  'regulatory_filing',
] as const
const DEPT_PACKS = ['sales', 'marketing', 'engineering', 'legal', 'finance'] as const
const DECISION_KINDS = [
  'stage_transition',
  'approval_outcome',
  'thread_spawn',
  'customer_commitment',
  'recommendation',
  'pivot',
] as const

// ─── Schema files exist + reference the canonical enums ──────────

test('Phase 5-1.a migration exists and contains all 4 action_kinds', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510100000_phase_5_master_agent_state.sql'),
    'utf8',
  )
  for (const kind of ACTION_KINDS) {
    assert.ok(sql.includes(`'${kind}'`), `migration missing action_kind '${kind}'`)
  }
})

test('Phase 5-1.a migration contains all 5 stages in current_stage CHECK', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510100000_phase_5_master_agent_state.sql'),
    'utf8',
  )
  for (const stage of STAGES) {
    assert.ok(sql.includes(`'${stage}'`), `migration missing stage '${stage}'`)
  }
})

test('Phase 5-1.a migration contains all 5 department names in CHECK', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510100000_phase_5_master_agent_state.sql'),
    'utf8',
  )
  for (const dept of DEPT_PACKS) {
    assert.ok(sql.includes(`'${dept}'`), `migration missing department '${dept}'`)
  }
})

test('Phase 5-3.a migration contains all 6 decision_kinds in CHECK', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510130000_phase_5_3a_bd_decisions_log.sql'),
    'utf8',
  )
  for (const kind of DECISION_KINDS) {
    assert.ok(sql.includes(`'${kind}'`), `migration missing decision_kind '${kind}'`)
  }
})

// ─── BD v3 manifest coherence ────────────────────────────────────

test('business-director manifest is at version 3.0.0 (BD v3)', () => {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'agent-packs/business-director/manifest.json'),
      'utf8',
    ),
  ) as { version: string }
  assert.equal(m.version, '3.0.0', 'BD v3 manifest should be at 3.0.0 after Phase 5-3.a')
})

test('BD v3 manifest declares all 5 dept dispatch skills', () => {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'agent-packs/business-director/manifest.json'),
      'utf8',
    ),
  ) as { skills: { id: string; enabled_for_tiers?: string[] }[] }
  for (const dept of DEPT_PACKS) {
    const entry = m.skills.find((s) => s.id === `${dept}-dispatch`)
    assert.ok(entry, `manifest missing ${dept}-dispatch`)
    assert.deepEqual(
      entry!.enabled_for_tiers,
      ['studio'],
      `${dept}-dispatch should be Studio-only (Q3=A locked)`,
    )
  }
})

test('BD v3 manifest declares all Phase 5-4 templates (BPJS / DJP / bank / UU PDP)', () => {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'agent-packs/business-director/manifest.json'),
      'utf8',
    ),
  ) as { templates: { id: string }[] }
  const ids = new Set(m.templates.map((t) => t.id))
  for (const expected of [
    'finance/bpjs-registration-paths.md',
    'finance/djp-tax-filing-cycle.md',
    'finance/bank-account-checklist.md',
    'legal/uu-pdp-basic-compliance.md',
  ]) {
    assert.ok(ids.has(expected), `manifest missing template ${expected}`)
  }
})

// ─── BD v3 SOUL.md coherence with the implementation ────────────

test('BD v3 SOUL.md references all 5 dept dispatch skills by exact id', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/SOUL.md'),
    'utf8',
  )
  for (const dept of DEPT_PACKS) {
    assert.ok(
      md.includes(`${dept}-dispatch`),
      `SOUL.md missing reference to ${dept}-dispatch`,
    )
  }
})

test('BD v3 SOUL.md references all 4 action_kinds by exact name', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/SOUL.md'),
    'utf8',
  )
  for (const kind of ACTION_KINDS) {
    assert.ok(md.includes(kind), `SOUL.md missing action_kind ${kind}`)
  }
})

test('BD v3 SOUL.md references the locked Q4=C expiry numbers', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/SOUL.md'),
    'utf8',
  )
  // Q4=C: incorporate=14d, contract_sign=14d, public_emission=24h, regulatory_filing=48h
  assert.ok(md.includes('14d'), 'SOUL.md should reference 14d expiry')
  assert.ok(md.includes('24h'), 'SOUL.md should reference 24h expiry')
  assert.ok(md.includes('48h'), 'SOUL.md should reference 48h expiry')
})

// ─── State machine ↔ schema enum coherence ──────────────────────

test('services/business-roadmap STAGES matches the schema CHECK enum', () => {
  const stagesTs = fs.readFileSync(
    path.join(ROOT, 'services/business-roadmap/src/stages.ts'),
    'utf8',
  )
  for (const stage of STAGES) {
    assert.ok(
      stagesTs.includes(`'${stage}'`),
      `stages.ts missing '${stage}'`,
    )
  }
})

test('approval-queue-handler ACTION_KINDS matches schema CHECK enum', () => {
  const ts = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/approval-queue-handler.ts'),
    'utf8',
  )
  for (const kind of ACTION_KINDS) {
    assert.ok(ts.includes(`'${kind}'`), `handler missing '${kind}'`)
  }
})

test('approval-queue-handler ACTION_EXPIRY_HOURS matches Q4=C lock', () => {
  const ts = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/approval-queue-handler.ts'),
    'utf8',
  )
  // Q4=C: incorporate=14d, contract_sign=14d, public_emission=24h, regulatory_filing=48h
  assert.ok(/incorporate:\s*14\s*\*\s*24/.test(ts), 'incorporate should be 14*24 hours')
  assert.ok(/contract_sign:\s*14\s*\*\s*24/.test(ts), 'contract_sign should be 14*24 hours')
  assert.ok(/public_emission:\s*24/.test(ts), 'public_emission should be 24 hours')
  assert.ok(/regulatory_filing:\s*48/.test(ts), 'regulatory_filing should be 48 hours')
})

// ─── 5-stage-checklist deliverable id coverage ─────────────────

test('5-stage-checklist references all 20 deliverable ids from stages.ts', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/templates/roadmap/5-stage-checklist.md'),
    'utf8',
  )
  // Re-read stages.ts to pull the canonical ids
  const stagesTs = fs.readFileSync(
    path.join(ROOT, 'services/business-roadmap/src/stages.ts'),
    'utf8',
  )
  // [a-z0-9_]+ — sell_10_paying_customers contains a digit
  const idMatches = stagesTs.match(/'(idea|setup|identity|build|sell)_[a-z0-9_]+'/g) ?? []
  const uniqueIds = new Set(idMatches.map((s) => s.replace(/'/g, '')))
  assert.equal(uniqueIds.size, 20, 'expected exactly 20 deliverable ids in stages.ts')

  for (const id of uniqueIds) {
    assert.ok(
      md.includes(id),
      `5-stage-checklist mapping missing deliverable id ${id}`,
    )
  }
})

// ─── Telegram formatter ↔ approval-queue action_kinds coherence ──

test('approval-telegram-formatter handles all 4 action_kinds', () => {
  const ts = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/approval-telegram-formatter.ts'),
    'utf8',
  )
  for (const kind of ACTION_KINDS) {
    assert.ok(ts.includes(`'${kind}'`) || ts.includes(`${kind}:`), `formatter missing action_kind ${kind}`)
  }
})

// ─── Edge Functions deployed (file existence) ──────────────────

test('all Phase 5 Edge Function entries exist on disk', () => {
  for (const fn of ['approval-queue', 'roadmap-state', 'hermes-kanban-proxy']) {
    const p = path.join(ROOT, 'supabase/functions', fn, 'index.ts')
    assert.ok(fs.existsSync(p), `Edge Function entry missing: ${fn}/index.ts`)
  }
})

test('all Phase 5 pure handlers exist on disk', () => {
  for (const file of [
    'approval-queue-handler.ts',
    'roadmap-state-handler.ts',
    'hermes-kanban-proxy-handler.ts',
    'approval-telegram-formatter.ts',
  ]) {
    const p = path.join(ROOT, 'supabase/functions/_shared', file)
    assert.ok(fs.existsSync(p), `pure handler missing: _shared/${file}`)
  }
})

// ─── Department thread → kanban board linkage ─────────────────

test('department_threads schema can link to hermes_kanban_boards (Phase 4-5b)', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510100000_phase_5_master_agent_state.sql'),
    'utf8',
  )
  assert.ok(
    sql.includes('hermes_kanban_board_id'),
    'department_threads should have hermes_kanban_board_id column linking to Phase 4-5b',
  )
})

// ─── Tier-gating consistency (Q3=A locked) ─────────────────────

test('all 5 dept-dispatch SKILL.md files declare Studio tier (Q3=A locked)', () => {
  for (const dept of DEPT_PACKS) {
    const md = fs.readFileSync(
      path.join(ROOT, `agent-packs/business-director/skills/${dept}-dispatch/SKILL.md`),
      'utf8',
    )
    assert.ok(
      /Tier:\s*studio/i.test(md),
      `${dept}-dispatch SKILL.md should declare Studio tier`,
    )
    assert.ok(
      /phase_5_enabled/.test(md),
      `${dept}-dispatch SKILL.md should reference phase_5_enabled gate`,
    )
  }
})

test('customers.phase_5_enabled column added in Phase 5-1.a migration', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260510100000_phase_5_master_agent_state.sql'),
    'utf8',
  )
  assert.ok(
    /ALTER TABLE public\.customers[\s\S]+ADD COLUMN IF NOT EXISTS phase_5_enabled/i.test(sql),
    'migration should add phase_5_enabled column to customers',
  )
})

// ─── No deprecated department-task-spawner references ──────────

test('department-task-spawner is purged from all Phase 5+ references', () => {
  // Check key files where we know the deprecated reference would appear
  const filesToCheck = [
    'agent-packs/business-director/SOUL.md',
    'agent-packs/business-director/manifest.json',
    'supabase/functions/_shared/soul-md-template.ts',
  ]
  for (const file of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.ok(
      !content.includes('department-task-spawner'),
      `${file} should not reference deprecated department-task-spawner`,
    )
  }
})

// ─── Approval gate coverage in dept dispatch SKILL.md ──────────

test('legal-dispatch surfaces contract_sign approval gate', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/skills/legal-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(md.includes('contract_sign'), 'legal-dispatch should surface contract_sign')
})

test('marketing-dispatch surfaces public_emission approval gate', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/skills/marketing-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(md.includes('public_emission'), 'marketing-dispatch should surface public_emission')
})

test('finance-dispatch surfaces regulatory_filing approval gate', () => {
  const md = fs.readFileSync(
    path.join(ROOT, 'agent-packs/business-director/skills/finance-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(md.includes('regulatory_filing'), 'finance-dispatch should surface regulatory_filing')
})

// ─── Phase 5 migration files locked + applied ──────────────────

test('Phase 5 migration files use the locked timestamp range (20260510*)', () => {
  const migrationsDir = path.join(ROOT, 'supabase/migrations')
  const files = fs.readdirSync(migrationsDir)
  const phase5 = files.filter((f) => f.startsWith('20260510'))
  assert.ok(
    phase5.length >= 2,
    `expected at least 2 Phase 5 migrations starting with 20260510*; found ${phase5.length}`,
  )
  // 5-1.a and 5-3.a known migrations
  assert.ok(
    phase5.some((f) => f.includes('phase_5_master_agent_state')),
    'should have 5-1.a master agent state migration',
  )
  assert.ok(
    phase5.some((f) => f.includes('bd_decisions_log')),
    'should have 5-3.a bd_decisions_log migration',
  )
})
