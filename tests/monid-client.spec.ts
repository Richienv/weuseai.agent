import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMonidSeedanceRun as createApiMonidSeedanceRun,
  getMonidRun as getApiMonidRun,
  MONID_ENDPOINTS as apiMonidEndpoints,
} from '../api/_shared/monid-run.ts'
import {
  createMonidSeedanceRun,
  getMonidWalletBalance,
  mapMonidStatus,
  MONID_ENDPOINTS,
  presentMonidRun,
  presentMonidWallet,
  resolveMonidConfig,
} from '../supabase/functions/_shared/monid-client.ts'

const PLAN = {
  prompt: [
    'SCENE A quiet alley walk.',
    'REFERENCES Face crops only. Use @Image1 as FACE LOCK.',
    'PHYSICS Weight in the steps.',
    'LIGHT Neon from the left.',
    'CAMERA Locked 9:16.',
    'TIMELINE Six seconds, one take.',
    'PERFORMANCE Off-lens.',
    'SOUND Rain only.',
    'LOCKS One person.',
  ].join('\n'),
  ratio: '9:16' as const,
  durationSeconds: 6,
  generateAudio: false,
  model: 'seedance-2.5' as const,
  resolution: '720p' as const,
}

test('monid host allowlist is api.monid.ai only', () => {
  assert.equal(resolveMonidConfig().baseUrl, 'https://api.monid.ai')
  assert.throws(() => resolveMonidConfig({ baseUrl: 'https://evil.example' }), /invalid_monid_base_url/)
})

test('create posts Seedance 2.5 body to /v1/run', async () => {
  const captured: Array<{ url: string; body: Record<string, unknown> }> = []
  const task = await createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: ['https://files.example/face.jpg'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async (url, init) => {
    captured.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return new Response(JSON.stringify({ runId: '01TESTMONIDRUN0001' }), { status: 200 })
  })
  assert.equal(task.id, '01TESTMONIDRUN0001')
  assert.match(captured[0].url, /https:\/\/api\.monid\.ai\/v1\/run/)
  assert.equal(captured[0].body.provider, 'bytedance')
  assert.equal(captured[0].body.endpoint, '/v1/video/seedance-2.5')
  const input = captured[0].body.input as { body: Record<string, unknown> }
  assert.equal(input.body.duration, 6)
  assert.equal(input.body.resolution, '720p')
  assert.equal(input.body.watermark, false)
  const content = input.body.content as Array<Record<string, unknown>>
  assert.equal(content[0].type, 'text')
  assert.equal(content[1].type, 'image_url')
  // No declared roles: everything is reference_image. A character sheet must
  // never become the first frame of the clip.
  assert.equal(content[1].role, 'reference_image')
})

test('ref roles are explicit per image, never guessed from order', async () => {
  const captured: Array<Record<string, unknown>> = []
  await createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: [
      'https://files.example/sheet.png',
      'https://files.example/scene-still.jpg',
    ],
    refRoles: ['reference_image', 'first_frame'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ runId: '01TESTMONIDRUN0006' }), { status: 200 })
  })
  const input = captured[0].input as { body: { content: Array<Record<string, unknown>> } }
  const [, sheet, still] = input.body.content
  assert.equal(sheet.role, 'reference_image')
  assert.equal(still.role, 'first_frame')
  // Unknown or missing role values collapse to reference_image, not first_frame.
  const capturedLoose: Array<Record<string, unknown>> = []
  await createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: ['https://files.example/sheet.png', 'https://files.example/extra.png'],
    refRoles: ['weird_role'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async (_url, init) => {
    capturedLoose.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ runId: '01TESTMONIDRUN0007' }), { status: 200 })
  })
  const loose = capturedLoose[0].input as { body: { content: Array<Record<string, unknown>> } }
  assert.equal(loose.body.content[1].role, 'reference_image')
  assert.equal(loose.body.content[2].role, 'reference_image')
})

