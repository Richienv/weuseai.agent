// Shared types for the HyperFrames render-provider adapters.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-2 + Q2=A locked
// pick — Runway primary + Pika fallback).
//
// Each provider adapter implements IRenderProvider. The provider router
// (router.ts) picks the best provider per request based on customer
// preference + which API keys are available.

// ─── HyperFrames input types (mirrors agent-packs/video-producer/templates/hyperframes-storyboard-format.md) ───

export type HyperFramesAspectRatio = '9:16' | '16:9' | '1:1'

export type HyperFramesTargetRenderer =
  | 'runway'
  | 'pika'
  | 'sora'        // Reserved; not yet supported (Sora not GA at Phase 4-2 ship)
  | 'capcut'      // Reserved; Phase 5+ (different render category)
  | 'generic'

export type HyperFramesTransition =
  | 'cut'
  | 'match-cut'
  | 'whip-pan'
  | 'dissolve'
  | 'fade-out'

/** A single scene from the storyboard. */
export type HyperFramesScene = {
  scene_id: number
  timestamp: string
  visual_prompt: string
  motion_hint: string
  duration_sec: number
  audio_cue?: string
  transition_to_next: HyperFramesTransition
}

/** Full HyperFrames input — produced by the existing
 *  `hyperframes-storyboard` skill, consumed by `hyperframes-render`. */
export type HyperFramesInput = {
  version: 'hyperframes/1.0'
  metadata: {
    aspect_ratio: HyperFramesAspectRatio
    target_renderer: HyperFramesTargetRenderer
    total_duration_sec: number
    style_direction?: string
  }
  scenes: HyperFramesScene[]
}

// ─── Provider interface ───────────────────────────────────────────────

/** Render job kicked off via a provider's API. Polled until terminal. */
export type RenderJob = {
  /** Provider-specific job identifier. */
  job_id: string
  /** Which provider owns this job (so polling routes correctly). */
  provider: 'runway' | 'pika' | 'mock'
  /** Original scene we're rendering — propagated through so
   *  the orchestrator can re-stitch in order. */
  scene: HyperFramesScene
  /** Provider-determined poll endpoint. */
  poll_url?: string
}

export type RenderJobStatus =
  | { status: 'queued'; job: RenderJob }
  | { status: 'processing'; job: RenderJob; progress_pct?: number }
  | { status: 'succeeded'; job: RenderJob; mp4_url: string; duration_sec: number }
  | { status: 'failed'; job: RenderJob; error: string }

/** Per-scene cost estimate. Used by the router to flag total spend
 *  before kicking off jobs. */
export type ProviderCost = {
  /** USD cents per second of output video. */
  usd_cents_per_sec: number
  /** Brief human-readable explanation, e.g. "Runway Gen-3 standard tier $0.05/s". */
  note: string
}

export interface IRenderProvider {
  readonly name: 'runway' | 'pika' | 'mock'
  readonly supportedAspectRatios: HyperFramesAspectRatio[]
  /** Indicates this provider can handle the request (aspect ratio +
   *  scene durations + visual prompt content). Returns reason if not. */
  canHandle(input: HyperFramesInput): { ok: true } | { ok: false; reason: string }

  /** Cost estimate for the input — used for the request's pre-flight
   *  cost report. */
  estimateCost(input: HyperFramesInput): ProviderCost

  /** Kick off a render for a single scene. Returns immediately with
   *  the job; caller polls. */
  startScene(input: {
    scene: HyperFramesScene
    aspect_ratio: HyperFramesAspectRatio
    apiKey: string
  }): Promise<RenderJob>

  /** Poll a job. Should be safe to call repeatedly. */
  pollJob(input: { job: RenderJob; apiKey: string }): Promise<RenderJobStatus>
}

// ─── Render-handler request / response types ─────────────────────────

/** Inbound request shape for /functions/v1/hyperframes-render. */
export type RenderRequest = {
  /** The HyperFrames spec from the storyboard skill. */
  hyperframes: HyperFramesInput
  /** Customer's BYOK API keys. Phase 4-2 v0: the key arrives per
   *  request rather than living in customer rows (no SQL migration
   *  needed; trade-off: key crosses the wire on every render). */
  api_keys: {
    runway?: string
    pika?: string
  }
  /** Provider preference. If omitted, falls back to
   *  hyperframes.metadata.target_renderer. If both, request wins. */
  provider_preference?: 'runway' | 'pika'
  /** Customer ID (for logging + rate-limit accounting). */
  customer_id?: string
}

/** Initial response — fan-out has been kicked off; client polls. */
export type RenderKickoffResponse = {
  /** Per-scene job, in order. */
  jobs: RenderJob[]
  /** Pre-flight cost estimate (informational; we don't gate on it). */
  cost_estimate: {
    usd_cents: number
    provider: string
    note: string
  }
  /** Stitch recipe — instructions for the customer's Hermes to merge
   *  the rendered scenes after polling completes. */
  stitch_recipe: StitchRecipe
}

export type StitchRecipe = {
  /** Per-scene transition out (matches hyperframes input). */
  transitions: { scene_id: number; transition: HyperFramesTransition }[]
  /** Total expected duration. */
  total_duration_sec: number
  /** ffmpeg-stitch CLI invocation hint. */
  cli_hint: string
}
