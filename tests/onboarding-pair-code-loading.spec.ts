// Track 4 (P0): pair-code box shows "—:—" placeholder for ~5 seconds
// before populating. No loading indicator — customer assumes broken
// and bounces.
//
// Fix: render an explicit "Membuat kode pasangan…" loading state in the
// pair-code container at step-3 entry. Replace with the rendered code
// cells once startPairing() resolves. Add a 10s soft-timeout fallback
// that surfaces a visible "lambat — coba refresh" message.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const ONBOARDING = path.join(ROOT, 'onboarding.html')

test('pair-code box has an initial loading placeholder', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The static HTML for #pair-code must contain a loading affordance
  // so the customer never sees an empty box. Either:
  //   - a [data-pair-code-loading] element, OR
  //   - a "Membuat kode pasangan" string
  // Choosing data-* hook so the renderer can hide it deterministically.
  assert.ok(
    /id="pair-code"[\s\S]{0,500}data-pair-code-loading/.test(src),
    'pair-code container must include a [data-pair-code-loading] child',
  )
  assert.ok(
    /Membuat kode pasangan/i.test(src),
    'loading copy must read "Membuat kode pasangan…"',
  )
})

test('renderPairingCode hides / replaces the loading placeholder', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The renderer assigns innerHTML based on the digits — that wipes the
  // loading placeholder. Test asserts renderPairingCode exists and is
  // the path that mutates pair-code's contents.
  assert.ok(
    /function\s+renderPairingCode\b[\s\S]{0,300}\$pairCode\.innerHTML\s*=/.test(src),
    'renderPairingCode must overwrite #pair-code.innerHTML so the loading state is replaced',
  )
})

test('pair-code soft-timeout (≥10s) surfaces a "slow / refresh" hint', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Defensive: if startPairing hangs (slow rotate-pairing-code), show
  // a visible hint after ~10s instead of leaving the loading state up
  // indefinitely.
  assert.ok(
    /PAIR_CODE_SLOW_MS\s*=\s*10_?000/.test(src),
    'must declare a PAIR_CODE_SLOW_MS = 10_000 constant',
  )
  assert.ok(
    /Sedang lambat|coba refresh/i.test(src),
    'soft-timeout copy must mention "lambat" or "refresh"',
  )
})

test('expiry timer placeholder ("—:—") replaced once code arrives', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The expiry ticker mutates [data-mmss]. Test that the path exists.
  assert.ok(
    /\[data-mmss\][\s\S]{0,400}textContent\s*=/.test(src) ||
      /\$mmss\.textContent\s*=/.test(src),
    'expiry ticker must overwrite the [data-mmss] placeholder',
  )
})
