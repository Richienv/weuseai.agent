import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  inferParameters,
  inferParamName,
  inferParamType,
} from '../src/lib/parameterize.ts'
import { tokopediaSearchSession } from './_helpers/fixtures.ts'

// ─── inferParameters across multiple sessions ────────────────────────

test('inferParameters: search query varies across sessions → parameter', () => {
  const result = inferParameters([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'iphone', productTitle: 'iPhone 14', productPrice: 'Rp 15jt' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'macbook', productTitle: 'MacBook Pro', productPrice: 'Rp 30jt' }),
    tokopediaSearchSession({ sessionIdx: 3, searchQuery: 'airpods', productTitle: 'AirPods', productPrice: 'Rp 3jt' }),
  ])
  assert.equal(result.parameters.length, 1)
  assert.equal(result.parameters[0].name, 'search_query')
  assert.equal(result.parameters[0].type, 'string')
  assert.equal(result.parameters[0].required, true)
  assert.deepEqual(result.parameters[0].examples, ['iphone', 'macbook', 'airpods'])
})

test('inferParameters: same value across sessions → literal (not parameter)', () => {
  const sessions = [
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'fixed', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'fixed', productTitle: 'B', productPrice: 'Y' }),
  ]
  const result = inferParameters(sessions)
  assert.equal(result.parameters.length, 0)
  assert.equal(result.literals.length, 1)
  assert.equal(result.literals[0].value, 'fixed')
  assert.equal(result.literals[0].occurrences, 2)
})

test('inferParameters: single session → all inputs become parameters (no comparison possible)', () => {
  const single = [tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'test', productTitle: 'A', productPrice: 'X' })]
  const result = inferParameters(single)
  assert.equal(result.parameters.length, 1, 'single-session: type/select actions become params')
  assert.equal(result.literals.length, 0)
})

test('inferParameters: empty input returns empty result', () => {
  const result = inferParameters([])
  assert.deepEqual(result.parameters, [])
  assert.deepEqual(result.literals, [])
})

test('inferParameters: handles divergent session lengths (truncates to minLen)', () => {
  const a = tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'q1', productTitle: 'T1', productPrice: 'P1' })
  const b = tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'q2', productTitle: 'T2', productPrice: 'P2' })
  // Truncate b to drop the second extract — sessions diverge in length.
  b.actions = b.actions.slice(0, -1)
  const result = inferParameters([a, b])
  // The search_query parameter should still be detected from the first
  // type action (which is at idx 1 in both sessions).
  assert.ok(result.parameters.some((p) => p.name === 'search_query'))
})

// ─── inferParamName ──────────────────────────────────────────────────

test('inferParamName: search-related → search_query', () => {
  assert.equal(inferParamName('search-input'), 'search_query')
  assert.equal(inferParamName('Cari di Tokopedia'), 'search_query')
  assert.equal(inferParamName('q'), 'search_query')
})

test('inferParamName: email → email', () => {
  assert.equal(inferParamName('email-field'), 'email')
})

test('inferParamName: phone variants', () => {
  assert.equal(inferParamName('phone'), 'phone')
  assert.equal(inferParamName('telp'), 'phone')
  assert.equal(inferParamName('hp'), 'phone')
})

test('inferParamName: Indonesian variants (nama, alamat, tanggal, kode)', () => {
  assert.equal(inferParamName('nama-lengkap'), 'name')
  assert.equal(inferParamName('alamat-rumah'), 'address')
  assert.equal(inferParamName('tanggal-lahir'), 'date')
  assert.equal(inferParamName('kode-otp'), 'code')
})

test('inferParamName: falls back to snake_case of input + strip non-alpha', () => {
  assert.equal(inferParamName('My Custom Field 123!'), 'my_custom_field_123')
})

test('inferParamName: empty input → "input"', () => {
  assert.equal(inferParamName(''), 'input')
  assert.equal(inferParamName('   '), 'input')
})

// ─── inferParamType ──────────────────────────────────────────────────

test('inferParamType: all-numeric → number', () => {
  assert.equal(inferParamType(['1', '2', '3.14']), 'number')
})

test('inferParamType: all-boolean → boolean', () => {
  assert.equal(inferParamType(['true', 'false']), 'boolean')
})

test('inferParamType: mixed → string', () => {
  assert.equal(inferParamType(['1', 'foo']), 'string')
})

test('inferParamType: empty → string default', () => {
  assert.equal(inferParamType([]), 'string')
})
