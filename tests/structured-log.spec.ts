/**
 * Tests for slog() — the structured JSON logger. Its one hard contract:
 * logging must NEVER throw, because it sits on caller catch/failure paths
 * (security audit L5, 2026-06-14).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { slog } from '../supabase/functions/_shared/structured-log.ts'

// Capture console output without polluting the test run.
function capture(level: 'info' | 'warn' | 'error', fn: () => void): string[] {
  const original = console[level]
  const lines: string[] = []
  console[level] = (...args: unknown[]) => lines.push(String(args[0]))
  try {
    fn()
  } finally {
    console[level] = original
  }
  return lines
}

test('slog: emits one JSON line with ts, level, event, and flattened fields', () => {
  const [line] = capture('error', () =>
    slog('error', 'provision.notify_failed', { customerId: 'abc', degraded: true }),
  )
  const parsed = JSON.parse(line)
  assert.equal(parsed.level, 'error')
  assert.equal(parsed.event, 'provision.notify_failed')
  assert.equal(parsed.customerId, 'abc')
  assert.equal(parsed.degraded, true)
  assert.ok(typeof parsed.ts === 'string')
})

test('slog: does NOT throw on a BigInt field (serialises it as a string)', () => {
  const lines = capture('warn', () => {
    assert.doesNotThrow(() =>
      // String constructor avoids the Number-literal precision loss that
      // BigInt(9007199254740993) would suffer before conversion.
      slog('warn', 'test.bigint', { n: BigInt('9007199254740993') }),
    )
  })
  const parsed = JSON.parse(lines[0])
  assert.equal(parsed.event, 'test.bigint')
  assert.equal(parsed.n, '9007199254740993')
})

test('slog: does NOT throw on a circular reference (falls back, keeps the signal)', () => {
  const circular: Record<string, unknown> = { a: 1 }
  circular.self = circular
  const lines = capture('error', () => {
    assert.doesNotThrow(() => slog('error', 'test.circular', { circular }))
  })
  const parsed = JSON.parse(lines[0])
  // Fallback keeps event + level so the signal isn't lost.
  assert.equal(parsed.event, 'test.circular')
  assert.equal(parsed.level, 'error')
  assert.equal(parsed._slog_error, 'fields_not_serialisable')
})
