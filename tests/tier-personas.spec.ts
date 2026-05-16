/**
 * Tier → personas mapping (founder D1 lock 2026-05-12).
 *
 * Single source of truth for which personas a customer at each tier
 * receives. Consumed by:
 *   - bundle-pull-script.ts (loops over the slug list at boot)
 *   - setup-script.ts (writes WEUSEAI_AGENT_SLUGS=<csv> to .env)
 *   - bundle-version-bump-broadcast (filters which customers get
 *     pinged when a persona ships an update)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIER_PERSONAS,
  personasForTier,
  DEFAULT_PERSONA,
} from '../supabase/functions/_shared/tier-personas.ts'
import { KNOWN_PERSONA_SLUGS } from '../supabase/functions/_shared/manifest-validator.ts'

// ─── shape pins ─────────────────────────────────────────────────────────

test('Starter gets 3 personas: the-pro, doc-expert, slide-master', () => {
  assert.deepEqual(TIER_PERSONAS.starter, ['the-pro', 'doc-expert', 'slide-master'])
})

test('Pro gets 8 personas: Starter + 5', () => {
  assert.deepEqual(TIER_PERSONAS.pro, [
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

test('Studio gets 10 personas: Pro + web-app-builder + business-agent', () => {
  assert.deepEqual(TIER_PERSONAS.studio, [
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

// ─── invariants ─────────────────────────────────────────────────────────

test('Each tier list is a superset of the lower tier (graceful upgrade)', () => {
  const starter = new Set(TIER_PERSONAS.starter)
  const pro = new Set(TIER_PERSONAS.pro)
  const studio = new Set(TIER_PERSONAS.studio)
  for (const s of starter) assert.ok(pro.has(s), `Pro is missing Starter persona "${s}"`)
  for (const s of pro) assert.ok(studio.has(s), `Studio is missing Pro persona "${s}"`)
})

test('Every persona in every tier is in KNOWN_PERSONA_SLUGS', () => {
  const known = new Set(KNOWN_PERSONA_SLUGS as readonly string[])
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    for (const slug of TIER_PERSONAS[tier]) {
      assert.ok(known.has(slug), `tier "${tier}" lists unknown persona "${slug}"`)
    }
  }
})

test('Studio covers all 10 KNOWN_PERSONA_SLUGS (full library at top tier)', () => {
  assert.equal(TIER_PERSONAS.studio.length, KNOWN_PERSONA_SLUGS.length)
  const studio = new Set(TIER_PERSONAS.studio)
  for (const slug of KNOWN_PERSONA_SLUGS) {
    assert.ok(studio.has(slug), `Studio missing known persona "${slug}"`)
  }
})

test('DEFAULT_PERSONA is the-pro (D2 lock)', () => {
  assert.equal(DEFAULT_PERSONA, 'the-pro')
})

test('DEFAULT_PERSONA appears at index 0 in every tier list (first-of-list invariant)', () => {
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    assert.equal(TIER_PERSONAS[tier][0], DEFAULT_PERSONA, `tier "${tier}" does not lead with default persona`)
  }
})

// ─── helper ────────────────────────────────────────────────────────────

test('personasForTier(tier) returns the same as TIER_PERSONAS[tier]', () => {
  assert.deepEqual(personasForTier('starter'), TIER_PERSONAS.starter)
  assert.deepEqual(personasForTier('pro'), TIER_PERSONAS.pro)
  assert.deepEqual(personasForTier('studio'), TIER_PERSONAS.studio)
})

test('personasForTier rejects unknown tier (defensive)', () => {
  assert.throws(() => personasForTier('enterprise' as unknown as 'starter'), /unknown tier/i)
})

// ─── persona picker metadata (2026-05-17) ───────────────────────────

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
