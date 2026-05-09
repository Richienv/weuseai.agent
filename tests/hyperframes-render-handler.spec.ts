/**
 * hyperframes-render handler tests using MockRenderProvider.
 *
 * Validate request handling + provider selection + kickoff fan-out +
 * partial-failure reporting + stitch_recipe shape. Zero network.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleHyperFramesRender } from '../supabase/functions/_shared/hyperframes-render-handler.ts'
import { MockRenderProvider } from '../supabase/functions/_shared/render-providers/mock.ts'
import { buildInput, buildScene } from './_helpers/hyperframes-fixtures.ts'

function buildReq(body: unknown, opts?: { method?: string }): Request {
  const init: RequestInit = {
    method: opts?.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
  }
  if ((opts?.method ?? 'POST') !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/hyperframes-render', init)
}

function setupDeps(mock: MockRenderProvider) {
  return {
    router: { providers: { runway: mock as never, pika: mock as never } },
  }
}

// ─── method gate + JSON parse ───────────────────────────────────────

test('GET → 405', async () => {
  const mock = new MockRenderProvider()
  const r = await handleHyperFramesRender(buildReq({}, { method: 'GET' }), setupDeps(mock))
  assert.equal(r.status, 405)
})

test('malformed JSON → 400 invalid_json', async () => {
  const mock = new MockRenderProvider()
  const r = await handleHyperFramesRender(buildReq('not-json'), setupDeps(mock))
  assert.equal(r.status, 400)
  const body = (await r.json()) as { error: string }
  assert.equal(body.error, 'invalid_json')
})

// ─── input validation ──────────────────────────────────────────────

test('missing api_keys → 400 invalid_input', async () => {
  const mock = new MockRenderProvider()
  const r = await handleHyperFramesRender(
    buildReq({ hyperframes: buildInput(), api_keys: {} }),
    setupDeps(mock),
  )
  assert.equal(r.status, 400)
  const body = (await r.json()) as { error: string; detail: string }
  assert.equal(body.error, 'invalid_input')
  assert.match(body.detail, /api_keys must include/)
})

test('invalid hyperframes (wrong version) → 400 invalid_input', async () => {
  const mock = new MockRenderProvider()
  const input = buildInput()
  ;(input as any).version = 'hyperframes/wrong'
  const r = await handleHyperFramesRender(
    buildReq({ hyperframes: input, api_keys: { runway: 'k' } }),
    setupDeps(mock),
  )
  assert.equal(r.status, 400)
  const body = (await r.json()) as { error: string; detail: string }
  assert.equal(body.error, 'invalid_input')
  assert.match(body.detail, /unsupported hyperframes version/)
})

// ─── provider selection ───────────────────────────────────────────

test('happy path: kicks off all scenes, returns jobs[] + cost + stitch_recipe', async () => {
  const mock = new MockRenderProvider()
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'k-r' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  assert.equal(r.status, 200)
  const body = (await r.json()) as {
    jobs: { scene: { scene_id: number } }[]
    cost_estimate: { usd_cents: number; provider: string; note: string }
    stitch_recipe: {
      transitions: { scene_id: number; transition: string }[]
      total_duration_sec: number
      cli_hint: string
    }
  }
  assert.equal(body.jobs.length, 3)
  assert.deepEqual(body.jobs.map((j) => j.scene.scene_id), [1, 2, 3])
  assert.equal(body.stitch_recipe.transitions.length, 3)
  assert.equal(body.stitch_recipe.total_duration_sec, 10)
  assert.match(body.stitch_recipe.cli_hint, /hyperframes-stitch/)
  assert.equal(body.cost_estimate.provider, 'mock')
  assert.equal(body.cost_estimate.usd_cents, 10)   // 1¢/s × 10s default mock
  assert.equal(mock.startedScenes.length, 3)
})

test('provider api_key plumbed through', async () => {
  const mock = new MockRenderProvider()
  await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'sk-runway-test-12345' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  assert.equal(mock.lastApiKey, 'sk-runway-test-12345')
})

test('cost estimate matches provider × scene duration', async () => {
  const mock = new MockRenderProvider()
  mock.costCentsPerSec = 5   // simulate Runway pricing
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'k' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  const body = (await r.json()) as { cost_estimate: { usd_cents: number } }
  // 5¢/s × (3+5+2)s = 50¢
  assert.equal(body.cost_estimate.usd_cents, 50)
})

// ─── partial / total failure ──────────────────────────────────────

test('total kickoff failure → 502 provider_unavailable', async () => {
  const mock = new MockRenderProvider()
  mock.throwOnStartScene = true
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'k' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  assert.equal(r.status, 502)
  const body = (await r.json()) as { error: string }
  assert.equal(body.error, 'provider_unavailable')
})

test('no provider available (all canHandle reject) → 400 no_provider', async () => {
  const mock = new MockRenderProvider()
  mock.canHandleResult = { ok: false, reason: 'mock rejected' }
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'k' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  assert.equal(r.status, 400)
  const body = (await r.json()) as { error: string; detail: string }
  assert.equal(body.error, 'no_provider')
})

test('stitch_recipe transitions preserve scene order', async () => {
  const mock = new MockRenderProvider()
  const input = buildInput()
  input.scenes = [
    buildScene({ scene_id: 1, duration_sec: 2, transition_to_next: 'cut' }),
    buildScene({ scene_id: 2, duration_sec: 3, transition_to_next: 'dissolve' }),
    buildScene({ scene_id: 3, duration_sec: 4, transition_to_next: 'fade-out' }),
  ]
  input.metadata.total_duration_sec = 9
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: input,
      api_keys: { runway: 'k' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  const body = (await r.json()) as { stitch_recipe: { transitions: { scene_id: number; transition: string }[] } }
  assert.deepEqual(body.stitch_recipe.transitions, [
    { scene_id: 1, transition: 'cut' },
    { scene_id: 2, transition: 'dissolve' },
    { scene_id: 3, transition: 'fade-out' },
  ])
})

test('cost_estimate.note mentions match reason (request preference / target / default)', async () => {
  const mock = new MockRenderProvider()
  const r = await handleHyperFramesRender(
    buildReq({
      hyperframes: buildInput(),
      api_keys: { runway: 'k' },
      provider_preference: 'runway',
    }),
    setupDeps(mock),
  )
  const body = (await r.json()) as { cost_estimate: { note: string } }
  assert.match(body.cost_estimate.note, /request preference runway|storyboard target runway|default primary/)
})
