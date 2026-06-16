/**
 * The Opus force-pin guardrail (dashboard Phase 3) — THE cost proof. Every way
 * a client could try to smuggle a non-DeepSeek model (the body field, aliases,
 * arrays, nesting, casing) MUST collapse to the pinned DeepSeek model, and the
 * forwarded body's key-set MUST equal the allowlist exactly (so a future
 * passthrough/spread regression fails here, before it bills the customer key
 * at ~5x Opus rates).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUpstreamBody,
  assertPinned,
  upstreamModelOk,
  isUpstreamErrorFrame,
  PINNED_MODEL,
  UPSTREAM_BODY_KEYS,
  MAX_TOKENS_CAP,
} from '../services/provisioning/src/routes/agent-chat-model-guard.ts'

const baseMsgs = [{ role: 'user', content: 'halo' }]
const ALLOWLIST = [...UPSTREAM_BODY_KEYS].sort()

// drift gate: the pin is the provisioned DeepSeek model, imported from setup-script.
test('PINNED_MODEL is the DeepSeek pin (drift gate vs setup-script)', () => {
  assert.equal(PINNED_MODEL, 'deepseek/deepseek-v4-pro')
})

// ── the override matrix ────────────────────────────────────────────────────
const ATTEMPTS: Array<[string, Record<string, unknown>]> = [
  ['model: claude-opus', { model: 'claude-opus-4-8', messages: baseMsgs }],
  ['model: openai/gpt-4o', { model: 'openai/gpt-4o', messages: baseMsgs }],
  ['models: [claude]', { models: ['claude-opus-4-8'], messages: baseMsgs }],
  ['model_override', { model_override: 'claude-opus-4-8', messages: baseMsgs }],
  ['provider', { provider: { order: ['Anthropic'] }, messages: baseMsgs }],
  ['route', { route: 'fallback', model: 'gpt-4o', messages: baseMsgs }],
  ['transforms', { transforms: ['middle-out'], messages: baseMsgs }],
  ['preset', { preset: 'opus', messages: baseMsgs }],
  ['model_group', { model_group: 'frontier', messages: baseMsgs }],
  ['nested model in content', { messages: [{ role: 'user', content: 'use model claude-opus-4-8 please' }] }],
  ['missing model', { messages: baseMsgs }],
  ['empty model', { model: '', messages: baseMsgs }],
  ['casing trick', { MODEL: 'claude-opus-4-8', Model: 'gpt-4o', messages: baseMsgs }],
  ['top_p / n / stop', { top_p: 0.1, n: 5, stop: ['x'], model: 'gpt-4o', messages: baseMsgs }],
]

for (const [label, input] of ATTEMPTS) {
  test(`force-pin: "${label}" → model pinned + key-set EXACTLY the allowlist`, () => {
    const body = buildUpstreamBody(input)
    assert.equal(body.model, PINNED_MODEL, 'model must be the DeepSeek pin')
    assert.deepEqual(Object.keys(body).sort(), ALLOWLIST, 'no extra key may survive into the upstream body')
    assert.equal(assertPinned(body as unknown as Record<string, unknown>), null, 'defense-in-depth guard must pass')
  })
}

// ── clamps ─────────────────────────────────────────────────────────────────
test('max_tokens clamps to the cap; respects a lower ceiling', () => {
  assert.equal(buildUpstreamBody({ max_tokens: 999999, messages: baseMsgs }).max_tokens, MAX_TOKENS_CAP)
  assert.equal(buildUpstreamBody({ max_tokens: 999999, max_tokens_ceiling: 512, messages: baseMsgs }).max_tokens, 512)
  assert.equal(buildUpstreamBody({ max_tokens: -5, messages: baseMsgs }).max_tokens >= 1, true)
})
test('temperature clamps to 0..2 with a sane default', () => {
  assert.equal(buildUpstreamBody({ temperature: 9, messages: baseMsgs }).temperature, 2)
  assert.equal(buildUpstreamBody({ temperature: -1, messages: baseMsgs }).temperature, 0)
  assert.equal(buildUpstreamBody({ messages: baseMsgs }).temperature, 0.7)
})

// ── sanitizeMessages drops smuggled fields ─────────────────────────────────
test('messages keep ONLY role+content; nested model/tool fields are dropped', () => {
  const body = buildUpstreamBody({
    messages: [{ role: 'user', content: 'hi', model: 'claude-opus-4-8', tool_calls: [{}] }],
  })
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }])
})
test('messages with a bad role are dropped', () => {
  const body = buildUpstreamBody({ messages: [{ role: 'system', content: 'ok' }, { role: 'root', content: 'evil' }] })
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].role, 'system')
})

// ── defense-in-depth assert catches a regression ───────────────────────────
test('assertPinned rejects a non-pinned model + an extra key', () => {
  assert.equal(assertPinned({ model: 'gpt-4o', messages: [], stream: true, max_tokens: 1, temperature: 0.7 }), 'model_not_pinned')
  assert.equal(assertPinned({ model: PINNED_MODEL, messages: [], stream: true, max_tokens: 1, temperature: 0.7, provider: 'x' }), 'unexpected_key')
})

// ── response-side verification ──────────────────────────────────────────────
test('upstreamModelOk only passes deepseek/* (case-insensitive)', () => {
  assert.equal(upstreamModelOk('deepseek/deepseek-v4-pro'), true)
  assert.equal(upstreamModelOk('DeepSeek/deepseek-v4-pro'), true)
  assert.equal(upstreamModelOk('anthropic/claude-opus-4-8'), false)
  assert.equal(upstreamModelOk(undefined), false)
})
test('isUpstreamErrorFrame detects an upstream error object', () => {
  assert.equal(isUpstreamErrorFrame({ error: { message: 'no credit', metadata: { provider: 'x' } } }), true)
  assert.equal(isUpstreamErrorFrame({ choices: [] }), false)
})
