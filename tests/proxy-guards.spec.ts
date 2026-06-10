/**
 * LLM proxy cost-guard tests.
 *
 * Audit: docs/audits/2026-06-07-fable5-systemwide-audit.md (Cost P1 #4).
 * The proxy fronts our DeepSeek key for starter credits, so these guards are
 * what stand between a runaway agent loop and our money.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  capMaxTokens,
  validateChatRequest,
  shouldChargeUsage,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_CAP,
  MAX_REQUEST_MESSAGES,
} from '../services/proxy/src/guards.ts'

const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ role: 'user', content: `m${i}` }))

// ─── capMaxTokens ──────────────────────────────────────────────────────────

test('capMaxTokens: omitted max_tokens defaults to the cap', () => {
  assert.equal(capMaxTokens({ messages: msgs(1) }).max_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
})

test('capMaxTokens: a huge requested max_tokens is clamped to the hard ceiling', () => {
  assert.equal(capMaxTokens({ messages: msgs(1), max_tokens: 1_000_000 }).max_tokens, MAX_OUTPUT_TOKENS_CAP)
})

test('capMaxTokens: a reasonable request is preserved', () => {
  assert.equal(capMaxTokens({ messages: msgs(1), max_tokens: 512 }).max_tokens, 512)
})

test('capMaxTokens: non-positive max_tokens falls back to default', () => {
  assert.equal(capMaxTokens({ messages: msgs(1), max_tokens: 0 }).max_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
  assert.equal(capMaxTokens({ messages: msgs(1), max_tokens: -5 }).max_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
})

test('capMaxTokens: does not mutate the original body', () => {
  const body = { messages: msgs(1) }
  capMaxTokens(body)
  assert.equal('max_tokens' in body, false)
})

// ─── validateChatRequest ──────────────────────────────────────────────────

test('validateChatRequest: a normal request passes', () => {
  assert.deepEqual(validateChatRequest({ messages: msgs(3) }), { ok: true })
})

test('validateChatRequest: missing messages is rejected', () => {
  assert.deepEqual(validateChatRequest({}), { ok: false, error: 'messages_required' })
})

test('validateChatRequest: empty messages is rejected', () => {
  assert.deepEqual(validateChatRequest({ messages: [] }), { ok: false, error: 'messages_empty' })
})

test('validateChatRequest: too many messages is rejected (loop guard)', () => {
  assert.deepEqual(
    validateChatRequest({ messages: msgs(MAX_REQUEST_MESSAGES + 1) }),
    { ok: false, error: 'too_many_messages' },
  )
})

test('validateChatRequest: an oversized body is rejected', () => {
  const huge = [{ role: 'user', content: 'x'.repeat(300_000) }]
  assert.deepEqual(validateChatRequest({ messages: huge }), { ok: false, error: 'request_too_large' })
})

// ─── shouldChargeUsage ────────────────────────────────────────────────────

test('shouldChargeUsage: charge on a successful call with usage', () => {
  assert.equal(shouldChargeUsage(true, { prompt_tokens: 10, completion_tokens: 5 }), true)
})

test('shouldChargeUsage: do NOT charge on a failed upstream call (even with usage)', () => {
  assert.equal(shouldChargeUsage(false, { prompt_tokens: 10, completion_tokens: 5 }), false)
})

test('shouldChargeUsage: do NOT charge when there is no usage', () => {
  assert.equal(shouldChargeUsage(true, undefined), false)
  assert.equal(shouldChargeUsage(true, null), false)
})