test('2.5 sends video_url and audio_url content items', async () => {
  const captured: Array<Record<string, unknown>> = []
  await createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: [
      'https://files.example/sheet.png',
      'https://files.example/move.mp4',
      'https://files.example/room.mp3',
    ],
    refRoles: ['reference_image', 'reference_video', 'reference_audio'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ runId: '01TESTMONIDRUN00VA' }), { status: 200 })
  })
  const input = captured[0].input as { body: { content: Array<Record<string, unknown>> } }
  const [, sheet, video, audio] = input.body.content
  assert.equal(sheet.type, 'image_url')
  assert.equal(sheet.role, 'reference_image')
  assert.equal(video.type, 'video_url')
  assert.equal(video.role, 'reference_video')
  assert.deepEqual(video.video_url, { url: 'https://files.example/move.mp4' })
  assert.equal(audio.type, 'audio_url')
  assert.equal(audio.role, 'reference_audio')
  assert.deepEqual(audio.audio_url, { url: 'https://files.example/room.mp3' })
  await assert.rejects(() => createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: Array.from({ length: 11 }, (_, i) => `https://files.example/clip-${i + 1}.mp4`),
    refRoles: Array.from({ length: 11 }, () => 'reference_video'),
  }, 'monid-key-16chars+', resolveMonidConfig(), async () => new Response('no', { status: 500 })), /operator_video_cap/)
  await assert.rejects(() => createMonidSeedanceRun({
    plan: { ...PLAN, model: 'seedance-2.0-fast' },
    signedInputUrls: ['https://files.example/move.mp4'],
    refRoles: ['reference_video'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async () => new Response('no', { status: 500 })), /operator_video_cap/)
})

test('2.5 sends 30 image urls and rejects 31', async () => {
  const urls = Array.from({ length: 30 }, (_, i) => `https://files.example/ref-${i + 1}.jpg`)
  const captured: Array<Record<string, unknown>> = []
  await createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: urls,
    refRoles: urls.map(() => 'reference_image'),
  }, 'monid-key-16chars+', resolveMonidConfig(), async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ runId: '01TESTMONIDRUN0030REFS' }), { status: 200 })
  })
  const input = captured[0].input as { body: { content: Array<Record<string, unknown>> } }
  assert.equal(input.body.content.length, 31)
  assert.equal(input.body.content.filter((row) => row.type === 'image_url').length, 30)
  await assert.rejects(() => createMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: [...urls, 'https://files.example/ref-31.jpg'],
  }, 'monid-key-16chars+', resolveMonidConfig(), async () => new Response('no', { status: 500 })), /operator_ref_cap/)
})

test('2.0 family rejects 30s and 2.5 accepts it', async () => {
  await assert.rejects(() => createMonidSeedanceRun({
    plan: { ...PLAN, model: 'seedance-2.0-fast', durationSeconds: 30 },
  }, 'monid-key-16chars+', resolveMonidConfig(), async () => new Response('no', { status: 500 })), /invalid_operator_duration/)
  const ok = await createMonidSeedanceRun({
    plan: { ...PLAN, durationSeconds: 30 },
  }, 'monid-key-16chars+', resolveMonidConfig(), async () => {
    return new Response(JSON.stringify({ id: '01TESTMONIDRUN0030' }), { status: 200 })
  })
  assert.equal(ok.id, '01TESTMONIDRUN0030')
})

test('wallet balance is parsed from Monid and fail-open on junk', async () => {
  const parsed = presentMonidWallet({
    balance: { value: 2.85, currency: 'USD' },
    held: { value: 0.1 },
  })
  assert.equal(parsed.value, 2.85)
  assert.equal(parsed.held, 0.1)
  assert.equal(presentMonidWallet(null).value, null)
  let url = ''
  const live = await getMonidWalletBalance('monid-key-16chars+', resolveMonidConfig(), async (target) => {
    url = String(target)
    return new Response(JSON.stringify({ balance: { value: 0.07, currency: 'USD' } }), { status: 200 })
  })
  assert.match(url, /\/v1\/wallet\/balance$/)
  assert.equal(live.value, 0.07)
})

