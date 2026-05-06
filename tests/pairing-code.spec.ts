/**
 * Pairing code generator + expiry tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_LIFETIME_MS,
  generatePairingCode,
  isPairingCodeExpired,
} from '../supabase/functions/_shared/pairing-code.ts'

test('generates 6-digit zero-padded codes', () => {
  for (let i = 0; i < 100; i++) {
    const { code } = generatePairingCode()
    assert.equal(code.length, PAIRING_CODE_LENGTH, `len iter ${i}: ${code}`)
    assert.match(code, /^\d{6}$/, `digits iter ${i}: ${code}`)
  }
})

test('expiresAt is exactly 30 minutes from now', () => {
  const now = Date.parse('2026-05-06T10:00:00Z')
  const { expiresAt } = generatePairingCode(() => now)
  assert.equal(expiresAt, '2026-05-06T10:30:00.000Z')
  assert.equal(Date.parse(expiresAt) - now, PAIRING_CODE_LIFETIME_MS)
})

test('codes are random across many calls (no obvious dup pattern)', () => {
  const codes = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    codes.add(generatePairingCode().code)
  }
  // 1000 random draws from 1M possibilities — collision probability
  // ~50% (birthday paradox) is for ~1100 draws. Allow a few collisions
  // but require >= 990 unique. Catches a stuck PRNG.
  assert.ok(codes.size >= 990, `unique=${codes.size}/1000`)
})

test('isPairingCodeExpired: future timestamp not expired', () => {
  const now = Date.parse('2026-05-06T10:00:00Z')
  const future = '2026-05-06T10:30:00.000Z'
  assert.equal(isPairingCodeExpired(future, () => now), false)
})

test('isPairingCodeExpired: past timestamp is expired', () => {
  const now = Date.parse('2026-05-06T10:30:00Z')
  const past = '2026-05-06T10:00:00.000Z'
  assert.equal(isPairingCodeExpired(past, () => now), true)
})

test('isPairingCodeExpired: exactly-now is expired (boundary defensive)', () => {
  const t = '2026-05-06T10:00:00.000Z'
  assert.equal(isPairingCodeExpired(t, () => Date.parse(t)), true)
})

test('isPairingCodeExpired: null/undefined treated as expired', () => {
  assert.equal(isPairingCodeExpired(null), true)
  assert.equal(isPairingCodeExpired(undefined), true)
  assert.equal(isPairingCodeExpired(''), true)
})

test('isPairingCodeExpired: malformed timestamp is expired', () => {
  assert.equal(isPairingCodeExpired('not-a-date'), true)
  assert.equal(isPairingCodeExpired('2026-13-99'), true)
})
