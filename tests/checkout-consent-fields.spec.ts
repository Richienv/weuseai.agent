/**
 * Source-level drift gate on checkout.html — ensures the ToS / marketing
 * consent fields are actually included in the create-invoice POST body.
 *
 * Sesi D pass-3 P0 (2026-05-13). Pre-pass-3 the checkbox stamped only
 * localStorage — the POST body omitted both fields, so the server-side
 * gate was silently unreachable. This spec catches that exact
 * regression: if a future refactor strips `tos_accepted_at` from the
 * checkout submit body, this test fails.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CHECKOUT = path.resolve(process.cwd(), 'checkout.html')

test('checkout.html exists', () => {
  assert.ok(fs.existsSync(CHECKOUT))
})

test('create-invoice POST body includes tos_accepted_at', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The submit handler's fetch body must literally contain the field
  // name — exact string match across any whitespace + value reference.
  assert.match(src, /tos_accepted_at\s*:/, 'tos_accepted_at must appear as a key in the request body')
})

test('create-invoice POST body includes marketing_opt_in_at', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  assert.match(src, /marketing_opt_in_at\s*:/, 'marketing_opt_in_at must appear as a key in the request body')
})

test('create-invoice POST body includes policy_version', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  assert.match(src, /policy_version\s*:/, 'policy_version must appear as a key in the request body')
})

test('server-side tos_required + tos_stale error codes are surfaced in the UI', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The submit handler must inspect the server response error code and
  // surface a Bahasa explanation under the ToS checkbox. Closes the
  // "fail silently" path when the server gate trips post-DevTools-bypass.
  assert.match(src, /'tos_required'/, 'tos_required handler must exist in client error path')
  assert.match(src, /'tos_stale'/, 'tos_stale handler must exist in client error path')
})

test('tos_accepted_at value reuses the same timestamp written to localStorage', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Prevents a regression where the body and localStorage are stamped
  // with two separate `new Date().toISOString()` calls — those would
  // be a few ms apart and the localStorage cache would diverge from
  // the server-side record. Pinned by a single named variable.
  assert.match(src, /const\s+tosAcceptedAt\s*=\s*new\s+Date\(\)\.toISOString\(\)/, 'tosAcceptedAt must be a single named variable')
})
