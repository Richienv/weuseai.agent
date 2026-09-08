import assert from 'node:assert/strict'
import { test } from 'node:test'

import { handleAiVideoProviderCallback } from '../supabase/functions/_shared/ai-video-provider-callback-handler.ts'
import {
  processAiVideoOperatorJob,
  type AiVideoOperatorDeliveryJob,
  type AiVideoOperatorProcessorDeps,
} from '../supabase/functions/_shared/ai-video-operator-callback-handler.ts'
import { runAiVideoOperatorWorker } from '../supabase/functions/_shared/ai-video-operator-runtime.ts'
import type { AiVideoDeliveryJob, AiVideoProviderProcessorDeps } from '../supabase/functions/_shared/ai-video-provider-callback-handler.ts'
import type { SeedanceTask } from '../supabase/functions/_shared/modelark-client.ts'

function task(over: Partial<SeedanceTask> = {}): SeedanceTask {
  return {
    id: 'task-1',
    status: 'succeeded',
    model: 'dreamina-seedance-2-5-260628',
    videoUrl: 'https://cdn.example/out.mp4',
    failureCode: null,
    usage: { completionTokens: 12, raw: { completion_tokens: 12 } },
    ...over,
  }
}

function operatorJob(over: Partial<AiVideoOperatorDeliveryJob> = {}): AiVideoOperatorDeliveryJob {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'queued',
    prompt: 'SCENE walk\nREFERENCES face\nPHYSICS weight\nLIGHT neon\nCAMERA lock\nTIMELINE 6s\nPERFORMANCE quiet\nSOUND rain\nLOCKS one',
    ratio: '9:16',
    durationSeconds: 6,
    generateAudio: false,
    providerTaskId: null,
    providerModelId: null,
    refUrls: [],
    refRoles: [],
    resultPath: null,
    attempt: 0,
    ...over,
  }
}

function operatorDeps(over: Partial<AiVideoOperatorProcessorDeps> = {}): AiVideoOperatorProcessorDeps & { stored: string[] } {
  const stored: string[] = []
  return {
    stored,
    seedanceModelId: 'dreamina-seedance-2-5-260628',
    submit: async () => ({ id: 'task-1' }),
    getAuthoritativeTask: async () => task(),
    markSubmitted: async () => undefined,
    updateProviderState: async () => undefined,
    claimDelivery: async () => true,
    storeResult: async (_job, url) => { stored.push(url) },
    markFailed: async () => undefined,
    releaseDelivery: async () => undefined,
    ...over,
  }
}

test('queued operator jobs submit and never send Telegram', async () => {
  const deps = operatorDeps()
  assert.equal(await processAiVideoOperatorJob(operatorJob(), deps), 'submitted')
  assert.deepEqual(deps.stored, [])
})

test('succeeded operator jobs copy the file instead of chatting', async () => {
  const deps = operatorDeps()
  const result = await processAiVideoOperatorJob(operatorJob({
    status: 'submitted',
    providerTaskId: 'task-1',
    providerModelId: 'seedance-2.5',
  }), deps)
  assert.equal(result, 'stored')
  assert.deepEqual(deps.stored, ['https://cdn.example/out.mp4'])
})

test('completed Monid runs without a video fail instead of looking done', async () => {
  const failed: string[] = []
  const result = await processAiVideoOperatorJob(operatorJob({
    status: 'submitted',
    providerTaskId: 'task-1',
  }), operatorDeps({
    getAuthoritativeTask: async () => task({ status: 'failed', videoUrl: null, failureCode: 'monid_privacy' }),
    markFailed: async (_id, code) => { failed.push(code) },
  }))
  assert.equal(result, 'terminal')
  assert.deepEqual(failed, ['monid_privacy'])
})

test('operator poll binds on run id, not the model slug', async () => {
  const deps = operatorDeps({
    seedanceModelId: 'seedance-2.5',
    getAuthoritativeTask: async () => task({ model: '/v1/video/seedance-2.5' }),
  })
  const result = await processAiVideoOperatorJob(operatorJob({
    status: 'submitted',
    providerTaskId: 'task-1',
    providerModelId: 'seedance-2.5',
  }), deps)
  assert.equal(result, 'stored')
})

test('worker releases the lease after submit so the next poll can claim', async () => {
  const released: string[] = []
  const result = await runAiVideoOperatorWorker({
    claim: async () => [operatorJob()],
    processor: operatorDeps({
      releaseDelivery: async (id) => { released.push(id) },
    }),
  })
  assert.equal(result.completed, 1)
  assert.deepEqual(released, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
})

test('callback routes operator tasks away from the customer entitlement path', async () => {
  const customerCalls: string[] = []
  const operatorCalls: string[] = []
  const customerProcessor = {
    seedanceModelId: 'dreamina-seedance-2-0-fast-260128',
    getAuthoritativeTask: async () => { throw new Error('customer_should_not_run') },
    updateProviderState: async () => undefined,
    claimDelivery: async () => false,
    deliver: async () => { customerCalls.push('deliver') },
    markDelivered: async () => undefined,
    releaseDelivery: async () => undefined,
    cleanupInput: async () => undefined,
  } satisfies AiVideoProviderProcessorDeps
  const response = await handleAiVideoProviderCallback(new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ id: 'task-1' }),
  }), {
    findJobByTaskId: async () => null as AiVideoDeliveryJob | null,
    processor: customerProcessor,
    findOperatorJobByTaskId: async () => operatorJob({ status: 'submitted', providerTaskId: 'task-1' }),
    operatorProcessor: operatorDeps({
      storeResult: async () => { operatorCalls.push('store') },
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(customerCalls, [])
  assert.deepEqual(operatorCalls, ['store'])
})

test('a provider failure during submit terminates the job and cannot be auto-replayed', async () => {
  const failed: string[] = []
  await runAiVideoOperatorWorker({ claim: async () => [operatorJob()], processor: operatorDeps({
    submit: async () => { throw new Error('monid_rejected') },
    markFailed: async (_id, code) => { failed.push(code) },
  }) })
  assert.deepEqual(failed, ['monid_rejected'])
  let submissions = 0
  await processAiVideoOperatorJob(operatorJob({ attempt: 1 }), operatorDeps({ submit: async () => { submissions++; return { id: 'duplicate' } } }))
  assert.equal(submissions, 0)
})

test('network failure after submission remains ambiguous and stops paid retries', async () => {
  const failed: string[] = []
  await runAiVideoOperatorWorker({ claim: async () => [operatorJob()], processor: operatorDeps({
    submit: async () => { throw new TypeError('fetch failed') },
    markFailed: async (_id, code) => { failed.push(code) },
  }) })
  assert.deepEqual(failed, ['monid_submission_unknown'])
})

test('poll failures preserve the run identity and can be retried', async () => {
  let markedFailed = false; const syncErrors: string[] = []
  await runAiVideoOperatorWorker({ claim: async () => [operatorJob({ status: 'running', providerTaskId: 'task-1' })], processor: operatorDeps({
    getAuthoritativeTask: async () => { throw new TypeError('fetch failed') },
    markFailed: async () => { markedFailed = true },
    recordSyncError: async (_id, code) => { syncErrors.push(code) },
  }) })
  assert.equal(markedFailed, false)
  assert.deepEqual(syncErrors, ['operator_poll_unavailable'])
})

test('a queued row already bound to a provider run is polled instead of resubmitted', async () => {
  let submissions = 0
  await processAiVideoOperatorJob(operatorJob({ providerTaskId: 'task-1' }), operatorDeps({ submit: async () => { submissions++; return { id: 'duplicate' } } }))
  assert.equal(submissions, 0)
})
