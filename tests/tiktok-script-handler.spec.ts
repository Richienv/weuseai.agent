/**
 * Tests for tiktok-script-handler — Phase 2E-1 pilot 3.
 *
 * Strategy: inject mock LLM client. Tests verify the wiring + validation
 * — actual creative generation is the LLM's job. We test that we
 * correctly accept valid responses, reject malformed ones, and pass the
 * right config (model pin, temperature, prompt content).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTiktokScriptPrompt,
  generateTiktokScript,
  TIKTOK_AUDIENCES,
  TIKTOK_LENGTHS,
  TIKTOK_PLATFORMS,
  TIKTOK_RESPONSE_SCHEMA,
  type TiktokScript,
} from '../supabase/functions/_shared/tiktok-script-handler.ts'
import type {
  LlmJsonResponse,
} from '../supabase/functions/_shared/llm-client.ts'

// ─── canned response data ─────────────────────────────────────────────

const VALID_SCRIPT: TiktokScript = {
  hook: 'Pernah cek saldo, langsung kaget?',
  body: 'Coba cara budgeting 50/30/20. 50% kebutuhan, 30% keinginan, 20% tabungan. Sederhana tapi work.',
  cta: 'Save video ini buat reminder.',
  visual_scenes: [
    { timestamp: '0:00', description: 'POV cek saldo HP, ekspresi kaget' },
    { timestamp: '0:05', description: 'Cut to overlay text 50/30/20 rule' },
    { timestamp: '0:20', description: 'Demo split di kalkulator' },
    { timestamp: '0:28', description: 'Final CTA dengan teks "save"' },
  ],
  sound_suggestion: 'oh-no-oh-no original sound (aug 2026 trend)',
  hashtags: ['#fintok', '#budgeting', '#keuanganId', '#millennialmoney'],
}

function makeFakeLlm(
  responses: Array<LlmJsonResponse<unknown>>,
): {
  fn: typeof import('../supabase/functions/_shared/llm-client.ts').llmJsonCompletion
  spy: { calls: number; lastOpts: unknown }
} {
  const spy = { calls: 0, lastOpts: undefined as unknown }
  let idx = 0
  const fn = (async (opts: unknown) => {
    spy.calls++
    spy.lastOpts = opts
    if (idx >= responses.length) throw new Error('mock LLM out of responses')
    return responses[idx++]
  }) as typeof import('../supabase/functions/_shared/llm-client.ts').llmJsonCompletion
  return { fn, spy }
}

const baseOpts = {
  apiKey: 'sk-or-test',
  input: { topic: 'Tips budgeting buat anak muda Indonesia' },
}

// ─── enums + schema sanity ────────────────────────────────────────────

test('TIKTOK_LENGTHS = [15, 30, 60, 90]', () => {
  assert.deepEqual([...TIKTOK_LENGTHS], [15, 30, 60, 90])
})

test('TIKTOK_AUDIENCES has 3 segments', () => {
  assert.deepEqual([...TIKTOK_AUDIENCES].sort(), ['gen-z', 'general', 'millennial'])
})

test('TIKTOK_PLATFORMS has 3 platforms', () => {
  assert.deepEqual([...TIKTOK_PLATFORMS].sort(), ['reels', 'shorts', 'tiktok'])
})

test('TIKTOK_RESPONSE_SCHEMA has 6 required fields', () => {
  const required = TIKTOK_RESPONSE_SCHEMA.required as readonly string[]
  assert.deepEqual(
    [...required].sort(),
    ['body', 'cta', 'hashtags', 'hook', 'sound_suggestion', 'visual_scenes'],
  )
})

// ─── happy path ────────────────────────────────────────────────────────

test('script: happy path returns valid script', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: VALID_SCRIPT, raw: 'json' }])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.script.hook, VALID_SCRIPT.hook)
    assert.equal(r.script.visual_scenes.length, 4)
  }
  assert.equal(spy.calls, 1)
})

test('script: defaults applied (length 30, audience general, platform tiktok)', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: VALID_SCRIPT, raw: 'json' }])
  await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  const opts = spy.lastOpts as { messages: Array<{ content: string }> }
  // System prompt mentions 30 detik (default length) + general (default audience) + TikTok
  assert.match(opts.messages[0].content, /30 detik/)
  assert.match(opts.messages[0].content, /general/)
  assert.match(opts.messages[0].content, /TikTok/)
})

test('script: explicit length overrides default', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: VALID_SCRIPT, raw: 'json' }])
  await generateTiktokScript({
    apiKey: 'sk',
    input: { topic: 'x', length: 90 },
    llmCallFn: fn,
  })
  const opts = spy.lastOpts as { messages: Array<{ content: string }> }
  assert.match(opts.messages[0].content, /90 detik/)
})

test('script: platform=reels prompts for Instagram Reels', async () => {
  const { fn, spy } = makeFakeLlm([{ ok: true, result: VALID_SCRIPT, raw: 'json' }])
  await generateTiktokScript({
    apiKey: 'sk',
    input: { topic: 'x', platform: 'reels' },
    llmCallFn: fn,
  })
  const opts = spy.lastOpts as { messages: Array<{ content: string }> }
  assert.match(opts.messages[0].content, /Instagram Reels/)
})

// ─── failure paths ────────────────────────────────────────────────────

test('script: missing api key → no_api_key, no LLM call', async () => {
  const { fn, spy } = makeFakeLlm([])
  const r = await generateTiktokScript({ ...baseOpts, apiKey: '', llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'no_api_key')
  assert.equal(spy.calls, 0)
})

test('script: HTTP error → http_error result', async () => {
  const { fn } = makeFakeLlm([
    { ok: false, reason: 'http_error', status: 500, detail: 'OpenRouter down' },
  ])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'http_error')
})

test('script: malformed JSON → json_parse_failed', async () => {
  const { fn } = makeFakeLlm([
    { ok: false, reason: 'json_parse_failed', detail: 'unexpected token', raw: 'not json' },
  ])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'json_parse_failed')
})

// ─── schema validation ────────────────────────────────────────────────

test('script: rejects missing required field as schema_validation_failed', async () => {
  const malformed = { ...VALID_SCRIPT } as Partial<TiktokScript>
  delete malformed.cta
  const { fn } = makeFakeLlm([{ ok: true, result: malformed, raw: 'json' }])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /cta/)
  }
})

test('script: rejects invalid hashtag format (no # prefix)', async () => {
  const malformed = { ...VALID_SCRIPT, hashtags: ['budgeting', '#fintok', '#keuangan'] }
  const { fn } = makeFakeLlm([{ ok: true, result: malformed, raw: 'json' }])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /hashtags\[0\]/)
  }
})

test('script: rejects fewer than 3 hashtags (minItems)', async () => {
  const malformed = { ...VALID_SCRIPT, hashtags: ['#fin', '#money'] }
  const { fn } = makeFakeLlm([{ ok: true, result: malformed, raw: 'json' }])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, 'schema_validation_failed')
})

test('script: rejects bad timestamp format on visual_scenes', async () => {
  const malformed = {
    ...VALID_SCRIPT,
    visual_scenes: [
      { timestamp: '5sec', description: 'wrong format' },
      { timestamp: '0:10', description: 'right' },
      { timestamp: '0:20', description: 'right' },
      { timestamp: '0:28', description: 'right' },
    ],
  }
  const { fn } = makeFakeLlm([{ ok: true, result: malformed, raw: 'json' }])
  const r = await generateTiktokScript({ ...baseOpts, llmCallFn: fn })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.reason, 'schema_validation_failed')
    assert.match(r.detail!, /visual_scenes\[0\]\.timestamp/)
  }
})

// ─── prompt content (Indonesian + structure rules) ────────────────────

test('buildTiktokScriptPrompt: includes topic, length, audience, platform', () => {
  const { system, user } = buildTiktokScriptPrompt({
    topic: 'Tips budgeting',
    length: 60,
    audience: 'gen-z',
    platform: 'tiktok',
  })
  assert.match(system, /60 detik/)
  assert.match(system, /gen-z/)
  assert.match(system, /TikTok/)
  assert.match(user, /Tips budgeting/)
})

test('buildTiktokScriptPrompt: instructs hook ≤30 chars + 3-second guidance', () => {
  const { system } = buildTiktokScriptPrompt({
    topic: 'x',
    length: 30,
    audience: 'general',
    platform: 'tiktok',
  })
  assert.match(system, /3 detik pertama/)
  assert.match(system, /30 karakter/)
})

test('buildTiktokScriptPrompt: hashtag pattern restricted', () => {
  const { system } = buildTiktokScriptPrompt({
    topic: 'x',
    length: 30,
    audience: 'general',
    platform: 'tiktok',
  })
  assert.match(system, /\^#\[a-zA-Z0-9_\]\+\$/)
})

test('buildTiktokScriptPrompt: forbids markdown + prose in output', () => {
  const { system } = buildTiktokScriptPrompt({
    topic: 'x',
    length: 30,
    audience: 'general',
    platform: 'tiktok',
  })
  assert.match(system, /JSON object SAJA/)
  assert.match(system, /tidak ada markdown/i)
})
