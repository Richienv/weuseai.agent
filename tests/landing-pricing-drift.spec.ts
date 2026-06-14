/**
 * Drift gate: assets/app.jsx Pricing section ≡ the locked tier catalog in
 * supabase/functions/_shared/tier-personas.ts (TIERS).
 *
 * Why this exists: the landing pricing cards inline their own numeric
 * setup fees (the React-via-CDN page can't import the Deno-style TS
 * module). Two LIVE customer-facing bugs slipped through before this gate
 * existed:
 *   1. Bare Agent showed setupIdr 249_000 — the catalog charges 99_000.
 *   2. Solo Starter (slug 'solo', 399_000) was MISSING from the landing
 *      pricing array entirely.
 *
 * This test pins every sellable tier's setup fee to the catalog so the
 * landing can never silently drift from what we actually charge. If a
 * future PR changes a fee in tier-personas.ts without updating app.jsx
 * (or vice-versa), this fails loudly with a self-documenting message.
 *
 * Source-of-truth precedence: tier-personas.ts is canonical. app.jsx must
 * mirror it. Mismatch = fix app.jsx, not this test.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TIERS } from '../supabase/functions/_shared/tier-personas.ts'

const appJsx = readFileSync(new URL('../assets/app.jsx', import.meta.url), 'utf8')

// Every self-serve, fixed-price tier shown on the landing pricing grid.
// enterprise is contact-only (no fixed fee) and rendered as a separate
// card — excluded from the numeric-fee drift checks.
const SELLABLE_TIERS = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you'] as const

/** id-ID grouped form, e.g. 599000 → "599.000" / 1299000 → "1.299.000". */
const idGrouped = (n: number) => n.toLocaleString('id-ID')

/** Underscore-grouped numeric-literal form as written in app.jsx source,
 *  e.g. 599000 → "599_000" / 1299000 → "1_299_000". */
const underscoreGrouped = (n: number) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_')

test('every sellable tier setup fee in app.jsx matches tier-personas.ts TIERS', () => {
  for (const tier of SELLABLE_TIERS) {
    const fee = TIERS[tier].setup_fee_idr
    assert.ok(fee != null, `tier-personas.ts has no setup_fee_idr for "${tier}"`)

    // The card object inlines the fee as a numeric literal: `setupIdr: 99_000`.
    // This is the load-bearing value the PriceBreakdownModal computes from.
    const literal = `setupIdr: ${underscoreGrouped(fee)}`
    assert.ok(
      appJsx.includes(literal),
      `Drift: app.jsx is missing "${literal}" for tier "${tier}" — ` +
        `the landing setup fee diverged from tier-personas.ts (${idGrouped(fee)}).`,
    )
  }
})

test('app.jsx does NOT carry the old (wrong) Bare Agent 249_000 setup fee', () => {
  // Regression pin for live bug #1 — Bare charged 249k on the landing while
  // the catalog charges 99k. Both the numeric literal and the derived month-1
  // total (249 + 99 = 348rb) must be gone.
  assert.ok(!appJsx.includes('setupIdr: 249_000'), 'Bare Agent stale 249_000 setup fee resurfaced')
  assert.ok(!appJsx.includes('Rp 348rb'), 'Bare Agent stale month1Total (Rp 348rb) resurfaced')
})

test('Bare Agent shows the correct 99rb setup + 198rb month-1 total', () => {
  assert.ok(appJsx.includes('setupIdr: 99_000'), 'Bare Agent setupIdr 99_000 missing')
  assert.ok(appJsx.includes("priceLabel: 'Rp 99rb'"), 'Bare Agent priceLabel Rp 99rb missing')
  assert.ok(appJsx.includes("month1Total: 'Rp 198rb'"), 'Bare Agent month1Total Rp 198rb (99 setup + 99 hosting) missing')
})

test('Solo Starter tier is present on the landing (name + slug + 399_000 fee)', () => {
  // Regression pin for live bug #2 — the entire Solo tier was absent.
  assert.ok(appJsx.includes("name: 'Solo Starter'"), 'Solo Starter tier name missing from app.jsx pricing array')
  assert.ok(appJsx.includes("slug: 'solo'"), "Solo Starter slug 'solo' missing from app.jsx pricing array")
  assert.ok(appJsx.includes('setupIdr: 399_000'), 'Solo Starter setupIdr 399_000 missing')
  assert.ok(appJsx.includes("priceLabel: 'Rp 399rb'"), 'Solo Starter priceLabel Rp 399rb missing')
})

test('every sellable tier slug appears in app.jsx (no tier dropped)', () => {
  for (const tier of SELLABLE_TIERS) {
    assert.ok(
      appJsx.includes(`slug: '${tier}'`),
      `Drift: app.jsx pricing array is missing tier card slug '${tier}'.`,
    )
  }
})

test('the canonical id-ID grouped fee strings round-trip from the catalog', () => {
  // Sanity pin on the grouped representation the PriceBreakdownModal renders
  // at runtime via setupIdr.toLocaleString('id-ID'). Asserts the expected
  // human-facing strings stay stable: 99.000 / 399.000 / 599.000 / 799.000 /
  // 1.299.000 (and the 999.000 library-full anchor).
  assert.equal(idGrouped(TIERS.bare.setup_fee_idr as number), '99.000')
  assert.equal(idGrouped(TIERS.solo.setup_fee_idr as number), '399.000')
  assert.equal(idGrouped(TIERS['voice-starter'].setup_fee_idr as number), '599.000')
  assert.equal(idGrouped(TIERS['library-full'].setup_fee_idr as number), '799.000')
  assert.equal(idGrouped(TIERS['library-full'].setup_fee_anchor_idr as number), '999.000')
  assert.equal(idGrouped(TIERS['done-for-you'].setup_fee_idr as number), '1.299.000')
})
