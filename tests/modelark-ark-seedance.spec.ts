import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ARK_SEEDANCE_25_MODEL_ID,
  arkSeedanceContentItem,
  createArkSeedanceTask,
  createOperatorSeedanceTask,
  getArkSeedanceTask,
  getSeedanceTask,
  resolveArkVideoConfig,
  resolveOperatorModelArkConfig,
  type ArkSeedancePlan,
} from '../supabase/functions/_shared/modelark-client.ts'

const KEY = 'merchant-key-16chars'
const RICHIE = 'asset://Asset-20260914100001-fghij'
const RENITA = 'asset://Asset-20260914100002-klmno'
const VOICE = 'asset://Asset-20260914100003-pqrst'

const PLAN: ArkSeedancePlan = {
  prompt: [
    'SCENE A fallen angel lands on a Jakarta rooftop at dusk.',
    'REFERENCES @Image1 is Richie, @Image2 is Renita. Face lock both.',
    'CAMERA Locked 9:16, one take.',
  ].join('\n'),
  ratio: '9:16',
  durationSeconds: 30,
  resolution: '1080p',
  generateAudio: true,
}

function capture(reply: () => Response = () => new Response(JSON.stringify({ id: 'cgt-2026-ark-1' }), { status: 200 })) {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return reply()
  }
  return { calls, fetchImpl }
}

