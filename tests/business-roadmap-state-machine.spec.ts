// Phase 5-1.b: business-roadmap state machine tests.
//
// Pure module at services/business-roadmap/src/.
// Models the 5-stage Indonesian-founder roadmap (idea → setup → identity →
// build → sell) with per-stage deliverable gates.
//
// Q1=A locked: stage names match Persona v2 BD enum.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STAGES,
  STAGE_DELIVERABLES,
  ALL_DELIVERABLES,
  initialRoadmapState,
  canAdvance,
  advance,
  markDeliverable,
  listMissingDeliverables,
  isStage,
  isDeliverableId,
  type RoadmapState,
  type StageKind,
  type AdvanceResult,
} from '../services/business-roadmap/src/index.ts'

// Helper: assert advance succeeded and return state. Lets us narrow the
// AdvanceResult discriminator inline so test bodies stay readable.
function mustAdvance(result: AdvanceResult): RoadmapState {
  if (!result.ok) {
    assert.fail(`expected advance to succeed but got ${result.reason}`)
  }
  return result.state
}

// ─── Stage ordering ─────────────────────────────────────────────────

test('STAGES are exactly the 5 Q1=A locked names in order', () => {
  assert.deepEqual(STAGES, ['idea', 'setup', 'identity', 'build', 'sell'])
})

test('STAGE_DELIVERABLES has an entry for every stage with at least 1 deliverable', () => {
  for (const stage of STAGES) {
    const deliverables = STAGE_DELIVERABLES[stage]
    assert.ok(Array.isArray(deliverables), `${stage} should have a deliverables array`)
    assert.ok(deliverables.length >= 1, `${stage} should have at least 1 deliverable`)
  }
})

test('ALL_DELIVERABLES is the union of every stage deliverables (no duplicates)', () => {
  const union = STAGES.flatMap((s) => STAGE_DELIVERABLES[s])
  assert.equal(ALL_DELIVERABLES.length, union.length, 'no duplicates expected')
  for (const d of union) {
    assert.ok(ALL_DELIVERABLES.includes(d), `${d} missing from ALL_DELIVERABLES`)
  }
})

test('every deliverable id is namespaced by its stage prefix (e.g. setup_*)', () => {
  // Defensive: deliverable IDs are referenced in db jsonb keys + dept pack
  // SKILL.md routing — keep the namespace stable so a typo can't quietly
  // promote a wrong-stage deliverable.
  for (const stage of STAGES) {
    for (const d of STAGE_DELIVERABLES[stage]) {
      assert.ok(
        d.startsWith(`${stage}_`),
        `deliverable ${d} should be prefixed with ${stage}_`,
      )
    }
  }
})

// ─── isStage / isDeliverableId guards ──────────────────────────────

test('isStage accepts known stages, rejects unknown', () => {
  assert.equal(isStage('idea'), true)
  assert.equal(isStage('sell'), true)
  assert.equal(isStage('initial'), false) // Q1=A: rejected
  assert.equal(isStage(''), false)
  assert.equal(isStage('SETUP'), false) // case-sensitive
})

test('isDeliverableId accepts known IDs, rejects unknown', () => {
  const known = STAGE_DELIVERABLES.setup[0]
  assert.equal(isDeliverableId(known), true)
  assert.equal(isDeliverableId('not_a_real_deliverable'), false)
})

// ─── initialRoadmapState ────────────────────────────────────────────

test('initialRoadmapState starts at "idea" with no deliverables completed', () => {
  const state = initialRoadmapState('cust-123')
  assert.equal(state.customer_id, 'cust-123')
  assert.equal(state.current_stage, 'idea')
  assert.deepEqual(state.deliverables_completed, {})
  assert.equal(state.notes_md, null)
  assert.ok(typeof state.stage_entered_at === 'string')
  assert.ok(typeof state.updated_at === 'string')
})

// ─── markDeliverable ───────────────────────────────────────────────

test('markDeliverable sets a deliverable to true (or false)', () => {
  // Inject monotonic clock so updated_at advances reliably even on
  // sub-millisecond runs.
  let counter = 0
  const now = () => `2026-01-01T00:00:0${counter++}.000Z`

  const initial = initialRoadmapState('c', now)
  const id = STAGE_DELIVERABLES.idea[0]
  const next = markDeliverable(initial, id, true, now)
  assert.equal(next.deliverables_completed[id], true)
  assert.notEqual(next.updated_at, initial.updated_at)

  const off = markDeliverable(next, id, false, now)
  assert.equal(off.deliverables_completed[id], false)
})

test('markDeliverable rejects unknown deliverable id', () => {
  const initial = initialRoadmapState('c')
  assert.throws(
    () => markDeliverable(initial, 'made_up_id', true),
    /unknown deliverable/,
  )
})

test('markDeliverable rejects deliverable not belonging to current stage', () => {
  // Customer at stage "idea" cannot mark a "build_*" deliverable yet —
  // that gates against marking-out-of-order.
  const initial = initialRoadmapState('c')
  const buildDeliverable = STAGE_DELIVERABLES.build[0]
  assert.throws(
    () => markDeliverable(initial, buildDeliverable, true),
    /not in current stage/,
  )
})

