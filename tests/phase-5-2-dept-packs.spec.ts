// Phase 5-2: department dispatch skills drift tests.
//
// Asserts the 5 dept-dispatch skills (sales/marketing/engineering/legal/finance)
// are coherent across:
//   - all-in-one-business-agent/manifest.json (entry exists, Studio-tier-only,
//     handler_ref:hermes-skill:<id>-dispatch)
//   - all-in-one-business-agent/skills/<id>-dispatch/SKILL.md (file exists, has
//     correct Bundle/Tier/Handler header lines)
//   - department-task-spawner is GONE (replaced by 5 dept packs)
//   - The legacy/new substitution doesn't break manifest-validator's
//     knownHermesSkills allow-list (covered separately in
//     manifest-validator.spec.ts).

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const BD_DIR = path.join(ROOT, 'agent-packs/all-in-one-business-agent')

const DEPT_PACKS = [
  'sales',
  'marketing',
  'engineering',
  'legal',
  'finance',
] as const

type Manifest = {
  version: string
  skills: {
    id: string
    handler_ref: string
    enabled_for_tiers?: string[]
  }[]
  templates: { id: string }[]
}

function readManifest(): Manifest {
  const raw = fs.readFileSync(path.join(BD_DIR, 'manifest.json'), 'utf8')
  return JSON.parse(raw) as Manifest
}

// ─── Manifest entries exist ─────────────────────────────────────────

test('business-director manifest version is at least 2.1.0 (Phase 5-2 dept packs ship + Phase 5-3.a BD v3 bumps to 3.0.0)', () => {
  const m = readManifest()
  // Drift defense: the dept packs land at 2.1.0 (Phase 5-2). The BD v3
  // SOUL.md rewrite bumps to 3.0.0 (Phase 5-3.a). Either is acceptable —
  // a regression to <2.1.0 fails this test.
  const parts = m.version.split('.').map(Number)
  const maj = parts[0] ?? 0
  const min = parts[1] ?? 0
  assert.ok(
    (maj === 2 && min >= 1) || maj >= 3,
    `expected version >= 2.1.0; got ${m.version}`,
  )
})

test('all 5 dept-dispatch skills have manifest entries', () => {
  const m = readManifest()
  const ids = new Set(m.skills.map((s) => s.id))
  for (const dept of DEPT_PACKS) {
    assert.ok(
      ids.has(`${dept}-dispatch`),
      `expected manifest entry ${dept}-dispatch`,
    )
  }
})

test('every dept-dispatch entry is Studio-tier-only (Q3=A locked)', () => {
  const m = readManifest()
  for (const dept of DEPT_PACKS) {
    const entry = m.skills.find((s) => s.id === `${dept}-dispatch`)
    assert.ok(entry, `missing ${dept}-dispatch in manifest`)
    assert.deepEqual(
      entry!.enabled_for_tiers,
      ['studio'],
      `${dept}-dispatch should be enabled_for_tiers: ["studio"] only`,
    )
  }
})

test('every dept-dispatch handler_ref is hermes-skill:<dept>-dispatch', () => {
  const m = readManifest()
  for (const dept of DEPT_PACKS) {
    const entry = m.skills.find((s) => s.id === `${dept}-dispatch`)!
    assert.equal(
      entry.handler_ref,
      `hermes-skill:${dept}-dispatch`,
      `${dept}-dispatch handler_ref should match`,
    )
  }
})

// ─── SKILL.md files exist + headers match ──────────────────────────

test('every dept-dispatch SKILL.md file exists', () => {
  for (const dept of DEPT_PACKS) {
    const p = path.join(BD_DIR, `skills/${dept}-dispatch/SKILL.md`)
    assert.ok(
      fs.existsSync(p),
      `expected SKILL.md at ${path.relative(ROOT, p)}`,
    )
  }
})

