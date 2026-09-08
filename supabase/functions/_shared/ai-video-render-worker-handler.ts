import {
  processAiVideoDeliveryJob,
  type AiVideoDeliveryJob,
  type AiVideoProviderProcessorDeps,
} from './ai-video-provider-callback-handler.ts'

export async function runAiVideoRenderWorker(input: {
  claim(limit: number, leaseSeconds: number): Promise<AiVideoDeliveryJob[]>
  processor: AiVideoProviderProcessorDeps
}): Promise<{ claimed: number; completed: number; failed: number }> {
  const jobs = await input.claim(25, 300)
  let cursor = 0
  let completed = 0
  let failed = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      try {
        await processAiVideoDeliveryJob(job, input.processor)
        completed++
      } catch {
        await input.processor.releaseDelivery(job.id).catch(() => undefined)
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, () => worker()))
  return { claimed: jobs.length, completed, failed }
}
