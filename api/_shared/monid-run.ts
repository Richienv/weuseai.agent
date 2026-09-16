import {
  AI_VIDEO_OPERATOR_MAX_SECONDS,
  AI_VIDEO_OPERATOR_MIN_SECONDS,
  AI_VIDEO_OPERATOR_PROMPT_MAX,
  AI_VIDEO_OPERATOR_PROMPT_MIN,
  MONID_SEEDANCE_PROMPT_MAX,
  inferOperatorRefRole,
  isAiVideoOperatorModel,
  isAiVideoOperatorRatio,
  isAiVideoOperatorResolution,
  operatorMaxAudioRefs,
  operatorMaxImageRefs,
  operatorMaxVideoRefs,
  operatorModelMaxSeconds,
  providerReferencePrompt,
  type AiVideoOperatorModel,
  type AiVideoOperatorRatio,
  type AiVideoOperatorResolution,
} from './ai-video-operator.js'

export const MONID_API_BASE = 'https://api.monid.ai'
export const MONID_PROVIDER = 'bytedance'

export const MONID_ENDPOINTS: Record<AiVideoOperatorModel, string> = {
  'wan3.0': '/v1/video/wan3.0',
  'seedance-2.5': '/v1/video/seedance-2.5',
  'seedance-2.0': '/v1/video/seedance-2.0',
  'seedance-2.0-fast': '/v1/video/seedance-2.0-fast',
  'seedance-2.0-mini': '/v1/video/seedance-2.0-mini',
}

export type MonidSeedancePlan = {
  prompt: string
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  generateAudio: boolean
  model: AiVideoOperatorModel
  resolution: AiVideoOperatorResolution
}

function mapUpstreamError(status: number): string {
  if (status === 401 || status === 403) return 'monid_unauthorized'
  if (status === 429) return 'monid_rate_limited'
  if (status === 400 || status === 422) return 'monid_rejected'
  if (status === 402) return 'monid_blocked'
  return 'monid_unavailable'
}

function runIdOf(body: Record<string, unknown>): string {
  const id = typeof body.runId === 'string' ? body.runId : typeof body.id === 'string' ? body.id : ''
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id) ? id : ''
}

export function resolveMonidConfig(input: { baseUrl?: string } = {}): { baseUrl: string } {
  const baseUrl = (input.baseUrl ?? MONID_API_BASE).replace(/\/+$/, '')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.monid.ai') {
    throw new Error('invalid_monid_base_url')
  }
  return { baseUrl }
}

export async function createMonidSeedanceRun(input: {
  plan: MonidSeedancePlan
  signedInputUrls?: readonly string[]
  refRoles?: readonly string[]
}, apiKey: string, config: { baseUrl: string } = resolveMonidConfig()): Promise<{ id: string }> {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 16 || apiKey.length > 1000) {
    throw new Error('invalid_monid_api_key')
  }
  if (!isAiVideoOperatorModel(input.plan.model)) throw new Error('invalid_operator_model')
  if (!isAiVideoOperatorRatio(input.plan.ratio)) throw new Error('invalid_operator_ratio')
  if (!isAiVideoOperatorResolution(input.plan.resolution)) throw new Error('invalid_operator_resolution')
  // 1080p is a BytePlus-only tier (verified-identity lane); Monid stays at 720p.
  if (input.plan.resolution === '1080p') throw new Error('invalid_operator_resolution')
  const maxSeconds = operatorModelMaxSeconds(input.plan.model)
  if (
    !Number.isInteger(input.plan.durationSeconds)
    || input.plan.durationSeconds < AI_VIDEO_OPERATOR_MIN_SECONDS
    || input.plan.durationSeconds > maxSeconds
    || input.plan.durationSeconds > AI_VIDEO_OPERATOR_MAX_SECONDS
  ) {
    throw new Error('invalid_operator_duration')
  }
  const prompt = providerReferencePrompt(input.plan.prompt.trim(), input.plan.model)
  if (prompt.length < AI_VIDEO_OPERATOR_PROMPT_MIN) throw new Error('invalid_operator_prompt')
  if (prompt.length > MONID_SEEDANCE_PROMPT_MAX) throw new Error('monid_prompt_limit')
  const urls = [...(input.signedInputUrls ?? [])]
  const media = urls.map((raw, index) => {
    const url = new URL(raw)
    if (url.protocol !== 'https:') throw new Error('invalid_ai_video_input_url')
    const role = inferOperatorRefRole(raw, input.refRoles?.[index] ?? null)
    if (role === 'reference_video') {
      return { type: 'video_url' as const, video_url: { url: raw }, role: 'reference_video' as const }
    }
    if (role === 'reference_audio') {
      return { type: 'audio_url' as const, audio_url: { url: raw }, role: 'reference_audio' as const }
    }
    return {
      type: 'image_url' as const,
      image_url: { url: raw },
      role: role === 'first_frame' ? 'first_frame' as const : 'reference_image' as const,
    }
  })
  const images = media.filter((item) => item.type === 'image_url').length
  const videos = media.filter((item) => item.type === 'video_url').length
  const audios = media.filter((item) => item.type === 'audio_url').length
  if (images > operatorMaxImageRefs(input.plan.model)) throw new Error('operator_ref_cap')
  if (videos > operatorMaxVideoRefs(input.plan.model)) throw new Error('operator_video_cap')
  if (audios > operatorMaxAudioRefs(input.plan.model)) throw new Error('operator_audio_cap')
  const wan = input.plan.model === 'wan3.0'
  if (wan && input.plan.ratio === '21:9') throw new Error('invalid_operator_ratio')
  if (input.plan.ratio === '21:9' && media.some((item) => item.role === 'first_frame')) {
    throw new Error('invalid_operator_ratio')
  }
  if (wan && media.some((item) => item.role === 'first_frame') && media.length > 1) throw new Error('invalid_operator_ref_combination')
  const response = await fetch(`${config.baseUrl}/v1/run`, {
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider: wan ? 'alibaba' : MONID_PROVIDER,
      endpoint: MONID_ENDPOINTS[input.plan.model],
      input: {
        body: wan ? {
          prompt,
          ...(media.length ? { media: media.map((item) => ({
            type: item.role,
            url: item.type === 'image_url' ? item.image_url.url : item.type === 'video_url' ? item.video_url.url : item.audio_url.url,
          })) } : {}),
          resolution: input.plan.resolution.toUpperCase(),
          duration: input.plan.durationSeconds,
          ratio: media.some((item) => item.role === 'first_frame') ? 'adaptive' : input.plan.ratio,
          audio: input.plan.generateAudio || audios > 0,
          prompt_extend: true,
          watermark: false,
        } : {
          content: [
            { type: 'text', text: prompt },
            ...media,
          ],
          resolution: input.plan.resolution,
          duration: input.plan.durationSeconds,
          ratio: media.some((item) => item.role === 'first_frame') ? 'adaptive' : input.plan.ratio,
          ...(input.plan.model === 'seedance-2.5' ? { output_format: 'mp4' } : {}),
          generate_audio: input.plan.generateAudio,
          watermark: false,
        },
      },
    }),
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  let body: Record<string, unknown> = {}
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    throw new Error('monid_invalid_response')
  }
  const id = runIdOf(body)
  if (!id) throw new Error('monid_invalid_run')
  return { id }
}

