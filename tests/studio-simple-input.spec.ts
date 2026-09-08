import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SIMPLE_MODEL, SIMPLE_MODELS, simpleModelSettings, simpleReferenceError, compileSimplePrompt, simplePromptText, simpleEstimate } from '../api/_shared/ai-video-operator.ts'
import { parseOperatorStartInput, presentAiVideoOperatorJob } from '../api/_shared/ai-video-operator.ts'
import { parseOperatorStartInput as parseEdge } from '../supabase/functions/_shared/ai-video-operator.ts'
import { createMonidSeedanceRun, presentMonidRun } from '../supabase/functions/_shared/monid-client.ts'
import { createMonidSeedanceRun as createVercelRun } from '../api/_shared/monid-run.ts'

const base = { prompt_mode: 'simple', prompt: 'Kucing lari', ratio: '9:16', duration_seconds: 6, model: 'wan3.0', resolution: '720p' }
const photo = 'operator/inbox/character.jpg'
const audio = 'operator/inbox/voice.wav'

test('plain short prompts work without skill modes, tokens or heading requirements', () => {
  const input = parseOperatorStartInput(base)
  assert.equal(simplePromptText(input.prompt), base.prompt)
  assert.doesNotMatch(input.prompt, /one take|one-take|locked camera|SCENE|TIMELINE/)
  assert.throws(() => parseOperatorStartInput({ ...base, prompt: ' ' }), /invalid_operator_prompt/)
  assert.deepEqual(input, parseEdge(base))
})
test('all supplied image and audio references acquire matching guidance automatically', () => {
  const input = parseOperatorStartInput({ ...base, ref_paths: [photo, audio, 'operator/inbox/second.jpg'], ref_roles: ['reference_image', 'reference_audio', 'reference_image'], ref_durations: [0, 4, 0] })
  assert.deepEqual(input.refPaths, [photo, audio, 'operator/inbox/second.jpg'])
  assert.deepEqual(input.refRoles, ['reference_image', 'reference_audio', 'reference_image'])
  assert.match(input.prompt, /@Image1, @Image2/)
  assert.match(input.prompt, /preserve|Preserve/)
  assert.match(input.prompt, /@Audio1/)
  assert.equal(input.generateAudio, true)
  assert.equal(input.referenceSeconds, 4)
  assert.equal(simpleEstimate(6, input.referenceSeconds, 'wan3.0'), 1)
  assert.deepEqual(input, parseEdge({ ...base, ref_paths: [photo, audio, 'operator/inbox/second.jpg'], ref_roles: ['reference_image', 'reference_audio', 'reference_image'], ref_durations: [0, 4, 0] }))
})
test('reusing a simple prompt never accumulates the reference guidance', () => {
  const compiled = compileSimplePrompt('Kucing lari', ['reference_image'])
  assert.equal(compileSimplePrompt(compiled, ['reference_image']), compiled)
  assert.equal(simplePromptText(compiled), 'Kucing lari')
})
test('Wan rejects unsupported or unmeasured audio before a billable submission', () => {
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: [audio] }), /invalid_operator_media_duration/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: [audio], ref_durations: [16] }), /invalid_operator_media_duration/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: [audio, 'operator/inbox/music.mp3'], ref_durations: [10, 6] }), /invalid_operator_media_duration/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: ['operator/inbox/voice.m4a'], ref_durations: [3] }), /invalid_operator_audio_format/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: ['operator/inbox/clip.mp4'], ref_durations: [10], duration_seconds: 30 }), /invalid_operator_media_duration/)
})
test('Wan enforces frame/reference exclusivity, photo capacity and aspect ratios', () => {
  assert.throws(() => parseOperatorStartInput({ ...base, ratio: '21:9' }), /invalid_operator_ratio/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: [photo, audio], ref_roles: ['first_frame', 'reference_audio'], ref_durations: [0, 3] }), /invalid_operator_ref_combination/)
  assert.throws(() => parseOperatorStartInput({ ...base, ref_paths: Array(11).fill(photo) }), /operator_ref_cap/)
  assert.throws(() => parseOperatorStartInput({ ...base, prompt: 'A'.repeat(5900), ref_paths: [photo] }), /monid_prompt_limit/)
})
const plan = { prompt: compileSimplePrompt('A cat walks across a wooden desk.', ['reference_image', 'reference_audio']), ratio: '9:16' as const, durationSeconds: 6, generateAudio: true, resolution: '720p' as const, model: 'wan3.0' as const }
const apiKey = 'mock-monid-test-credential-123456'
const refs = ['https://example.com/cat.jpg', 'https://example.com/voice.wav']
const roles = ['reference_image', 'reference_audio']

