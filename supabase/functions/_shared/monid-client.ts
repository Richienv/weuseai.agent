import {
  AI_VIDEO_OPERATOR_MAX_SECONDS,
  AI_VIDEO_OPERATOR_MIN_SECONDS,
  AI_VIDEO_OPERATOR_PROMPT_MAX,
  AI_VIDEO_OPERATOR_PROMPT_MIN,
  MONID_SEEDANCE_PROMPT_MAX,
  isAiVideoOperatorModel,
  isAiVideoOperatorRatio,
  isAiVideoOperatorResolution,
  operatorMaxAudioRefs,
  operatorMaxImageRefs,
  operatorMaxVideoRefs,
  operatorModelMaxSeconds,
  providerReferencePrompt,
  inferOperatorRefRole,
  type AiVideoOperatorModel,
  type AiVideoOperatorRatio,
  type AiVideoOperatorResolution,
} from './ai-video-operator.ts'
import type { SeedanceTask, SeedanceUsage } from './modelark-client.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

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

export type MonidCost = {
  value: number | null
  currency: string | null
  raw: Record<string, unknown> | null
}

export type MonidWallet = {
  value: number | null
  currency: string
  held: number | null
}

const ALLOWED_HOSTS = new Set(['api.monid.ai'])
const EMPTY_USAGE: SeedanceUsage = { completionTokens: null, raw: null }
const STATUS_MAP: Record<string, SeedanceTask['status']> = {
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

export function resolveMonidConfig(input: { baseUrl?: string } = {}): { baseUrl: string } {
  const baseUrl = (input.baseUrl ?? MONID_API_BASE).replace(/\/+$/, '')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('invalid_monid_base_url')
  }
  return { baseUrl }
}

export function monidEndpointForModel(model: AiVideoOperatorModel): string {
  return MONID_ENDPOINTS[model]
}

export async function createMonidSeedanceRun(input: {
  plan: MonidSeedancePlan
  signedInputUrls?: readonly string[]
  // Parallel to signedInputUrls. Anything that is not 'first_frame' becomes
  // 'reference_image' — character sheets lock the face, they never open the shot.
  refRoles?: readonly string[]
}, apiKey: string, config: { baseUrl: string } = resolveMonidConfig(), fetchImpl: FetchLike = fetch): Promise<{ id: string }> {
  assertApiKey(apiKey)
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
  const response = await fetchImpl(`${config.baseUrl}/v1/run`, {
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider: wan ? 'alibaba' : MONID_PROVIDER,
      endpoint: monidEndpointForModel(input.plan.model),
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
  const body = await safeJson(response) as Record<string, unknown>
  const id = runIdOf(body)
  if (!id) throw new Error('monid_invalid_run')
  return { id }
}

export function presentMonidWallet(raw: unknown): MonidWallet {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: null, currency: 'USD', held: null }
  }
  const body = raw as Record<string, unknown>
  const balance = body.balance && typeof body.balance === 'object' && !Array.isArray(body.balance)
    ? body.balance as Record<string, unknown>
    : null
  const held = body.held && typeof body.held === 'object' && !Array.isArray(body.held)
    ? body.held as Record<string, unknown>
    : null
  return {
    value: typeof balance?.value === 'number' && Number.isFinite(balance.value) ? balance.value : null,
    currency: typeof balance?.currency === 'string' && balance.currency.trim() ? balance.currency : 'USD',
    held: typeof held?.value === 'number' && Number.isFinite(held.value) ? held.value : null,
  }
}