export type MonidTask = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  videoUrl: string | null
  failureCode: string | null
  usage: Record<string, unknown>
}

const STATUS_MAP: Record<string, MonidTask['status']> = {
  ready: 'queued',
  queued: 'queued',
  pending: 'queued',
  running: 'running',
  completed: 'succeeded',
  succeeded: 'succeeded',
  failed: 'failed',
  blocked: 'failed',
  timed_out: 'failed',
  time_out: 'failed',
  timeout: 'failed',
  stopped: 'cancelled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

export async function getMonidRun(
  runId: string,
  apiKey: string,
  config: { baseUrl: string } = resolveMonidConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<MonidTask> {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 16 || apiKey.length > 1000) {
    throw new Error('invalid_monid_api_key')
  }
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(runId)) throw new Error('invalid_monid_run_id')
  const response = await fetchImpl(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  let body: Record<string, unknown> = {}
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    throw new Error('monid_invalid_response')
  }
  return presentMonidRun(body, runId)
}

export function presentMonidRun(raw: unknown, fallbackId = ''): MonidTask {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('monid_invalid_run')
  const body = raw as Record<string, unknown>
  const id = runIdOf(body) || fallbackId
  if (!id) throw new Error('monid_invalid_run')
  const videoUrl = extractVideoUrl(body)
  const mapped = STATUS_MAP[String(body.status ?? '').toLowerCase().replace(/-/g, '_')]
  if (!mapped) throw new Error('monid_invalid_run_status')
  const status = mapped === 'succeeded' && !videoUrl ? 'failed' : mapped
  return {
    id,
    status,
    videoUrl: status === 'succeeded' ? videoUrl : null,
    failureCode: failureCodeOf(body, status),
    usage: extractUsage(body),
  }
}

function extractVideoUrl(body: Record<string, unknown>): string | null {
  const candidates = [
    lookupString(body, ['output', 'content', 'video_url']),
    lookupString(body, ['output', 'video_url']),
    lookupString(body, ['output', 'output', 'video_url']),
    lookupString(body, ['providerResponse', 'output', 'video_url']),
    lookupString(body, ['providerResponse', 'data', 'output', 'video_url']),
    lookupString(body, ['output', 'url']),
    lookupString(body, ['providerResponse', 'data', 'video_url']),
    lookupString(body, ['providerResponse', 'data', 'content', 'video_url']),
    lookupString(body, ['providerResponse', 'video_url']),
    typeof body.video_url === 'string' ? body.video_url : null,
  ]
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const parsed = new URL(raw)
      if (parsed.protocol === 'https:') return parsed.toString()
    } catch { /* skip */ }
  }
  return null
}

function extractUsage(body: Record<string, unknown>): Record<string, unknown> {
  const raw = body.usage && typeof body.usage === 'object' && !Array.isArray(body.usage)
    ? body.usage as Record<string, unknown>
    : {}
  const cost = body.cost && typeof body.cost === 'object' && !Array.isArray(body.cost)
    ? body.cost as Record<string, unknown>
    : null
  return {
    ...raw,
    ...(cost ? { cost: cost, cost_usd: typeof cost.value === 'number' ? cost.value : undefined } : {}),
  }
}

function failureCodeOf(body: Record<string, unknown>, status: MonidTask['status']): string | null {
  const rawStatus = String(body.status ?? '').toUpperCase()
  if (rawStatus === 'BLOCKED') return 'monid_blocked'
  if (rawStatus === 'TIMED_OUT' || rawStatus === 'TIME_OUT' || rawStatus === 'TIMEOUT') return 'monid_timeout'
  if (rawStatus === 'STOPPED') return 'monid_stopped'
  if (status !== 'failed') return null
  const providerCode = lookupString(body, ['providerResponse', 'error', 'code'])
  if (providerCode) {
    if (/sensitive|privacy|real.?person/i.test(providerCode)) return 'monid_privacy'
    return `monid_${providerCode.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`
  }
  return lookupString(body, ['providerResponse', 'error', 'message']) ? 'monid_rejected' : 'monid_result_missing'
}

function lookupString(value: unknown, path: string[]): string | null {
  let current: unknown = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : null
}
