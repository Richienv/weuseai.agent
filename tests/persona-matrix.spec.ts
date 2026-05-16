/**
 * Persona-matrix validation — Item D of the persona-fix workstream
 * (2026-05-17).
 *
 * The persona audit (docs/audits/2026-05-16-persona-system-audit.md)
 * found the advertised 10-persona library was effectively fiction:
 * stub artifacts on two personas, no selection mechanism, bundles never
 * published. Items A/B/C closed those gaps. THIS file is the standing
 * drift gate — it proves, on every CI run, that all 10 personas are
 * real, complete, mutually distinct, pickable, and tier-correct. If a
 * future change re-stubs a persona, drops one from PERSONA_META, or
 * breaks the tier math, this fails loudly with a self-describing name.
 *
 * Pure local validation (disk + tier-personas) — no network, runs in
 * the standard `npm test` suite so CI catches regressions. The deployed
 * per-VPS provision matrix (spin one VPS per persona, confirm bundle
 * install + gateway + persona-voiced auto-greet) is a separate,
 * cost-bearing manual e2e run; this gate catches every source-of-truth
 * failure class BEFORE a VPS is ever spun.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

import {
  TIER_PERSONAS,
  DEFAULT_PERSONA,
  PERSONA_META,
  personasForTier,
} from '../supabase/functions/_shared/tier-personas.ts'

const PACKS = path.join(path.resolve(process.cwd()), 'agent-packs')

// The 10 personas = union of every tier list.
const ALL_PERSONAS = [...new Set(Object.values(TIER_PERSONAS).flat())]

test('persona-matrix: exactly 10 personas, tier counts 3 / 8 / 10', () => {
  assert.equal(ALL_PERSONAS.length, 10, `expected 10 personas, got ${ALL_PERSONAS.length}`)
  assert.equal(personasForTier('starter').length, 3, 'Starter must grant 3 personas')
  assert.equal(personasForTier('pro').length, 8, 'Pro must grant 8 personas')
  assert.equal(personasForTier('studio').length, 10, 'Studio must grant all 10 personas')
})

test('persona-matrix: DEFAULT_PERSONA is index 0 of every tier (first-of-list invariant)', () => {
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    assert.equal(
      personasForTier(tier)[0],
      DEFAULT_PERSONA,
      `${tier}[0] must be the default persona "${DEFAULT_PERSONA}"`,
    )
  }
})

test('persona-matrix: every persona has complete on-disk artifacts (no stubs)', () => {
  for (const slug of ALL_PERSONAS) {
    const dir = path.join(PACKS, slug)
    assert.ok(fs.existsSync(dir), `agent-packs/${slug}/ is missing`)
    for (const file of ['manifest.json', 'SOUL.md', 'SKILL.md']) {
      const fp = path.join(dir, file)
      assert.ok(fs.existsSync(fp), `agent-packs/${slug}/${file} is missing`)
      assert.ok(
        fs.statSync(fp).size > 80,
        `agent-packs/${slug}/${file} is a stub (<80 bytes) — persona is not real`,
      )
    }
    // manifest must be valid JSON.
    const manifestRaw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')
    let manifest: { skills?: unknown[]; templates?: unknown[] }
    try {
      manifest = JSON.parse(manifestRaw)
    } catch (e) {
      assert.fail(`agent-packs/${slug}/manifest.json is not valid JSON: ${String(e)}`)
    }
    // Every file the manifest's skills[] reference must exist on disk.
    for (const skill of (manifest.skills ?? []) as Array<Record<string, unknown>>) {
      const rel = (skill.path ?? skill.file ?? skill.skill_md) as string | undefined
      if (typeof rel === 'string' && rel.length > 0) {
        assert.ok(
          fs.existsSync(path.join(dir, rel)),
          `agent-packs/${slug}/manifest.json references missing skill file "${rel}"`,
        )
      }
    }
  }
})

test('persona-matrix: every persona SOUL.md is mutually distinct (no persona is a copy of another)', () => {
  // The audit’s core fear: customers paying for persona X silently get
  // The Pro. A byte-identical SOUL.md between two personas is exactly
  // that failure surfacing in the source of truth.
  const byHash = new Map<string, string>()
  for (const slug of ALL_PERSONAS) {
    const soul = fs.readFileSync(path.join(PACKS, slug, 'SOUL.md'), 'utf8').trim()
    assert.ok(soul.length > 200, `agent-packs/${slug}/SOUL.md is too thin to be a real persona`)
    const hash = crypto.createHash('sha256').update(soul).digest('hex')
    const clash = byHash.get(hash)
    assert.equal(
      clash,
      undefined,
      `agent-packs/${slug}/SOUL.md is byte-identical to ${clash} — personas must be distinct`,
    )
    byHash.set(hash, slug)
  }
})

test('persona-matrix: every persona is pickable — present in PERSONA_META with name + blurb', () => {
  // PERSONA_META drives the onboarding picker. A persona missing here
  // is granted by the tier but invisible in the UI — unreachable.
  for (const slug of ALL_PERSONAS) {
    const meta = PERSONA_META[slug]
    assert.ok(meta, `${slug} is missing from PERSONA_META — the picker would never list it`)
    assert.ok(
      typeof meta.name === 'string' && meta.name.trim().length > 1,
      `${slug} PERSONA_META.name is empty`,
    )
    assert.ok(
      typeof meta.blurb === 'string' && meta.blurb.trim().length > 10,
      `${slug} PERSONA_META.blurb is empty / too short for a picker card`,
    )
    // Brand voice: no exclamation marks in customer-facing copy.
    assert.equal(meta.blurb.includes('!'), false, `${slug} PERSONA_META.blurb contains "!"`)
  }
})

test('persona-matrix: PERSONA_META has no phantom entries beyond the 10 tier personas', () => {
  for (const slug of Object.keys(PERSONA_META)) {
    assert.ok(
      ALL_PERSONAS.includes(slug),
      `PERSONA_META lists "${slug}" which is not in any tier — the picker would offer an ungrantable persona`,
    )
  }
})