test('ark video config keeps the existing host allowlist and needs no callback', () => {
  const config = resolveArkVideoConfig()
  assert.equal(config.baseUrl, 'https://ark.ap-southeast.bytepluses.com/api/v3')
  assert.equal(config.modelId, ARK_SEEDANCE_25_MODEL_ID)
  assert.equal(resolveArkVideoConfig({ baseUrl: 'https://ark.eu-west.bytepluses.com/api/v3/', modelId: ' custom-ep-1 ' }).modelId, 'custom-ep-1')
  assert.throws(() => resolveArkVideoConfig({ baseUrl: 'https://evil.example/api/v3' }), /invalid_modelark_base_url/)
  assert.throws(() => resolveArkVideoConfig({ baseUrl: 'http://ark.ap-southeast.bytepluses.com/api/v3' }), /invalid_modelark_base_url/)
  assert.throws(() => resolveArkVideoConfig({ baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v2' }), /invalid_modelark_base_url/)
  assert.throws(() => resolveArkVideoConfig({ modelId: 'bad model id!' }), /missing_modelark_model_config/)
})

test('createArkSeedanceTask posts a 2.5 body with roles, asset:// passthrough, 30s, 1080p, no callback', async () => {
  const { calls, fetchImpl } = capture()
  const task = await createArkSeedanceTask({
    plan: PLAN,
    refs: [
      { url: RICHIE, role: 'reference_image' },
      { url: RENITA, role: 'reference_image' },
      { url: 'https://files.example/xiao-sheet.png', role: 'reference_image' },
      { url: 'https://files.example/anime-ref.mp4', role: 'reference_video' },
      { url: VOICE, role: 'reference_audio' },
    ],
  }, KEY, resolveArkVideoConfig(), fetchImpl)
  assert.equal(task.id, 'cgt-2026-ark-1')
  const [call] = calls
  assert.equal(call.url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks')
  assert.equal(call.init.method, 'POST')
  const headers = call.init.headers as Record<string, string>
  assert.equal(headers.authorization, `Bearer ${KEY}`)
  assert.equal(headers['content-type'], 'application/json')
  assert.ok(call.init.signal instanceof AbortSignal)
  assert.deepEqual(Object.keys(call.body).sort(), ['content', 'duration', 'generate_audio', 'model', 'ratio', 'resolution'])
  assert.equal(call.body.model, ARK_SEEDANCE_25_MODEL_ID)
  assert.equal(call.body.duration, 30)
  assert.equal(call.body.resolution, '1080p')
  assert.equal(call.body.ratio, '9:16')
  assert.equal(call.body.generate_audio, true)
  assert.equal('callback_url' in call.body, false)
  const content = call.body.content as Array<Record<string, unknown>>
  assert.deepEqual(content[0], { type: 'text', text: PLAN.prompt })
  assert.deepEqual(content[1], { type: 'image_url', image_url: { url: RICHIE }, role: 'reference_image' })
  assert.deepEqual(content[2], { type: 'image_url', image_url: { url: RENITA }, role: 'reference_image' })
  assert.deepEqual(content[3], { type: 'image_url', image_url: { url: 'https://files.example/xiao-sheet.png' }, role: 'reference_image' })
  assert.deepEqual(content[4], { type: 'video_url', video_url: { url: 'https://files.example/anime-ref.mp4' }, role: 'reference_video' })
  assert.deepEqual(content[5], { type: 'audio_url', audio_url: { url: VOICE }, role: 'reference_audio' })
})

test('ref roles follow the monid-run mapping: declared wins, extension infers, unknown collapses to reference_image', () => {
  assert.deepEqual(arkSeedanceContentItem({ url: 'https://f.example/still.jpg', role: 'first_frame' }),
    { type: 'image_url', image_url: { url: 'https://f.example/still.jpg' }, role: 'first_frame' })
  assert.deepEqual(arkSeedanceContentItem({ url: 'https://f.example/move.mp4' }),
    { type: 'video_url', video_url: { url: 'https://f.example/move.mp4' }, role: 'reference_video' })
  assert.deepEqual(arkSeedanceContentItem({ url: 'https://f.example/room.wav' }),
    { type: 'audio_url', audio_url: { url: 'https://f.example/room.wav' }, role: 'reference_audio' })
  assert.deepEqual(arkSeedanceContentItem({ url: 'https://f.example/sheet.png', role: 'weird_role' }),
    { type: 'image_url', image_url: { url: 'https://f.example/sheet.png' }, role: 'reference_image' })
  // asset:// has no extension, so the role must be declared; undeclared is a reference image.
  assert.deepEqual(arkSeedanceContentItem({ url: RICHIE }),
    { type: 'image_url', image_url: { url: RICHIE }, role: 'reference_image' })
  assert.deepEqual(arkSeedanceContentItem({ url: ` ${VOICE} `, role: 'reference_audio' }),
    { type: 'audio_url', audio_url: { url: VOICE }, role: 'reference_audio' })
  assert.throws(() => arkSeedanceContentItem({ url: 'http://f.example/a.jpg' }), /invalid_ai_video_input_url/)
  assert.throws(() => arkSeedanceContentItem({ url: 'asset://short' }), /invalid_ai_video_input_url/)
  assert.throws(() => arkSeedanceContentItem({ url: 'asset://../../etc' }), /invalid_ai_video_input_url/)
  assert.throws(() => arkSeedanceContentItem({ url: 'operator/richie/sheet.png' }), /invalid_ai_video_input_url/)
  assert.throws(() => arkSeedanceContentItem({ url: '' }), /invalid_ai_video_input_url/)
})

test('caps and rules are enforced before any provider request', async () => {
  let requests = 0
  const fetchImpl = async () => { requests++; return new Response(JSON.stringify({ id: 'never' })) }
  const reject = (input: Parameters<typeof createArkSeedanceTask>[0], code: RegExp) =>
    assert.rejects(() => createArkSeedanceTask(input, KEY, resolveArkVideoConfig(), fetchImpl), code)
  const images = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://f.example/ref-${i + 1}.jpg`, role: 'reference_image' }))
  const videos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://f.example/clip-${i + 1}.mp4`, role: 'reference_video' }))
  const audios = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://f.example/take-${i + 1}.mp3`, role: 'reference_audio' }))
  await reject({ plan: PLAN, refs: images(31) }, /operator_ref_cap/)
  await reject({ plan: PLAN, refs: videos(11) }, /operator_video_cap/)
  await reject({ plan: PLAN, refs: audios(11) }, /operator_audio_cap/)
  await reject({ plan: { ...PLAN, prompt: 'x'.repeat(6001) } }, /modelark_prompt_limit/)
  await reject({ plan: { ...PLAN, prompt: '   ' } }, /invalid_operator_prompt/)
  await reject({ plan: { ...PLAN, durationSeconds: 1 } }, /invalid_operator_duration/)
  await reject({ plan: { ...PLAN, durationSeconds: 31 } }, /invalid_operator_duration/)
  await reject({ plan: { ...PLAN, durationSeconds: 7.5 } }, /invalid_operator_duration/)
  await reject({ plan: { ...PLAN, resolution: '4k' as unknown as '1080p' } }, /invalid_operator_resolution/)
  await reject({ plan: { ...PLAN, ratio: '4:3' as unknown as '1:1' } }, /invalid_operator_ratio/)
  await reject({ plan: { ...PLAN, ratio: '21:9' }, refs: [{ url: 'https://f.example/frame.png', role: 'first_frame' }] }, /invalid_operator_ratio/)
  await reject({ plan: { ...PLAN, model: 'bad model!' } }, /invalid_operator_model/)
  await reject({ plan: PLAN, refs: [{ url: 'http://f.example/a.jpg', role: 'reference_image' }] }, /invalid_ai_video_input_url/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, 'short', resolveArkVideoConfig(), fetchImpl), /invalid_modelark_api_key/)
  assert.equal(requests, 0)

  // Boundaries that must pass: 30 images + 10 videos + 10 audio, 2s, 6000 chars, 21:9 without first frame.
  const { calls, fetchImpl: ok } = capture()
  await createArkSeedanceTask({ plan: { ...PLAN, prompt: 'x'.repeat(6000), durationSeconds: 2, ratio: '21:9', resolution: '480p' }, refs: [...images(30), ...videos(10), ...audios(10)] }, KEY, resolveArkVideoConfig(), ok)
  const content = calls[0].body.content as Array<Record<string, unknown>>
  assert.equal(content.length, 51)
  assert.equal(calls[0].body.duration, 2)
  assert.equal(calls[0].body.ratio, '21:9')
  assert.equal(calls[0].body.resolution, '480p')
})

test('first_frame flips ratio to adaptive and plan.model overrides config', async () => {
  const { calls, fetchImpl } = capture()
  await createArkSeedanceTask({
    plan: { ...PLAN, ratio: '9:16', model: 'ep-custom-seedance' },
    refs: [{ url: 'https://f.example/frame.png', role: 'first_frame' }, { url: RICHIE, role: 'reference_image' }],
  }, KEY, resolveArkVideoConfig(), fetchImpl)
  assert.equal(calls[0].body.ratio, 'adaptive')
  assert.equal(calls[0].body.model, 'ep-custom-seedance')
  const explicit = capture()
  await createArkSeedanceTask({ plan: { ...PLAN, ratio: 'adaptive' } }, KEY, resolveArkVideoConfig(), explicit.fetchImpl)
  assert.equal(explicit.calls[0].body.ratio, 'adaptive')
  assert.deepEqual(explicit.calls[0].body.content, [{ type: 'text', text: PLAN.prompt }])
})

test('create maps upstream failures and rejects junk task ids', async () => {
  const withStatus = (status: number) => async () => new Response('no', { status })
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), withStatus(401)), /modelark_unauthorized/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), withStatus(429)), /modelark_rate_limited/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), withStatus(400)), /modelark_moderation_rejected/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), withStatus(503)), /modelark_unavailable/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), async () => new Response('{}', { status: 200 })), /modelark_invalid_task/)
  await assert.rejects(() => createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), async () => new Response('<html>', { status: 200 })), /modelark_invalid_response/)
  const viaTaskId = await createArkSeedanceTask({ plan: PLAN }, KEY, resolveArkVideoConfig(), async () => new Response(JSON.stringify({ task_id: 'cgt-alt' })))
  assert.equal(viaTaskId.id, 'cgt-alt')
})

