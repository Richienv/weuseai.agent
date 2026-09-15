import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ARK_SEEDANCE_25_MODEL_ID } from '../supabase/functions/_shared/modelark-client.ts'
import {
  createAiVideoOperatorRuntime,
  asOperatorDeliveryJob,
  operatorProviderOf,
  runAiVideoOperatorWorker,
} from '../supabase/functions/_shared/ai-video-operator-runtime.ts'

// Worker runtime: jobs with an asset:// ref go straight to BytePlus Ark with
// the merchant key; everything else keeps riding Monid. No network: fetch is
// replaced per test and every call is recorded.

const MONID_KEY = 'monid-key-16chars-ok'
const ARK_KEY = 'merchant-key-16chars'
const RICHIE_FACE = 'asset://Asset-20260914100001-fghij'
const RICHIE_VOICE = 'asset://Asset-20260914100003-pqrst'
const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type Call = { table: string; op: string; patch: unknown; filters: Array<[string, unknown]> }

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    status: 'queued',
    prompt: 'Richie melambai ke kamera, satu take, cahaya sore dari kiri, tanpa cut.',
    ratio: '9:16',
    duration_seconds: 6,
    generate_audio: true,
    resolution: '1080p',
    provider: 'byteplus_modelark',
    provider_model_id: 'seedance-2.5',
    provider_task_id: null,
    ref_urls: [RICHIE_FACE, RICHIE_VOICE],
    ref_paths: ['operator/inbox/scene.jpg'],
    ref_roles: ['reference_image', 'reference_audio', 'reference_image'],
    usage: {},
    result_path: null,
    attempt: 0,
    ...over,
  }
}

function fakeSupabase(current: Record<string, unknown>, calls: Call[]) {
  return {
    from(table: string) {
      const state: Call = { table, op: 'select', patch: null, filters: [] }
      const chain: any = {
        select() { return chain },
        update(patch: unknown) { state.op = 'update'; state.patch = patch; return chain },
        insert(patch: unknown) { state.op = 'insert'; state.patch = patch; calls.push(state); return Promise.resolve({ data: null, error: null }) },
        eq(column: string, value: unknown) { state.filters.push([column, value]); return chain },
        is(column: string, value: unknown) { state.filters.push([column, value]); return chain },
        in(column: string, value: unknown) { state.filters.push([column, value]); calls.push(state); return Promise.resolve({ data: null, error: null }) },
        async maybeSingle() { return { data: current, error: null } },
        async single() { return { data: current, error: null } },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          calls.push(state)
          return Promise.resolve({ data: [current], error: null }).then(resolve, reject)
        },
      }
      return chain
    },
    storage: {
      from() {
        return { createSignedUrl: async (path: string) => ({ data: { signedUrl: 'https://signed.example/' + path }, error: null }) }
      },
    },
  }
}

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const impl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init })
    const body = handler(url, init)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { impl, requests }
}

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  try { return await run() } finally { globalThis.fetch = original }
}

test('a BytePlus job submits to Ark with asset:// passthrough, signed https refs, no callback, and touches last_inference_at', async () => {
  const calls: Call[] = []
  const current = row()
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY, modelArkApiKey: ARK_KEY })
  const { impl, requests } = fakeFetch(() => ({ id: 'cgt-ark-1' }))
  const task = await withFetch(impl, () => runtime.submit(asOperatorDeliveryJob(current)))
  assert.deepEqual(task, { id: 'cgt-ark-1' })
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /^https:\/\/ark\.ap-southeast\.bytepluses\.com\/api\/v3\/contents\/generations\/tasks$/)
  assert.equal(new Headers(requests[0].init?.headers).get('authorization'), `Bearer ${ARK_KEY}`)
  const body = JSON.parse(String(requests[0].init?.body))
  assert.equal(body.model, ARK_SEEDANCE_25_MODEL_ID)
  assert.equal(body.resolution, '1080p')
  assert.equal(body.duration, 6)
  assert.equal(body.ratio, '9:16')
  assert.equal(body.generate_audio, true)
  assert.equal('callback_url' in body, false)
  assert.deepEqual(body.content, [
    { type: 'text', text: current.prompt },
    { type: 'image_url', image_url: { url: RICHIE_FACE }, role: 'reference_image' },
    { type: 'audio_url', audio_url: { url: RICHIE_VOICE }, role: 'reference_audio' },
    { type: 'image_url', image_url: { url: 'https://signed.example/operator/inbox/scene.jpg' }, role: 'reference_image' },
  ])
  const touch = calls.find((call) => call.table === 'ai_video_identity_assets')
  assert.ok(touch, 'last_inference_at update missing')
  assert.equal(touch.op, 'update')
  assert.match(String((touch.patch as { last_inference_at?: string }).last_inference_at), /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(touch.filters, [['asset_id', ['Asset-20260914100001-fghij', 'Asset-20260914100003-pqrst']]])
})

