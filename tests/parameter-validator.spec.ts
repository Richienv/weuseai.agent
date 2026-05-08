/**
 * Tests for parameter-validator.ts — JSON Schema subset validator.
 *
 * Covers the schema features the 3 pilot workflows actually use:
 *   - object: required, properties, defaults
 *   - string: minLength/maxLength, enum, pattern, format=date
 *   - number/integer: minimum/maximum, enum
 *   - boolean
 *   - array: items, minItems, maxItems
 *   - nested objects + arrays
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  requiredFieldsOf,
  validateAgainstSchema,
} from '../supabase/functions/_shared/parameter-validator.ts'

// Helper: shorthand for a successful validation that returns a value.
function passes(value: unknown, schema: Record<string, unknown>): unknown {
  const r = validateAgainstSchema(value, schema)
  if (!r.ok) {
    assert.fail(`expected ok, got errors: ${JSON.stringify(r.errors)}`)
  }
  return r.value
}

function fails(value: unknown, schema: Record<string, unknown>): string[] {
  const r = validateAgainstSchema(value, schema)
  if (r.ok) {
    assert.fail(`expected fail, got ok: ${JSON.stringify(r.value)}`)
  }
  return r.errors
}

// ─── strings ──────────────────────────────────────────────────────────

test('string: accepts a basic string', () => {
  passes('hello', { type: 'string' })
})

test('string: rejects non-string', () => {
  const errs = fails(123, { type: 'string' })
  assert.match(errs[0], /expected string/)
})

test('string: minLength enforced', () => {
  passes('hello', { type: 'string', minLength: 3 })
  const errs = fails('hi', { type: 'string', minLength: 3 })
  assert.match(errs[0], /< minLength 3/)
})

test('string: maxLength enforced', () => {
  passes('hi', { type: 'string', maxLength: 5 })
  const errs = fails('hello world', { type: 'string', maxLength: 5 })
  assert.match(errs[0], /> maxLength 5/)
})

test('string: enum enforced', () => {
  passes('IDR', { type: 'string', enum: ['IDR', 'USD'] })
  const errs = fails('EUR', { type: 'string', enum: ['IDR', 'USD'] })
  assert.match(errs[0], /must be one of/)
})

test('string: pattern enforced', () => {
  passes('#trending', { type: 'string', pattern: '^#[a-zA-Z0-9_]+$' })
  const errs = fails('no-hash', { type: 'string', pattern: '^#[a-zA-Z0-9_]+$' })
  assert.match(errs[0], /does not match pattern/)
})

test('string: format=date accepts YYYY-MM-DD', () => {
  passes('2026-05-07', { type: 'string', format: 'date' })
})

test('string: format=date rejects timestamps + bad format', () => {
  const e1 = fails('2026-05-07T12:00:00Z', { type: 'string', format: 'date' })
  assert.match(e1[0], /YYYY-MM-DD format/)
  const e2 = fails('07/05/2026', { type: 'string', format: 'date' })
  assert.match(e2[0], /YYYY-MM-DD format/)
})

test('string: format=date rejects impossible dates', () => {
  // Note: JS Date treats Feb 30 as overflow to Mar 2; we validate the
  // format regex first (which passes) then construct Date and check NaN
  // for truly malformed values like "2026-13-99".
  const errs = fails('2026-13-45', { type: 'string', format: 'date' })
  // Regex fails first because day 45 doesn't match \d{2} bounds (it does
  // match — \d{2}). Date construction then yields NaN.
  // Either way, an error is raised.
  assert.ok(errs.length > 0, 'expected at least one error')
})

// ─── numbers ──────────────────────────────────────────────────────────

test('integer: accepts integers, rejects floats', () => {
  passes(42, { type: 'integer' })
  const errs = fails(3.14, { type: 'integer' })
  assert.match(errs[0], /expected integer/)
})

test('number: accepts integer + float', () => {
  passes(42, { type: 'number' })
  passes(3.14, { type: 'number' })
})

test('number: minimum + maximum enforced', () => {
  passes(0.5, { type: 'number', minimum: 0, maximum: 1 })
  fails(-0.1, { type: 'number', minimum: 0, maximum: 1 })
  fails(1.5, { type: 'number', minimum: 0, maximum: 1 })
})

test('integer: enum enforced (e.g. length: 15|30|60|90)', () => {
  const schema = { type: 'integer', enum: [15, 30, 60, 90] }
  passes(30, schema)
  const errs = fails(45, schema)
  assert.match(errs[0], /must be one of/)
})

test('number: rejects NaN and Infinity', () => {
  fails(Number.NaN, { type: 'number' })
  fails(Infinity, { type: 'number' })
})

// ─── boolean ──────────────────────────────────────────────────────────

test('boolean: accepts true/false', () => {
  passes(true, { type: 'boolean' })
  passes(false, { type: 'boolean' })
})

test('boolean: rejects truthy non-bools', () => {
  fails(1, { type: 'boolean' })
  fails('true', { type: 'boolean' })
})

// ─── arrays ───────────────────────────────────────────────────────────

test('array: validates items against item schema', () => {
  passes(
    ['a', 'b', 'c'],
    { type: 'array', items: { type: 'string' } },
  )
  const errs = fails(
    ['a', 1, 'c'],
    { type: 'array', items: { type: 'string' } },
  )
  assert.match(errs[0], /\[1\]: expected string/)
})

test('array: minItems + maxItems enforced', () => {
  const schema = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 }
  passes(['a'], schema)
  passes(['a', 'b', 'c'], schema)
  fails([], schema)
  fails(['a', 'b', 'c', 'd'], schema)
})

// ─── objects ──────────────────────────────────────────────────────────

test('object: required fields enforced', () => {
  const schema = {
    type: 'object',
    required: ['name', 'age'],
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
    },
  }
  passes({ name: 'Sarah', age: 30 }, schema)
  const errs = fails({ name: 'Sarah' }, schema)
  assert.match(errs[0], /missing required property "age"/)
})

test('object: defaults applied for missing optional fields', () => {
  const schema = {
    type: 'object',
    properties: {
      tax_rate: { type: 'number', default: 0.11 },
      currency: { type: 'string', default: 'IDR' },
    },
  }
  const r = validateAgainstSchema({}, schema)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.value, { tax_rate: 0.11, currency: 'IDR' })
  }
})

test('object: rejects null + array (typeof object pitfalls)', () => {
  const schema = { type: 'object', properties: {} }
  fails(null, schema)
  fails(['a'], schema)
})

test('object: nested object validation works', () => {
  const schema = {
    type: 'object',
    required: ['client'],
    properties: {
      client: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
        },
      },
    },
  }
  passes({ client: { name: 'Acme' } }, schema)
  const errs = fails({ client: { name: '' } }, schema)
  assert.match(errs[0], /client\.name: length 0 < minLength 1/)
})

test('object: invoice-style nested array validation', () => {
  // Mirrors invoice-generator parameters_schema (key pilot use case).
  const schema = {
    type: 'object',
    required: ['client_name', 'items'],
    properties: {
      client_name: { type: 'string', minLength: 1, maxLength: 200 },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['description', 'qty', 'unit_price'],
          properties: {
            description: { type: 'string', minLength: 1 },
            qty: { type: 'number', minimum: 0 },
            unit_price: { type: 'number', minimum: 0 },
          },
        },
      },
      tax_rate: { type: 'number', minimum: 0, maximum: 1, default: 0.11 },
    },
  }
  const r = validateAgainstSchema(
    {
      client_name: 'PT Acme Indonesia',
      items: [{ description: 'Konsultasi', qty: 10, unit_price: 500_000 }],
    },
    schema,
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    const v = r.value as Record<string, unknown>
    assert.equal(v.tax_rate, 0.11, 'default applied')
  }
})

test('object: nested-array item errors include array index path', () => {
  const schema = {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['qty'],
          properties: { qty: { type: 'number', minimum: 0 } },
        },
      },
    },
  }
  const errs = fails(
    { items: [{ qty: 5 }, { qty: -1 }] },
    schema,
  )
  // path should point to items[1].qty
  assert.ok(
    errs.some((e) => /items\[1\]\.qty: -1 < minimum 0/.test(e)),
    `expected items[1].qty error, got: ${JSON.stringify(errs)}`,
  )
})

// ─── requiredFieldsOf ────────────────────────────────────────────────

test('requiredFieldsOf: returns the required array for an object schema', () => {
  assert.deepEqual(
    requiredFieldsOf({ type: 'object', required: ['a', 'b'] }),
    ['a', 'b'],
  )
})

test('requiredFieldsOf: returns [] when no required field', () => {
  assert.deepEqual(requiredFieldsOf({ type: 'object', properties: {} }), [])
})

test('requiredFieldsOf: returns [] for non-object schema', () => {
  assert.deepEqual(requiredFieldsOf({ type: 'string' }), [])
})
