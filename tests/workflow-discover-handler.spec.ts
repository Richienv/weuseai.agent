/**
 * Tests for workflow-discover-handler.
 *
 * All dependencies (customer lookup, embedding, vector search, LLM
 * extraction) are injected, so this test file mocks the I/O entirely.
 * Real I/O is exercised by the edge-function entrypoint integration test.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExtractionPrompt,
  workflowDiscoverHandler,
  type CustomerInfo,
  type DiscoverDeps,
} from '../supabase/functions/_shared/workflow-discover-handler.ts'
import type { WorkflowRow } from '../supabase/functions/_shared/workflow-types.ts'

const FAKE_VECTOR = new Array(1536).fill(0.001)

function customerOk(): CustomerInfo {
  return { id: 'cust-1', tier: 'pro' }
}

function row(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    id: 'wf-' + Math.random().toString(36).slice(2, 8),
    slug: 'invoice-generator',
    name_id: 'Generator Invoice',
    description_id: 'Bikin invoice',
    agent_slugs: ['doc-expert'],
    category: 'template',
    intent_phrases: ['bikin invoice'],
    intent_embedding: null,
    parameters_schema: {
      type: 'object',
      required: ['client_name', 'items'],
      properties: {
        client_name: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        tax_rate: { type: 'number' },
      },
    },
    execution_type: 'edge-function',
    handler_ref: 'edge-fn:invoice-generator-handler',
    output_type: 'file',
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

function deps(opts: {
  customer?: CustomerInfo | null
  embedReturn?: number[] | null
  searchResults?: Array<{ row: WorkflowRow; confidence: number }>
  searchThrows?: Error
  extractReturn?: Record<string, unknown>
  extractThrows?: Error
}): DiscoverDeps {
  return {
    customerLookup: async () => opts.customer === undefined ? customerOk() : opts.customer,
    embedFn: async () => (opts.embedReturn !== undefined ? opts.embedReturn : FAKE_VECTOR),
    vectorSearchFn: async () => {
      if (opts.searchThrows) throw opts.searchThrows
      return opts.searchResults ?? []
    },
    llmExtractFn: async () => {
      if (opts.extractThrows) throw opts.extractThrows
      return opts.extractReturn ?? {}
    },
  }
}

const baseInput = {
  customer_id: 'cust-1',
  agent_slug: 'doc-expert',
  message_text: 'bikin invoice untuk PT Acme',
}

// ─── input validation ──────────────────────────────────────────────────

test('discover: rejects missing customer_id (400)', async () => {
  const r = await workflowDiscoverHandler({ ...baseInput, customer_id: '' }, deps({}))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 400)
})

test('discover: rejects missing agent_slug (400)', async () => {
  const r = await workflowDiscoverHandler({ ...baseInput, agent_slug: '' }, deps({}))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 400)
})

test('discover: rejects empty message_text (400)', async () => {
  const r = await workflowDiscoverHandler({ ...baseInput, message_text: '   \n  ' }, deps({}))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'empty_message_text')
})

test('discover: rejects > 2000 char message (400)', async () => {
  const r = await workflowDiscoverHandler(
    { ...baseInput, message_text: 'a'.repeat(2001) },
    deps({}),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'message_too_long')
})

test('discover: 404 when customer not found', async () => {
  const r = await workflowDiscoverHandler(baseInput, deps({ customer: null }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 404)
})

test('discover: 500 when embed fails', async () => {
  const r = await workflowDiscoverHandler(baseInput, deps({ embedReturn: null }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'embed_failed')
  }
})

test('discover: 500 when vector search throws', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({ searchThrows: new Error('pgvector down') }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'vector_search_failed')
  }
})

// ─── happy path ────────────────────────────────────────────────────────

test('discover: top-1 auto-execute path runs extraction + recomputes missing', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      searchResults: [
        { row: row(), confidence: 0.92 },
        { row: row({ slug: 'other-wf', name_id: 'Other' }), confidence: 0.41 },
      ],
      extractReturn: { client_name: 'PT Acme' },
    }),
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  const matches = r.body.matches
  assert.equal(matches.length, 2)
  assert.equal(matches[0].confidence, 0.92)
  assert.equal(matches[0].slug, 'invoice-generator')
  // Extraction fired only for top-1 (auto-execute true: 0.92 >= 0.85,
  // gap 0.51 >= 0.10).
  assert.deepEqual(matches[0].extracted_parameters, { client_name: 'PT Acme' })
  // 'items' is required + missing from extraction
  assert.ok(matches[0].missing_parameters.includes('items'))
  // 'client_name' is required but extracted, so NOT in missing
  assert.equal(matches[0].missing_parameters.includes('client_name'), false)
  // Top-2 had NO extraction fired; missing_parameters lists everything required.
  assert.deepEqual(
    matches[1].extracted_parameters,
    {},
    'top-2 should have empty extracted_parameters (cost optimization)',
  )
  assert.deepEqual(
    matches[1].missing_parameters.sort(),
    ['client_name', 'items'],
  )
})

test('discover: ambiguous matches (gap < 0.10) → no extraction call (cost optimization)', async () => {
  let extractCalls = 0
  const customDeps = deps({
    searchResults: [
      { row: row(), confidence: 0.92 },
      { row: row({ slug: 'other-wf' }), confidence: 0.85 },  // gap = 0.07
    ],
  })
  customDeps.llmExtractFn = async () => {
    extractCalls++
    return { client_name: 'PT Acme' }
  }
  const r = await workflowDiscoverHandler(baseInput, customDeps)
  assert.equal(r.ok, true)
  if (!r.ok) return
  // No extraction call when ambiguous.
  assert.equal(extractCalls, 0)
  assert.equal(r.body.auto_execute_recommended, false)
  // Both matches have empty extracted + every required field listed missing.
  for (const m of r.body.matches) {
    assert.deepEqual(m.extracted_parameters, {})
    assert.deepEqual(m.missing_parameters.sort(), ['client_name', 'items'])
  }
})

test('discover: extraction fires exactly ONCE for top-1 (not per match)', async () => {
  let extractCalls = 0
  const seenSlugs: string[] = []
  const customDeps = deps({
    searchResults: [
      { row: row({ slug: 'invoice-generator' }), confidence: 0.95 },
      { row: row({ slug: 'unrelated-wf-1' }), confidence: 0.40 },
      { row: row({ slug: 'unrelated-wf-2' }), confidence: 0.30 },
    ],
  })
  customDeps.llmExtractFn = async ({ workflowSlug }) => {
    extractCalls++
    seenSlugs.push(workflowSlug)
    return {}
  }
  await workflowDiscoverHandler(baseInput, customDeps)
  assert.equal(extractCalls, 1, 'one extraction call only')
  assert.deepEqual(seenSlugs, ['invoice-generator'], 'top-1 only')
})

test('discover: auto_execute_recommended=true when top-1 ≥ 0.85 and gap ≥ 0.10', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      searchResults: [
        { row: row(), confidence: 0.92 },
        { row: row({ slug: 'other' }), confidence: 0.41 },
      ],
    }),
  )
  if (!r.ok) assert.fail('expected ok')
  assert.equal(r.body.auto_execute_recommended, true)
})

test('discover: auto_execute_recommended=false when ambiguous (top-1 vs top-2 gap < 0.10)', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      searchResults: [
        { row: row(), confidence: 0.92 },
        { row: row({ slug: 'other' }), confidence: 0.88 },
      ],
    }),
  )
  if (!r.ok) assert.fail('expected ok')
  assert.equal(r.body.auto_execute_recommended, false)
})

test('discover: auto_execute_recommended=false when top-1 < 0.85', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      searchResults: [{ row: row(), confidence: 0.84 }],
    }),
  )
  if (!r.ok) assert.fail('expected ok')
  assert.equal(r.body.auto_execute_recommended, false)
})

test('discover: empty result is ok with empty matches array', async () => {
  const r = await workflowDiscoverHandler(baseInput, deps({ searchResults: [] }))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.body.matches, [])
    assert.equal(r.body.auto_execute_recommended, false)
  }
})

// ─── extraction failure isolation ──────────────────────────────────────

test('discover: LLM extract throw on top-1 auto-execute path returns empty + missing populated', async () => {
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      // Single match at 0.91 → above 0.85 threshold + only 1 result so
      // gap rule auto-passes → auto_execute_recommended=true → extraction
      // is invoked → extraction throws → we fall back to empty.
      searchResults: [{ row: row(), confidence: 0.91 }],
      extractThrows: new Error('OpenRouter 503'),
    }),
  )
  assert.equal(r.ok, true, 'whole discovery does NOT fail on extraction error')
  if (!r.ok) return
  assert.deepEqual(r.body.matches[0].extracted_parameters, {})
  // Both required fields show up as missing since extraction returned nothing.
  assert.deepEqual(
    r.body.matches[0].missing_parameters.sort(),
    ['client_name', 'items'],
  )
})

test('discover: invalid extracted field stripped via per-field schema validation', async () => {
  // LLM returns amount as a string — schema says number → strip + mark missing.
  const r = await workflowDiscoverHandler(
    baseInput,
    deps({
      searchResults: [{ row: row(), confidence: 0.95 }],
      // amount is unknown to the schema (test row only declares client_name,
      // items, tax_rate) → stripped as unknown property regardless of value.
      extractReturn: { client_name: 'PT Acme', amount: 'three million' },
    }),
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  // 'amount' isn't even in the schema for invoice-generator (the test row
  // schema only has client_name + items + tax_rate). 'amount' gets stripped
  // as unknown property regardless of value type.
  assert.equal(
    'amount' in r.body.matches[0].extracted_parameters,
    false,
    'unknown property "amount" stripped',
  )
  // client_name is valid, kept.
  assert.equal(r.body.matches[0].extracted_parameters.client_name, 'PT Acme')
})

// ─── tier filtering passed to vector search ────────────────────────────

test('discover: passes correct tier ordinal + agent_slug to vector search', async () => {
  const seenSearch = { params: undefined as unknown }
  const customDeps: DiscoverDeps = {
    ...deps({}),
    vectorSearchFn: async (params) => {
      seenSearch.params = params
      return []
    },
  }
  await workflowDiscoverHandler(baseInput, customDeps)
  const params = seenSearch.params as Record<string, unknown>
  assert.equal(params.agentSlug, 'doc-expert')
  assert.equal(params.customerTierOrd, 2) // pro = 2
  assert.equal(params.limit, 3)
})

// ─── prompt builder ────────────────────────────────────────────────────

test('buildExtractionPrompt: includes workflow slug + schema + message', () => {
  const { system, user } = buildExtractionPrompt({
    messageText: 'bikin invoice untuk PT Acme',
    parametersSchema: { type: 'object', required: ['client_name'] },
    workflowSlug: 'invoice-generator',
  })
  assert.match(system, /invoice-generator/)
  assert.match(system, /client_name/)
  assert.match(system, /JSON object SAJA/)
  assert.match(user, /PT Acme/)
})

test('buildExtractionPrompt: discourages hallucination', () => {
  const { system } = buildExtractionPrompt({
    messageText: 'x',
    parametersSchema: {},
    workflowSlug: 'x',
  })
  // Critical: instruct LLM NOT to invent fields it can't see.
  assert.match(system, /Jangan tebak/)
  assert.match(system, /BENAR-BENAR ada di pesan/)
})