test('both submission adapters send the exact Wan media, audio and resolution contract', async (t) => {
  const sent: any[] = []
  const fetcher = async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ runId: 'run-wan-1' }), { status: 200 }) }
  await createMonidSeedanceRun({ plan, signedInputUrls: refs, refRoles: roles }, apiKey, undefined, fetcher)
  t.mock.method(globalThis, 'fetch', fetcher)
  await createVercelRun({ plan, signedInputUrls: refs, refRoles: roles }, apiKey)
  assert.deepEqual(sent[0], sent[1])
  assert.equal(sent[0].provider, 'alibaba')
  assert.equal(sent[0].endpoint, '/v1/video/wan3.0')
  assert.deepEqual(sent[0].input.body.media, [{ type: 'reference_image', url: refs[0] }, { type: 'reference_audio', url: refs[1] }])
  assert.equal(sent[0].input.body.resolution, '720P')
  assert.equal(sent[0].input.body.audio, true)
  assert.equal(sent[0].input.body.duration, 6)
  assert.equal('content' in sent[0].input.body, false)
})
test('selecting Seedance sends the same provider and reference contract through both adapters', async (t) => {
  const sent: any[] = []
  const input = { plan: { ...plan, model: 'seedance-2.5' as const }, signedInputUrls: refs, refRoles: roles }
  const fetcher = async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: 'run-seedance' })) }
  await createMonidSeedanceRun(input, apiKey, undefined, fetcher)
  t.mock.method(globalThis, 'fetch', fetcher)
  await createVercelRun(input, apiKey)
  assert.deepEqual(sent[0], sent[1])
  assert.equal(sent[0].provider, 'bytedance')
  assert.equal(sent[0].endpoint, '/v1/video/seedance-2.5')
  assert.equal(sent[0].input.body.content.length, 3)
})
test('submission failures never trigger an automatic provider fallback', async () => {
  let calls = 0
  await assert.rejects(() => createMonidSeedanceRun({ plan }, apiKey, undefined, async () => { calls++; return new Response('{}', { status: 502 }) }), /monid_unavailable/)
  assert.equal(calls, 1)
})
test('Wan results and timed-out runs map to explicit terminal states', () => {
  const succeeded = presentMonidRun({ id: 'run-1', status: 'COMPLETED', output: { output: { video_url: 'https://example.com/result.mp4' } }, cost: { value: .6, currency: 'USD' } })
  assert.equal(succeeded.status, 'succeeded'); assert.equal(succeeded.videoUrl, 'https://example.com/result.mp4')
  assert.equal(succeeded.cost.value, .6)
  const timedOut = presentMonidRun({ id: 'run-2', status: 'TIMED_OUT' })
  assert.equal(timedOut.status, 'failed'); assert.equal(timedOut.failureCode, 'monid_timeout')
})

test('provider status updates retain reference durations used for cost estimates and reuse', async () => {
  const { createAiVideoOperatorRuntime } = await import('../supabase/functions/_shared/ai-video-operator-runtime.ts')
  let patch: any
  const previous = { reference_seconds: 3, reference_durations: [0, 3], source_prompt: '@Image3 memakai @Audio2', reference_tags: ['@Image3', '@Audio2'] }
  const chain: any = { select() { return this }, eq() { return this }, async single() { return { data: { usage: previous }, error: null } }, update(value: any) { patch = value; return this } }
  const runtime = createAiVideoOperatorRuntime({ supabase: { from: () => chain } as any, apiKey })
  await runtime.updateProviderState('job-1', { id: 'run-1', status: 'running', model: 'wan3.0', videoUrl: null, failureCode: null, usage: { completionTokens: null, raw: { cost_usd: .9 } } })
  assert.deepEqual(patch.usage, { ...previous, cost_usd: .9 })
})


