// Sesi D pass-2 P1 — timing-safe bearer comparison for Vercel api/* endpoints.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md (P1-PASS2-1)
//   "4 Vercel admin/cron endpoints still use timing-unsafe `auth !==
//    \`Bearer ${ADMIN_SECRET}\``. Pass-1 P1-1 fix landed in Edge
//    Functions but didn't propagate to api/* Vercel functions."
//
// Two test layers:
//   1. Helper unit tests — match cases, mismatch cases, empty cases.
//   2. Drift assertion — none of the 4 admin/cron endpoints reintroduce
//      plain `auth !== \`Bearer ${...}\`` direct comparison.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { isValidBearer } from '../api/_shared/timing-safe-bearer.ts'

const ROOT = path.resolve(process.cwd())

// ─── Layer 1: helper unit tests ────────────────────────────────────

test('isValidBearer: matches when auth equals "Bearer <secret>"', () => {
  assert.equal(isValidBearer('Bearer hunter2', 'hunter2'), true)
})

test('isValidBearer: mismatches when secret is wrong', () => {
  assert.equal(isValidBearer('Bearer wrong', 'hunter2'), false)
})

test('isValidBearer: mismatches when "Bearer " prefix missing', () => {
  assert.equal(isValidBearer('hunter2', 'hunter2'), false)
})

test('isValidBearer: mismatches when prefix uses lowercase "bearer "', () => {
  // Per RFC 6750 the scheme is case-insensitive, but our endpoints
  // gate on the literal "Bearer " — match the existing behavior.
  assert.equal(isValidBearer('bearer hunter2', 'hunter2'), false)
})

test('isValidBearer: mismatches when auth has extra trailing chars', () => {
  assert.equal(isValidBearer('Bearer hunter2X', 'hunter2'), false)
})

test('isValidBearer: mismatches on empty auth', () => {
  assert.equal(isValidBearer('', 'hunter2'), false)
})

test('isValidBearer: returns false when secret is empty (defense-in-depth)', () => {
  // Caller is supposed to gate on "secret unset → 500 misconfigured"
  // before calling, but if it slips through, we don't want
  // `Bearer ` (just the literal prefix) to match an empty secret.
  assert.equal(isValidBearer('Bearer ', ''), false)
})

test('isValidBearer: handles length mismatch without throwing (crypto.timingSafeEqual throws on mismatch)', () => {
  // Verifies the implementation length-pre-checks BEFORE calling
  // timingSafeEqual (which throws if buffers differ in length).
  assert.doesNotThrow(() => isValidBearer('Bearer x', 'hunter2'))
  assert.equal(isValidBearer('Bearer x', 'hunter2'), false)
})

test('isValidBearer: handles non-ASCII secrets (unicode equality, byte-length matches)', () => {
  const secret = 'πα∫∫'
  assert.equal(isValidBearer(`Bearer ${secret}`, secret), true)
  assert.equal(isValidBearer('Bearer πα∫α', secret), false)
})

// ─── Layer 2: drift assertion — admin/cron endpoints use the helper ──

const ADMIN_FILES = [
  'api/admin/customers.ts',
  'api/admin/support-tickets.ts',
  'api/admin/observability/customer.ts',
  'api/nightly-cleanup.ts',
]

// Look for the legacy timing-unsafe pattern. We need to be specific
// enough not to false-positive on the helper definition itself.
//
// Pattern matches: `auth !== \`Bearer ${SECRET}\`` (any whitespace,
// any case for "Bearer", any var name for the secret).
const LEGACY_PATTERN_RE =
  /\bauth\b\s*!==?\s*`Bearer\s*\$\{[A-Za-z_][\w]*\}`/

for (const rel of ADMIN_FILES) {
  test(`drift: ${rel} does NOT use plain \`auth !== \\\`Bearer \${SECRET}\\\`\` comparison`, () => {
    const abs = path.join(ROOT, rel)
    const src = fs.readFileSync(abs, 'utf8')
    assert.equal(
      LEGACY_PATTERN_RE.test(src),
      false,
      `${rel} reintroduces the timing-unsafe pattern that Sesi D pass-2 P1-1 fixed. Use isValidBearer from api/_shared/timing-safe-bearer.ts.`,
    )
  })

  test(`drift: ${rel} imports isValidBearer from api/_shared/timing-safe-bearer`, () => {
    const abs = path.join(ROOT, rel)
    const src = fs.readFileSync(abs, 'utf8')
    assert.match(
      src,
      /from ['"][./@\w-]*timing-safe-bearer(?:\.ts|\.js)?['"]/,
      `${rel} must import the timing-safe helper`,
    )
  })
}