test('run statuses map onto existing job statuses and keep cost', () => {
  assert.equal(mapMonidStatus('READY'), 'queued')
  assert.equal(mapMonidStatus('RUNNING'), 'running')
  assert.equal(mapMonidStatus('COMPLETED'), 'succeeded')
  assert.equal(mapMonidStatus('FAILED'), 'failed')
  assert.equal(mapMonidStatus('BLOCKED'), 'failed')
  assert.equal(mapMonidStatus('STOPPED'), 'cancelled')
  assert.equal(mapMonidStatus('TIME_OUT'), 'failed')
  const run = presentMonidRun({
    runId: '01TESTMONIDRUN0002',
    status: 'COMPLETED',
    endpoint: '/v1/video/seedance-2.5',
    usage: { completion_tokens: 12 },
    cost: { value: 0.5183, currency: 'USD' },
    output: { video_url: 'https://cdn.example/out.mp4' },
  })
  assert.equal(run.status, 'succeeded')
  assert.equal(run.videoUrl, 'https://cdn.example/out.mp4')
  assert.equal(run.cost.value, 0.5183)
  assert.equal(run.usage.raw?.cost_usd, 0.5183)
  const nested = presentMonidRun({
    runId: '01TESTMONIDRUN0004',
    status: 'COMPLETED',
    output: { content: { video_url: 'https://cdn.example/nested.mp4' } },
  })
  assert.equal(nested.videoUrl, 'https://cdn.example/nested.mp4')
  const empty = presentMonidRun({
    runId: '01TESTMONIDRUN0005',
    status: 'COMPLETED',
    output: null,
    providerResponse: {
      httpStatus: 400,
      error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation' },
    },
  })
  assert.equal(empty.status, 'failed')
  assert.equal(empty.failureCode, 'monid_privacy')
  const blocked = presentMonidRun({ runId: '01TESTMONIDRUN0003', status: 'BLOCKED' })
  assert.equal(blocked.failureCode, 'monid_blocked')
})

test('Vercel list path uses a Node-safe Monid twin, not the Edge .ts import', () => {
  assert.deepEqual(apiMonidEndpoints, MONID_ENDPOINTS)
})

test('Vercel getMonidRun reads a completed Seedance URL', async () => {
  const task = await getApiMonidRun('01TESTMONIDRUN0009', 'monid-key-16chars+', resolveMonidConfig(), async () => (
    new Response(JSON.stringify({
      runId: '01TESTMONIDRUN0009',
      status: 'COMPLETED',
      output: { content: { video_url: 'https://cdn.example/clip.mp4' } },
    }))
  ))
  assert.equal(task.status, 'succeeded')
  assert.equal(task.videoUrl, 'https://cdn.example/clip.mp4')
})


test('rejects prompts above the current 6000 character provider contract before spending', async () => {
  let requests = 0
  await assert.rejects(() => createMonidSeedanceRun({ plan: { ...PLAN, prompt: 'x'.repeat(6001) } },
    'monid-key-16chars+', resolveMonidConfig(), async () => {
      requests++
      return new Response(JSON.stringify({ runId: 'run-too-long' }))
    }), /monid_prompt_limit/)
  assert.equal(requests, 0)
})

test('21:9 first-frame generation is rejected before a provider request', async () => {
  let requests = 0
  const input = {
    plan: { ...PLAN, ratio: '21:9' },
    signedInputUrls: ['https://files.example/frame.png'],
    refRoles: ['first_frame'],
  } as const
  await assert.rejects(() => createMonidSeedanceRun(input, 'monid-key-16chars+', resolveMonidConfig(), async () => {
    requests++
    return new Response(JSON.stringify({ runId: 'run-first-frame' }))
  }), /invalid_operator_ratio/)
  await assert.rejects(() => createApiMonidSeedanceRun(input, 'monid-key-16chars+'), /invalid_operator_ratio/)
  assert.equal(requests, 0)
})

test('9:16 first-frame generation becomes adaptive without invented controls', async (t) => {
  const bodies: Array<Record<string, unknown>> = []
  const fetcher = async (_url: string, init?: RequestInit) => {
    bodies.push((JSON.parse(String(init?.body)) as { input: { body: Record<string, unknown> } }).input.body)
    return new Response(JSON.stringify({ runId: 'run-first-frame' }))
  }
  await createMonidSeedanceRun({ plan: PLAN, signedInputUrls: ['https://files.example/frame.png'], refRoles: ['first_frame'] },
    'monid-key-16chars+', resolveMonidConfig(), fetcher)
  t.mock.method(globalThis, 'fetch', fetcher)
  await createApiMonidSeedanceRun({
    plan: PLAN,
    signedInputUrls: ['https://files.example/frame.png'],
    refRoles: ['first_frame'],
  }, 'monid-key-16chars+')
  assert.deepEqual(bodies[0], bodies[1])
  const body = bodies[0]
  assert.equal(body.ratio, 'adaptive')
  assert.equal(body.output_format, 'mp4')
  assert.equal(body.generate_audio, false)
  assert.equal('last_frame' in body, false)
  assert.equal('camera_fixed' in body, false)
  assert.equal('seed' in body, false)
  assert.equal('mode' in body, false)
})
