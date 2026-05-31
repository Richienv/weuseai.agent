/**
 * Tier → personas mapping (Phase A feature-bundle restructure 2026-05-28).
 *
 * Single source of truth for which personas a customer at each tier
 * receives. Consumed by:
 *   - bundle-pull-script.ts (loops over the slug list at boot)
 *   - setup-script.ts (writes WEUSEAI_AGENT_SLUGS=<csv> to .env)
 *   - bundle-version-bump-broadcast (filters which customers get
 *     pinged when a persona ships an update)
 *
 * Phase A: the count-based 3-tier ladder (starter/pro/studio) became a
 * 4-tier feature matrix (voice-starter / library-full / done-for-you /
 * enterprise). Old slugs are DEPRECATED ALIASES that still resolve.
 *
 * The old "each tier is a superset of the lower tier" linear-ladder
 * invariant NO LONGER HOLDS — library-full carries MORE personas than the
 * pricier done-for-you. The invariants below assert the feature-matrix
 * shape instead.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIERS,
  TIER_PERSONAS,
  personasForTier,
  resolveTier,
  DEFAULT_PERSONA,
} from '../supabase/functions/_shared/tier-personas.ts'
import { KNOWN_PERSONA_SLUGS } from '../supabase/functions/_shared/manifest-validator.ts'

// ─── shape pins ─────────────────────────────────────────────────────────

test('voice-starter gets 3 personas: the-pro, doc-expert, slide-master', () => {
  assert.deepEqual(TIERS['voice-starter'].personas, [
    'the-pro',
    'doc-expert',
    'slide-master',
  ])
})

test('done-for-you gets the 8-persona Pro set', () => {
  assert.deepEqual(TIERS['done-for-you'].personas, [
    'the-pro',
    'doc-expert',
    'slide-master',
    'deep-researcher',
    'trade-pro',
    'project-conductor',
    'video-producer',
    'social-conductor',
  ])
})

test('library-full gets the full 10-persona library', () => {
  assert.deepEqual(TIERS['library-full'].personas, [
    'the-pro',
    'doc-expert',
    'slide-master',
    'deep-researcher',
    'trade-pro',
    'project-conductor',
    'video-producer',
    'social-conductor',
    'web-app-builder',
    'business-agent',
  ])
})

test('enterprise personas is null (custom — no fixed roster)', () => {
  assert.equal(TIERS.enterprise.personas, null)
})

// ─── fee + feature pins ─────────────────────────────────────────────────

test('tier fees match the Phase A structure', () => {
  assert.equal(TIERS['voice-starter'].setup_fee_idr, 699_000)
  assert.equal(TIERS['library-full'].setup_fee_idr, 899_000)
  assert.equal(TIERS['done-for-you'].setup_fee_idr, 1_299_000)
  assert.equal(TIERS.enterprise.setup_fee_idr, null)
  for (const t of ['voice-starter', 'library-full', 'done-for-you'] as const) {
    assert.equal(TIERS[t].monthly_fee_idr, 99_000)
  }
  assert.equal(TIERS.enterprise.monthly_fee_idr, null)
})

test('tier features flags match the Phase A structure', () => {
  assert.deepEqual(TIERS['voice-starter'].features, { voice: true, web_app: false, custom_build: false })
  assert.deepEqual(TIERS['library-full'].features, { voice: true, web_app: false, custom_build: false })
  assert.deepEqual(TIERS['done-for-you'].features, { voice: true, web_app: true, custom_build: false })
  assert.deepEqual(TIERS.enterprise.features, { voice: true, web_app: true, custom_build: true })
})

test('only enterprise requires contact (sales flow)', () => {
  assert.equal(TIERS['voice-starter'].contact_required, false)
  assert.equal(TIERS['library-full'].contact_required, false)
  assert.equal(TIERS['done-for-you'].contact_required, false)
  assert.equal(TIERS.enterprise.contact_required, true)
})

// ─── invariants ─────────────────────────────────────────────────────────

test('the-pro is at index 0 in every non-null persona list (first-of-list invariant)', () => {
  for (const slug of Object.keys(TIERS) as Array<keyof typeof TIERS>) {
    const personas = TIERS[slug].personas
    if (personas === null) continue // enterprise — custom, no fixed list
    assert.equal(personas[0], DEFAULT_PERSONA, `tier "${slug}" does not lead with default persona`)
  }
})

test('every persona in every non-null tier is in KNOWN_PERSONA_SLUGS', () => {
  const known = new Set(KNOWN_PERSONA_SLUGS as readonly string[])
  for (const slug of Object.keys(TIERS) as Array<keyof typeof TIERS>) {
    const personas = TIERS[slug].personas
    if (personas === null) continue
    for (const p of personas) {
      assert.ok(known.has(p), `tier "${slug}" lists unknown persona "${p}"`)
    }
  }
})

test('library-full === the full KNOWN_PERSONA_SLUGS library (all 10)', () => {
  const personas = TIERS['library-full'].personas!
  assert.equal(personas.length, KNOWN_PERSONA_SLUGS.length)
  const set = new Set(personas)
  for (const slug of KNOWN_PERSONA_SLUGS) {
    assert.ok(set.has(slug), `library-full missing known persona "${slug}"`)
  }
})

test('done-for-you === the 8-persona Pro set (NOT a superset of library-full)', () => {
  assert.equal(TIERS['done-for-you'].personas!.length, 8)
  // Feature matrix, not a ladder: library-full (10) carries MORE personas
  // than the pricier done-for-you (8).
  assert.ok(
    TIERS['library-full'].personas!.length > TIERS['done-for-you'].personas!.length,
    'library-full should carry more personas than done-for-you (feature matrix, not ladder)',
  )
})

test('voice-starter === the 3-persona set', () => {
  assert.equal(TIERS['voice-starter'].personas!.length, 3)
})

test('DEFAULT_PERSONA is the-pro (D2 lock)', () => {
  assert.equal(DEFAULT_PERSONA, 'the-pro')
})

test('TIER_PERSONAS map mirrors TIERS for the non-custom tiers', () => {
  for (const slug of ['voice-starter', 'library-full', 'done-for-you'] as const) {
    assert.deepEqual(TIER_PERSONAS[slug], TIERS[slug].personas)
  }
})

// ─── personasForTier resolver ────────────────────────────────────────────

test('personasForTier(new slug) returns the tier persona list', () => {
  assert.deepEqual(personasForTier('voice-starter'), TIERS['voice-starter'].personas)
  assert.deepEqual(personasForTier('library-full'), TIERS['library-full'].personas)
  assert.deepEqual(personasForTier('done-for-you'), TIERS['done-for-you'].personas)
})

test('personasForTier(enterprise) returns the full library (most permissive)', () => {
  assert.deepEqual(personasForTier('enterprise'), TIERS['library-full'].personas)
})

test('personasForTier rejects a genuinely-unknown tier (defensive)', () => {
  assert.throws(() => personasForTier('platinum-deluxe'), /unknown tier/i)
})

// ─── deprecated-slug alias resolution (expand-then-contract) ─────────────
//
// CORRECTED, persona-set-consistent mapping:
//   starter (3) → voice-starter (3)
//   pro     (8) → done-for-you  (8 Pro set)
//   studio  (10)→ library-full  (10 full library)

test('resolveTier maps old slugs to the persona-consistent new slugs', () => {
  assert.equal(resolveTier('starter'), 'voice-starter')
  assert.equal(resolveTier('pro'), 'done-for-you')
  assert.equal(resolveTier('studio'), 'library-full')
})

test('resolveTier is identity on canonical new slugs', () => {
  for (const slug of ['voice-starter', 'library-full', 'done-for-you', 'enterprise'] as const) {
    assert.equal(resolveTier(slug), slug)
  }
})

test('old slugs resolve via alias to the persona-correct new tier', () => {
  assert.deepEqual(personasForTier('starter'), personasForTier('voice-starter'))
  assert.deepEqual(personasForTier('pro'), personasForTier('done-for-you'))
  assert.deepEqual(personasForTier('studio'), personasForTier('library-full'))
})

// ─── persona picker metadata (2026-05-17) ───────────────────────

import { PERSONA_META } from '../supabase/functions/_shared/tier-personas.ts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

test('PERSONA_META covers every persona slug in the library', () => {
  for (const slug of KNOWN_PERSONA_SLUGS) {
    const meta = PERSONA_META[slug]
    assert.ok(meta, `PERSONA_META missing entry for "${slug}"`)
    assert.ok(meta.name.length > 0, `${slug}: empty display name`)
    assert.ok(meta.blurb.length > 0, `${slug}: empty blurb`)
  }
  // No stray slugs beyond the library.
  for (const slug of Object.keys(PERSONA_META)) {
    assert.ok(
      (KNOWN_PERSONA_SLUGS as readonly string[]).includes(slug),
      `PERSONA_META has unknown slug "${slug}"`,
    )
  }
})

test('PERSONA_META blurbs follow brand voice (no exclamation, no banned words)', () => {
  const banned = [
    'basically', 'just', 'literally', 'honestly', 'revolutionary',
    'disrupt', '10x', 'game-changer', 'next-level',
  ]
  for (const slug of Object.keys(PERSONA_META)) {
    const blurb = PERSONA_META[slug].blurb
    assert.ok(!blurb.includes('!'), `${slug}: blurb has an exclamation mark`)
    for (const w of banned) {
      assert.ok(
        !blurb.toLowerCase().includes(w),
        `${slug}: blurb uses banned word "${w}"`,
      )
    }
  }
})

test('onboarding.html mirrors PERSONA_META + TIER_PERSONAS (drift gate)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const html = fs.readFileSync(path.join(here, '..', 'onboarding.html'), 'utf8')
  // Every slug + display name must appear in the static page's mirror.
  for (const slug of KNOWN_PERSONA_SLUGS) {
    assert.ok(html.includes(`'${slug}'`), `onboarding.html missing slug "${slug}"`)
    assert.ok(
      html.includes(PERSONA_META[slug].name),
      `onboarding.html missing display name for "${slug}"`,
    )
  }
  // The tier lists must be present (spot-check the boundary personas).
  assert.ok(html.includes("DEFAULT_PERSONA = 'the-pro'"), 'default persona mirror')
})
