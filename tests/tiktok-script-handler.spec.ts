/**
 * Tests for tiktok-script-handler — Phase 2E-1.5 (Hermes-native).
 *
 * Architecture pivot 2026-05-08: handler is now a VALIDATOR, not a
 * generator. Tests verify the schema gate. Generation happens in
 * Hermes on the customer's VPS using their BYOK key.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIKTOK_AUDIENCES,
  TIKTOK_LENGTHS,
  TIKTOK_PLATFORMS,
  TIKTOK_RESPONSE_SCHEMA,
  validateTiktokScript,
  type TiktokScript,
} from '../supabase/functions/_shared/tiktok-script-handler.ts'

// ─── canned valid script ──────────────────────────────────────────────

const VALID_SCRIPT: TiktokScript = {
  hook: 'Pernah cek saldo, langsung kaget?',
  body: 'Coba cara budgeting 50/30/20. 50% kebutuhan, 30% keinginan, 20% tabungan. Sederhana tapi work.',
  cta: 'Save video ini buat reminder.',
  visual_scenes: [
    { timestamp: '0:00', description: 'POV cek saldo HP, ekspresi kaget' },
    { timestamp: '0:05', description: 'Cut to overlay text 50/30/20 rule' },
    { timestamp: '0:20', description: 'Demo split di kalkulator' },
    { timestamp: '0:28', description: 'Final CTA dengan teks "save"' },
  ],
  sound_suggestion: 'oh-no-oh-no original sound (aug 2026 trend)',
  hashtags: ['#fintok', '#budgeting', '#keuanganId', '#millennialmoney'],
}

// ─── enums + schema sanity ────────────────────────────────────────────

test('TIKTOK_LENGTHS = [15, 30, 60, 90]', () => {
  assert.deepEqual([...TIKTOK_LENGTHS], [15, 30, 60, 90])
})

test('TIKTOK_AUDIENCES has 3 segments', () => {
  assert.deepEqual([...TIKTOK_AUDIENCES].sort(), ['gen-z', 'general', 'millennial'])
})

test('TIKTOK_PLATFORMS has 3 platforms', () => {
  assert.deepEqual([...TIKTOK_PLATFORMS].sort(), ['reels', 'shorts', 'tiktok'])
})

test('TIKTOK_RESPONSE_SCHEMA has 6 required fields', () => {
  const required = TIKTOK_RESPONSE_SCHEMA.required as readonly string[]
  assert.deepEqual(
    [...required].sort(),
    ['body', 'cta', 'hashtags', 'hook', 'sound_suggestion', 'visual_scenes'],
  )
})

// ─── happy path ────────────────────────────────────────────────────────

test('validate: valid script returns ok with canonicalized output', () => {
  const r = validateTiktokScript({ script: VALID_SCRIPT })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.script.hook, VALID_SCRIPT.hook)
    assert.equal(r.script.visual_scenes.length, 4)
  }
})

test('validate: ignores extra context fields (topic/length/audience)', () => {
  const r = validateTiktokScript({
    script: VALID_SCRIPT,
    topic: 'Tips budgeting',
    length: 30,
    audience: 'gen-z',
    platform: 'tiktok',
  })
  assert.equal(r.ok, true)
})

// ─── validation errors ────────────────────────────────────────────────

test('validate: missing script field → missing_script', () => {
  const r = validateTiktokScript({} as never)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'missing_script')
  }
})

test('validate: null script → missing_script', () => {
  const r = validateTiktokScript({ script: null })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'missing_script')
})

test('validate: missing required field → schema_validation_failed with detail', () => {
  const malformed = { ...VALID_SCRIPT } as Partial<TiktokScript>
  delete malformed.cta
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /cta/)
    assert.ok(Array.isArray(r.errors))
  }
})

test('validate: hashtag without # prefix is rejected', () => {
  const malformed = { ...VALID_SCRIPT, hashtags: ['budgeting', '#fintok', '#keuangan'] }
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /hashtags\[0\]/)
  }
})

test('validate: fewer than 3 hashtags rejected', () => {
  const malformed = { ...VALID_SCRIPT, hashtags: ['#fin', '#money'] }
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'schema_validation_failed')
})

test('validate: bad timestamp format on visual_scenes rejected', () => {
  const malformed = {
    ...VALID_SCRIPT,
    visual_scenes: [
      { timestamp: '5sec', description: 'wrong format' },
      { timestamp: '0:10', description: 'right' },
      { timestamp: '0:20', description: 'right' },
      { timestamp: '0:28', description: 'right' },
    ],
  }
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /visual_scenes\[0\]\.timestamp/)
  }
})

test('validate: empty hook rejected (minLength 1)', () => {
  const malformed = { ...VALID_SCRIPT, hook: '' }
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
})

test('validate: hashtag with space rejected', () => {
  const malformed = { ...VALID_SCRIPT, hashtags: ['#with space', '#valid', '#also'] }
  const r = validateTiktokScript({ script: malformed })
  assert.equal(r.ok, false)
})

test('validate: array as script rejected (must be object)', () => {
  const r = validateTiktokScript({ script: ['hook', 'body'] as never })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'schema_validation_failed')
})
