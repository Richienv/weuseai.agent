import {
  applyOperatorTransition,
  canSubmitOperatorJob,
  type AiVideoOperatorJob,
} from './ai-video-operator.ts'
import type { SeedanceTask } from './modelark-client.ts'

export type AiVideoOperatorDeliveryJob = {
  id: string
  status: AiVideoOperatorJob['status']
  prompt: string
  ratio: AiVideoOperatorJob['ratio']
  durationSeconds: number
  generateAudio: boolean
  resolution?: string | null
  providerTaskId: string | null
  providerModelId: string | null
  refUrls: string[]
  refRoles: string[]
  resultPath: string | null
  attempt: number
}

export type AiVideoOperatorProcessorDeps = {
  seedanceModelId: string
  beginSubmission?(jobId: string): Promise<boolean>
  recordSyncError?(jobId: string, code: string): Promise<void>
  submit(job: AiVideoOperatorDeliveryJob): Promise<{ id: string }>
  getAuthoritativeTask(job: AiVideoOperatorDeliveryJob): Promise<SeedanceTask>
  markSubmitted(jobId: string, taskId: string): Promise<void>
  updateProviderState(jobId: string, task: SeedanceTask): Promise<void>
  claimDelivery(jobId: string): Promise<boolean>
  storeResult(job: AiVideoOperatorDeliveryJob, videoUrl: string): Promise<void>
  markFailed(jobId: string, code: string): Promise<void>
  releaseDelivery(jobId: string): Promise<void>
}

export async function processAiVideoOperatorJob(
  job: AiVideoOperatorDeliveryJob,
  deps: AiVideoOperatorProcessorDeps,
): Promise<'submitted' | 'pending' | 'terminal' | 'stored' | 'idempotent'> {
  if (job.status === 'succeeded' && job.resultPath) return 'idempotent'
  if (job.status === 'failed' || job.status === 'cancelled') return 'terminal'
  if (job.status === 'queued' && !job.providerTaskId) {
    if (job.attempt > 0 || !canSubmitOperatorJob({ status: job.status, attempt: job.attempt })) {
      await deps.markFailed(job.id, 'monid_submission_unknown')
      return 'terminal'
    }
    applyOperatorTransition('queued', 'submitted')
    if (deps.beginSubmission && !await deps.beginSubmission(job.id)) return 'pending'
    const task = await deps.submit(job)
    try { await deps.markSubmitted(job.id, task.id) }
    catch {
      // Retry persistence only, never the billable POST. Retain IDs in a safe log if DB is down.
      try { await deps.markSubmitted(job.id, task.id) }
      catch (error) {
        console.error(JSON.stringify({ event: 'operator_submission_save_failed', job_id: job.id, provider_task_id: task.id }))
        throw error
      }
    }
    return 'submitted'
  }
  if (!job.providerTaskId) throw new Error('operator_task_missing')
  const task = await deps.getAuthoritativeTask(job)
  if (task.id !== job.providerTaskId) {
    throw new Error('provider_task_binding_mismatch')
  }
  if (task.status === 'queued' || task.status === 'running') {
    await deps.updateProviderState(job.id, task)
    return 'pending'
  }
  if (task.status === 'cancelled') {
    await deps.updateProviderState(job.id, task)
    return 'terminal'
  }
  if (task.status !== 'succeeded' || !task.videoUrl) {
    await deps.markFailed(job.id, task.failureCode ?? (task.videoUrl ? `monid_${task.status}` : 'monid_result_missing'))
    return 'terminal'
  }
  await deps.updateProviderState(job.id, task)
  if (job.resultPath) return 'idempotent'
  try {
    await deps.storeResult(job, task.videoUrl)
  } catch (error) {
    await deps.releaseDelivery(job.id)
    throw error
  }
  return 'stored'
}
