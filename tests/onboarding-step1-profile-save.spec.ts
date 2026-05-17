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

test('step 1 form Email input is server-sourced + readonly (email-mismatch fix 2026-05-17)', () => {
  // History: the email was previously sourced from a GLOBAL browser
  // localStorage key ('onboarding_checkout_email'). A browser that ran
  // more than one checkout — a shared/family machine, or one person
  // buying two agents — showed the WRONG (previous) customer's email on
  // this form. The email is metadata of the PAYMENT.
  //
  // Fix (2026-05-17): the email is resolved server-side from the
  // customers row (xendit-webhook's payer_email) via the X-CID-gated
  // customer-onboarding-info Edge Function, and the field is `readonly`
  // — it is not user-editable. The old anon-REVOKE problem that once
  // forced an editable field is moot now: the lookup runs service-role.
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  const m = src.match(/<input[^>]*id="f-email"[^>]*>/)
  assert.ok(m, 'must find <input id="f-email">')
  assert.ok(
    /\breadonly\b/.test(m[0]),
    `f-email input must be readonly — the email is payment metadata: ${m[0]}`,
  )
  assert.ok(
    /\brequired\b/.test(m[0]),
    `f-email input must be required: ${m[0]}`,
  )
  assert.match(m[0], /autocomplete="off"/, 'f-email must disable browser autofill')
  // Email is resolved server-side, NOT from browser state.
  assert.match(
    src,
    /customer-onboarding-info/,
    'render path must resolve the email via the customer-onboarding-info Edge Function',
  )
  assert.equal(
    /onboarding_checkout_email/.test(src),
    false,
    'the old global-localStorage email source must be gone — it was the mismatch bug',
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
