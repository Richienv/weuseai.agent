/**
 * Drift gate: onboarding-new.html (the tarot redesign) must offer the FULL
 * persona set a tier grants — not a curated subset.
 *
 * Why this exists: the redesign originally hard-coded persona selection to a
 * 4-slug DETAIL_SLUG array + a 6-card tarot map (4 distinct slugs), so 6 of
 * the 10 library personas (slide-master, deep-researcher, trade-pro,
 * project-conductor, video-producer, web-app-builder) were UNREACHABLE for
 * the library-full / done-for-you customers who pay for them. The existing
 * TIER_PERSONAS mirror gate cannot catch that — the mirror can be correct
 * while the picker still renders a subset. This gate pins the "Option A" fix:
 * the detail-mode picker renders personasForTier(tier), and PERSONA_META
 * carries a friendly name for every canonical slug.
 *
 * When onboarding-new.html is promoted to onboarding.html, repoint FILE below.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { personasForTier } from '../supabase/functions/_shared/tier-personas.ts'

const FILE = '../onboarding-new.html'
const html = readFileSync(new URL(FILE, import.meta.url), 'utf8')

/** Slice + eval the inlined TIER_PERSONAS mirror (same technique as the
 *  onboarding.html drift gate). */
function extractTierPersonas(): Record<string, string[]> {
  const start = html.indexOf('const _SET_3')
  assert.ok(start !== -1, `${FILE}: could not find _SET_3`)
  const tpIdx = html.indexOf('const TIER_PERSONAS', start)
  const closeIdx = html.indexOf('};', tpIdx)
  assert.ok(tpIdx !== -1 && closeIdx !== -1, `${FILE}: could not find TIER_PERSONAS`)
  const block = html.slice(start, closeIdx + 2)
  // eslint-disable-next-line no-new-func
  return new Function(`${block}\nreturn TIER_PERSONAS;`)() as Record<string, string[]>
}

const TP = extractTierPersonas()
const SLUGS = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you', 'starter', 'pro', 'studio'] as const
const ALL_TEN = [...personasForTier('library-full')]

test('TIER_PERSONAS mirror matches tier-personas.ts for every tier', () => {
  for (const slug of SLUGS) {
    assert.deepEqual(TP[slug], [...personasForTier(slug)], `Drift for "${slug}"`)
  }
})

test('PERSONA_META carries a display name for every canonical persona slug', () => {
  // The full-tier picker looks each granted slug up in PERSONA_META; a missing
  // entry would render the raw slug (e.g. "web-app-builder") to the customer.
  const start = html.indexOf('const PERSONA_META')
  assert.ok(start !== -1, `${FILE}: PERSONA_META not found`)
  const block = html.slice(start, html.indexOf('};', start) + 2)
  for (const slug of ALL_TEN) {
    assert.ok(block.includes(`'${slug}'`), `PERSONA_META missing "${slug}" — full-tier picker would show a raw slug`)
  }
})

test('detail-mode picker renders the tier-granted set, not a fixed subset', () => {
  // Pins the Option A fix: the persona list is built from `granted`
  // (personasForTier), so every persona a tier grants is selectable.
  assert.ok(
    /\(\s*personaFree\s*\?\s*\[\]\s*:\s*granted\s*\)\.map/.test(html),
    'persona picker must map over `granted` (the full tier set)',
  )
  // The submitted slug must come from the granted set by index.
  assert.ok(
    html.includes('slug = granted[this.state.persona]'),
    'finish() must submit granted[persona], not a curated slug array',
  )
})

test('the collapsed 4-slug DETAIL_SLUG array is gone (regression pin)', () => {
  assert.ok(!html.includes('DETAIL_SLUG'), 'DETAIL_SLUG resurfaced — persona breadth would collapse to 4 slugs')
})

test('template mode offers a "Lihat semua persona" path to the full set', () => {
  assert.ok(html.includes('Lihat semua'), 'the "Lihat semua persona" affordance is missing from template mode')
  assert.ok(html.includes('personaCount'), 'personaCount (the tier persona count) is not surfaced')
})

test('fetchTier accepts any slug present in TIER_PERSONAS (canonical + legacy)', () => {
  assert.ok(
    html.includes('Object.prototype.hasOwnProperty.call(TIER_PERSONAS, t)'),
    'fetchTier must key off TIER_PERSONAS membership',
  )
})
