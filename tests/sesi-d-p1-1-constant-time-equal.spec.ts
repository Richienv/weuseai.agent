// Sesi D security audit — P1-1 fix tests.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d.md (P1-1)
//   "Telegram webhook secret-token comparison is timing-unsafe"
//
// Two layers:
//   1. Unit tests for the new shared `_shared/constant-time-equal.ts`
//      module (the canonical timing-safe comparator).
//   2. Schema-drift tests asserting the four call sites flagged by the
//      audit (telegram-bot-webhook, pair-customer-bot-webhook,
//      hermes-instance-auth, xendit-webhook) all import the shared
//      helper and no longer carry their own ad-hoc copies.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { constantTimeEqual } from '../supabase/functions/_shared/constant-time-equal.ts'

const ROOT = path.resolve(process.cwd())
const SHARED = path.join(ROOT, 'supabase/functions/_shared')

// ─── Layer 1: unit tests for constantTimeEqual ─────────────────────

test('constantTimeEqual: equal strings → true', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true)
})

test('constantTimeEqual: same length, fully different → false', () => {
  assert.equal(constantTimeEqual('abc', 'xyz'), false)
})

test('constantTimeEqual: same length, prefix match (timing-attack shape) → false', () => {
  // The exact case `!==` would short-circuit on the second char.
  assert.equal(constantTimeEqual('aXc', 'aYc'), false)
})

test('constantTimeEqual: different lengths → false (no throw)', () => {
  assert.equal(constantTimeEqual('abc', 'abcd'), false)
  assert.equal(constantTimeEqual('abcd', 'abc'), false)
})

test('constantTimeEqual: empty strings → true', () => {
  assert.equal(constantTimeEqual('', ''), true)
})

test('constantTimeEqual: empty vs non-empty → false', () => {
  assert.equal(constantTimeEqual('', 'a'), false)
  assert.equal(constantTimeEqual('a', ''), false)
})

test('constantTimeEqual: realistic webhook-secret length (32 chars), one bit differs → false', () => {
  const a = 'a'.repeat(32)
  const b = 'a'.repeat(31) + 'b'
  assert.equal(constantTimeEqual(a, b), false)
})

// ─── Layer 2: schema-drift on the 4 audit-flagged call sites ───────

const CALL_SITES = [
  'telegram-bot-webhook-handler.ts',
  'pair-customer-bot-webhook-handler.ts',
  'xendit-webhook-handler.ts',
  'hermes-instance-auth.ts',
] as const

for (const file of CALL_SITES) {
  test(`drift: ${file} imports constantTimeEqual from shared module`, () => {
    const src = fs.readFileSync(path.join(SHARED, file), 'utf8')
    assert.ok(
      /import\s*\{[^}]*\bconstantTimeEqual\b[^}]*\}\s*from\s*['"]\.\/constant-time-equal\.ts['"]/.test(
        src,
      ),
      `${file} must import constantTimeEqual from ./constant-time-equal.ts`,
    )
  })

  test(`drift: ${file} does not redefine constantTimeEqual or safeEqual locally`, () => {
    const src = fs.readFileSync(path.join(SHARED, file), 'utf8')
    assert.ok(
      !/^\s*function\s+constantTimeEqual\s*\(/m.test(src),
      `${file} must not declare its own constantTimeEqual function`,
    )
    assert.ok(
      !/^\s*function\s+safeEqual\s*\(/m.test(src),
      `${file} must not declare its own safeEqual function`,
    )
  })
}

test('drift: telegram-bot-webhook-handler does not use plain `!==` on the secret token', () => {
  const src = fs.readFileSync(
    path.join(SHARED, 'telegram-bot-webhook-handler.ts'),
    'utf8',
  )
  assert.ok(
    !/sentToken\s*!==\s*deps\.webhookSecret/.test(src),
    'telegram-bot-webhook must not use plain !== on the secret token (timing leak)',
  )
})

test('drift: pair-customer-bot-webhook-handler does not use plain `!==` on the secret token', () => {
  const src = fs.readFileSync(
    path.join(SHARED, 'pair-customer-bot-webhook-handler.ts'),
    'utf8',
  )
  assert.ok(
    !/sentToken\s*!==\s*deps\.webhookSecret/.test(src),
    'pair-customer-bot-webhook must not use plain !== on the secret token (timing leak)',
  )
})

test('drift: shared module carries Sesi D P1-1 reference comment', () => {
  const src = fs.readFileSync(
    path.join(SHARED, 'constant-time-equal.ts'),
    'utf8',
  )
  assert.ok(/Sesi D P1-1/.test(src), 'shared module must reference audit ID')
})