export async function getMonidWalletBalance(
  apiKey: string,
  config: { baseUrl: string } = resolveMonidConfig(),
  fetchImpl: FetchLike = fetch,
): Promise<MonidWallet> {
  assertApiKey(apiKey)
  const response = await fetchImpl(`${config.baseUrl}/v1/wallet/balance`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  return presentMonidWallet(await safeJson(response))
}

export async function getMonidRun(
  runId: string,
  apiKey: string,
  config: { baseUrl: string } = resolveMonidConfig(),
  fetchImpl: FetchLike = fetch,
): Promise<SeedanceTask & { cost: MonidCost }> {
  assertApiKey(apiKey)
  assertRunId(runId)
  const response = await fetchImpl(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  return presentMonidRun(await safeJson(response), runId)
}

export function presentMonidRun(raw: unknown, fallbackId = ''): SeedanceTask & { cost: MonidCost } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('monid_invalid_run')
  const body = raw as Record<string, unknown>
  const id = runIdOf(body) || fallbackId
  if (!id) throw new Error('monid_invalid_run')
  const videoUrl = extractVideoUrl(body)
  let status = mapMonidStatus(body.status)
  if (status === 'succeeded' && !videoUrl) status = 'failed'
  const cost = extractCost(body)
  const usage = extractUsage(body, cost)
  const failureCode = failureCodeOf(body, status)
  return {
    id,
    status,
    model: typeof body.endpoint === 'string' ? body.endpoint : String(body.provider ?? 'monid'),
    videoUrl: status === 'succeeded' ? videoUrl : null,
    failureCode,
    usage,
    cost,
  }
}

export function mapMonidStatus(value: unknown): SeedanceTask['status'] {
  const status = String(value ?? '').toLowerCase().replace(/-/g, '_')
  const mapped = STATUS_MAP[status]
  if (!mapped) throw new Error('monid_invalid_run_status')
  return mapped
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
    } catch {
      continue
    }
  }
  return null
}

function extractCost(body: Record<string, unknown>): MonidCost {
  const cost = body.cost && typeof body.cost === 'object' && !Array.isArray(body.cost)
    ? body.cost as Record<string, unknown>
    : null
  const value = cost && typeof cost.value === 'number' && Number.isFinite(cost.value) ? cost.value : null
  return {
    value,
    currency: cost && typeof cost.currency === 'string' ? cost.currency : null,
    raw: cost,
  }
}

function extractUsage(body: Record<string, unknown>, cost: MonidCost): SeedanceUsage {
  const raw = body.usage && typeof body.usage === 'object' && !Array.isArray(body.usage)
    ? body.usage as Record<string, unknown>
    : null
  const completion = raw && typeof raw.completion_tokens === 'number' ? raw.completion_tokens : null
  return {
    completionTokens: completion,
    raw: {
      ...(raw ?? EMPTY_USAGE.raw ?? {}),
      cost: cost.raw ?? undefined,
      cost_usd: cost.value,
    },
  }
}

function failureCodeOf(body: Record<string, unknown>, status: SeedanceTask['status']): string | null {
  const rawStatus = String(body.status ?? '').toUpperCase()
  if (rawStatus === 'BLOCKED') return 'monid_blocked'
  if (rawStatus === 'TIMED_OUT' || rawStatus === 'TIME_OUT' || rawStatus === 'TIMEOUT') return 'monid_timeout'
  if (rawStatus === 'STOPPED') return 'monid_stopped'
  if (status === 'failed') {
    const providerCode = lookupString(body, ['providerResponse', 'error', 'code'])
    if (providerCode) {
      if (/sensitive|privacy|real.?person/i.test(providerCode)) return 'monid_privacy'
      return `monid_${providerCode.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`
    }
    const error = body.error
    if (typeof error === 'string' && error.trim()) return `monid_${error.trim().slice(0, 80)}`
    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return 'monid_failed'
    }
    if (lookupString(body, ['providerResponse', 'error', 'message'])) return 'monid_rejected'
    return 'monid_result_missing'
  }
  return null
}

function runIdOf(body: Record<string, unknown>): string {
  const id = typeof body.runId === 'string' ? body.runId : typeof body.id === 'string' ? body.id : ''
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id) ? id : ''
}

function lookupString(value: unknown, path: string[]): string | null {
  let current: unknown = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : null
}

function mapUpstreamError(status: number): string {
  if (status === 401 || status === 403) return 'monid_unauthorized'
  if (status === 429) return 'monid_rate_limited'
  if (status === 400 || status === 422) return 'monid_rejected'
  if (status === 402) return 'monid_blocked'
  return 'monid_unavailable'
}

function assertApiKey(value: string): void {
  if (typeof value !== 'string' || value.trim().length < 16 || value.length > 1000) {
    throw new Error('invalid_monid_api_key')
  }
}

function assertRunId(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value)) throw new Error('invalid_monid_run_id')
}

async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { throw new Error('monid_invalid_response') }
}
