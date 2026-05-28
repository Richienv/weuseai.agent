/**
 * Drift gate: api/_shared/tier-catalog.ts (Vercel-Functions-side mirror)
 *   ≡ supabase/functions/_shared/tier-personas.ts (D1 lock 2026-05-12, source of truth)
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
 * Also pins the v1.2 setup-fee values from CLAUDE.md.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TIER_PERSONAS } from '../supabase/functions/_shared/tier-personas.ts'
import { TIER_CATALOG, personasForTier, setupFeeForTier } from '../api/_shared/tier-catalog.ts'

const SETUP_FEES_V12 = {
  starter: 399_000,
  pro: 1_290_000,
  studio: 5_900_000,
} as const

test('TIER_CATALOG.personas matches TIER_PERSONAS for every tier', () => {
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    assert.deepEqual(
      personasForTier(tier),
      TIER_PERSONAS[tier],
      `Drift: api/_shared/tier-catalog.ts personas for "${tier}" diverged from supabase/functions/_shared/tier-personas.ts.`,
    )
  }
})

test('TIER_CATALOG setup fees match CLAUDE.md v1.2 lock', () => {
  assert.equal(setupFeeForTier('starter'), SETUP_FEES_V12.starter)
  assert.equal(setupFeeForTier('pro'), SETUP_FEES_V12.pro)
  assert.equal(setupFeeForTier('studio'), SETUP_FEES_V12.studio)
})

test('TIER_CATALOG has the 3 expected tier keys (no drift in shape)', () => {
  assert.deepEqual(Object.keys(TIER_CATALOG).sort(), ['pro', 'starter', 'studio'])
})

test('Starter persona count = 3 (NOT 1 from any consult mis-spec)', () => {
  assert.equal(personasForTier('starter').length, 3)
})

test('Pro persona count = 8 (NOT 5 from any consult mis-spec)', () => {
  assert.equal(personasForTier('pro').length, 8)
})

test('Studio persona count = 10', () => {
  assert.equal(personasForTier('studio').length, 10)
})

test('the-pro is index-0 in every tier (default-persona invariant)', () => {
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    assert.equal(personasForTier(tier)[0], 'the-pro')
  }
})

test('admin-shared.js TIER_CATALOG mirrors source of truth (source-grep drift gate)', () => {
  const js = readFileSync(
    new URL('../admin/assets/admin-shared.js', import.meta.url),
    'utf8',
  )
  // Pin the three persona-count lines as substring matches. Cheap source-
  // grep that fails if anyone removes or reorders the locked personas.
  assert.ok(
    js.includes("personas: ['the-pro', 'doc-expert', 'slide-master']"),
    'admin-shared.js Starter personas changed',
  )
  // Pro line spans multiple lines in the source; normalize whitespace.
  const flat = js.replace(/\s+/g, ' ')
  assert.ok(
    flat.includes("'the-pro', 'doc-expert', 'slide-master', 'deep-researcher', 'trade-pro', 'project-conductor', 'video-producer', 'social-conductor'"),
    'admin-shared.js Pro persona set diverged from tier-personas.ts',
  )
  // Setup-fee pins.
  assert.ok(js.includes('setup_fee_idr: 399000'), 'Starter fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 1290000'), 'Pro fee changed in admin-shared.js')
  assert.ok(js.includes('setup_fee_idr: 5900000'), 'Studio fee changed in admin-shared.js')
})
