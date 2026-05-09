/**
 * Provider canHandle / estimateCost tests — Runway + Pika.
 *
 * Pure logic; no network.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RunwayProvider } from '../supabase/functions/_shared/render-providers/runway.ts'
import { PikaProvider } from '../supabase/functions/_shared/render-providers/pika.ts'
import { buildInput, buildScene } from './_helpers/hyperframes-fixtures.ts'

const runway = new RunwayProvider()
const pika = new PikaProvider()

// ─── Runway ──────────────────────────────────────────────────────────

test('runway.canHandle: well-formed 9:16 input ok', () => {
  const r = runway.canHandle(buildInput())
  assert.equal(r.ok, true)
})

test('runway.canHandle: rejects 4:3 aspect ratio', () => {
  const input = buildInput()
  ;(input.metadata as any).aspect_ratio = '4:3'
  const r = runway.canHandle(input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /aspect ratio 4:3/)
})

test('runway.canHandle: rejects scene > 10s', () => {
  const input = buildInput()
  input.scenes = [buildScene({ duration_sec: 11 })]
  input.metadata.total_duration_sec = 11
  const r = runway.canHandle(input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /1-10s range/)
})

test('runway.canHandle: rejects scene < 1s', () => {
  const input = buildInput()
  input.scenes = [buildScene({ duration_sec: 0.5 })]
  input.metadata.total_duration_sec = 0.5
  const r = runway.canHandle(input)
  assert.equal(r.ok, false)
})

test('runway.canHandle: rejects visual_prompt > 1000 chars', () => {
  const input = buildInput()
  input.scenes = [buildScene({ duration_sec: 5, visual_prompt: 'a'.repeat(1001) })]
  input.metadata.total_duration_sec = 5
  const r = runway.canHandle(input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /1000-char limit/)
})

test('runway.estimateCost: 5¢/sec × total scene duration', () => {
  // buildInput defaults = 3+5+2 = 10s
  const cost = runway.estimateCost(buildInput())
  assert.equal(cost.usd_cents_per_sec, 5)
  assert.match(cost.note, /10\.0s/)
  assert.match(cost.note, /\$0\.50/)
})

test('runway.composePrompt: combines visual + motion under 1000 chars', () => {
  const scene = buildScene({
    visual_prompt: 'POV close-up of phone',
    motion_hint: 'slow zoom in',
  })
  const prompt = runway.composePrompt(scene)
  assert.equal(prompt, 'POV close-up of phone. slow zoom in')
})

test('runway.composePrompt: truncates at 1000 chars', () => {
  const scene = buildScene({
    visual_prompt: 'a'.repeat(995),
    motion_hint: 'b'.repeat(20),
  })
  const prompt = runway.composePrompt(scene)
  assert.equal(prompt.length, 1000)
})

test('runway.supportedAspectRatios includes 9:16, 16:9, 1:1', () => {
  assert.deepEqual(runway.supportedAspectRatios, ['9:16', '16:9', '1:1'])
})

// ─── Pika ────────────────────────────────────────────────────────────

test('pika.canHandle: well-formed 9:16 input ok', () => {
  const r = pika.canHandle(buildInput())
  assert.equal(r.ok, true)
})

test('pika.canHandle: rejects scene > 8s', () => {
  const input = buildInput()
  input.scenes = [buildScene({ duration_sec: 9 })]
  input.metadata.total_duration_sec = 9
  const r = pika.canHandle(input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /1-8s range/)
})

test('pika.canHandle: rejects visual_prompt > 500 chars', () => {
  const input = buildInput()
  input.scenes = [buildScene({ duration_sec: 5, visual_prompt: 'a'.repeat(501) })]
  input.metadata.total_duration_sec = 5
  const r = pika.canHandle(input)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /500-char limit/)
})

test('pika.estimateCost: 2¢/sec × total scene duration', () => {
  const cost = pika.estimateCost(buildInput())
  assert.equal(cost.usd_cents_per_sec, 2)
  assert.match(cost.note, /\$0\.20/)
})

test('pika.composePrompt: motion-first then visual', () => {
  const scene = buildScene({
    visual_prompt: 'cyberpunk street, neon, night',
    motion_hint: 'handheld pan-right',
  })
  const prompt = pika.composePrompt(scene)
  assert.equal(prompt, 'handheld pan-right, cyberpunk street, neon, night')
})

test('pika.supportedAspectRatios identical to runway', () => {
  assert.deepEqual(pika.supportedAspectRatios, ['9:16', '16:9', '1:1'])
})
