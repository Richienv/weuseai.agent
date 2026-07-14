// checkout.html email-only form regression tests.
//
// Track 1 of post-CORS-hotfix cascade (2026-05-10): name field removed
// from checkout. Display name + WhatsApp are collected on onboarding
// step 1 instead. Xendit's createInvoice only requires payer_email;
// the customer.given_names block was already unused server-side per
// supabase/functions/create-invoice/index.ts payload at line 120.
//
// Source-level assertions on checkout.html — no jsdom (matches the
// convention for other source-grep specs in this directory).

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const CHECKOUT = path.join(ROOT, 'checkout.html')

test('checkout.html exists', () => {
  assert.ok(fs.existsSync(CHECKOUT))
})

test('name field is removed from checkout DOM', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // No <input id="name" ...> anywhere — display_name is now collected
  // on onboarding step 1 via save-onboarding-profile.
  assert.equal(
    /<input[^>]*id=["']name["']/.test(src),
    false,
    'no <input id="name"> may exist in checkout',
  )
  // No nameError inline error node (the input was removed too).
  assert.equal(
    /<p[^>]*id=["']nameError["']/.test(src),
    false,
    'no nameError inline node may exist',
  )
})

test('email field still present + required', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  const m = src.match(/<input[^>]*id=["']email["'][^>]*>/)
  assert.ok(m, 'must find <input id="email">')
  assert.match(m[0], /\brequired\b/, 'email field must carry required attribute')
  assert.match(m[0], /type=["']email["']/, 'must use type="email"')
})

test('submit POST body sends email but NOT displayName', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Locate the create-invoice POST body.
  const fetchSection = src.match(
    /fetch\(`\$\{SUPABASE_FUNCTIONS_URL\}\/create-invoice`[^]*?\}\)\s*,\s*\}\)/,
  )
  assert.ok(fetchSection, 'must find create-invoice fetch call')
  // email key still emitted.
  assert.match(fetchSection[0], /\bemail\s*:\s*email\b/)
  // displayName key removed (or commented out — must NOT be live).
  assert.equal(
    /^\s*displayName\s*:/m.test(fetchSection[0].replace(/\/\/.*$/gm, '')),
    false,
    'displayName must not be sent in the request body (lives on onboarding step 1 now)',
  )
})

test('JS validation only requires email (not name)', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The pre-submit validation must NOT reference a `nameInp` variable
  // — that was the gating var for the now-removed name field.
  assert.equal(
    /\bnameInp\s*=\s*document\.getElementById\(['"]name['"]\)/.test(src),
    false,
    'no nameInp lookup may remain in submit handler',
  )
  assert.equal(
    /setFieldError\([^)]*nameInp/.test(src),
    false,
    'no setFieldError(nameInp, …) call may remain',
  )
})
