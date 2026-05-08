/**
 * Tests for workflow-list-handler.ts.
 *
 * Strategy: inject a fake reader function that returns canned WorkflowRow
 * arrays. We don't touch a real Supabase client at this layer — that's
 * exercised by the deno-serve entrypoint integration test (separate).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  workflowListHandler,
  type ListReader,
} from '../supabase/functions/_shared/workflow-list-handler.ts'
import type { WorkflowRow } from '../supabase/functions/_shared/workflow-types.ts'

function row(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    id: 'row-' + Math.random().toString(36).slice(2, 8),
    slug: 'test-workflow',
    name_id: 'Test Workflow',
    description_id: 'Test description',
    agent_slugs: ['the-pro'],
    category: 'analysis',
    parameters_schema: { type: 'object', properties: {} },
    execution_type: 'edge-function',
    handler_ref: 'edge-fn:test-handler',
    output_type: 'json',
    tier: 'starter',
    version: 1,
    success_rate: 0,
    avg_duration_ms: 0,
    usage_count: 0,
    created_at: '2026-05-07T00:00:00Z',
    updated_at: '2026-05-07T00:00:00Z',
    ...overrides,
  }
}

const fakeReader = (rows: WorkflowRow[]): ListReader => {
  return async () => rows
}

const seenFilter = (): { reader: ListReader; lastFilter: { value: unknown } } => {
  const lastFilter = { value: undefined as unknown }
  const reader: ListReader = async (filter) => {
    lastFilter.value = filter
    return []
  }
  return { reader, lastFilter }
}

// ─── happy path ────────────────────────────────────────────────────────

test('list: returns ok + array of public-shape items, no sensitive fields', async () => {
  const r = await workflowListHandler(
    {},
    fakeReader([
      row({ slug: 'invoice-generator', handler_ref: 'edge-fn:invoice-generator-handler', success_rate: 0.95 }),
    ]),
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.workflows.length, 1)
  const item = r.workflows[0]
  // Public fields present
  assert.equal(item.slug, 'invoice-generator')
  assert.equal(item.name_id, 'Test Workflow')
  // Sensitive fields NOT present
  assert.equal((item as Record<string, unknown>).handler_ref, undefined)
  assert.equal((item as Record<string, unknown>).success_rate, undefined)
  assert.equal((item as Record<string, unknown>).avg_duration_ms, undefined)
  assert.equal((item as Record<string, unknown>).usage_count, undefined)
})

test('list: empty result is ok with empty array', async () => {
  const r = await workflowListHandler({}, fakeReader([]))
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.workflows, [])
})

// ─── filter passthrough ────────────────────────────────────────────────

test('list: agent_slug filter passed to reader', async () => {
  const { reader, lastFilter } = seenFilter()
  await workflowListHandler({ agent_slug: 'doc-expert' }, reader)
  assert.deepEqual(lastFilter.value, { agent_slug: 'doc-expert', category: undefined, tier: undefined })
})

test('list: category filter passed to reader', async () => {
  const { reader, lastFilter } = seenFilter()
  await workflowListHandler({ category: 'template' }, reader)
  assert.deepEqual(lastFilter.value, { agent_slug: undefined, category: 'template', tier: undefined })
})

test('list: tier filter passed to reader', async () => {
  const { reader, lastFilter } = seenFilter()
  await workflowListHandler({ tier: 'pro' }, reader)
  assert.deepEqual(lastFilter.value, { agent_slug: undefined, category: undefined, tier: 'pro' })
})

test('list: combined filters all passed', async () => {
  const { reader, lastFilter } = seenFilter()
  await workflowListHandler(
    { agent_slug: 'video-producer', category: 'generation', tier: 'pro' },
    reader,
  )
  assert.deepEqual(lastFilter.value, {
    agent_slug: 'video-producer',
    category: 'generation',
    tier: 'pro',
  })
})

// ─── validation errors ────────────────────────────────────────────────

test('list: rejects empty agent_slug as 400', async () => {
  const r = await workflowListHandler({ agent_slug: '' }, fakeReader([]))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_agent_slug')
  }
})

test('list: rejects unknown category as 400 with allowed values', async () => {
  const r = await workflowListHandler({ category: 'cooking' }, fakeReader([]))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_category')
    assert.match(r.detail!, /booking/)
    assert.match(r.detail!, /template/)
  }
})

test('list: rejects unknown tier as 400', async () => {
  const r = await workflowListHandler({ tier: 'free' }, fakeReader([]))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_tier')
    assert.match(r.detail!, /starter/)
  }
})

test('list: invalid filter is rejected before reader is called', async () => {
  let readerCalled = false
  const r = await workflowListHandler(
    { category: 'cooking' },
    async () => {
      readerCalled = true
      return []
    },
  )
  assert.equal(r.ok, false)
  assert.equal(readerCalled, false, 'reader must not be called on invalid filter')
})