test('getArkSeedanceTask polls the existing task endpoint without a legacy prompt model', async () => {
  let url = ''
  const got = await getArkSeedanceTask('cgt-2026-ark-1', KEY, resolveArkVideoConfig(), async (target, init) => {
    url = target
    assert.equal((init?.headers as Record<string, string>).authorization, `Bearer ${KEY}`)
    return new Response(JSON.stringify({
      status: 'succeeded',
      model: ARK_SEEDANCE_25_MODEL_ID,
      content: { video_url: 'https://cdn.example/out.mp4' },
      usage: { completion_tokens: 1_000_000 },
    }), { status: 200 })
  })
  assert.equal(url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-2026-ark-1')
  assert.equal(got.status, 'succeeded')
  assert.equal(got.videoUrl, 'https://cdn.example/out.mp4')
  assert.equal(got.usage.completionTokens, 1_000_000)
  const running = await getArkSeedanceTask('cgt-2026-ark-1', KEY, resolveArkVideoConfig(), async () => new Response(JSON.stringify({ status: 'running' })))
  assert.equal(running.status, 'running')
  await assert.rejects(() => getArkSeedanceTask('bad id', KEY, resolveArkVideoConfig()), /invalid_modelark_task_id/)
})

test('legacy operator exports are untouched (customer path still imports them)', async () => {
  const config = resolveOperatorModelArkConfig({ callbackUrl: 'https://example.com/cb' })
  assert.equal(config.seedanceModelId, ARK_SEEDANCE_25_MODEL_ID)
  const captured: Record<string, unknown>[] = []
  await createOperatorSeedanceTask({
    plan: { prompt: PLAN.prompt, ratio: '9:16', durationSeconds: 6, generateAudio: false },
    signedInputUrls: ['https://files.example/face.jpg'],
  }, KEY, config, async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ id: 'task-1' }), { status: 200 })
  })
  assert.equal(captured[0].callback_url, 'https://example.com/cb')
  assert.equal('resolution' in captured[0], false)
  const got = await getSeedanceTask('task-1', KEY, { ...config, promptModelId: 'unused' }, async () => new Response(JSON.stringify({ status: 'queued' })))
  assert.equal(got.status, 'queued')
})
