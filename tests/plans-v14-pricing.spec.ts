/**
 * v1.4 payment-chain pricing — PLANS catalog + create-invoice acceptance.
 *
 * Mission 2 Phase 0.3 (2026-06-10). The server PLANS catalog now carries the
 * five canonical v1.4 slugs DERIVED from tier-personas.ts (no mirror to
 * drift) alongside the FROZEN legacy v1.2 slugs the live checkout.html still
 * displays. Display and charge must always match: legacy slugs keep their
 * legacy price until the checkout v1.4 flip lands; canonical slugs charge
 * exactly the founder-locked v1.4 catalog.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PLANS } from '../supabase/functions/_shared/types.ts'
import { TIERS } from '../supabase/functions/_shared/tier-personas.ts'
import { chargeBeforeFee, totalCharge } from '../supabase/functions/_shared/pricing.ts'

const CANONICAL = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you'] as const
const LEGACY = ['starter', 'pro', 'studio'] as const

test('canonical PLANS entries equal the founder-locked tier-personas catalog', () => {
  for (const slug of CANONICAL) {
    assert.equal(
      PLANS[slug].setupIdr,
      TIERS[slug].setup_fee_idr,
      `PLANS.${slug}.setupIdr diverged from tier-personas.ts`,
    )
    assert.equal(PLANS[slug].displayName, TIERS[slug].label_id)
  }
})

test('v1.4 locked numbers: bare 99k / solo 399k / voice-starter 599k / library-full 799k / done-for-you 1.299jt', () => {
  assert.equal(PLANS.bare.setupIdr, 99_000)
  assert.equal(PLANS.solo.setupIdr, 399_000)
  assert.equal(PLANS['voice-starter'].setupIdr, 599_000)
  assert.equal(PLANS['library-full'].setupIdr, 799_000)
  assert.equal(PLANS['done-for-you'].setupIdr, 1_299_000)
})

test('library-full anchor (2.2jt) is the REAL post-batch price (founder 2026-07-16)', () => {
  assert.equal(PLANS['library-full'].setupOldIdr, 2_200_000)
  // The charge path must use setupIdr (799k), not the anchor.
  assert.equal(chargeBeforeFee('library-full', false), 799_000 + 99_000)
})

test('legacy slugs stay FROZEN at the v1.2 prices the live checkout displays', () => {
  // Display==charge invariant: these may only change in the same PR that
  // flips checkout.html to canonical slugs (held until PR2 lands).
  assert.equal(PLANS.starter.setupIdr, 399_000)
  assert.equal(PLANS.pro.setupIdr, 1_290_000)
  assert.equal(PLANS.studio.setupIdr, 5_900_000)
})

test('enterprise is not purchasable (absent from PLANS)', () => {
  assert.equal('enterprise' in PLANS, false)
})

test('totalCharge works for a canonical slug (qris, no always-on)', () => {
  const { base, total } = totalCharge('solo', false, 'qris')
  assert.equal(base, 399_000 + 99_000)
  assert.equal(total, base + Math.round((base * 0.7) / 100))
})