test('markDeliverable preserves prior deliverable values from earlier stages', () => {
  // After advancing setup → identity, the setup deliverables should still
  // be true in deliverables_completed (history is preserved).
  const initial = initialRoadmapState('c')
  let s: RoadmapState = initial
  for (const id of STAGE_DELIVERABLES.idea) {
    s = markDeliverable(s, id, true)
  }
  s = mustAdvance(advance(s)) // idea → setup
  for (const id of STAGE_DELIVERABLES.setup) {
    s = markDeliverable(s, id, true)
  }
  s = mustAdvance(advance(s)) // setup → identity

  // All idea + setup deliverables remain true.
  for (const id of STAGE_DELIVERABLES.idea) {
    assert.equal(s.deliverables_completed[id], true, `${id} should be preserved`)
  }
  for (const id of STAGE_DELIVERABLES.setup) {
    assert.equal(s.deliverables_completed[id], true, `${id} should be preserved`)
  }
})

// ─── listMissingDeliverables ────────────────────────────────────────

test('listMissingDeliverables returns all current-stage deliverables when none done', () => {
  const initial = initialRoadmapState('c')
  const missing = listMissingDeliverables(initial)
  assert.deepEqual(missing.sort(), [...STAGE_DELIVERABLES.idea].sort())
})

test('listMissingDeliverables shrinks as deliverables are marked done', () => {
  let s = initialRoadmapState('c')
  s = markDeliverable(s, STAGE_DELIVERABLES.idea[0], true)
  const missing = listMissingDeliverables(s)
  assert.equal(missing.length, STAGE_DELIVERABLES.idea.length - 1)
  assert.ok(!missing.includes(STAGE_DELIVERABLES.idea[0]))
})

test('listMissingDeliverables returns empty when all done', () => {
  let s = initialRoadmapState('c')
  for (const id of STAGE_DELIVERABLES.idea) {
    s = markDeliverable(s, id, true)
  }
  assert.deepEqual(listMissingDeliverables(s), [])
})

test('listMissingDeliverables only considers current stage, not future stages', () => {
  let s = initialRoadmapState('c')
  for (const id of STAGE_DELIVERABLES.idea) {
    s = markDeliverable(s, id, true)
  }
  s = mustAdvance(advance(s)) // idea → setup
  // Should be all setup deliverables, not setup + identity + build + sell.
  assert.deepEqual(
    listMissingDeliverables(s).sort(),
    [...STAGE_DELIVERABLES.setup].sort(),
  )
})

// ─── canAdvance ────────────────────────────────────────────────────

test('canAdvance returns false when current stage has missing deliverables', () => {
  const initial = initialRoadmapState('c')
  assert.equal(canAdvance(initial), false)
})

test('canAdvance returns true when all current-stage deliverables done', () => {
  let s = initialRoadmapState('c')
  for (const id of STAGE_DELIVERABLES.idea) {
    s = markDeliverable(s, id, true)
  }
  assert.equal(canAdvance(s), true)
})

test('canAdvance returns false at "sell" stage even when all done (no further stage)', () => {
  // Walking to sell stage and completing everything should still return
  // canAdvance=false because there's no next stage.
  let s = initialRoadmapState('c')
  for (const stage of STAGES) {
    for (const id of STAGE_DELIVERABLES[stage]) {
      s = markDeliverable(s, id, true)
    }
    if (stage !== 'sell') s = mustAdvance(advance(s))
  }
  assert.equal(s.current_stage, 'sell')
  assert.equal(canAdvance(s), false)
})

// ─── advance ───────────────────────────────────────────────────────

test('advance moves idea → setup when all deliverables done', () => {
  let counter = 0
  const now = () => `2026-01-01T00:00:0${counter++}.000Z`
  let s = initialRoadmapState('c', now)
  for (const id of STAGE_DELIVERABLES.idea) {
    s = markDeliverable(s, id, true, now)
  }
  const result = advance(s, now)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.state.current_stage, 'setup')
    assert.notEqual(result.state.stage_entered_at, s.stage_entered_at)
  }
})

test('advance fails when canAdvance is false (missing deliverables)', () => {
  const initial = initialRoadmapState('c')
  const result = advance(initial)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.reason, 'missing_deliverables')
    assert.ok(Array.isArray(result.missing) && result.missing.length > 0)
  }
})

test('advance fails at "sell" stage with reason=already_at_final', () => {
  let s = initialRoadmapState('c')
  for (const stage of STAGES) {
    for (const id of STAGE_DELIVERABLES[stage]) {
      s = markDeliverable(s, id, true)
    }
    if (stage !== 'sell') s = mustAdvance(advance(s))
  }
  const result = advance(s)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.reason, 'already_at_final')
  }
})

test('advance walks all 5 stages in order', () => {
  let s = initialRoadmapState('c')
  const visited: StageKind[] = [s.current_stage]
  for (let i = 0; i < 4; i++) {
    for (const id of STAGE_DELIVERABLES[s.current_stage]) {
      s = markDeliverable(s, id, true)
    }
    s = mustAdvance(advance(s))
    visited.push(s.current_stage)
  }
  assert.deepEqual(visited, ['idea', 'setup', 'identity', 'build', 'sell'])
})

// ─── Schema enum drift defense ────────────────────────────────────

test('STAGES matches the CHECK constraint in 20260510100000_phase_5_master_agent_state.sql', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260510100000_phase_5_master_agent_state.sql',
  )
  const sql = fs.readFileSync(migrationPath, 'utf8')
  // Locate the CHECK on current_stage and assert STAGES matches.
  const m = sql.match(/current_stage in \(\s*('[^)]+)\)/)
  assert.ok(m, 'expected current_stage CHECK constraint in migration')
  const enumMembers = m![1]
    .split(',')
    .map((s) => s.replace(/'/g, '').trim())
    .filter(Boolean)
  assert.deepEqual(enumMembers, [...STAGES])
})
