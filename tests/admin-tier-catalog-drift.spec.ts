/**
 * Drift gate: api/_shared/tier-catalog.ts (Vercel-Functions-side mirror)
 *   ≡ supabase/functions/_shared/tier-personas.ts (Phase A source of truth)
 *   ≡ admin/assets/admin-shared.js TIER_CATALOG (browser-side mirror)
 *
 * Why this exists: the admin form (manual-provision v2) needs
 * tier→personas + tier→setup-fee on both the browser (React-via-CDN
 * page) and the Vercel Function side. Re-importing the Deno-style TS
 * module across runtimes is awkward, so both sides inline a mirror.
 *
 * If a future PR adds a persona to tier-personas.ts but forgets the
 * mirror files, the customer at that tier will silently miss the new
 * persona in the form picker AND the audit row. This test fails loudly
 * before that lands.
 *
 * Also pins the Phase A (2026-05-28) setup-fee + feature values.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TIERS } from '../supabase/functions/_shared/tier-personas.ts'
import { TIER_CATALOG, personasForTier, setupFeeForTier } from '../api/_shared/tier-catalog.ts'

// v1.4 pricing lock (2026-06-09): added bare (99k) + solo (399k) entry
// tiers; reduced voice-starter 699→599 and library-full 899→799.
const SETUP_FEES = {
  bare: 99_000,
  solo: 399_000,
  'voice-starter': 599_000,
  'library-full': 799_000,
  'done-for-you': 1_299_000,
} as const

// All non-enterprise tiers (persona + fee mirror checks). bare has an EMPTY
// persona set, so it is excluded from the index-0 invariant below.
const NON_ENTERPRISE = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you'] as const

test('TIER_CATALOG.personas matches tier-personas.ts TIERS for every tier', () => {
  for (const tier of NON_ENTERPRISE) {
    assert.deepEqual(
      personasForTier(tier),
      TIERS[tier].personas,
      `Drift: api/_shared/tier-catalog.ts personas for "${tier}" diverged from tier-personas.ts.`,
    )
  }
  // Enterprise — both sides custom (null).
  assert.equal(TIER_CATALOG.enterprise.personas, null)
  assert.equal(TIERS.enterprise.personas, null)
})

test('TIER_CATALOG setup fees match the v1.4 lock', () => {
  assert.equal(setupFeeForTier('bare'), SETUP_FEES.bare)
  assert.equal(setupFeeForTier('solo'), SETUP_FEES.solo)
  assert.equal(setupFeeForTier('voice-starter'), SETUP_FEES['voice-starter'])
  assert.equal(setupFeeForTier('library-full'), SETUP_FEES['library-full'])
  assert.equal(setupFeeForTier('done-for-you'), SETUP_FEES['done-for-you'])
  assert.equal(setupFeeForTier('enterprise'), null)
})

test('TIER_CATALOG has the 6 expected tier keys (no drift in shape)', () => {
  assert.deepEqual(
    Object.keys(TIER_CATALOG).sort(),
    ['bare', 'done-for-you', 'enterprise', 'library-full', 'solo', 'voice-starter'],
  )
})

test('bare = empty persona set + no voice; solo = 3 personas + no voice', () => {
  assert.deepEqual(personasForTier('bare'), [])
  assert.equal(TIER_CATALOG.bare.features.voice, false)
  assert.deepEqual(personasForTier('solo'), ['the-pro', 'doc-expert', 'slide-master'])
  assert.equal(TIER_CATALOG.solo.features.voice, false)
})

test('voice-starter persona count = 3', () => {
  assert.equal(personasForTier('voice-starter').length, 3)
})

test('done-for-you persona count = 8 (Pro set)', () => {
  assert.equal(personasForTier('done-for-you').length, 8)
})

test('library-full persona count = 10 (full library)', () => {
  assert.equal(personasForTier('library-full').length, 10)
})

test('the-pro is index-0 in every non-empty tier (default-persona invariant)', () => {
  // bare is intentionally persona-free ([]) — excluded from the lead-with-
  // the-pro invariant.
  for (const tier of NON_ENTERPRISE) {
    const personas = personasForTier(tier)
    if (personas.length === 0) continue
    assert.equal(personas[0], 'the-pro')
  }
})

test('feature flags mirror between tier-catalog and tier-personas', () => {
  for (const tier of ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you', 'enterprise'] as const) {
    assert.deepEqual(
      TIER_CATALOG[tier].features,
      TIERS[tier].features,
      `Drift: features for "${tier}" diverged between mirrors.`,
    )
  }
})

test('deprecated slugs still resolve through the Vercel-side mirror (alias)', () => {
  assert.deepEqual(personasForTier('starter'), personasForTier('voice-starter'))
  assert.deepEqual(personasForTier('pro'), personasForTier('done-for-you'))
  assert.deepEqual(personasForTier('studio'), personasForTier('library-full'))
})

test('admin-shared.js TIER_CATALOG mirrors source of truth (source-grep drift gate)', () => {
  const js = readFileSync(
    new URL('../admin/assets/admin-shared.js', import.meta.url),
    'utf8',
  )
  // Pin the persona-set lines as substring matches. Cheap source-grep that
  // fails if anyone removes or reorders the locked personas.
  assert.ok(
    js.includes("personas: ['the-pro', 'doc-expert', 'slide-master']"),
    'admin-shared.js voice-starter personas changed',
  )
  const flat = js.replace(/\s+/g, ' ')
  // done-for-you / Pro 8-set
  assert.ok(
    flat.includes("'the-pro', 'doc-expert', 'slide-master', 'deep-researcher', 'trade-pro', 'project-conductor', 'video-producer', 'social-conductor',"),
    'admin-shared.js done-for-you Pro persona set diverged from tier-personas.ts',
  )
  // library-full full 10-set boundary personas
  assert.ok(
    flat.includes("'web-app-builder', 'business-agent',"),
    'admin-shared.js library-full full persona set diverged',
  )
  // Setup-fee pins (v1.4 prices).
  assert.ok(js.includes('setup_fee_idr: 99000'), 'bare fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 399000'), 'solo fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 599000'), 'voice-starter fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 799000'), 'library-full fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 1299000'), 'done-for-you fee changed in admin-shared.js')
  // New v1.4 tiers present.
  assert.ok(js.includes("label: 'Bare Agent'"), 'admin-shared.js Bare tier missing')
  assert.ok(js.includes("label: 'Solo Starter'"), 'admin-shared.js Solo tier missing')
  // bare carries an empty persona set.
  assert.ok(/bare['"]?\s*:\s*\{[\s\S]*?personas:\s*\[\s*\]/.test(js), 'admin-shared.js bare must have empty personas')
  // Enterprise present + contact-only.
  assert.ok(js.includes("label: 'Enterprise'"), 'admin-shared.js Enterprise tier missing')
  assert.ok(js.includes('contact_required: true'), 'admin-shared.js Enterprise contact flag missing')
})
