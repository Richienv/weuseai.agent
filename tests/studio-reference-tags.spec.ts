import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindReferenceTags, missingReferenceTags, referenceMentions, parseOperatorStartInput, presentAiVideoOperatorJob, providerReferencePrompt, simplePromptText } from '../api/_shared/ai-video-operator.ts'
import { parseOperatorStartInput as parseEdge } from '../supabase/functions/_shared/ai-video-operator.ts'
import { startAiVideoOperatorGenerate } from '../api/_shared/admin-ai-video-generate-handler.ts'
import { createAiVideoOperatorGenerateStore } from '../api/_shared/admin-ai-video-generate.ts'
import { createMonidSeedanceRun } from '../api/_shared/monid-run.ts'
import { createMonidSeedanceRun as createEdgeRun } from '../supabase/functions/_shared/monid-client.ts'

const input = {
  prompt_mode: 'simple', model: 'seedance-2.5', prompt: '@Image1 is Richie. @Image2 is Renita. Richie uses @Audio1; Renita uses @Audio2.',
  ratio: '9:16', duration_seconds: 6, resolution: '720p',
  ref_urls: ['https://example.com/renita.jpg', 'https://example.com/renita.wav'],
  ref_paths: ['operator/inbox/richie.jpg', 'operator/inbox/richie.wav'],
  ref_roles: ['reference_image', 'reference_audio', 'reference_image', 'reference_audio'],
  ref_tags: ['@Image2', '@Audio2', '@Image1', '@Audio1'], ref_durations: [0, 3, 0, 3],
}
const mapped = '@Image2 is Richie. @Image1 is Renita. Richie uses @Audio2; Renita uses @Audio1.'
const key = 'mock-monid-reference-test-key'

test('mixed URLs and uploads bind each character and voice to its file, without cascading replacements', () => {
  const parsed = parseOperatorStartInput(input)
  assert.deepEqual(parsed, parseEdge(input))
  assert.equal(simplePromptText(parsed.prompt), mapped)
  assert.equal(parsed.sourcePrompt, input.prompt)
  assert.deepEqual(parsed.refTags, input.ref_tags)
  const ten = Array(10).fill('reference_image')
  assert.equal(bindReferenceTags('@Image1 then @Image10 then @Image1', ten, ['@Image10', ...Array.from({ length: 9 }, (_, i) => '@Image' + (i + 1))]).prompt, '@Image2 then @Image1 then @Image2')
})

test('removed references cannot become another character and invalid bindings stop before submission', () => {
  assert.deepEqual(missingReferenceTags('@Image1 speaks to @Image2', ['@Image2', '@Image3']), ['@Image1'])
  assert.throws(() => bindReferenceTags('@Image1 speaks', ['reference_image'], ['@Image2']), /invalid_operator_reference_tag/)
  for (const tags of [null, ['@Image1'], ['@Image1', '@Image1', '@Image2', '@Audio2'], ['@Image1', '@Image2', '@Audio1', '@Audio2'], ['@Image0', '@Audio2', '@Image1', '@Audio1']]) {
    assert.throws(() => parseOperatorStartInput({ ...input, ref_tags: tags }), /invalid_operator_reference_binding/)
  }
})

test('owned video handles bind like photos and do not cascade after a deletion', () => {
  const video = {
    prompt_mode: 'simple', model: 'seedance-2.5', prompt: '@Video2 follows @Video1.',
    ratio: '9:16', duration_seconds: 6, resolution: '720p',
    ref_paths: ['operator/inbox/one.mp4', 'operator/inbox/two.mp4'],
    ref_roles: ['reference_video', 'reference_video'],
    ref_tags: ['@Video1', '@Video2'], ref_durations: [3, 4],
  }
  const parsed = parseOperatorStartInput(video)
  assert.deepEqual(parsed, parseEdge(video))
  assert.equal(simplePromptText(parsed.prompt), '@Video2 follows @Video1.')
  assert.deepEqual(missingReferenceTags('@Video3 follows @Video1', ['@Video1', '@Video2']), ['@Video3'])
})

