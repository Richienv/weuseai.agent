/**
 * Agent Mesh — contract module + conductor-skill drift pins +
 * the Phase F scripted full-mesh run.
 *
 * The execution primitive is upstream (Hermes delegate_task); OUR layer is
 * the policy: tier-gated delegation, honest assembly, graceful failure.
 * These tests pin (1) the pure contract, (2) that the conductor SKILL.md
 * prose matches the contract (slugs, env gate, verbatim copy, fallback),
 * and (3) one full mesh run end-to-end through the contract.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  validateMeshPlan,
  gateMeshPlan,
  assembleMeshDeliverable,
  meshOutOfTierCopy,
  type MeshPlan,
  type MeshSubResult,
} from '../supabase/functions/_shared/agent-mesh.ts'
import { brandVoiceViolations } from '../supabase/functions/_shared/persona-genesis-validator.ts'
import { KNOWN_PERSONA_SLUGS } from '../supabase/functions/_shared/manifest-validator.ts'
import { personasForTier, PERSONA_META } from '../supabase/functions/_shared/tier-personas.ts'

const PLAN: MeshPlan = {
  goal: 'Siapin launch produk kopi susu botolan',
  subtasks: [
    { id: 'riset-kompetitor', persona_slug: 'deep-researcher', brief: 'Riset 5 kompetitor kopi susu botolan di Indonesia, harga dan positioning.' },
    { id: 'draft-press-release', persona_slug: 'doc-expert', brief: 'Draft press release launch dalam Bahasa Indonesia, gaya brand calm-premium.' },
    { id: 'deck-investor', persona_slug: 'slide-master', brief: 'Susun outline deck 8 slide untuk briefing internal launch.' },
    { id: 'landing-page', persona_slug: 'web-app-builder', brief: 'Rancang struktur landing page satu halaman untuk pre-order.' },
  ],
}

// ─── plan validation ─────────────────────────────────────────────────────

test('validateMeshPlan: the fixture plan is valid', () => {
  assert.deepEqual(validateMeshPlan(PLAN), { ok: true })
})

test('validateMeshPlan: unknown persona slug rejected (the web-master class of bug)', () => {
  const bad: MeshPlan = {
    ...PLAN,
    subtasks: [{ id: 'x', persona_slug: 'web-master', brief: 'bikin landing page dong' }],
  }
  const v = validateMeshPlan(bad)
  assert.equal(v.ok, false)
  assert.ok((v as { errors: string[] }).errors.some((e) => e.includes('web-master')))
})

test('validateMeshPlan: self-delegation (conductor → conductor) rejected', () => {
  const bad: MeshPlan = {
    ...PLAN,
    subtasks: [{ id: 'x', persona_slug: 'project-conductor', brief: 'orkestrasi dirimu sendiri' }],
  }
  assert.equal(validateMeshPlan(bad).ok, false)
})

// ─── tier gate ───────────────────────────────────────────────────────────

test('gate: library-full customer runs the whole plan (all 10 personas granted)', () => {
  const gated = gateMeshPlan(PLAN, personasForTier('library-full'))
  assert.equal(gated.runnable.length, 4)
  assert.equal(gated.blocked.length, 0)
})

test('gate: done-for-you customer gets web-app-builder BLOCKED with the flagged copy', () => {
  // done-for-you = the 8-persona Pro set, which does NOT include
  // web-app-builder — straight from tier-personas.ts.
  const allowed = personasForTier('done-for-you')
  assert.ok(!allowed.includes('web-app-builder'), 'precondition from the source of truth')
  const gated = gateMeshPlan(PLAN, allowed)
  assert.equal(gated.runnable.length, 3)
  assert.equal(gated.blocked.length, 1)
  assert.equal(gated.blocked[0].subtask.persona_slug, 'web-app-builder')
  // The copy uses the DISPLAY name, not the slug.
  assert.match(gated.blocked[0].copy, /Web Creator/)
  assert.equal(gated.blocked[0].copy, meshOutOfTierCopy('Web Creator'))
})

test('gate: copy passes brand voice (no banned words, zero exclamation, no Anda)', () => {
  for (const slug of KNOWN_PERSONA_SLUGS) {
    const copy = meshOutOfTierCopy(PERSONA_META[slug]?.name ?? slug)
    assert.deepEqual(brandVoiceViolations('mesh copy', copy), [])
  }
})

// ─── assembly ────────────────────────────────────────────────────────────

const RESULTS: MeshSubResult[] = [
  { id: 'riset-kompetitor', persona_slug: 'deep-researcher', status: 'ok', output: 'Lima kompetitor utama: ...' },
  { id: 'draft-press-release', persona_slug: 'doc-expert', status: 'ok', output: 'Draft press release: ...' },
  { id: 'deck-investor', persona_slug: 'slide-master', status: 'timeout', note: 'render deck melewati batas waktu' },
]

test('assembly: one deliverable with sections, who-did-what, and honest notes', () => {
  const allowed = personasForTier('done-for-you')
  const { blocked } = gateMeshPlan(PLAN, allowed)
  const out = assembleMeshDeliverable(PLAN.goal, RESULTS, blocked)

  // Sections per successful output, by display name.
  assert.match(out, /## Deep Researcher — riset-kompetitor/)
  assert.match(out, /## Doc Expert — draft-press-release/)
  // Who-did-what covers every state.
  assert.match(out, /## Siapa mengerjakan apa/)
  assert.match(out, /Slide Master: deck-investor — kehabisan waktu/)
  assert.match(out, /Web Creator: landing-page — tidak termasuk paket kamu/)
  // Honest notes: failure + the tier copy verbatim.
  assert.match(out, /## Catatan jujur/)
  assert.ok(out.includes(meshOutOfTierCopy('Web Creator')))
  // Never silent: the timeout is surfaced with a retry offer.
  assert.match(out, /coba ulang/)
})

test('assembly: clean run has no Catatan jujur section', () => {
  const okResults = RESULTS.filter((r) => r.status === 'ok')
  const out = assembleMeshDeliverable(PLAN.goal, okResults, [])
  assert.ok(!out.includes('Catatan jujur'))
})

test('assembly output passes brand voice', () => {
  const { blocked } = gateMeshPlan(PLAN, personasForTier('done-for-you'))
  const out = assembleMeshDeliverable(PLAN.goal, RESULTS, blocked)
  assert.deepEqual(brandVoiceViolations('mesh deliverable', out), [])
})

// ─── conductor SKILL.md drift pins ──────────────────────────────────────

const ROUTER = readFileSync(
  new URL('../agent-packs/project-conductor/skills/multi-agent-router/SKILL.md', import.meta.url),
  'utf8',
)
const ORCH = readFileSync(
  new URL('../agent-packs/project-conductor/skills/project-orchestration/SKILL.md', import.meta.url),
  'utf8',
)

test('router: every persona slug mentioned in the enum is a REAL slug', () => {
  // The bug this kills: the router shipped with web-master and
  // business-director — two slugs that do not exist — so delegation to
  // them could never resolve a bundle.
  const enumLine = ROUTER.split('\n').find((l) => l.includes('`target_persona`'))
  assert.ok(enumLine, 'target_persona enum line present')
  // Slugs live between "enum:" and the closing "| ya |" cell.
  const enumCell = enumLine!.split('enum:')[1]?.split('| ya')[0] ?? ''
  const slugs = [...enumCell.matchAll(/[a-z][a-z0-9]+(?:-[a-z0-9]+)+/g)].map((m) => m[0])
  assert.ok(slugs.length >= 8, `expected a full persona enum, got ${slugs.length}`)
  for (const s of slugs) {
    assert.ok(
      (KNOWN_PERSONA_SLUGS as readonly string[]).includes(s),
      `router enum mentions unknown slug "${s}"`,
    )
  }
  assert.ok(!ROUTER.includes('web-master'), 'stale web-master slug removed')
  assert.ok(!ROUTER.includes('business-director'), 'stale business-director slug removed')
})

test('router: tier gate uses WEUSEAI_AGENT_SLUGS (the runtime-true mechanism)', () => {
  assert.ok(ROUTER.includes('$WEUSEAI_AGENT_SLUGS'))
  assert.ok(!ROUTER.includes('lookup customers.tier'), 'impossible DB-lookup mechanism removed')
})

test('router: carries the canonical out-of-tier copy verbatim (founder-flagged single source)', () => {
  // The SKILL.md embeds the copy with a [Nama Persona] placeholder; the
  // module is the single source. Pin both directions.
  const template = meshOutOfTierCopy('[Nama Persona]')
  assert.ok(ROUTER.includes(template), 'router copy diverged from agent-mesh.ts meshOutOfTierCopy')
  const moduleSrc = readFileSync(
    new URL('../supabase/functions/_shared/agent-mesh.ts', import.meta.url),
    'utf8',
  )
  assert.ok(moduleSrc.includes('FOUNDER REVIEW'), 'copy must stay founder-flagged until reviewed')
})

test('router: names delegate_task, the SOUL context recipe, and the no-delegation fallback', () => {
  assert.ok(ROUTER.includes('delegate_task'))
  assert.ok(ROUTER.includes('/var/lib/weuseai/bundle/'))
  assert.ok(ROUTER.includes('.installed-version'))
  assert.match(ROUTER, /maksimal 3/)
  assert.match(ROUTER, /Fallback/i)
  assert.match(ROUTER, /JANGAN berhenti diam|JANGAN spawn/)
})

test('orchestration: final-deliverable contract present (sections + who-did-what + honest notes)', () => {
  assert.ok(ORCH.includes('## Deliverable akhir'))
  assert.ok(ORCH.includes('Siapa mengerjakan apa'))
  assert.ok(ORCH.includes('Catatan jujur'))
  assert.ok(ORCH.includes('$WEUSEAI_AGENT_SLUGS'))
})

test('conductor skills pass brand voice', () => {
  for (const [label, text] of [['router', ROUTER], ['orchestration', ORCH]] as const) {
    // The Voice-signature rule QUOTES the banned register to forbid it
    // ('bukan "Anda"') — exempt the quoted mention, flag any real use.
    const cleaned = text.replaceAll('"Anda"', '"[register-terlarang]"')
    assert.deepEqual(brandVoiceViolations(label, cleaned), [], `${label} violates brand voice`)
  }
})

test('manifest bumped to 2.6.0 for the mesh contract', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../agent-packs/project-conductor/manifest.json', import.meta.url), 'utf8'),
  ) as { version: string }
  assert.equal(manifest.version, '2.6.0')
})

// ─── Phase F: one full scripted mesh run ─────────────────────────────────

test('FULL MESH RUN: decompose → gate → delegate (simulated) → assemble, with a failure and a tier block', async () => {
  // The customer: done-for-you (8 personas, no web-app-builder).
  const allowed = personasForTier('done-for-you')

  // 1. The conductor decomposes (fixture plan) and validates it.
  assert.deepEqual(validateMeshPlan(PLAN), { ok: true })

  // 2. Tier gate BEFORE any spawn.
  const { runnable, blocked } = gateMeshPlan(PLAN, allowed)
  assert.deepEqual(
    runnable.map((s) => s.persona_slug).sort(),
    ['deep-researcher', 'doc-expert', 'slide-master'],
  )
  assert.equal(blocked.length, 1)

  // 3. Simulated delegate_task batch (parallel ≤3): each child gets the
  //    persona SOUL as context and produces output; one times out.
  const childRun = async (st: (typeof runnable)[number]): Promise<MeshSubResult> => {
    if (st.id === 'deck-investor') {
      return { id: st.id, persona_slug: st.persona_slug, status: 'timeout', note: 'render melewati batas waktu' }
    }
    return {
      id: st.id,
      persona_slug: st.persona_slug,
      status: 'ok',
      output: `Hasil ${st.id} dikerjakan dengan SOUL ${st.persona_slug}.`,
    }
  }
  assert.ok(runnable.length <= 3, 'fits one parallel batch')
  const results = await Promise.all(runnable.map(childRun))

  // 4. Assembly: one deliverable, partial-but-honest.
  const out = assembleMeshDeliverable(PLAN.goal, results, blocked)
  assert.match(out, /^# Siapin launch produk kopi susu botolan/)
  assert.match(out, /## Deep Researcher — riset-kompetitor/)
  assert.match(out, /## Catatan jujur/)
  assert.ok(out.includes(meshOutOfTierCopy('Web Creator')))
  assert.deepEqual(brandVoiceViolations('mesh run output', out), [])
})
