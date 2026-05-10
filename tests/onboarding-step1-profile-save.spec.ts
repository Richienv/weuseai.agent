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

test('step 1 form Email input is readonly + prefilled from checkout (Track 4 post-pair polish 2026-05-10)', () => {
  // Pre-Track-4 the field was editable so customers could correct an
  // email typo from checkout. Founder feedback from fresh-customer test:
  // duplicate ask felt like a bureaucratic form, and any divergence
  // between the two values silently created a data inconsistency
  // (receipts go to one address, account email is another). Now: email
  // is readonly + prefilled from customers.email; corrections route
  // through WhatsApp support (link is visible right below the form).
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  const m = src.match(/<input[^>]*id="f-email"[^>]*>/)
  assert.ok(m, 'must find <input id="f-email">')
  assert.ok(
    /\breadonly\b/.test(m[0]),
    `f-email input must be readonly per Track 4 (was: ${m[0]})`,
  )
  // Help text must point customers at the correction path.
  assert.match(
    src,
    /Email dari checkout/,
    'help text must explain why email is locked + how to fix',
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