test('pasted Higgsfield-style tags normalize while stable handles above provider capacity bind safely', () => {
  assert.equal(bindReferenceTags('@[Image 1] memakai @audio 1', ['reference_image', 'reference_audio']).prompt, '@Image1 memakai @Audio1')
  assert.deepEqual(referenceMentions('hello@example.com @Image1').map((row) => row.tag), ['@Image1'])
  const source = { ...input, prompt: '@Image99 is Richie.', ref_tags: ['@Image2', '@Audio2', '@Image99', '@Audio1'] }
  assert.equal(simplePromptText(parseOperatorStartInput(source).prompt), '@Image2 is Richie.')
  assert.equal(parseOperatorStartInput(source).sourcePrompt, source.prompt)
})

test('the admin entry point validates handles before sanitizing or creating a paid job', async () => {
  let calls = 0
  const store = { countInflight: async () => 0, createQueued: async () => { calls++; throw new Error('must not create') } } as any
  const result = await startAiVideoOperatorGenerate({ ...input, prompt: '@Image99 speaks.' }, store, { OPERATOR_GENERATE_ENABLED: 'true', MONID_API_KEY: key })
  assert.equal(result.error, 'invalid_operator_reference_tag')
  assert.equal(result.status, 400)
  assert.equal(calls, 0)
})

test('both provider adapters use the documented tag syntax and exactly the same media order', async (t) => {
  for (const model of ['seedance-2.5', 'wan3.0'] as const) {
    const parsed = parseOperatorStartInput({ ...input, model })
    const plan = { prompt: parsed.prompt, ratio: parsed.ratio, durationSeconds: parsed.durationSeconds, generateAudio: true, resolution: parsed.resolution, model }
    const urls = [...input.ref_urls, 'https://example.com/richie.jpg', 'https://example.com/richie.wav']
    const payloads: any[] = []
    const fetcher = async (_url: string, init?: RequestInit) => { payloads.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: 'tag-test' })) }
    t.mock.method(globalThis, 'fetch', fetcher)
    await createMonidSeedanceRun({ plan, signedInputUrls: urls, refRoles: parsed.refRoles }, key)
    await createEdgeRun({ plan, signedInputUrls: urls, refRoles: parsed.refRoles }, key, undefined, fetcher)
    assert.deepEqual(payloads[0], payloads[1])
    const body = payloads[0].input.body
    if (model === 'wan3.0') {
      assert.equal(simplePromptText(body.prompt), 'Image 2 is Richie. Image 1 is Renita. Richie uses Audio 2; Renita uses Audio 1.')
      assert.deepEqual(body.media.map((ref: any) => ref.url), urls)
    } else {
      assert.equal(simplePromptText(body.content[0].text), mapped)
      assert.deepEqual(body.content.slice(1).map((ref: any) => (ref.image_url || ref.audio_url).url), urls)
    }
  }
  assert.equal(providerReferencePrompt('@Image1 beside @Image2', 'seedance-2.5'), '@Image1 beside @Image2')
})

test('the real job store persists the source prompt and tags for history and reuse', async (t) => {
  let saved: any
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.match(url, /\/rest\/v1\/ai_video_operator_(jobs|assets)/)
    if (url.includes('ai_video_operator_jobs')) {
      saved = JSON.parse(String(init?.body))
      return new Response(JSON.stringify([{ ...saved, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: '2026-09-07', updated_at: '2026-09-07' }]))
    }
    return new Response('{}')
  })
  const parsed = parseOperatorStartInput(input)
  const job = await createAiVideoOperatorGenerateStore().createQueued({ ...parsed, orderId: null })
  assert.equal(saved.usage.source_prompt, input.prompt)
  assert.deepEqual(saved.usage.reference_tags, input.ref_tags)
  const shown = presentAiVideoOperatorJob(job)
  assert.equal(shown.source_prompt, input.prompt)
  assert.deepEqual(shown.ref_tags, input.ref_tags)
  assert.equal(simplePromptText(shown.prompt), mapped)
})
