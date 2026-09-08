import type { SeedanceTask } from './modelark-client.ts'
import {
  processAiVideoOperatorJob,
  type AiVideoOperatorDeliveryJob,
  type AiVideoOperatorProcessorDeps,
} from './ai-video-operator-callback-handler.ts'

export type AiVideoDeliveryJob = {
  id: string
  customerId: string
  entitlementStatus: string
  providerTaskId: string
  providerModelId: string
  status: string
  deliveredAt: string | null
  cleanupCompletedAt: string | null
  channelChatId: string
  inputBucket: string | null
  inputPath: string | null
}

export type AiVideoProviderProcessorDeps = {
  seedanceModelId: string
  getAuthoritativeTask(job: AiVideoDeliveryJob): Promise<SeedanceTask>
  updateProviderState(jobId: string, task: SeedanceTask): Promise<void>
  claimDelivery(jobId: string): Promise<boolean>
  deliver(job: AiVideoDeliveryJob, videoUrl: string): Promise<void>
  markDelivered(jobId: string): Promise<void>
  releaseDelivery(jobId: string): Promise<void>
  cleanupInput(job: AiVideoDeliveryJob): Promise<void>
}

export async function processAiVideoDeliveryJob(job: AiVideoDeliveryJob, deps: AiVideoProviderProcessorDeps): Promise<'pending' | 'terminal' | 'delivered' | 'idempotent' | 'suspended'> {
  if (job.entitlementStatus !== 'active') return 'suspended'
  if (job.deliveredAt) {
    if (!job.cleanupCompletedAt) await deps.cleanupInput(job)
    return 'idempotent'
  }
  const task = await deps.getAuthoritativeTask(job)
  if (task.id !== job.providerTaskId || task.model !== deps.seedanceModelId) throw new Error('provider_task_binding_mismatch')
  await deps.updateProviderState(job.id, task)
  if (task.status === 'queued' || task.status === 'running') return 'pending'
  if (task.status !== 'succeeded') {
    await deps.cleanupInput(job)
    return 'terminal'
  }
  if (!task.videoUrl) throw new Error('provider_result_missing')
  if (!await deps.claimDelivery(job.id)) return 'idempotent'
  try {
    await deps.deliver(job, task.videoUrl)
    await deps.markDelivered(job.id)
  } catch (error) {
    await deps.releaseDelivery(job.id)
    throw error
  }
  await deps.cleanupInput(job)
  return 'delivered'
}

export async function handleAiVideoProviderCallback(req: Request, input: {
  findJobByTaskId(taskId: string): Promise<AiVideoDeliveryJob | null>
  processor: AiVideoProviderProcessorDeps
  findOperatorJobByTaskId?(taskId: string): Promise<AiVideoOperatorDeliveryJob | null>
  operatorProcessor?: AiVideoOperatorProcessorDeps
}): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown>
  try { body = await req.json() as Record<string, unknown> } catch { return json({ error: 'invalid_json' }, 400) }
  const taskId = typeof body.id === 'string' ? body.id.trim() : typeof body.task_id === 'string' ? body.task_id.trim() : ''
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(taskId)) return json({ error: 'invalid_event' }, 400)
  try {
    const job = await input.findJobByTaskId(taskId)
    if (job) {
      const result = await processAiVideoDeliveryJob(job, input.processor)
      return json({ ok: true, result })
    }
    if (input.findOperatorJobByTaskId && input.operatorProcessor) {
      const operatorJob = await input.findOperatorJobByTaskId(taskId)
      if (operatorJob) {
        const result = await processAiVideoOperatorJob(operatorJob, input.operatorProcessor)
        return json({ ok: true, result })
      }
    }
    return json({ ok: true, ignored: 'unknown_task' })
  } catch {
    return json({ error: 'temporary_failure' }, 503)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
