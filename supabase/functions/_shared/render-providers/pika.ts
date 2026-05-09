// Pika provider adapter — fallback when Runway unavailable / rate-limited.
//
// Pika Labs API: https://pika.art/docs (text-to-video endpoint).
// Cost: ~$0.02/s on standard tier, lower fidelity than Runway.
//
// Pika's strength: motion-forward, dynamic short clips.
// Pika's weakness: weaker cinematographic vocabulary than Runway.
// We re-phrase the prompt for Pika's preferred style.

import type {
  IRenderProvider,
  HyperFramesInput,
  HyperFramesScene,
  HyperFramesAspectRatio,
  ProviderCost,
  RenderJob,
  RenderJobStatus,
} from './types.ts'

const PIKA_API = 'https://api.pika.art/v1'
const PIKA_USD_CENTS_PER_SEC = 2

/** Pika supports a more limited aspect ratio set in v1 API. */
const PIKA_RATIO_MAP: Record<HyperFramesAspectRatio, string> = {
  '9:16': 'vertical',
  '16:9': 'horizontal',
  '1:1': 'square',
}

export class PikaProvider implements IRenderProvider {
  readonly name = 'pika' as const
  readonly supportedAspectRatios: HyperFramesAspectRatio[] = ['9:16', '16:9', '1:1']

  canHandle(input: HyperFramesInput): { ok: true } | { ok: false; reason: string } {
    if (!this.supportedAspectRatios.includes(input.metadata.aspect_ratio)) {
      return {
        ok: false,
        reason: `Pika does not support aspect ratio ${input.metadata.aspect_ratio}`,
      }
    }
    // Pika scenes are 3-6 seconds typical; reject outside.
    for (const scene of input.scenes) {
      if (scene.duration_sec < 1 || scene.duration_sec > 8) {
        return {
          ok: false,
          reason: `Scene ${scene.scene_id} duration ${scene.duration_sec}s outside Pika 1-8s range`,
        }
      }
    }
    // Pika prompt limit ~500 chars (per pika.art/docs).
    for (const scene of input.scenes) {
      if (scene.visual_prompt.length > 500) {
        return {
          ok: false,
          reason: `Scene ${scene.scene_id} visual_prompt exceeds Pika 500-char limit`,
        }
      }
    }
    return { ok: true }
  }

  estimateCost(input: HyperFramesInput): ProviderCost {
    const totalSec = input.scenes.reduce((sum, s) => sum + s.duration_sec, 0)
    return {
      usd_cents_per_sec: PIKA_USD_CENTS_PER_SEC,
      note: `Pika v1 standard tier @ $0.02/s × ${totalSec.toFixed(1)}s = ~$${(totalSec * PIKA_USD_CENTS_PER_SEC / 100).toFixed(2)}`,
    }
  }

  async startScene(input: {
    scene: HyperFramesScene
    aspect_ratio: HyperFramesAspectRatio
    apiKey: string
  }): Promise<RenderJob> {
    const prompt = this.composePrompt(input.scene)
    const aspectRatio = PIKA_RATIO_MAP[input.aspect_ratio]

    const r = await fetch(`${PIKA_API}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        duration: input.scene.duration_sec,
        seed: input.scene.scene_id,
      }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`Pika start_scene -> ${r.status}: ${body.slice(0, 300)}`)
    }
    const data = (await r.json()) as { job_id?: string; id?: string }
    const jobId = data.job_id ?? data.id
    if (!jobId) {
      throw new Error(`Pika start_scene returned no job id`)
    }
    return {
      job_id: jobId,
      provider: 'pika',
      scene: input.scene,
      poll_url: `${PIKA_API}/jobs/${jobId}`,
    }
  }

  async pollJob(input: { job: RenderJob; apiKey: string }): Promise<RenderJobStatus> {
    const r = await fetch(input.job.poll_url ?? `${PIKA_API}/jobs/${input.job.job_id}`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return {
        status: 'failed',
        job: input.job,
        error: `Pika poll -> ${r.status}: ${body.slice(0, 200)}`,
      }
    }
    const data = (await r.json()) as {
      status?: string
      video_url?: string
      output_url?: string
      progress?: number
      error?: string
    }
    switch (data.status) {
      case 'queued':
      case 'pending':
        return { status: 'queued', job: input.job }
      case 'running':
      case 'processing':
        return {
          status: 'processing',
          job: input.job,
          progress_pct: data.progress != null ? Math.round(data.progress * 100) : undefined,
        }
      case 'completed':
      case 'succeeded':
      case 'finished': {
        const url = data.video_url ?? data.output_url ?? null
        if (!url) {
          return {
            status: 'failed',
            job: input.job,
            error: 'Pika succeeded but output url missing',
          }
        }
        return {
          status: 'succeeded',
          job: input.job,
          mp4_url: url,
          duration_sec: input.job.scene.duration_sec,
        }
      }
      case 'failed':
      case 'error':
        return {
          status: 'failed',
          job: input.job,
          error: data.error ?? 'Pika reported failure',
        }
      default:
        return { status: 'queued', job: input.job }
    }
  }

  /** Pika prefers concise, motion-forward prompts. We collapse
   *  visual_prompt + motion_hint into one short sentence. */
  composePrompt(scene: HyperFramesScene): string {
    // Lead with motion if present (Pika weights early tokens heavily).
    const parts = [scene.motion_hint, scene.visual_prompt].filter(
      (p) => p && p.length > 0,
    )
    return parts.join(', ').slice(0, 500)
  }
}
