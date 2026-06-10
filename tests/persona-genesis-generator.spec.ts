/**
 * Persona Genesis — generator pipeline (prompts, parsing, assembly) +
 * quality validator.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlanPrompt,
  buildSkillsPrompt,
  buildTemplatesPrompt,
  parsePlan,
  parseSkills,
  parseTemplates,
  generatePersona,
  GenesisGenerationError,
} from '../supabase/functions/_shared/persona-genesis-generator.ts'
import {
  validateGeneratedPersona,
  BANNED_WORDS,
} from '../supabase/functions/_shared/persona-genesis-validator.ts'
import { validateManifest } from '../supabase/functions/_shared/manifest-validator.ts'
import {
  FIXTURE_PROFILE,
  fixturePlanResponse,
  fixtureLlm,
} from './_helpers/genesis-fixture.ts'

const CID = 'a1b2c3d4-0000-4000-8000-1234567890ab'

// ─── prompts ─────────────────────────────────────────────────────────────

test('plan prompt carries the brand rules + the customer profile', () => {
  const { system, user } = buildPlanPrompt(FIXTURE_PROFILE)
  assert.match(system, /ATURAN BAHASA/)
  assert.match(system, /game-changer/) // banned list embedded
  assert.match(system, /TIDAK punya akses kalender/i)
  assert.match(user, /Marketing manager di startup F&B/)
})

test('skills + templates prompts feed the plan forward', () => {
  const plan = parsePlan(fixturePlanResponse())
  const sp = buildSkillsPrompt(FIXTURE_PROFILE, plan)
  assert.match(sp.user, /kalender-konten-mingguan/)
  const tp = buildTemplatesPrompt(FIXTURE_PROFILE, plan)
  assert.match(tp.user, /laporan-performa-mingguan\.md/)
})

// ─── parsing ─────────────────────────────────────────────────────────────

test('parsePlan accepts the fixture and normalizes kinds', () => {
  const plan = parsePlan(fixturePlanResponse())
  assert.equal(plan.persona_name, 'Konten Komandan')
  assert.equal(plan.skill_plan.length, 7)
  assert.equal(plan.skill_plan[3].kind, 'playbook')
})

test('parsePlan tolerates a markdown fence around the JSON', () => {
  const fenced = '```json\n' + fixturePlanResponse() + '\n```'
  const plan = parsePlan(fenced)
  assert.equal(plan.persona_name, 'Konten Komandan')
})

test('parsePlan throws GenesisGenerationError on garbage', () => {
  assert.throws(() => parsePlan('maaf, aku tidak bisa'), GenesisGenerationError)
})

test('parseSkills rejects a response missing a planned skill', () => {
  const plan = parsePlan(fixturePlanResponse())
  const partial = JSON.stringify({
    shell_skill_md: 'x'.repeat(200),
    skills: [{ id: 'kalender-konten-mingguan', description_id: 'desc panjang cukup', skill_md: 'y'.repeat(300), templates_used: [] }],
  })
  assert.throws(() => parseSkills(partial, plan), /not generated/)
})

test('parseSkills drops hallucinated template refs', async () => {
  const plan = parsePlan(fixturePlanResponse())
  const llm = fixtureLlm()
  const raw = await llm({ system: '', user: '', stage: 'skills' })
  const doctored = raw.replace('"templates_used": ["kalender-konten-mingguan.md"]', '"templates_used": ["kalender-konten-mingguan.md", "fake-template.md"]')
  const skills = parseSkills(doctored, plan)
  const target = skills.skills.find((s) => s.id === 'kalender-konten-mingguan')!
  assert.deepEqual(target.templates_used, ['kalender-konten-mingguan.md'])
})

// ─── end-to-end pipeline + validator ─────────────────────────────────────

test('generatePersona: fixture pipeline produces a persona that PASSES the quality gate', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  assert.equal(persona.slug, `custom-${CID}`)
  assert.equal(persona.manifest.skills.length, 7)
  assert.equal(persona.manifest.templates.length, 5)
  const v = validateGeneratedPersona(persona)
  assert.deepEqual(v, { ok: true }, `validator errors: ${JSON.stringify((v as { errors?: string[] }).errors)}`)
})

test('generated manifest passes the SAME validateManifest as curated bundles', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  const mv = validateManifest(persona.manifest, { allowAgentSlugs: [persona.slug] })
  assert.equal(mv.ok, true)
})

test('custom slugs stay REJECTED by validateManifest without the explicit allowance', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  const mv = validateManifest(persona.manifest)
  assert.equal(mv.ok, false)
})

// ─── validator: brand-voice floor ────────────────────────────────────────

test('validator rejects every banned word in SOUL.md', async () => {
  for (const word of BANNED_WORDS) {
    const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
    persona.soul_md += `\nIni fitur yang ${word} bagus.`
    const v = validateGeneratedPersona(persona)
    assert.equal(v.ok, false, `"${word}" must be rejected`)
    assert.ok((v as { errors: string[] }).errors.some((e) => e.includes(word)))
  }
})

test('validator rejects exclamation marks', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.files[0].content += '\nSemangat ya!'
  const v = validateGeneratedPersona(persona)
  assert.equal(v.ok, false)
})

test('validator rejects "Anda" register', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.soul_md = persona.soul_md.replace('pakai "kamu"', 'melayani Anda dengan baik')
  const v = validateGeneratedPersona(persona)
  assert.equal(v.ok, false)
})

test('validator rejects a thin SOUL', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.soul_md = 'Aku asisten kamu.'
  assert.equal(validateGeneratedPersona(persona).ok, false)
})

test('validator rejects a missing skill file', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.files = persona.files.filter((f) => !f.path.includes('caption-draft'))
  const v = validateGeneratedPersona(persona)
  assert.equal(v.ok, false)
  assert.ok((v as { errors: string[] }).errors.some((e) => e.includes('caption-draft')))
})

test('validator rejects a wrong-slug manifest (tenant mismatch)', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.manifest.agent_slug = 'custom-someone-else'
  assert.equal(validateGeneratedPersona(persona).ok, false)
})

test('validator rejects path traversal in bundle files', async () => {
  const persona = await generatePersona(CID, FIXTURE_PROFILE, fixtureLlm())
  persona.files.push({ path: 'templates/../../etc/passwd', content: 'x'.repeat(100) })
  const v = validateGeneratedPersona(persona)
  assert.equal(v.ok, false)
})
