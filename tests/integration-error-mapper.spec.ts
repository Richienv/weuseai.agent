/**
 * Sesi R Phase 0 (2026-05-13): Bahasa error-mapping contract.
 *
 * Maps third-party API error codes to premium Bahasa Indonesian copy
 * that respects weuseai.agent brand voice rules (CLAUDE.md):
 *   - No banned words (basically, just, literally, honestly, kind of,
 *     pretty much, revolutionary, disrupt, 10x, game-changer, next-level)
 *   - No exclamation marks in body copy
 *   - Calm-premium register
 *   - English allowed only for technical/dev terms (API, key, dst)
 *
 * Tested behaviors:
 *   1. Each catalogued Xendit error returns a Bahasa message.
 *   2. Unmapped errors return fallback ("Layanan sementara tidak tersedia...").
 *   3. No customer-facing string contains banned brand-voice words.
 *   4. No customer-facing string contains exclamation marks.
 *   5. Function is pure (same input → same output, no DB / network).
 *   6. Maps HTTP status codes (401/403/404/429/500/503) AND Xendit
 *      string codes (INVALID_API_KEY, etc).
 *   7. Three integrations supported: xendit, whatsapp_cloud_api, onlinepajak
 *      (latter two stubbed with fallback until their phases land).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  mapIntegrationError,
  type IntegrationName,
} from '../supabase/functions/_shared/integration-error-mapper.ts'

const BANNED_WORDS = [
  'basically', 'just', 'literally', 'honestly', 'kind of',
  'pretty much', 'revolutionary', 'disrupt', '10x',
  'game-changer', 'next-level',
]

function assertBahasaQuality(s: string, label: string): void {
  // No exclamation marks anywhere.
  assert.doesNotMatch(s, /!/, `${label}: contains exclamation mark`)
  // No banned words (case-insensitive).
  for (const banned of BANNED_WORDS) {
    assert.doesNotMatch(
      s,
      new RegExp(`\\b${banned}\\b`, 'i'),
      `${label}: contains banned word "${banned}"`,
    )
  }
  // Must be non-empty.
  assert.ok(s.length > 0, `${label}: empty message`)
}

test('error-mapper: Xendit 401 INVALID_API_KEY maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 401, code: 'INVALID_API_KEY' })
  assert.equal(r.code, 'invalid_api_key')
  assert.match(r.message_bahasa, /Akun Xendit/)
  assertBahasaQuality(r.message_bahasa, 'xendit.invalid_api_key')
})

test('error-mapper: Xendit 402 INSUFFICIENT_BALANCE maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 402, code: 'INSUFFICIENT_BALANCE' })
  assert.equal(r.code, 'insufficient_balance')
  assert.match(r.message_bahasa, /Saldo/)
  assertBahasaQuality(r.message_bahasa, 'xendit.insufficient_balance')
})

test('error-mapper: Xendit 429 rate limit maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 429, code: 'API_VALIDATION_ERROR' })
  assert.equal(r.code, 'rate_limited')
  assert.match(r.message_bahasa, /terlalu sering/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.rate_limited')
})

test('error-mapper: Xendit 500 maps to "gangguan" Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 500, code: 'SERVER_ERROR' })
  assert.equal(r.code, 'upstream_error')
  assert.match(r.message_bahasa, /gangguan/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.upstream_error')
})

test('error-mapper: Xendit 503 service unavailable maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 503, code: 'SERVICE_UNAVAILABLE' })
  assert.equal(r.code, 'upstream_error')
  assertBahasaQuality(r.message_bahasa, 'xendit.503')
})

test('error-mapper: Xendit DUPLICATE_PAYMENT_REQUEST maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 400, code: 'DUPLICATE_PAYMENT_REQUEST' })
  assert.equal(r.code, 'duplicate_request')
  assert.match(r.message_bahasa, /sudah ada/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.duplicate_request')
})

test('error-mapper: Xendit EXPIRED_API_KEY maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 401, code: 'EXPIRED_API_KEY' })
  assert.equal(r.code, 'expired_api_key')
  assert.match(r.message_bahasa, /kadaluarsa/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.expired_api_key')
})

test('error-mapper: Xendit DATA_NOT_FOUND maps to Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 404, code: 'DATA_NOT_FOUND' })
  assert.equal(r.code, 'not_found')
  assert.match(r.message_bahasa, /tidak ditemukan/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.not_found')
})

test('error-mapper: unmapped Xendit error returns fallback Bahasa', () => {
  const r = mapIntegrationError('xendit', { status: 418, code: 'I_AM_A_TEAPOT' })
  assert.equal(r.code, 'unknown_error')
  assert.match(r.message_bahasa, /sementara tidak tersedia/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.fallback')
})

test('error-mapper: pure function — same input → same output', () => {
  const a = mapIntegrationError('xendit', { status: 401, code: 'INVALID_API_KEY' })
  const b = mapIntegrationError('xendit', { status: 401, code: 'INVALID_API_KEY' })
  assert.deepEqual(a, b)
})

test('error-mapper: every integration has at least a fallback', () => {
  for (const integration of ['xendit', 'whatsapp_cloud_api', 'onlinepajak'] as IntegrationName[]) {
    const r = mapIntegrationError(integration, { status: 500, code: 'WHATEVER' })
    assert.ok(r.message_bahasa.length > 0, `${integration}: missing fallback`)
    assertBahasaQuality(r.message_bahasa, `${integration}.fallback`)
  }
})

test('error-mapper: response includes suggested_action when applicable', () => {
  const r = mapIntegrationError('xendit', { status: 401, code: 'INVALID_API_KEY' })
  // suggested_action is optional but should be set for fix-yourself errors.
  assert.ok(r.suggested_action, 'invalid_api_key should suggest action')
  assertBahasaQuality(r.suggested_action!, 'xendit.invalid_api_key.action')
})

test('error-mapper: network-level errors (no HTTP response) map to fallback', () => {
  const r = mapIntegrationError('xendit', { status: 0, code: 'NETWORK_ERROR' })
  assert.equal(r.code, 'network_error')
  assert.match(r.message_bahasa, /koneksi/i)
  assertBahasaQuality(r.message_bahasa, 'xendit.network')
})