test('every dept-dispatch SKILL.md has correct Bundle/Tier/Handler header lines', () => {
  for (const dept of DEPT_PACKS) {
    const p = path.join(BD_DIR, `skills/${dept}-dispatch/SKILL.md`)
    const md = fs.readFileSync(p, 'utf8')
    // Must mention business-director bundle
    assert.ok(
      /Bundle:\s*all-in-one-business-agent/.test(md),
      `${dept}-dispatch SKILL.md missing Bundle: business-director`,
    )
    // Studio tier (Q3=A)
    assert.ok(
      /Tier:\s*studio/.test(md),
      `${dept}-dispatch SKILL.md missing Tier: studio`,
    )
    // Handler ref
    assert.ok(
      new RegExp(`Handler:.*hermes-skill:${dept}-dispatch`).test(md),
      `${dept}-dispatch SKILL.md missing Handler: hermes-skill:${dept}-dispatch`,
    )
    // Phase 5 dept pack marker
    assert.ok(
      /Phase 5/.test(md),
      `${dept}-dispatch SKILL.md should reference Phase 5 in header`,
    )
  }
})

// ─── department-task-spawner removed ───────────────────────────────

test('department-task-spawner is removed from manifest (replaced by 5 dept packs)', () => {
  const m = readManifest()
  const ids = m.skills.map((s) => s.id)
  assert.ok(
    !ids.includes('department-task-spawner'),
    'department-task-spawner should be removed from manifest in Phase 5-2',
  )
})

test('department-task-spawner skill directory is removed', () => {
  const p = path.join(BD_DIR, 'skills/department-task-spawner')
  assert.equal(
    fs.existsSync(p),
    false,
    'department-task-spawner skill directory should be removed in Phase 5-2',
  )
})

// ─── Approval-gate disclosure (governance defense) ─────────────────

test('marketing-dispatch documents public_emission approval gate', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'skills/marketing-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(
    md.includes('public_emission'),
    'marketing-dispatch SKILL.md must document public_emission approval gate (Q4=C)',
  )
})

test('legal-dispatch documents contract_sign approval gate', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'skills/legal-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(
    md.includes('contract_sign'),
    'legal-dispatch SKILL.md must document contract_sign approval gate (Q4=C)',
  )
})

test('finance-dispatch documents regulatory_filing approval gate', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'skills/finance-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(
    md.includes('regulatory_filing'),
    'finance-dispatch SKILL.md must document regulatory_filing approval gate (Q4=C)',
  )
})

test('legal-dispatch and finance-dispatch include "not licensed" hard guardrail', () => {
  const legal = fs.readFileSync(
    path.join(BD_DIR, 'skills/legal-dispatch/SKILL.md'),
    'utf8',
  )
  const finance = fs.readFileSync(
    path.join(BD_DIR, 'skills/finance-dispatch/SKILL.md'),
    'utf8',
  )
  assert.ok(
    /not.*licensed.*advokat|bukan.*advokat/i.test(legal),
    'legal-dispatch must declare "not a licensed advokat" guardrail',
  )
  assert.ok(
    /not.*licensed.*accountant|bukan.*akuntan/i.test(finance),
    'finance-dispatch must declare "not a licensed accountant" guardrail',
  )
})

// ─── 5-stage-checklist BD v3 mapping section present ──────────────

test('5-stage-checklist has BD v3 state-machine mapping section (Phase 5-2)', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'templates/roadmap/5-stage-checklist.md'),
    'utf8',
  )
  assert.ok(
    md.includes('BD v3 state-machine mapping'),
    '5-stage-checklist.md must include BD v3 state-machine mapping section bridging to services/business-roadmap/src/stages.ts',
  )
  // Must mention every stage's first deliverable id (smoke check that
  // the mapping table is non-trivial)
  for (const id of [
    'idea_problem_articulated',
    'setup_entity_chosen',
    'identity_brand_defined',
    'build_mvp_shipped',
    'sell_first_paying_customer',
  ]) {
    assert.ok(
      md.includes(id),
      `5-stage-checklist mapping should reference deliverable id ${id}`,
    )
  }
})
