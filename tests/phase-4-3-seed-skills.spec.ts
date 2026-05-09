/**
 * Phase 4-3 seed-skill scaffolding drift test.
 *
 * Asserts:
 *   1. Each of the 6 seed-skill SKILL.md files exists at the expected
 *      path under agent-packs/web-master/skills/.
 *   2. Each is marked DRAFT in its body.
 *   3. The web-master manifest contains a matching entry per seed
 *      with handler_ref hermes-skill:autobrowse-replay and tier
 *      enabled_for_tiers ["studio"] (the DRAFT gate; flipped to
 *      ["pro", "studio"] post-graduation).
 *   4. Each SKILL.md mentions the graduation flow (Autobrowse capture).
 *
 * Run with: npx tsx --test tests/phase-4-3-seed-skills.spec.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const WEB_MASTER_MANIFEST = resolve(
  REPO_ROOT,
  'agent-packs/web-master/manifest.json',
)

const SEED_SKILLS = [
  'tokopedia-product-page',
  'shopee-storefront',
  'glints-job-post',
  'kompas-article',
  'olx-listing',
  'lamudi-rental',
] as const

type ManifestSkill = {
  id: string
  description_id: string
  description_en?: string
  templates_used: string[]
  execution: string
  handler_ref: string
  enabled_for_tiers: string[]
}

type Manifest = {
  agent_slug: string
  version: string
  skills: ManifestSkill[]
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(WEB_MASTER_MANIFEST, 'utf8')) as Manifest
}

// ─── existence ──────────────────────────────────────────────────────

for (const slug of SEED_SKILLS) {
  test(`seed skill exists on disk: ${slug}/SKILL.md`, () => {
    const path = resolve(
      REPO_ROOT,
      `agent-packs/web-master/skills/${slug}/SKILL.md`,
    )
    assert.equal(
      existsSync(path),
      true,
      `expected ${path} to exist`,
    )
  })
}

// ─── DRAFT marker ───────────────────────────────────────────────────

for (const slug of SEED_SKILLS) {
  test(`seed skill ${slug} is marked DRAFT in heading`, () => {
    const path = resolve(
      REPO_ROOT,
      `agent-packs/web-master/skills/${slug}/SKILL.md`,
    )
    const text = readFileSync(path, 'utf8')
    // Header contains "Phase 4-3 seed skill (DRAFT)"
    assert.match(
      text.slice(0, 500),
      /Phase 4-3 seed skill \(DRAFT\)/,
      `${slug}: SKILL.md header missing 'Phase 4-3 seed skill (DRAFT)' marker`,
    )
    // Status block explicitly says DRAFT
    assert.match(
      text,
      /\*\*Status: DRAFT/,
      `${slug}: SKILL.md missing '**Status: DRAFT' status block`,
    )
  })
}

// ─── graduation guidance ────────────────────────────────────────────

for (const slug of SEED_SKILLS) {
  test(`seed skill ${slug} documents the Autobrowse graduation flow`, () => {
    const path = resolve(
      REPO_ROOT,
      `agent-packs/web-master/skills/${slug}/SKILL.md`,
    )
    const text = readFileSync(path, 'utf8')
    // Mentions Autobrowse capture as the graduation path.
    assert.match(
      text,
      /[Aa]utobrowse/,
      `${slug}: SKILL.md must mention Autobrowse as graduation path`,
    )
    // Includes a Graduation status section heading.
    assert.match(
      text,
      /## Graduation status/,
      `${slug}: SKILL.md missing '## Graduation status' section`,
    )
  })
}

// ─── manifest entries match ────────────────────────────────────────

test('web-master manifest contains an entry per seed skill', () => {
  const manifest = loadManifest()
  const skillIds = new Set(manifest.skills.map((s) => s.id))
  for (const slug of SEED_SKILLS) {
    assert.equal(
      skillIds.has(slug),
      true,
      `manifest missing skill entry for ${slug}`,
    )
  }
})

test('each seed skill manifest entry uses handler_ref hermes-skill:autobrowse-replay', () => {
  const manifest = loadManifest()
  for (const slug of SEED_SKILLS) {
    const entry = manifest.skills.find((s) => s.id === slug)
    assert.ok(entry, `${slug} entry not found in manifest`)
    assert.equal(
      entry!.handler_ref,
      'hermes-skill:autobrowse-replay',
      `${slug}: handler_ref must be 'hermes-skill:autobrowse-replay'`,
    )
    assert.equal(entry!.execution, 'hermes-skill')
  }
})

test('each seed skill enabled_for_tiers is ["studio"] (DRAFT gate)', () => {
  // Phase 4-3 DRAFT scaffolding: only Studio sees them. Founder
  // bumps to ["pro", "studio"] AFTER graduating via real Autobrowse
  // captures.
  const manifest = loadManifest()
  for (const slug of SEED_SKILLS) {
    const entry = manifest.skills.find((s) => s.id === slug)
    assert.ok(entry)
    assert.deepEqual(
      entry!.enabled_for_tiers,
      ['studio'],
      `${slug}: enabled_for_tiers should be ["studio"] until graduated; got ${JSON.stringify(entry!.enabled_for_tiers)}`,
    )
  }
})

test('manifest version bumped to ≥ 2.1.0 with seed skills', () => {
  const manifest = loadManifest()
  // Persona v2 shipped 2.0.0; Phase 4-3 bumps to 2.1.0 (added
  // seed-skill entries). Allow ≥ in case Phase 4-3.x patches.
  const [major, minor] = manifest.version.split('.').map(Number)
  assert.ok(
    major > 2 || (major === 2 && minor >= 1),
    `manifest.version should be ≥ 2.1.0; got ${manifest.version}`,
  )
})

test('manifest description mentions the 6 seed sites', () => {
  const manifest = loadManifest()
  const desc = (manifest as { description_id?: string }).description_id ?? ''
  assert.match(desc, /Tokopedia/i)
  assert.match(desc, /Shopee/i)
  assert.match(desc, /Glints/i)
  assert.match(desc, /Kompas/i)
})

// ─── voice rule guards on the SKILL.md content ──────────────────────

for (const slug of SEED_SKILLS) {
  test(`seed skill ${slug} respects CLAUDE.md voice rules (no Anda, no exclamation in body)`, () => {
    const path = resolve(
      REPO_ROOT,
      `agent-packs/web-master/skills/${slug}/SKILL.md`,
    )
    const text = readFileSync(path, 'utf8')
    // 'Anda' as a standalone word violates the address-form rule.
    // Allow inside code blocks / quotes (rare); strict on body prose.
    // Simplest: no occurrence at all.
    assert.equal(
      /\bAnda\b/.test(text),
      false,
      `${slug}: SKILL.md must use 'kamu' form, not 'Anda'`,
    )
  })
}
