// Provider router — decides which provider gets a render request.
//
// Decision flow (per Q2=A locked: Runway primary + Pika fallback):
//   1. If `provider_preference` is set in the request → honor it (must
//      have key + canHandle ok).
//   2. Else if `hyperframes.metadata.target_renderer` ∈ {runway,pika}
//      AND key present → use that.
//   3. Else: try Runway first (preferred), then Pika.
//   4. If no provider has a key → return error.
//
// "canHandle" gate: a provider can reject a request before we kick
// off jobs (aspect ratio mismatch, out-of-range duration, prompt too
// long). The router falls through to the next viable provider.

import type {
  IRenderProvider,
  RenderRequest,
  HyperFramesInput,
} from './types.ts'

export type RouterDecision =
  | {
      ok: true
      provider: IRenderProvider
      apiKey: string
      reason: string
    }
  | {
      ok: false
      reason: string
      attemptedProviders: { name: string; reason: string }[]
    }

export type RouterDeps = {
  /** Available provider implementations, keyed by name. */
  providers: {
    runway?: IRenderProvider
    pika?: IRenderProvider
    mock?: IRenderProvider
  }
}

export function pickProvider(
  request: RenderRequest,
  deps: RouterDeps,
): RouterDecision {
  const attempts: { name: string; reason: string }[] = []

  // Resolve the preference order:
  //   1. request.provider_preference  (explicit)
  //   2. hyperframes.metadata.target_renderer  (storyboard hint)
  //   3. Runway first, then Pika  (locked default)
  const order = resolveOrder(request)

  for (const name of order) {
    const provider = deps.providers[name as 'runway' | 'pika' | 'mock']
    if (!provider) {
      attempts.push({ name, reason: 'provider not registered' })
      continue
    }
    const apiKey =
      name === 'runway' ? request.api_keys.runway :
      name === 'pika' ? request.api_keys.pika :
      name === 'mock' ? 'mock-key' :
      undefined
    if (!apiKey) {
      attempts.push({ name, reason: 'api key not provided in request' })
      continue
    }
    const ch = provider.canHandle(request.hyperframes)
    if (!ch.ok) {
      attempts.push({ name, reason: ch.reason })
      continue
    }
    return {
      ok: true,
      provider,
      apiKey,
      reason: matchReason(name, request),
    }
  }

  return {
    ok: false,
    reason: 'no provider available',
    attemptedProviders: attempts,
  }
}

function resolveOrder(request: RenderRequest): string[] {
  const order: string[] = []
  const seen = new Set<string>()

  const push = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name)
      order.push(name)
    }
  }

  if (request.provider_preference) {
    push(request.provider_preference)
  }

  const tgt = request.hyperframes.metadata.target_renderer
  if (tgt === 'runway' || tgt === 'pika') {
    push(tgt)
  }

  // Locked default: Runway primary, Pika fallback.
  push('runway')
  push('pika')

  return order
}

function matchReason(name: string, request: RenderRequest): string {
  if (request.provider_preference === name) return `request preference ${name}`
  if (request.hyperframes.metadata.target_renderer === name) {
    return `storyboard target ${name}`
  }
  return name === 'runway' ? 'default primary (runway)' : 'fallback (pika)'
}

/** Convenience for tests + handler — confirm a HyperFrames input is
 *  well-formed before routing. Returns first error or null. */
export function validateHyperFramesInput(input: HyperFramesInput): string | null {
  if (input.version !== 'hyperframes/1.0') {
    return `unsupported hyperframes version: ${input.version}`
  }
  if (!input.metadata) return 'missing metadata'
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    return 'scenes[] empty or missing'
  }
  if (input.scenes.length > 30) {
    return 'scenes[] too long (max 30 per render)'
  }
  let totalDur = 0
  for (const s of input.scenes) {
    if (typeof s.scene_id !== 'number' || s.scene_id < 1) {
      return `scene_id invalid: ${s.scene_id}`
    }
    if (typeof s.duration_sec !== 'number' || s.duration_sec <= 0) {
      return `scene ${s.scene_id} duration invalid`
    }
    if (!s.visual_prompt || s.visual_prompt.length < 5) {
      return `scene ${s.scene_id} visual_prompt too short`
    }
    totalDur += s.duration_sec
  }
  // Sum check (allow 0.5s tolerance per spec).
  const claimed = input.metadata.total_duration_sec
  if (Math.abs(totalDur - claimed) > 0.5) {
    return `total_duration_sec mismatch: claimed ${claimed} vs sum ${totalDur}`
  }
  return null
}
