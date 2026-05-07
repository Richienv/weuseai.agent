/**
 * Tests for workflow-types.ts shared helpers.
 *
 * Covers:
 *   - parseHandlerRef — discriminated union parser for handler_ref strings
 *   - shouldAutoExecute — top-K + threshold + gap rule
 *   - TIER_ORDINAL — ordering correctness
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTO_EXECUTE_CONFIDENCE_THRESHOLD,
  AUTO_EXECUTE_GAP_THRESHOLD,
  parseHandlerRef,
  shouldAutoExecute,
  TIER_ORDINAL,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EXECUTION_TYPES,
  WORKFLOW_OUTPUT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_TIERS,
} from '../supabase/functions/_shared/workflow-types.ts'
import type { DiscoverMatch } from '../supabase/functions/_shared/workflow-types.ts'

// ─── Enum tuples ───────────────────────────────────────────────────────

test('WORKFLOW_CATEGORIES has the 6 categories from the spec', () => {
  assert.deepEqual(
    [...WORKFLOW_CATEGORIES].sort(),
    ['analysis', 'automation', 'booking', 'generation', 'scraping', 'template'],
  )
})

test('WORKFLOW_EXECUTION_TYPES has 4 types', () => {
  assert.deepEqual(
    [...WORKFLOW_EXECUTION_TYPES].sort(),
    ['composite', 'edge-function', 'external-api', 'hermes-skill'],
  )
})

test('WORKFLOW_OUTPUT_TYPES has 4 types', () => {
  assert.deepEqual(
    [...WORKFLOW_OUTPUT_TYPES].sort(),
    ['file', 'json', 'side-effect', 'text'],
  )
})

test('WORKFLOW_TIERS aligns with subscriptions.tier (no "free")', () => {
  assert.deepEqual([...WORKFLOW_TIERS], ['starter', 'pro', 'studio'])
})

test('WORKFLOW_RUN_STATUSES has 4 states', () => {
  assert.deepEqual(
    [...WORKFLOW_RUN_STATUSES].sort(),
    ['failed', 'pending', 'running', 'success'],
  )
})

test('TIER_ORDINAL is monotonically increasing', () => {
  assert.equal(TIER_ORDINAL.starter, 1)
  assert.equal(TIER_ORDINAL.pro, 2)
  assert.equal(TIER_ORDINAL.studio, 3)
  assert.ok(TIER_ORDINAL.starter < TIER_ORDINAL.pro)
  assert.ok(TIER_ORDINAL.pro < TIER_ORDINAL.studio)
})

// ─── parseHandlerRef ───────────────────────────────────────────────────

test('parseHandlerRef: edge-fn:<name>', () => {
  assert.deepEqual(
    parseHandlerRef('edge-fn:invoice-generator-handler'),
    { kind: 'edge-fn', name: 'invoice-generator-handler' },
  )
})

test('parseHandlerRef: hermes-skill:<name>', () => {
  assert.deepEqual(
    parseHandlerRef('hermes-skill:daily-news-briefing-bahasa'),
    { kind: 'hermes-skill', name: 'daily-news-briefing-bahasa' },
  )
})

test('parseHandlerRef: external:<id>', () => {
  assert.deepEqual(
    parseHandlerRef('external:traveloka-flights-v1'),
    { kind: 'external', id: 'traveloka-flights-v1' },
  )
})

test('parseHandlerRef: composite:<slug>', () => {
  assert.deepEqual(
    parseHandlerRef('composite:weekly-recap-pipeline'),
    { kind: 'composite', slug: 'weekly-recap-pipeline' },
  )
})

test('parseHandlerRef: unknown kind returns null', () => {
  assert.equal(parseHandlerRef('unknown-kind:something'), null)
  assert.equal(parseHandlerRef('mcp:gmail.send'), null)  // not a registered kind
})

test('parseHandlerRef: malformed input returns null', () => {
  assert.equal(parseHandlerRef(''), null)
  assert.equal(parseHandlerRef('no-colon-at-all'), null)
  assert.equal(parseHandlerRef(':'), null)               // empty kind
  assert.equal(parseHandlerRef('edge-fn:'), null)        // empty name
  assert.equal(parseHandlerRef(':invoice-generator'), null) // empty kind side
})

// ─── shouldAutoExecute ─────────────────────────────────────────────────

const m = (confidence: number): DiscoverMatch => ({
  workflow_id: 'wf_' + confidence,
  slug: 'wf-' + confidence,
  name_id: 'wf ' + confidence,
  confidence,
  parameters_schema: { type: 'object' },
  extracted_parameters: {},
  missing_parameters: [],
})

test('shouldAutoExecute: empty array → false', () => {
  assert.equal(shouldAutoExecute([]), false)
})

test('shouldAutoExecute: top-1 below 0.85 → false (regardless of gap)', () => {
  assert.equal(shouldAutoExecute([m(0.84), m(0.10)]), false)
  assert.equal(shouldAutoExecute([m(0.50), m(0.10)]), false)
})

test('shouldAutoExecute: top-1 at exactly 0.85 → true (boundary inclusive)', () => {
  assert.equal(shouldAutoExecute([m(0.85), m(0.50)]), true)
})

test('shouldAutoExecute: gap exactly 0.10 → true (boundary inclusive)', () => {
  // top1 = 0.90, top2 = 0.80 → gap = 0.10, qualifies
  const matches = [m(0.90), m(0.80)]
  assert.equal(shouldAutoExecute(matches), true)
})

test('shouldAutoExecute: gap < 0.10 → false (ambiguous between top-1 and top-2)', () => {
  // top1 = 0.90, top2 = 0.83 → gap = 0.07, ambiguous, ask customer
  assert.equal(shouldAutoExecute([m(0.90), m(0.83)]), false)
})

test('shouldAutoExecute: single-element array → true iff above threshold', () => {
  assert.equal(shouldAutoExecute([m(0.95)]), true)
  assert.equal(shouldAutoExecute([m(0.84)]), false)
})

test('shouldAutoExecute: thresholds match the spec constants', () => {
  // If someone changes the constants, the test reveals the intent.
  assert.equal(AUTO_EXECUTE_CONFIDENCE_THRESHOLD, 0.85)
  assert.equal(AUTO_EXECUTE_GAP_THRESHOLD, 0.10)
})
