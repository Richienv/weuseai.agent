/**
 * Tests for workflow-types.ts (Hermes-native, post-pivot 2026-05-08).
 *
 * Covers:
 *   - enum tuples (slimmed; no DiscoverMatch / DiscoverOutput)
 *   - parseHandlerRef discriminated union
 *   - TIER_ORDINAL ordering
 *
 * Removed (architecture pivot dropped these):
 *   - shouldAutoExecute + threshold tests (no platform-side discover)
 *   - DiscoverMatch / DiscoverOutput shape tests
 *   - Floating-point boundary case (no longer relevant)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseHandlerRef,
  TIER_ORDINAL,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EXECUTION_TYPES,
  WORKFLOW_OUTPUT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_TIERS,
} from '../supabase/functions/_shared/workflow-types.ts'

// ─── Enum tuples ───────────────────────────────────────────────────────

test('WORKFLOW_CATEGORIES has the 6 categories', () => {
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
  assert.equal(parseHandlerRef('mcp:gmail.send'), null)
})

test('parseHandlerRef: malformed input returns null', () => {
  assert.equal(parseHandlerRef(''), null)
  assert.equal(parseHandlerRef('no-colon-at-all'), null)
  assert.equal(parseHandlerRef(':'), null)
  assert.equal(parseHandlerRef('edge-fn:'), null)
  assert.equal(parseHandlerRef(':invoice-generator'), null)
})