test('a BytePlus job without the merchant key fails with modelark_not_configured before any network call', async () => {
  const calls: Call[] = []
  const current = row()
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY })
  const { impl, requests } = fakeFetch(() => ({}))
  await withFetch(impl, async () => {
    await assert.rejects(runtime.submit(asOperatorDeliveryJob(current)), /modelark_not_configured/)
    await assert.rejects(runtime.getAuthoritativeTask(asOperatorDeliveryJob(row({ provider_task_id: 'cgt-1' }))), /modelark_not_configured/)
  })
  assert.equal(requests.length, 0)
  assert.equal(calls.some((call) => call.table === 'ai_video_identity_assets'), false)
})

test('the worker marks an unconfigured BytePlus job failed with modelark_not_configured', async () => {
  const calls: Call[] = []
  const current = row()
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY })
  const { impl } = fakeFetch(() => ({}))
  const result = await withFetch(impl, () => runAiVideoOperatorWorker({
    claim: async () => [asOperatorDeliveryJob(current)],
    processor: runtime,
  }))
  assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1 })
  const failed = calls.find((call) => call.table === 'ai_video_operator_jobs' && (call.patch as { status?: string } | null)?.status === 'failed')
  assert.ok(failed, 'markFailed missing')
  assert.equal((failed.patch as { error_code?: string }).error_code, 'modelark_not_configured')
})

test('a Monid job still posts to Monid even when the merchant key is present', async () => {
  const calls: Call[] = []
  const current = row({ provider: 'monid', resolution: '720p', ref_urls: ['https://example.com/face.jpg'], ref_paths: [], ref_roles: ['reference_image'] })
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY, modelArkApiKey: ARK_KEY })
  const { impl, requests } = fakeFetch(() => ({ runId: 'run-monid-1', status: 'queued' }))
  const task = await withFetch(impl, () => runtime.submit(asOperatorDeliveryJob(current)))
  assert.equal(task.id, 'run-monid-1')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /^https:\/\/api\.monid\.ai\//)
  assert.equal(new Headers(requests[0].init?.headers).get('authorization'), `Bearer ${MONID_KEY}`)
  assert.equal(calls.some((call) => call.table === 'ai_video_identity_assets'), false)
})

test('poll reads the Ark task, keeps Monid status shapes, and namespaces silent failures', async () => {
  const calls: Call[] = []
  const current = row({ status: 'submitted', provider_task_id: 'cgt-ark-1' })
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY, modelArkApiKey: ARK_KEY })
  const job = asOperatorDeliveryJob(current)
  const running = fakeFetch(() => ({ id: 'cgt-ark-1', status: 'running', model: ARK_SEEDANCE_25_MODEL_ID }))
  const task = await withFetch(running.impl, () => runtime.getAuthoritativeTask(job))
  assert.equal(running.requests[0].url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-ark-1')
  assert.equal(running.requests[0].init?.method ?? 'GET', 'GET')
  assert.equal(task.status, 'running'); assert.equal(task.id, 'cgt-ark-1'); assert.equal(task.failureCode, null)
  const done = fakeFetch(() => ({ id: 'cgt-ark-1', status: 'succeeded', content: { video_url: 'https://ark-cdn.example/out.mp4' } }))
  const succeeded = await withFetch(done.impl, () => runtime.getAuthoritativeTask(job))
  assert.equal(succeeded.status, 'succeeded'); assert.equal(succeeded.videoUrl, 'https://ark-cdn.example/out.mp4')
  const expired = fakeFetch(() => ({ id: 'cgt-ark-1', status: 'expired' }))
  const gone = await withFetch(expired.impl, () => runtime.getAuthoritativeTask(job))
  assert.equal(gone.status, 'expired'); assert.equal(gone.failureCode, 'modelark_expired')
  const failed = fakeFetch(() => ({ id: 'cgt-ark-1', status: 'failed' }))
  const broken = await withFetch(failed.impl, () => runtime.getAuthoritativeTask(job))
  assert.equal(broken.failureCode, 'modelark_generation_failed')
})

