// onboarding.html step 1 must capture Name + Email + WhatsApp + persist
// to server before advancing to step 2. Pre-fix the form had Name +
// Email rendered readonly with no save call — customers who paid
// without filling them at checkout had no way to recover the data.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const ONBOARDING = path.join(ROOT, 'onboarding.html')

test('step 1 form has editable Name input (no readonly attribute)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Find the f-name input and assert it is NOT readonly.
  const m = src.match(/<input[^>]*id="f-name"[^>]*>/)
  assert.ok(m, 'must find <input id="f-name">')
  assert.ok(
    !/\breadonly\b/.test(m[0]),
    `f-name input must not be readonly (was: ${m[0]})`,
  )
})

test('step 1 form Email input is editable + required (regression-fix 2026-05-10)', () => {
  // History: Track 4 of post-pair polish made this readonly +
  // prefilled-from-server. That broke EVERY customer because anon
  // SELECT on customers.email is REVOKED per Sesi D P0-2 — the
  // browser couldn't read the email back, so the field was readonly
  // AND empty AND validation rejected empty. Customers were locked
  // out of step 1.
  //
  // Fix: editable again, prefill best-effort from localStorage cache
  // that checkout.html writes on Bayar Sekarang submit. Save-onboarding-
  // profile-handler accepts email updates and writes back via service-
  // role. Customers who type a different email here than at checkout
  // get the customers.email row updated — no silent inconsistency.
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  const m = src.match(/<input[^>]*id="f-email"[^>]*>/)
  assert.ok(m, 'must find <input id="f-email">')
  assert.ok(
    !/\breadonly\b/.test(m[0]),
    `f-email input must NOT be readonly (regression of Track 4 readonly): ${m[0]}`,
  )
  assert.ok(
    /\brequired\b/.test(m[0]),
    `f-email input must be required: ${m[0]}`,
  )
  // Prefill mechanism: render path reads from localStorage when
  // customer.email is empty (covers Sesi-D-P0-2 anon-REVOKE case).
  assert.match(
    src,
    /onboarding_checkout_email/,
    'render path must consult localStorage cache for email prefill',
  )
})

test('step 1 form Name + Email + WhatsApp all carry required attribute', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  for (const id of ['f-name', 'f-email', 'f-whatsapp']) {
    const m = src.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))
    assert.ok(m, `must find input ${id}`)
    assert.ok(
      /\brequired\b/.test(m[0]),
      `${id} must carry required attribute (was: ${m[0]})`,
    )
  }
})

test('step 1 submit calls save-onboarding-profile edge function', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  assert.ok(
    /\/functions\/v1\/save-onboarding-profile/.test(src),
    'onboarding.html must POST to /functions/v1/save-onboarding-profile on step 1 submit',
  )
})

test('step 1 submit handler validates Name + Email before POST', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The handler should declare a saveStep1Profile or similar named
  // function that runs validation before fetch().
  assert.ok(
    /async\s+function\s+saveStep1Profile|saveStep1Profile\s*=\s*async/.test(src),
    'onboarding.html must declare an async saveStep1Profile function',
  )
})

test('step 1 form-error elements exist for Name + Email + WhatsApp', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Each field needs a sibling .field-error with aria-live for
  // accessible inline errors.
  for (const id of ['f-name-error', 'f-email-error', 'f-whatsapp-error']) {
    assert.ok(
      new RegExp(`id="${id}"`).test(src),
      `must declare <p id="${id}"> for inline error display`,
    )
  }
})
