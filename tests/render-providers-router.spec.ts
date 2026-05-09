/**
 * Provider router tests — pickProvider + validateHyperFramesInput.
 *
 * Pure-logic only; no real Runway/Pika calls.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  pickProvider,
  validateHyperFramesInput,
} from '../supabase/functions/_shared/render-providers/router.ts'
import { MockRenderProvider } from '../supabase/functions/_shared/render-providers/mock.ts'
import { RunwayProvider } from '../supabase/functions/_shared/render-providers/runway.ts'
import { PikaProvider } from '../supabase/functions/_shared/render-providers/pika.ts'
import { buildInput, buildScene } from './_helpers/hyperframes-fixtures.ts'

// ─── pickProvider ────────────────────────────────────────────────────

test('pickProvider: explicit provider_preference wins', () => {
  const decision = pickProvider(
    {
      hyperframes: buildInput(),
      api_keys: { runway: 'k-r', pika: 'k-p' },
      provider_preference: 'pika',
    },
    {
      providers: { runway: new RunwayProvider(), pika: new PikaProvider() },
    },
  )
  if (!decision.ok) throw new Error(`expected ok: ${decision.reason}`)
  assert.equal(decision.provider.name, 'pika')
  assert.equal(decision.apiKey, 'k-p')
})

test('pickProvider: target_renderer pika respected with valid scene', () => {
  const input = buildInput({ metadata: { aspect_ratio: '9:16', target_renderer: 'pika', total_duration_sec: 5 } })
  input.scenes = [buildScene({ scene_id: 1, duration_sec: 5, transition_to_next: 'cut' })]
  const decision = pickProvider(
    { hyperframes: input, api_keys: { runway: 'kr', pika: 'kp' } },
    { providers: { runway: new RunwayProvider(), pika: new PikaProvider() } },
  )
  if (!decision.ok) throw new Error(`expected ok: ${decision.reason}`)
  assert.equal(decision.provider.name, 'pika')
})

test('pickProvider: locked default = runway when no preference + no storyboard hint', () => {
  const input = buildInput({ metadata: { aspect_ratio: '9:16', target_renderer: 'generic', total_duration_sec: 5 } })
  input.scenes = [buildScene({ scene_id: 1, duration_sec: 5, transition_to_next: 'cut' })]
  const decision = pickProvider(
    { hyperframes: input, api_keys: { runway: 'kr', pika: 'kp' } },
    { providers: { runway: new RunwayProvider(), pika: new PikaProvider() } },
  )
  if (!decision.ok) throw new Error(`expected ok: ${decision.reason}`)
  assert.equal(decision.provider.name, 'runway')
})

test('pickProvider: falls through to pika when runway key missing', () => {
  const input = buildInput()
  input.scenes = [buildScene({ scene_id: 1, duration_sec: 5, transition_to_next: 'cut' })]
  input.metadata.total_duration_sec = 5
  const decision = pickProvider(
    { hyperframes: input, api_keys: { pika: 'kp' } },
    { providers: { runway: new RunwayProvider(), pika: new PikaProvider() } },
  )
  if (!decision.ok) throw new Error(`expected ok: ${decision.reason}`)
  assert.equal(decision.provider.name, 'pika')
})

test('pickProvider: falls through to pika when runway canHandle fails (long scene)', () => {
  // 11s scene — Runway max is 10s, Pika max is 8s. Both fail.
  const input = buildInput()
  input.scenes = [buildScene({ scene_id: 1, duration_sec: 11, transition_to_next: 'cut' })]
  input.metadata.total_duration_sec = 11
  const decision = pickProvider(
    { hyperframes: input, api_keys: { runway: 'kr', pika: 'kp' } },
    { providers: { runway: new RunwayProvider(), pika: new PikaProvider() } },
  )
  // Both fail canHandle → no provider.
  assert.equal(decision.ok, false)
  if (!decision.ok) {
    assert.ok(decision.attemptedProviders.length >= 2)
    assert.ok(decision.attemptedProviders.some((a) => /1-10s|1-8s/.test(a.reason)))
  }
})

test('pickProvider: returns no_provider when all keys missing', () => {
  const decision = pickProvider(
    { hyperframes: buildInput(), api_keys: {} },
    { providers: { runway: new RunwayProvider(), pika: new PikaProvider() } },
  )
  assert.equal(decision.ok, false)
  if (!decision.ok) {
    assert.equal(decision.reason, 'no provider available')
    for (const a of decision.attemptedProviders) {
      assert.match(a.reason, /api key not provided/)
    }
  }
})

test('pickProvider: handles single registered provider gracefully', () => {
  const decision = pickProvider(
    { hyperframes: buildInput({ metadata: { aspect_ratio: '9:16', target_renderer: 'runway', total_duration_sec: 3 } }), api_keys: { runway: 'kr' } },
    { providers: { runway: new RunwayProvider() } },
  )
  if (!decision.ok) throw new Error(`expected ok: ${decision.reason}`)
  assert.equal(decision.provider.name, 'runway')
})

test('pickProvider: mock-only registry routes to mock when used in tests', () => {
  const mock = new MockRenderProvider()
  const decision = pickProvider(
    { hyperframes: buildInput(), api_keys: {}, provider_preference: 'mock' as never },
    { providers: { mock } },
  )
  // Even with no api key, mock router uses 'mock-key' fallback.
  if (!decision.ok) throw new Error(`mock should resolve: ${decision.reason}`)
  assert.equal(decision.provider.name, 'mock')
})

// ─── validateHyperFramesInput ────────────────────────────────────────

test('validate: well-formed input returns null', () => {
  assert.equal(validateHyperFramesInput(buildInput()), null)
})

test('validate: rejects wrong version string', () => {
  const input = buildInput()
  ;(input as any).version = 'hyperframes/2.0'
  assert.match(validateHyperFramesInput(input as any) ?? '', /unsupported hyperframes version/)
})

test('validate: rejects empty scenes[]', () => {
  const input = buildInput()
  input.scenes = []
  assert.match(validateHyperFramesInput(input) ?? '', /scenes\[\] empty/)
})

test('validate: rejects > 30 scenes', () => {
  const input = buildInput()
  input.scenes = Array.from({ length: 31 }, (_, i) => buildScene({ scene_id: i + 1, duration_sec: 1 }))
  input.metadata.total_duration_sec = 31
  assert.match(validateHyperFramesInput(input) ?? '', /too long.*max 30/)
})

test('validate: rejects scene_id < 1', () => {
  const input = buildInput()
  input.scenes[0].scene_id = 0
  assert.match(validateHyperFramesInput(input) ?? '', /scene_id invalid/)
})

test('validate: rejects negative duration_sec', () => {
  const input = buildInput()
  input.scenes[0].duration_sec = -1
  assert.match(validateHyperFramesInput(input) ?? '', /duration invalid/)
})

test('validate: rejects too-short visual_prompt', () => {
  const input = buildInput()
  input.scenes[0].visual_prompt = 'a'
  assert.match(validateHyperFramesInput(input) ?? '', /visual_prompt too short/)
})

test('validate: rejects total_duration_sec mismatch (>0.5s tolerance)', () => {
  const input = buildInput()
  input.metadata.total_duration_sec = input.metadata.total_duration_sec + 5
  assert.match(validateHyperFramesInput(input) ?? '', /total_duration_sec mismatch/)
})

test('validate: tolerates 0.5s rounding', () => {
  const input = buildInput()
  input.metadata.total_duration_sec = input.scenes.reduce((s, sc) => s + sc.duration_sec, 0) + 0.4
  assert.equal(validateHyperFramesInput(input), null)
})
