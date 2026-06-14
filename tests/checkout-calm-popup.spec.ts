/**
 * Regression gate for the calm-checkout + payment-popup redesign (2026-06-10).
 *
 * Locks the founder-requested invariants so a future edit can't silently
 * bring back the noise: no Cicilan/BNPL, no itemized processor-fee paragraph,
 * no "Payments by…/Dioperasikan…" cruft, the payment popup stays, and the 5
 * v1.4 slugs remain priced. Pure source-grep — cheap, always runs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../checkout.html', import.meta.url), 'utf8')

test('checkout: Cicilan + BNPL are removed', () => {
  assert.equal((SRC.match(/cicilan|bnpl/gi) || []).length, 0, 'Cicilan/BNPL must not return to checkout')
})

test('checkout: no itemized processor-fee paragraph (one clean total)', () => {
  assert.ok(!SRC.includes('fee-explainer'), 'the scary fee-explainer paragraph must stay removed')
  assert.match(SRC, /Total hari ini/, 'single clean total label present')
})

test('checkout: branding cruft removed', () => {
  assert.ok(!SRC.includes('Payments by'), '"Payments by weuseai.agent" must be removed')
  assert.ok(!SRC.includes('Dioperasikan oleh'), '"Dioperasikan oleh…" must be removed')
})

test('checkout: payment popup + its a11y scaffolding are present', () => {
  assert.ok(SRC.includes('payModal'), 'payment popup (#payModal) present')
  assert.match(SRC, /role="dialog"/, 'modal has role=dialog')
  assert.match(SRC, /keydown/, 'keyboard handling present (radiogroup / focus-trap)')
  assert.match(SRC, /payModal\.hidden/, 'Enter-submit guard present (no fetch while modal hidden)')
  assert.match(SRC, /savedScrollY/, 'mobile body-scroll-lock present')
})

test('checkout: the 5 sellable v1.4 slugs remain in the client catalog', () => {
  for (const slug of ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you']) {
    assert.match(SRC, new RegExp(`['"]${slug}['"]`), `checkout PLANS missing "${slug}"`)
  }
})
