// Mock render provider — used by handler tests. Deterministic, no
// network. Lets us verify the orchestration logic without hitting
// Runway / Pika.

import type {
  IRenderProvider,
  HyperFramesInput,
  HyperFramesScene,
  HyperFramesAspectRatio,
  ProviderCost,
  RenderJob,
  RenderJobStatus,
} from './types.ts'

export class MockRenderProvider implements IRenderProvider {
  readonly name = 'mock' as const
  readonly supportedAspectRatios: HyperFramesAspectRatio[] = ['9:16', '16:9', '1:1']

  /** Test knobs — tweak per scenario. */
  public canHandleResult: { ok: true } | { ok: false; reason: string } = { ok: true }
  public costCentsPerSec = 1
  public throwOnStartScene = false
  public throwOnPollJob = false
  /** Sequence of statuses returned by pollJob — cycles through this list. */
  public pollSequence: ('queued' | 'processing' | 'succeeded' | 'failed')[] = [
    'succeeded',
  ]
  public pollCallCount = 0
  public startedScenes: HyperFramesScene[] = []
  public lastApiKey: string | null = null

  canHandle(_input: HyperFramesInput) {
    return this.canHandleResult
  }

  estimateCost(input: HyperFramesInput): ProviderCost {
    const totalSec = input.scenes.reduce((s, sc) => s + sc.duration_sec, 0)
    return {
      usd_cents_per_sec: this.costCentsPerSec,
      note: `Mock @ ${this.costCentsPerSec}¢/s × ${totalSec}s`,
    }
  }

  async startScene(input: {
    scene: HyperFramesScene
    aspect_ratio: HyperFramesAspectRatio
    apiKey: string
  }): Promise<RenderJob> {
    if (this.throwOnStartScene) {
      throw new Error('mock: startScene threw')
    }
    this.lastApiKey = input.apiKey
    this.startedScenes.push(input.scene)
    return {
      job_id: `mock-${input.scene.scene_id}`,
      provider: 'mock',
      scene: input.scene,
      poll_url: `mock://job/${input.scene.scene_id}`,
    }
  }

  async pollJob(input: { job: RenderJob; apiKey: string }): Promise<RenderJobStatus> {
    if (this.throwOnPollJob) {
      throw new Error('mock: pollJob threw')
    }
    const status = this.pollSequence[this.pollCallCount % this.pollSequence.length]
    this.pollCallCount++
    switch (status) {
      case 'queued':
        return { status: 'queued', job: input.job }
      case 'processing':
        return { status: 'processing', job: input.job, progress_pct: 50 }
      case 'succeeded':
        return {
          status: 'succeeded',
          job: input.job,
          mp4_url: `mock://output/${input.job.scene.scene_id}.mp4`,
          duration_sec: input.job.scene.duration_sec,
        }
      case 'failed':
        return {
          status: 'failed',
          job: input.job,
          error: 'mock: synthetic failure',
        }
    }
  }
}
