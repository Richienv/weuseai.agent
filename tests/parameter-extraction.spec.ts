/**
 * Tests for parameter-extraction.ts (Phase 2E-1 Q3a, option b).
 *
 * Covers:
 *   - Happy path (single LLM call returns valid JSON)
 *   - Currency parsing variants (LLM-side; we test that wiring passes
 *     extracted values through faithfully — actual parsing is the LLM's job)
 *   - Missing-required-field passthrough
 *   - Malformed JSON → retry once → success
 *   - Malformed JSON twice → fallback empty + telemetry fired
 *   - HTTP error → fallback graceful + telemetry fired
 *   - no_api_key → fallback + telemetry
 *   - Cost ceiling: maxTokens=200 enforced
 *   - validateExtractedFields: schema validation strips invalid + reports
 *   - validateExtractedFields: unknown property stripped
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExtractionPrompt,
  extractParametersFromMessage,
  validateExtractedFields,
  type ExtractionFailureReason,
} from '../supabase/functions/_shared/parameter-extraction.ts'
import {
  ORCHESTRATION_MAX_OUTPUT_TOKENS,
  PARAM_EXTRACTION_MODEL,
  type LlmJsonResponse,
} from '../supabase/functions/_shared/llm-client.ts'

const INVOICE_SCHEMA = {
  type: 'object',
  required: ['client_name', 'amount'],
  properties: {
    client_name: { type: 'string', minLength: 1 },
    amount: { type: 'number', minimum: 0 },
    note: { type: 'string', default: 'pembayaran rutin' },
    due_date: { type: 'string', format: 'date' },
  },
}

type FakeLlmCallSpy = {
  callCount: number
  capturedCalls: Array<{
    model: string | undefined
    maxTokens: number | undefined
    temperature: number | undefined
    systemContent: string
    userContent: string
  }>
}

function makeFakeLlm(
  responses: Array<LlmJsonResponse<unknown>>,
): { fn: typeof import('../supabase/functions/_shared/llm-client.ts').llmJsonCompletion; spy: FakeLlmCallSpy } {
  const spy: FakeLlmCallSpy = { callCount: 0, capturedCalls: [] }
  let idx = 0
  const fn = (async (opts: {
    model?: string
    maxTokens?: number
    temperature?: number
    messages: Array<{ role: string; content: string }>
  }) => {
    spy.callCount++
    spy.capturedCalls.push({
      model: opts.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      systemContent: opts.messages[0]?.content ?? '',
      userContent: opts.messages[1]?.content ?? '',
    })
    if (idx >= responses.length) {
      throw new Error('fake LLM ran out of canned responses')
    }
    return responses[idx++]
  }) as typeof import('../supabase/functions/_shared/llm-client.ts').llmJsonCompletion
  return { fn, spy }
}

const baseOpts = {
  apiKey: 'sk-or-test',
  messageText: 'bikin invoice 3jt klien PT Maju',
  parametersSchema: INVOICE_SCHEMA,
  workflowSlug: 'invoice-generator',
}

// ─── happy path ────────────────────────────────────────────────────────

test('extract: happy path — single call returns extracted object', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: true, result: { client_name: 'PT Maju', amount: 3_000_000 }, raw: '{...}' },
  ])
  const r = await extractParametersFromMessage({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.fallback, false)
  assert.deepEqual(r.extracted, { client_name: 'PT Maju', amount: 3_000_000 })
  assert.equal(spy.callCount, 1)
})

// ─── currency parsing variants (LLM-faithful passthrough) ──────────────

test('extract: passes currency variants through faithfully (LLM-side parsing)', async () => {
  // We don't test the LLM's parsing — we test that whatever JSON the LLM
  // returns gets passed through unchanged. Mocked LLM returns 3_000_000
  // for each currency form ("3jt", "Rp 3.000.000", "tiga juta", etc.).
  const variants = [
    'bikin invoice 3jt klien PT Maju',
    'tagihan PT Maju Rp 3.000.000',
    'invoice tiga juta untuk PT Maju',
    'PT Maju 3 juta',
    'invoice Rp 3,000,000 ke PT Maju',
  ]
  for (const messageText of variants) {
    const { fn } = makeFakeLlm([
      { ok: true, result: { client_name: 'PT Maju', amount: 3_000_000 }, raw: '{...}' },
    ])
    const r = await extractParametersFromMessage({ ...baseOpts, messageText, llmCallFn: fn })
    assert.equal(r.fallback, false, `currency variant: ${messageText}`)
    assert.equal(r.extracted.amount, 3_000_000)
  }
})

// ─── partial extraction (missing required field) ───────────────────────

test('extract: missing required field returned as-is (caller computes missing)', async () => {
  // LLM returns only client_name; amount unstated in customer message.
  const { fn } = makeFakeLlm([
    { ok: true, result: { client_name: 'PT Maju' }, raw: '{...}' },
  ])
  const r = await extractParametersFromMessage({
    ...baseOpts,
    messageText: 'bikin invoice untuk PT Maju',
    llmCallFn: fn,
  })
  assert.equal(r.fallback, false)
  assert.deepEqual(r.extracted, { client_name: 'PT Maju' })
  // Missing fields aren't computed here — that's the handler's job.
  // We just pass through the LLM's partial extraction.
})

// ─── retry on malformed JSON ───────────────────────────────────────────

test('extract: malformed JSON once → retry succeeds → returns extracted', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: false, reason: 'json_parse_failed', detail: 'unexpected token', raw: 'not json' },
    { ok: true, result: { client_name: 'PT Maju', amount: 3_000_000 }, raw: '{...}' },
  ])
  let failureCalled = false
  const r = await extractParametersFromMessage({
    ...baseOpts,
    llmCallFn: fn,
    onFailure: () => { failureCalled = true },
  })
  assert.equal(r.fallback, false)
  assert.deepEqual(r.extracted, { client_name: 'PT Maju', amount: 3_000_000 })
  assert.equal(spy.callCount, 2, 'retried exactly once')
  assert.equal(failureCalled, false, 'onFailure not called when retry succeeds')

  // Retry uses stricter prompt
  assert.match(spy.capturedCalls[1].systemContent, /RETRY ATTEMPT/)
  assert.match(spy.capturedCalls[1].systemContent, /MUST be a single JSON object/)
})

test('extract: malformed JSON twice → fallback empty + telemetry fired', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: false, reason: 'json_parse_failed', detail: 'a', raw: 'garbage 1' },
    { ok: false, reason: 'json_parse_failed', detail: 'b', raw: 'garbage 2 still bad' },
  ])
  const failures: Array<{ reason: ExtractionFailureReason; raw?: string }> = []
  const r = await extractParametersFromMessage({
    ...baseOpts,
    llmCallFn: fn,
    onFailure: (reason, raw) => failures.push({ reason, raw }),
  })
  assert.equal(r.fallback, true)
  assert.equal(r.reason, 'malformed_json_twice')
  assert.deepEqual(r.extracted, {})
  assert.equal(spy.callCount, 2)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].reason, 'malformed_json_twice')
  assert.equal(failures[0].raw, 'garbage 2 still bad')
  assert.equal(r.rawExcerpt, 'garbage 2 still bad')
})

// ─── HTTP / network errors → no retry, fallback immediately ────────────

test('extract: HTTP error on first call → no retry, fallback graceful', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: false, reason: 'http_error', status: 502, detail: 'bad gateway' },
  ])
  const failures: ExtractionFailureReason[] = []
  const r = await extractParametersFromMessage({
    ...baseOpts,
    llmCallFn: fn,
    onFailure: (reason) => failures.push(reason),
  })
  assert.equal(r.fallback, true)
  assert.equal(r.reason, 'http_error')
  assert.deepEqual(r.extracted, {})
  // No retry on HTTP errors — only on JSON-parse failures.
  assert.equal(spy.callCount, 1)
  assert.deepEqual(failures, ['http_error'])
})

test('extract: missing api key → fallback before any LLM call', async () => {
  const { fn, spy } = makeFakeLlm([])  // empty — should never be called
  const failures: ExtractionFailureReason[] = []
  const r = await extractParametersFromMessage({
    ...baseOpts,
    apiKey: '',
    llmCallFn: fn,
    onFailure: (reason) => failures.push(reason),
  })
  assert.equal(r.fallback, true)
  assert.equal(r.reason, 'no_api_key')
  assert.equal(spy.callCount, 0)
  assert.deepEqual(failures, ['no_api_key'])
})

// ─── bad response shape (non-object) → no retry, fallback ──────────────

test('extract: LLM returns array instead of object → bad_response fallback', async () => {
  const { fn } = makeFakeLlm([
    { ok: true, result: ['client_name', 'PT Maju'], raw: '[...]' } as never,
  ])
  const failures: ExtractionFailureReason[] = []
  const r = await extractParametersFromMessage({
    ...baseOpts,
    llmCallFn: fn,
    onFailure: (reason) => failures.push(reason),
  })
  assert.equal(r.fallback, true)
  assert.equal(r.reason, 'bad_response')
  assert.deepEqual(failures, ['bad_response'])
})

// ─── cost ceiling enforced ─────────────────────────────────────────────

test('extract: maxTokens capped at ORCHESTRATION_MAX_OUTPUT_TOKENS (200)', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: true, result: {}, raw: '{}' },
  ])
  await extractParametersFromMessage({ ...baseOpts, llmCallFn: fn })
  assert.equal(ORCHESTRATION_MAX_OUTPUT_TOKENS, 200)
  assert.equal(spy.capturedCalls[0].maxTokens, 200, 'attempt 1 uses cost ceiling')
})

test('extract: retry also respects maxTokens ceiling', async () => {
  const { fn, spy } = makeFakeLlm([
    { ok: false, reason: 'json_parse_failed', raw: 'bad 1' },
    { ok: true, result: {}, raw: '{}' },
  ])
  await extractParametersFromMessage({ ...baseOpts, llmCallFn: fn })
  assert.equal(spy.capturedCalls[0].maxTokens, 200, 'attempt 1')
  assert.equal(spy.capturedCalls[1].maxTokens, 200, 'attempt 2 (retry)')
})

test('extract: temperature pinned at 0 for deterministic extraction', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: {}, raw: '{}' }])
  await extractParametersFromMessage({ ...baseOpts, llmCallFn: fn })
  assert.equal(spy.capturedCalls[0].temperature, 0)
})

test('extract: model pinned at PARAM_EXTRACTION_MODEL (claude-3.5-haiku)', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: {}, raw: '{}' }])
  await extractParametersFromMessage({ ...baseOpts, llmCallFn: fn })
  assert.equal(spy.capturedCalls[0].model, PARAM_EXTRACTION_MODEL)
  assert.equal(PARAM_EXTRACTION_MODEL, 'anthropic/claude-3.5-haiku')
})

// ─── prompt content (Indonesian + English currency rules) ──────────────

test('buildExtractionPrompt: includes Rupiah parsing rules', () => {
  const { system } = buildExtractionPrompt({
    messageText: 'x',
    parametersSchema: {},
    workflowSlug: 'x',
  })
  // Currency parsing examples present (LLM uses these as in-context examples).
  assert.match(system, /3jt.*3000000/)
  assert.match(system, /Rp 3\.000\.000.*3000000/)
  assert.match(system, /tiga juta.*3000000/)
  assert.match(system, /500rb.*500000/)
})

test('buildExtractionPrompt: discourages hallucination', () => {
  const { system } = buildExtractionPrompt({
    messageText: 'x',
    parametersSchema: {},
    workflowSlug: 'x',
  })
  assert.match(system, /MENTIONED IN THE MESSAGE/)
  assert.match(system, /Do not guess/)
})

test('buildExtractionPrompt: instructs strict JSON output', () => {
  const { system } = buildExtractionPrompt({
    messageText: 'x',
    parametersSchema: {},
    workflowSlug: 'x',
  })
  assert.match(system, /No markdown, no code fences, no prose/)
  assert.match(system, /Start with `\{` and end with `\}`/)
})

// ─── validateExtractedFields ───────────────────────────────────────────

test('validateExtractedFields: keeps valid fields, strips invalid', () => {
  const { valid, invalid } = validateExtractedFields(
    { client_name: 'PT Maju', amount: 3_000_000, note: 'invoice' },
    INVOICE_SCHEMA,
  )
  assert.deepEqual(valid, { client_name: 'PT Maju', amount: 3_000_000, note: 'invoice' })
  assert.deepEqual(invalid, [])
})

test('validateExtractedFields: strips wrong-type field', () => {
  // LLM returned amount as a string instead of number.
  const { valid, invalid } = validateExtractedFields(
    { client_name: 'PT Maju', amount: 'three million' },
    INVOICE_SCHEMA,
  )
  assert.deepEqual(valid, { client_name: 'PT Maju' })
  assert.deepEqual(invalid, ['amount'])
})

test('validateExtractedFields: strips out-of-range field', () => {
  const { valid, invalid } = validateExtractedFields(
    { amount: -100 },
    INVOICE_SCHEMA,
  )
  assert.deepEqual(valid, {})
  assert.deepEqual(invalid, ['amount'])
})

test('validateExtractedFields: strips unknown property (LLM hallucination)', () => {
  const { valid, invalid } = validateExtractedFields(
    { client_name: 'PT Maju', extraneous_field: 'x' },
    INVOICE_SCHEMA,
  )
  assert.deepEqual(valid, { client_name: 'PT Maju' })
  assert.deepEqual(invalid, ['extraneous_field'])
})

test('validateExtractedFields: strips bad date format', () => {
  const { valid, invalid } = validateExtractedFields(
    { due_date: '21 May 2026' },  // not YYYY-MM-DD
    INVOICE_SCHEMA,
  )
  assert.deepEqual(valid, {})
  assert.deepEqual(invalid, ['due_date'])
})

test('validateExtractedFields: empty input → empty output', () => {
  const { valid, invalid } = validateExtractedFields({}, INVOICE_SCHEMA)
  assert.deepEqual(valid, {})
  assert.deepEqual(invalid, [])
})
