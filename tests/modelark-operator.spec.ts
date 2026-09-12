import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createOperatorSeedanceTask,
  getSeedanceTask,
  resolveOperatorModelArkConfig,
} from '../supabase/functions/_shared/modelark-client.ts'

const PLAN = {
  prompt: [
    'SCENE A quiet alley walk.',
    'REFERENCES Face crops only.',
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
}

const CONFIG = resolveOperatorModelArkConfig({
  seedanceModelId: 'dreamina-seedance-2-5-260628',
  callbackUrl: 'https://example.com/ai-video-provider-callback',
})

test('operator config pins Seedance 2.5 and the existing host allowlist', () => {
  assert.equal(CONFIG.seedanceModelId, 'dreamina-seedance-2-5-260628')
  assert.equal(CONFIG.baseUrl, 'https://ark.ap-southeast.bytepluses.com/api/v3')
  assert.throws(() => resolveOperatorModelArkConfig({
    baseUrl: 'https://evil.example/api/v3',
    callbackUrl: 'https://example.com/cb',
  }))
})

test('operator create sends 2.5, 4-15s, and no planner payload', async () => {
  const captured: Record<string, unknown>[] = []
  const task = await createOperatorSeedanceTask({ plan: PLAN, signedInputUrls: ['https://files.example/face.jpg'] }, 'merchant-key-16chars', CONFIG, async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({ id: 'task-1' }), { status: 200 })
  })
  const body = captured[0]
  assert.equal(task.id, 'task-1')
  assert.equal(body.model, 'dreamina-seedance-2-5-260628')
  assert.equal(body.duration, 6)
  assert.equal(body.ratio, '9:16')
  assert.equal(body.generate_audio, false)
  assert.ok(!('category' in body))
})

test('operator create rejects 30s and stores usage on get', async () => {
  await assert.rejects(() => createOperatorSeedanceTask({
    plan: { ...PLAN, durationSeconds: 30 },
  }, 'merchant-key-16chars', CONFIG, async () => new Response('no', { status: 500 })), /invalid_operator_duration/)
  const got = await getSeedanceTask('task-1', 'merchant-key-16chars', {
    ...CONFIG, promptModelId: 'unused',
  }, async () => new Response(JSON.stringify({
    status: 'succeeded',
    model: 'dreamina-seedance-2-5-260628',
    content: { video_url: 'https://cdn.example/out.mp4' },
    usage: { completion_tokens: 42000 },
  }), { status: 200 }))
  assert.equal(got.usage.completionTokens, 42000)
  assert.equal(got.videoUrl, 'https://cdn.example/out.mp4')
})
