// Runway provider adapter.
//
// API ref: https://docs.dev.runwayml.com/api/ (Runway Gen-3 Alpha endpoints)
//
// We use the text-to-video endpoint per scene. Each scene's
// visual_prompt + motion_hint becomes the prompt; duration_sec maps
// to the API's `duration` parameter. Aspect ratio maps to a fixed set
// of supported ratios.
//
// Cost (per public pricing, as of Phase 4-2 spec lock 2026-05-09):
//   ~$0.05 per second of generated video on the standard tier.

import type {
  IRenderProvider,
  HyperFramesInput,
  HyperFramesScene,
  HyperFramesAspectRatio,
  ProviderCost,
  RenderJob,
  RenderJobStatus,
} from './types.ts'

const RUNWAY_API = 'https://api.dev.runwayml.com/v1'
/** Runway Gen-3 Alpha cost — $0.05/s ≈ 5 USD cents/s on standard tier. */
const RUNWAY_USD_CENTS_PER_SEC = 5

/** Runway exposes 'gen3a_turbo' as a faster, slightly cheaper variant
 *  that better suits short-form social content. We default to that. */
const RUNWAY_DEFAULT_MODEL = 'gen3a_turbo'

/** Map HyperFrames aspect ratio → Runway's accepted ratio strings. */
const RUNWAY_RATIO_MAP: Record<HyperFramesAspectRatio, string> = {
  '9:16': '720:1280',
  '16:9': '1280:720',
  '1:1': '960:960',
}

export class RunwayProvider implements IRenderProvider {
  readonly name = 'runway' as const
  readonly supportedAspectRatios: HyperFramesAspectRatio[] = ['9:16', '16:9', '1:1']

  canHandle(input: HyperFramesInput): { ok: true } | { ok: false; reason: string } {
    if (!this.supportedAspectRatios.includes(input.metadata.aspect_ratio)) {
      return {
        ok: false,
        reason: `Runway does not support aspect ratio ${input.metadata.aspect_ratio}`,
      }
    }
    // Runway gen3a_turbo accepts 5 or 10 second clips. Reject scenes
    // that fall outside that range — synthesizer must split first.
    for (const scene of input.scenes) {
      if (scene.duration_sec < 1 || scene.duration_sec > 10) {
        return {
          ok: false,
          reason: `Scene ${scene.scene_id} duration ${scene.duration_sec}s outside Runway 1-10s range`,
        }
      }
    }
    // Reject visual prompts above 1000 chars — Runway truncates and
    // results get unpredictable.
    for (const scene of input.scenes) {
      if (scene.visual_prompt.length > 1000) {
        return {
          ok: false,
          reason: `Scene ${scene.scene_id} visual_prompt exceeds Runway 1000-char limit`,
        }
      }
    }
    return { ok: true }
  }

  estimateCost(input: HyperFramesInput): ProviderCost {
    const totalSec = input.scenes.reduce((sum, s) => sum + s.duration_sec, 0)
    return {
      usd_cents_per_sec: RUNWAY_USD_CENTS_PER_SEC,
      note: `Runway ${RUNWAY_DEFAULT_MODEL} standard tier @ $0.05/s × ${totalSec.toFixed(1)}s = ~$${(totalSec * RUNWAY_USD_CENTS_PER_SEC / 100).toFixed(2)}`,
    }
  }

  async startScene(input: {
    scene: HyperFramesScene
    aspect_ratio: HyperFramesAspectRatio
    apiKey: string
  }): Promise<RenderJob> {
    const prompt = this.composePrompt(input.scene)
    const ratio = RUNWAY_RATIO_MAP[input.aspect_ratio]
    // Runway accepts duration in seconds; round to nearest 5 for
    // gen3a_turbo (5 or 10).
    const duration = input.scene.duration_sec <= 5 ? 5 : 10

    const r = await fetch(`${RUNWAY_API}/text_to_video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'X-Runway-Version': '2025-01-31',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RUNWAY_DEFAULT_MODEL,
        promptText: prompt,
        ratio,
        duration,
        seed: input.scene.scene_id,   // deterministic per-scene re-runs
      }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`Runway start_scene -> ${r.status}: ${body.slice(0, 300)}`)
    }
    const data = (await r.json()) as { id?: string }
    if (!data.id) {
      throw new Error(`Runway start_scene returned no job id`)
    }
    return {
      job_id: data.id,
      provider: 'runway',
      scene: input.scene,
      poll_url: `${RUNWAY_API}/tasks/${data.id}`,
    }
  }

  async pollJob(input: { job: RenderJob; apiKey: string }): Promise<RenderJobStatus> {
    const r = await fetch(input.job.poll_url ?? `${RUNWAY_API}/tasks/${input.job.job_id}`, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'X-Runway-Version': '2025-01-31',
      },
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return {
        status: 'failed',
        job: input.job,
        error: `Runway poll -> ${r.status}: ${body.slice(0, 200)}`,
      }
    }
    const data = (await r.json()) as {
      status?: string
      output?: string[] | { url: string }[]
      progress?: number
      failure_reason?: string
    }
    switch (data.status) {
      case 'PENDING':
      case 'THROTTLED':
        return { status: 'queued', job: input.job }
      case 'RUNNING':
        return {
          status: 'processing',
          job: input.job,
          progress_pct: data.progress != null ? Math.round(data.progress * 100) : undefined,
        }
      case 'SUCCEEDED': {
        const url = pickRunwayMp4Url(data.output)
        if (!url) {
          return {
            status: 'failed',
            job: input.job,
            error: 'Runway succeeded but output url missing',
          }
        }
        return {
          status: 'succeeded',
          job: input.job,
          mp4_url: url,
          duration_sec: input.job.scene.duration_sec,
        }
      }
      case 'FAILED':
      case 'CANCELLED':
        return {
          status: 'failed',
          job: input.job,
          error: data.failure_reason ?? `Runway status ${data.status}`,
        }
      default:
        return {
          status: 'queued',
          job: input.job,
        }
    }
  }

  /** Compose a Runway-friendly prompt: cinematographic vocab from
   *  visual_prompt + motion_hint. Keep under 1000 chars (Runway's
   *  effective limit before quality degrades). */
  composePrompt(scene: HyperFramesScene): string {
    const parts = [scene.visual_prompt, scene.motion_hint].filter(
      (p) => p && p.length > 0,
    )
    return parts.join('. ').slice(0, 1000)
  }
}

function pickRunwayMp4Url(
  output: string[] | { url: string }[] | undefined,
): string | null {
  if (!output) return null
  if (output.length === 0) return null
  const first = output[0]
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && 'url' in first) return first.url
  return null
}
