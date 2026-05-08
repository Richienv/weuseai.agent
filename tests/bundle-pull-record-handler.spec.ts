/**
 * Tests for bundle-pull-record-handler (Phase 2E-2 Day 1).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bundlePullRecordHandler,
  PULL_STATUSES,
  type PullStatus,
  type RecordWriter,
} from '../supabase/functions/_shared/bundle-pull-record-handler.ts'

// ─── helpers ──────────────────────────────────────────────────────────

const recording = (): {
  writer: RecordWriter
  rows: Array<Record<string, unknown>>
} => {
  const rows: Array<Record<string, unknown>> = []
  let counter = 0
  const writer: RecordWriter = async (row) => {
    rows.push(row)
    return { ok: true, id: 'row_' + counter++ }
  }
  return { writer, rows }
}

const failingWriter: RecordWriter = async () => ({
  ok: false,
  error: 'simulated DB failure',
})

const baseInput = {
  customer_id: 'cust_1',
  agent_slug: 'doc-expert',
  status: 'success' as PullStatus,
}

// ─── happy path ────────────────────────────────────────────────────────

test('record: minimal valid input is accepted', async () => {
  const { writer, rows } = recording()
  const r = await bundlePullRecordHandler(baseInput, writer)
  assert.equal(r.ok, true)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].customer_id, 'cust_1')
  assert.equal(rows[0].agent_slug, 'doc-expert')
  assert.equal(rows[0].status, 'success')
})

test('record: full input with all optional fields', async () => {
  const { writer, rows } = recording()
  const r = await bundlePullRecordHandler(
    {
      ...baseInput,
      version_requested: '1.0.0',
      version_installed: '1.0.0',
      bytes_pulled: 1234567,
      duration_ms: 4500,
    },
    writer,
  )
  assert.equal(r.ok, true)
  assert.equal(rows[0].version_requested, '1.0.0')
  assert.equal(rows[0].version_installed, '1.0.0')
  assert.equal(rows[0].bytes_pulled, 1234567)
  assert.equal(rows[0].duration_ms, 4500)
})

// ─── all 5 status values accepted ─────────────────────────────────────

test('record: all 5 PULL_STATUSES are accepted', async () => {
  for (const status of PULL_STATUSES) {
    const { writer } = recording()
    const r = await bundlePullRecordHandler({ ...baseInput, status }, writer)
    assert.equal(r.ok, true, `${status} should be accepted`)
  }
})

// ─── input validation ─────────────────────────────────────────────────

test('record: rejects missing customer_id', async () => {
  const { writer } = recording()
  const r = await bundlePullRecordHandler({ ...baseInput, customer_id: '' }, writer)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'invalid_customer_id')
})

test('record: rejects missing agent_slug', async () => {
  const { writer } = recording()
  const r = await bundlePullRecordHandler({ ...baseInput, agent_slug: '' }, writer)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'invalid_agent_slug')
})

test('record: rejects unknown status value', async () => {
  const { writer } = recording()
  const r = await bundlePullRecordHandler(
    // @ts-expect-error testing invalid status
    { ...baseInput, status: 'partial' },
    writer,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'invalid_status')
})

// ─── defensive coercion ────────────────────────────────────────────────

test('record: NaN bytes_pulled coerced to undefined (not stored)', async () => {
  const { writer, rows } = recording()
  await bundlePullRecordHandler(
    { ...baseInput, bytes_pulled: Number.NaN },
    writer,
  )
  assert.equal(rows[0].bytes_pulled, undefined)
})

test('record: Infinity duration_ms coerced to undefined', async () => {
  const { writer, rows } = recording()
  await bundlePullRecordHandler(
    { ...baseInput, duration_ms: Infinity },
    writer,
  )
  assert.equal(rows[0].duration_ms, undefined)
})

test('record: error_detail truncated to 1000 chars', async () => {
  const { writer, rows } = recording()
  const huge = 'X'.repeat(5000)
  await bundlePullRecordHandler(
    { ...baseInput, status: 'failed', error_detail: huge },
    writer,
  )
  const stored = rows[0].error_detail as string
  assert.equal(stored.length, 1000)
})

// ─── DB write failure ─────────────────────────────────────────────────

test('record: DB write failure returns 500 with detail', async () => {
  const r = await bundlePullRecordHandler(baseInput, failingWriter)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'record_write_failed')
    assert.match(r.detail!, /simulated DB failure/)
  }
})