test('Seedance is the default and both choices use the same estimate as saved jobs', () => {
  assert.equal(SIMPLE_MODEL, 'seedance-2.5')
  assert.deepEqual(SIMPLE_MODELS, ['seedance-2.5', 'wan3.0'])
  assert.equal(simpleEstimate(10, 3), 2.312)
  assert.equal(simpleEstimate(10, 3, 'wan3.0'), 1.3)
  assert.equal(simpleModelSettings('seedance-2.5').photoLimit, 30)
  assert.equal(simpleModelSettings('seedance-2.5').audioLimit, 10)
  assert.equal(simpleModelSettings('wan3.0').photoLimit, 10)
  assert.equal(simpleModelSettings('wan3.0').audioLimit, 5)
})

test('switching models revalidates existing references without changing them', () => {
  const refs = [{ role: 'reference_image', seconds: 0 }, { role: 'reference_audio', seconds: 20 }]
  const original = structuredClone(refs)
  assert.equal(simpleReferenceError('seedance-2.5', refs, 10), '')
  assert.equal(simpleReferenceError('wan3.0', refs, 10), 'audio_duration')
  assert.equal(simpleReferenceError('seedance-2.5', refs, 10), '')
  assert.deepEqual(refs, original)
  assert.equal(simpleReferenceError('seedance-2.5', [{ role: 'reference_audio', seconds: 1.5 }], 6), 'audio_duration')
  assert.equal(simpleReferenceError('wan3.0', [{ role: 'reference_audio', seconds: 1.5 }], 6), '')
  assert.equal(simpleReferenceError('wan3.0', Array(11).fill({ role: 'reference_image' }), 6), 'photo_limit')
  assert.equal(simpleReferenceError('seedance-2.5', Array(11).fill({ role: 'reference_image' }), 6), '')
  assert.equal(simpleReferenceError('wan3.0', Array(6).fill({ role: 'reference_audio', seconds: 2 }), 6), 'audio_limit')
  assert.equal(simpleReferenceError('seedance-2.5', Array(6).fill({ role: 'reference_audio', seconds: 2 }), 6), '')
})

test('new Seedance requests validate clip lengths and independent audio/video totals before billing', () => {
  const seedance = { ...base, model: 'seedance-2.5', ref_paths: [audio], ref_durations: [20] }
  const input = parseOperatorStartInput(seedance)
  assert.deepEqual(input, parseEdge(seedance))
  assert.equal(input.model, 'seedance-2.5')
  assert.equal(input.referenceSeconds, 20)
  assert.deepEqual(input.refDurations, [20])
  for (const seconds of [0, 1.5, 31, NaN, Infinity]) {
    assert.throws(() => parseOperatorStartInput({ ...seedance, ref_durations: [seconds] }), /invalid_operator_media_duration/)
  }
  assert.throws(() => parseOperatorStartInput({ ...seedance, ref_durations: [] }), /invalid_operator_media_duration/)
  assert.throws(() => parseOperatorStartInput({ ...seedance, ref_paths: [audio, 'operator/inbox/music.mp3'], ref_durations: [20, 11] }), /invalid_operator_media_duration/)
  const separate = parseOperatorStartInput({ ...seedance, ref_paths: [audio, 'operator/inbox/motion.mp4'], ref_durations: [30, 30] })
  assert.equal(separate.referenceSeconds, 60)
  assert.equal(simpleReferenceError('wan3.0', [{ role: 'reference_audio', seconds: 8 }, { role: 'reference_video', seconds: 8 }], 6), 'media_total')
  assert.equal(simpleReferenceError('wan3.0', [{ role: 'reference_video', seconds: 5 }], 30), 'video_output_total')
})
