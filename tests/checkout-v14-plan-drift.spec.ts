/**
 * Drift gate for the v1.4 checkout chain (2026-06-09 redesign).
 *
 * The "Paket tidak dikenali" / invalid_plan bug was a slug+price mismatch
 * across three layers: the v1.4 catalog (tier-personas.ts), the server plan
 * catalog (types.ts PLANS, which create-invoice charges from), and the client
 * checkout.html. This pins all three so they can't drift apart again.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TIERS } from '../supabase/functions/_shared/tier-personas.ts'
import { PLANS } from '../supabase/functions/_shared/types.ts'

const SELLABLE = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you'] as const

test('server PLANS setup price matches the v1.4 catalog for every sellable tier', () => {
  for (const slug of SELLABLE) {
    assert.ok(slug in PLANS, `server PLANS missing "${slug}"`)
    assert.equal(
      PLANS[slug].setupIdr,
      TIERS[slug].setup_fee_idr,
      `server PLANS["${slug}"].setupIdr drifted from tier-personas TIERS`,
    )
  }
})

test('only library-full carries the 999k strikethrough anchor (display only)', () => {
  assert.equal(PLANS['library-full'].setupOldIdr, 999_000)
  assert.equal(PLANS['library-full'].setupOldIdr, TIERS['library-full'].setup_fee_anchor_idr)
  // Non-anchor tiers: setupOldIdr === setupIdr (no fake anchor).
  for (const slug of ['bare', 'solo', 'voice-starter', 'done-for-you'] as const) {
    assert.equal(PLANS[slug].setupOldIdr, PLANS[slug].setupIdr, `"${slug}" must not carry a fake anchor`)
  }
})

test('create-invoice resolves the deprecated slugs to canonical (no invalid_plan on old links)', () => {
  const src = readFileSync(new URL('../supabase/functions/_shared/create-invoice-handler.ts', import.meta.url), 'utf8')
  // The legacy alias must be present so /checkout?plan=pro etc. still resolve.
  for (const [legacy, canonical] of [['starter', 'voice-starter'], ['pro', 'done-for-you'], ['studio', 'library-full']]) {
    assert.match(src, new RegExp(`${legacy}\\s*:\\s*['"]${canonical}['"]`), `missing legacy alias ${legacy} -> ${canonical}`)
  }
})

test('checkout.html PLANS matches the sellable slugs + prices (client mirror)', () => {
  const src = readFileSync(new URL('../checkout.html', import.meta.url), 'utf8')
  for (const slug of SELLABLE) {
    assert.match(src, new RegExp(`['"]${slug}['"]\\s*:`), `checkout.html PLANS missing "${slug}"`)
  }
  // Prices present (id-ID grouping uses '.') — pin the four headline figures.
  for (const price of ['99000', '399000', '599000', '799000', '1299000']) {
    assert.ok(src.includes(price), `checkout.html missing price ${price}`)
  }
  // library-full anchor present; no other fake anchors / removed methods.
  assert.ok(src.includes('999000'), 'checkout.html missing library-full 999k anchor')
  assert.equal((src.match(/cicilan|bnpl/gi) || []).length, 0, 'cicilan/bnpl must be removed from checkout')
})
