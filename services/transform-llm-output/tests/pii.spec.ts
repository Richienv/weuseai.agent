/**
 * PII detection + redaction tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectPii, redactPii, luhnValid } from '../src/pii.ts'

// ─── NPWP ────────────────────────────────────────────────────────────

test('detectPii: NPWP punctuated', () => {
  const matches = detectPii('NPWP saya: 12.345.678.9-012.345')
  const npwp = matches.find((m) => m.kind === 'npwp')
  assert.ok(npwp)
  assert.equal(npwp!.matched, '12.345.678.9-012.345')
  assert.equal(npwp!.replacement, '[NPWP_REDACTED]')
})

test('detectPii: NPWP bare 15 digits', () => {
  const matches = detectPii('Tax ID: 123456789012345 sudah aktif')
  const npwp = matches.find((m) => m.kind === 'npwp')
  assert.ok(npwp)
  assert.equal(npwp!.matched, '123456789012345')
})

// ─── KTP ─────────────────────────────────────────────────────────────

test('detectPii: KTP 16 digits', () => {
  const matches = detectPii('KTP: 1234567890123456')
  const ktp = matches.find((m) => m.kind === 'ktp')
  assert.ok(ktp)
  assert.equal(ktp!.matched, '1234567890123456')
})

test('detectPii: KTP 16 digits NOT classified as bank account or NPWP', () => {
  const matches = detectPii('1234567890123456')
  // Should be a single KTP, not a CC + bank cascade.
  const npwp = matches.find((m) => m.kind === 'npwp')
  const bank = matches.find((m) => m.kind === 'bank_account_id')
  assert.equal(npwp, undefined)
  assert.equal(bank, undefined)
})

// ─── Phone ───────────────────────────────────────────────────────────

test('detectPii: Indonesian phone +62 prefix', () => {
  const matches = detectPii('Hubungi +6281234567890')
  const ph = matches.find((m) => m.kind === 'phone_id')
  assert.ok(ph)
  assert.equal(ph!.matched, '+6281234567890')
})

test('detectPii: Indonesian phone 0 prefix', () => {
  const matches = detectPii('Telp 081234567890')
  const ph = matches.find((m) => m.kind === 'phone_id')
  assert.ok(ph)
  assert.equal(ph!.matched, '081234567890')
})

test('detectPii: Indonesian phone with dashes', () => {
  const matches = detectPii('+62-812-3456-7890')
  const ph = matches.find((m) => m.kind === 'phone_id')
  assert.ok(ph)
  assert.equal(ph!.matched, '+62-812-3456-7890')
})

// ─── Email ───────────────────────────────────────────────────────────

test('detectPii: simple email', () => {
  const matches = detectPii('Kontak: founder@example.com')
  const em = matches.find((m) => m.kind === 'email')
  assert.ok(em)
  assert.equal(em!.matched, 'founder@example.com')
})

test('detectPii: email with plus alias', () => {
  const matches = detectPii('Email: foo+bar@example.co.id')
  const em = matches.find((m) => m.kind === 'email')
  assert.ok(em)
  assert.equal(em!.matched, 'foo+bar@example.co.id')
})

test('detectPii: email with multiple dots in domain', () => {
  const matches = detectPii('alice@mail.beta.example.id')
  const em = matches.find((m) => m.kind === 'email')
  assert.ok(em)
  assert.equal(em!.matched, 'alice@mail.beta.example.id')
})

// ─── Bank account ────────────────────────────────────────────────────

test('detectPii: bank account 10 digits', () => {
  const matches = detectPii('Rekening 1234567890 di BCA')
  const bank = matches.find((m) => m.kind === 'bank_account_id')
  assert.ok(bank)
  assert.equal(bank!.matched, '1234567890')
})

test('detectPii: bank account 13 digits (Mandiri-like)', () => {
  const matches = detectPii('1234567890123 Mandiri')
  const bank = matches.find((m) => m.kind === 'bank_account_id')
  assert.ok(bank)
})

// ─── Credit card ─────────────────────────────────────────────────────

test('detectPii: valid Luhn-passing 16-digit number is credit card NOT KTP', () => {
  // 4242 4242 4242 4242 = Stripe's test Visa, Luhn valid.
  const matches = detectPii('Card: 4242424242424242')
  const cc = matches.find((m) => m.kind === 'credit_card')
  const ktp = matches.find((m) => m.kind === 'ktp')
  assert.ok(cc, 'Luhn-valid 16-digit number should classify as credit_card')
  assert.equal(ktp, undefined)
})

test('detectPii: invalid Luhn 16-digit number falls through to KTP', () => {
  // 16 digits that DON'T satisfy Luhn.
  const matches = detectPii('1234567890123456')
  const cc = matches.find((m) => m.kind === 'credit_card')
  const ktp = matches.find((m) => m.kind === 'ktp')
  assert.equal(cc, undefined, 'Non-Luhn → not credit_card')
  assert.ok(ktp)
})

// ─── Multi-PII string ────────────────────────────────────────────────

test('detectPii: multiple kinds in one string', () => {
  const text = 'Sarah, NPWP 12.345.678.9-012.345, telp 081234567890, email sarah@example.com'
  const matches = detectPii(text)
  const kinds = matches.map((m) => m.kind).sort()
  assert.deepEqual(kinds, ['email', 'npwp', 'phone_id'])
})

test('detectPii: matches sorted by offset', () => {
  const text = 'A: founder@example.com, B: 081234567890'
  const matches = detectPii(text)
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i].offset > matches[i - 1].offset)
  }
})

// ─── redactPii ───────────────────────────────────────────────────────

test('redactPii: replaces all matches', () => {
  const text = 'Email: a@b.com, Phone: 081234567890'
  const matches = detectPii(text)
  const out = redactPii(text, matches, [])
  assert.match(out, /\[EMAIL_REDACTED\]/)
  assert.match(out, /\[PHONE_REDACTED\]/)
  assert.equal(out.includes('a@b.com'), false)
})

test('redactPii: allowlisted kinds pass through unchanged', () => {
  const text = 'Cited NPWP 12.345.678.9-012.345 dalam dokumen OSS'
  const matches = detectPii(text)
  const out = redactPii(text, matches, ['npwp'])
  assert.match(out, /12\.345\.678\.9-012\.345/)
  assert.equal(out.includes('[NPWP_REDACTED]'), false)
})

test('redactPii: empty matches list returns original text', () => {
  const text = 'Halo kamu, ini text bersih.'
  const out = redactPii(text, [], [])
  assert.equal(out, text)
})

// ─── luhnValid ───────────────────────────────────────────────────────

test('luhnValid: known-valid credit card numbers', () => {
  assert.equal(luhnValid('4242424242424242'), true)   // Stripe Visa test
  assert.equal(luhnValid('4111111111111111'), true)   // Visa test
  assert.equal(luhnValid('5555555555554444'), true)   // Mastercard test
})

test('luhnValid: known-invalid sequences', () => {
  assert.equal(luhnValid('1234567890123456'), false)
  assert.equal(luhnValid('0000000000000001'), false)
})

test('luhnValid: rejects too-short / too-long', () => {
  assert.equal(luhnValid('424242'), false)
  assert.equal(luhnValid('42424242424242424242'), false) // 20 digits
})