test('markSubmitted and updateProviderState carry the BytePlus provider through the row', async () => {
  const calls: Call[] = []
  const current = row()
  const runtime = createAiVideoOperatorRuntime({ supabase: fakeSupabase(current, calls) as any, apiKey: MONID_KEY, modelArkApiKey: ARK_KEY })
  await runtime.markSubmitted(JOB_ID, 'cgt-ark-1')
  const submitted = calls.find((call) => (call.patch as { status?: string } | null)?.status === 'submitted')
  assert.ok(submitted)
  assert.equal((submitted.patch as { provider?: string }).provider, 'byteplus_modelark')
  assert.equal((submitted.patch as { provider_task_id?: string }).provider_task_id, 'cgt-ark-1')
  await runtime.updateProviderState(JOB_ID, { id: 'cgt-ark-1', status: 'cancelled', model: ARK_SEEDANCE_25_MODEL_ID, videoUrl: null, failureCode: null, usage: { completionTokens: null, raw: null } })
  const cancelled = calls.find((call) => (call.patch as { status?: string } | null)?.status === 'cancelled')
  assert.ok(cancelled)
  assert.equal((cancelled.patch as { error_code?: string }).error_code, 'modelark_cancelled')
})

test('provider resolution prefers the stored column and derives from refs for legacy rows', () => {
  assert.equal(operatorProviderOf({ provider: 'byteplus_modelark', refUrls: [] }), 'byteplus_modelark')
  assert.equal(operatorProviderOf({ provider: null, refUrls: [RICHIE_FACE] }), 'byteplus_modelark')
  assert.equal(operatorProviderOf({ provider: null, refUrls: ['https://example.com/a.jpg'] }), 'monid')
  assert.equal(operatorProviderOf({ provider: null, refUrls: [] }, { provider: 'byteplus_modelark' }), 'byteplus_modelark')
  assert.equal(operatorProviderOf({ provider: null, refUrls: [] }, { ref_urls: [RICHIE_FACE] }), 'byteplus_modelark')
  assert.equal(asOperatorDeliveryJob(row({ provider: null })).provider, 'byteplus_modelark')
  assert.equal(asOperatorDeliveryJob(row({ provider: null, ref_urls: [] })).provider, 'monid')
})

test('render worker reads the merchant key and Ark base from env and maps claimed rows with the runtime', () => {
  const worker = readFileSync(new URL('../supabase/functions/ai-video-render-worker/index.ts', import.meta.url), 'utf8')
  assert.match(worker, /modelArkApiKey: Deno\.env\.get\('MODELARK_MERCHANT_API_KEY'\)/)
  assert.match(worker, /modelArkBaseUrl: Deno\.env\.get\('BYTEPLUS_MODELARK_API_BASE'\)/)
  assert.match(worker, /\.map\(asOperatorDeliveryJob\)/)
  const monidRun = readFileSync(new URL('../api/_shared/monid-run.ts', import.meta.url), 'utf8')
  const monidClient = readFileSync(new URL('../supabase/functions/_shared/monid-client.ts', import.meta.url), 'utf8')
  for (const src of [monidRun, monidClient]) assert.match(src, /resolution === '1080p'\) throw new Error\('invalid_operator_resolution'\)/)
})
