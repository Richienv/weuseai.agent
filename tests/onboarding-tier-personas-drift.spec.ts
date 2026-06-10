/**
 * Drift gate: onboarding.html TIER_PERSONAS (browser-side mirror)
 *   ≡ supabase/functions/_shared/tier-personas.ts (source of truth)
 *
 * Why this exists: onboarding.html is a static page that can't import the
 * Deno TS module, so it inlines a TIER_PERSONAS map to render the persona
 * picker. The v1.4 pricing PR (#226) added the canonical tier slugs to
 * tier-personas.ts but the onboarding mirror was left on the old
 * starter/pro/studio keys — so every library-full / done-for-you / bare
 * customer was mis-served at the persona step (fetchTier rejected the
 * canonical slug and fell back to 'starter'). This gate pins the mirror so
 * that regression can't recur silently.
 *
 * Faithful check: it slices the actual `const _SET_* / const TIER_PERSONAS`
 * block out of onboarding.html and evaluates it, then deepEquals each tier
 * against personasForTier(). No substring fragility.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { personasForTier } from '../supabase/functions/_shared/tier-personas.ts'

function extractOnboardingTierPersonas(): Record<string, string[]> {
  const html = readFileSync(new URL('../onboarding.html', import.meta.url), 'utf8')
  const start = html.indexOf('const _SET_3')
  assert.ok(start !== -1, 'onboarding.html: could not find the _SET_3 persona-set definition')
  // Grab through the end of the TIER_PERSONAS object literal.
  const tpIdx = html.indexOf('const TIER_PERSONAS', start)
  assert.ok(tpIdx !== -1, 'onboarding.html: could not find TIER_PERSONAS')
  const closeIdx = html.indexOf('};', tpIdx)
  assert.ok(closeIdx !== -1, 'onboarding.html: could not find TIER_PERSONAS close')
  const block = html.slice(start, closeIdx + 2)
  // Evaluate the sliced block in isolation and return the map.
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${block}\nreturn TIER_PERSONAS;`)
  return fn() as Record<string, string[]>
}

const ONBOARDING = extractOnboardingTierPersonas()

// All slugs onboarding must serve: v1.4 canonical (non-enterprise) + the
// deprecated aliases the live checkout still emits.
const SLUGS = [
  'bare', 'solo', 'voice-starter', 'library-full', 'done-for-you',
  'starter', 'pro', 'studio',
] as const

test('onboarding.html TIER_PERSONAS covers every v1.4 + legacy tier slug', () => {
  for (const slug of SLUGS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ONBOARDING, slug),
      `onboarding.html TIER_PERSONAS missing "${slug}" — picker would fall back to starter`,
    )
  }
})

test('onboarding.html persona lists match tier-personas.ts exactly', () => {
  for (const slug of SLUGS) {
    assert.deepEqual(
      ONBOARDING[slug],
      [...personasForTier(slug)],
      `Drift: onboarding.html personas for "${slug}" diverged from tier-personas.ts`,
    )
  }
})

test('onboarding.html bare tier is persona-free (empty picker)', () => {
  assert.deepEqual(ONBOARDING.bare, [])
})

test('onboarding.html fetchTier accepts any slug present in TIER_PERSONAS', () => {
  // The fetchTier gate must key off TIER_PERSONAS membership, not a frozen
  // starter/pro/studio allowlist (the original bug). Pin that shape.
  const html = readFileSync(new URL('../onboarding.html', import.meta.url), 'utf8')
  assert.ok(
    html.includes('Object.prototype.hasOwnProperty.call(TIER_PERSONAS, t)'),
    'fetchTier must accept any tier present in TIER_PERSONAS (canonical + legacy)',
  )
})
