import {
  getAiVideoPromptStrategy,
  type AiVideoPromptCategory,
  type AiVideoRatio,
} from './ai-video-prompt-catalog.ts'
import {
  AI_VIDEO_OPERATOR_MAX_AUDIO_REFS,
  AI_VIDEO_OPERATOR_MAX_IMAGE_REFS,
  AI_VIDEO_OPERATOR_MAX_VIDEO_REFS,
  inferOperatorRefRole,
} from './ai-video-operator.ts'
import { isArkAssetUri } from './ark-asset-client.ts'

export type ModelArkConfig = {
  baseUrl: string
  promptModelId: string
  seedanceModelId: string
  callbackUrl: string
}

export type AiVideoRenderPlan = {
  category: AiVideoPromptCategory
  title: string
  prompt: string
  ratio: AiVideoRatio
  durationSeconds: number
  generateAudio: boolean
}

export type SeedanceUsage = {
  completionTokens: number | null
  raw: Record<string, unknown> | null
}

export type SeedanceTask = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  model: string
  videoUrl: string | null
  failureCode: string | null
  usage: SeedanceUsage
}

export type OperatorModelArkConfig = {
  baseUrl: string
  seedanceModelId: string
  callbackUrl: string
}

export type OperatorSeedancePlan = {
  prompt: string
  ratio: '9:16' | '16:9' | '21:9' | '1:1'
  durationSeconds: number
  generateAudio: boolean
}

// Seedance 2.5 direct-to-Ark path (verified-identity lane). Poll-only, no callback.
export const ARK_SEEDANCE_25_MODEL_ID = 'dreamina-seedance-2-5-260628'
export const ARK_SEEDANCE_RATIOS = ['9:16', '16:9', '21:9', '1:1', 'adaptive'] as const
export const ARK_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p'] as const
export const ARK_SEEDANCE_MIN_SECONDS = 2
export const ARK_SEEDANCE_MAX_SECONDS = 30
export const ARK_SEEDANCE_PROMPT_MAX = 6_000

export type ArkSeedanceRatio = (typeof ARK_SEEDANCE_RATIOS)[number]
export type ArkSeedanceResolution = (typeof ARK_SEEDANCE_RESOLUTIONS)[number]

export type ArkVideoConfig = {
  baseUrl: string
  modelId: string
}

export type ArkSeedancePlan = {
  prompt: string
  ratio: ArkSeedanceRatio
  durationSeconds: number
  resolution: ArkSeedanceResolution
  generateAudio: boolean
  model?: string
}

export type ArkSeedanceRef = {
  url: string
  role?: string | null
}

export type ArkSeedanceContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role: 'first_frame' | 'reference_image' }
  | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
const ALLOWED_HOSTS = new Set(['ark.ap-southeast.bytepluses.com', 'ark.eu-west.bytepluses.com'])
const RATIOS = new Set<AiVideoRatio>(['9:16', '16:9', '1:1', 'adaptive'])
const OPERATOR_RATIOS = new Set(['9:16', '16:9', '21:9', '1:1'])
const ARK_RATIOS = new Set<string>(ARK_SEEDANCE_RATIOS)
const ARK_RESOLUTIONS = new Set<string>(ARK_SEEDANCE_RESOLUTIONS)
const ARK_MODEL_ID_RE = /^[A-Za-z0-9._-]{3,120}$/
const EMPTY_USAGE: SeedanceUsage = { completionTokens: null, raw: null }

export function resolveModelArkConfig(input: {
  baseUrl?: string
  promptModelId?: string
  seedanceModelId?: string
  callbackUrl?: string
}): ModelArkConfig {
  const baseUrl = (input.baseUrl ?? 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.pathname !== '/api/v3') {
    throw new Error('invalid_modelark_base_url')
  }
  if (!input.promptModelId?.trim() || !input.seedanceModelId?.trim()) throw new Error('missing_modelark_model_config')
  if (!input.callbackUrl) throw new Error('missing_modelark_callback_url')
  const callback = new URL(input.callbackUrl)
  if (callback.protocol !== 'https:') throw new Error('invalid_modelark_callback_url')
  return { baseUrl, promptModelId: input.promptModelId, seedanceModelId: input.seedanceModelId, callbackUrl: callback.toString() }
}

export function resolveOperatorModelArkConfig(input: {
  baseUrl?: string
  seedanceModelId?: string
  callbackUrl?: string
}): OperatorModelArkConfig {
  const baseUrl = (input.baseUrl ?? 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.pathname !== '/api/v3') {
    throw new Error('invalid_modelark_base_url')
  }
  const seedanceModelId = input.seedanceModelId?.trim() || 'dreamina-seedance-2-5-260628'
  if (!seedanceModelId) throw new Error('missing_modelark_model_config')
  if (!input.callbackUrl) throw new Error('missing_modelark_callback_url')
  const callback = new URL(input.callbackUrl)
  if (callback.protocol !== 'https:') throw new Error('invalid_modelark_callback_url')
  return { baseUrl, seedanceModelId, callbackUrl: callback.toString() }
}

export async function validateModelArkKey(apiKey: string, config: ModelArkConfig, fetchImpl: FetchLike = fetch): Promise<void> {
  assertApiKey(apiKey)
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks?page_size=1`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
}

export async function planAiVideoPrompt(input: {
  category: AiVideoPromptCategory
  brief: string
}, apiKey: string, config: ModelArkConfig, fetchImpl: FetchLike = fetch): Promise<AiVideoRenderPlan> {
  assertApiKey(apiKey)
  const brief = input.brief.trim().slice(0, 8000)
  if (!brief) throw new Error('empty_ai_video_brief')
  const strategy = getAiVideoPromptStrategy(input.category)
  const response = await fetchImpl(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.promptModelId,
      thinking: { type: 'disabled' },
      text: { format: { type: 'json_object' } },
      input: [
        { role: 'system', content: strategy.systemInstruction },
        { role: 'user', content: brief },
      ],
    }),
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  const body = await safeJson(response)
  const outputText = extractOutputText(body)
  let parsed: unknown
  try { parsed = JSON.parse(outputText) } catch { throw new Error('modelark_invalid_plan') }
  return parsePlan(parsed, input.category)
}

export async function createSeedanceTask(input: {
  plan: AiVideoRenderPlan
  signedInputUrls?: readonly string[]
}, apiKey: string, config: ModelArkConfig, fetchImpl: FetchLike = fetch): Promise<{ id: string }> {
  assertApiKey(apiKey)
  const urls = [...(input.signedInputUrls ?? [])]
  for (const raw of urls) {
    const url = new URL(raw)
    if (url.protocol !== 'https:') throw new Error('invalid_ai_video_input_url')
  }
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.seedanceModelId,
      content: [
        { type: 'text', text: input.plan.prompt },
        ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
      generate_audio: input.plan.generateAudio,
      ratio: input.plan.ratio,
      duration: input.plan.durationSeconds,
      callback_url: config.callbackUrl,
    }),
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  const body = await safeJson(response) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : typeof body.task_id === 'string' ? body.task_id : ''
  if (!id || id.length > 200) throw new Error('modelark_invalid_task')
  return { id }
}

export async function getSeedanceTask(taskId: string, apiKey: string, config: ModelArkConfig, fetchImpl: FetchLike = fetch): Promise<SeedanceTask> {
  assertTaskId(taskId)
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  const body = await safeJson(response) as Record<string, unknown>
  const status = normalizeStatus(body.status)
  const model = typeof body.model === 'string' ? body.model : ''
  const content = body.content && typeof body.content === 'object' ? body.content as Record<string, unknown> : {}
  const rawUrl = typeof content.video_url === 'string' ? content.video_url : typeof body.video_url === 'string' ? body.video_url : null
  let videoUrl: string | null = null
  if (rawUrl) {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') throw new Error('modelark_invalid_result_url')
    videoUrl = parsed.toString()
  }
  return {
    id: taskId, status, model, videoUrl,
    failureCode: status === 'failed' ? 'modelark_generation_failed' : null,
    usage: extractUsage(body),
  }
}

export async function createOperatorSeedanceTask(input: {
  plan: OperatorSeedancePlan
  signedInputUrls?: readonly string[]
}, apiKey: string, config: OperatorModelArkConfig, fetchImpl: FetchLike = fetch): Promise<{ id: string }> {
  assertApiKey(apiKey)
  if (!OPERATOR_RATIOS.has(input.plan.ratio)) throw new Error('invalid_operator_ratio')
  if (!Number.isInteger(input.plan.durationSeconds) || input.plan.durationSeconds < 4 || input.plan.durationSeconds > 15) {
    throw new Error('invalid_operator_duration')
  }
  const prompt = input.plan.prompt.trim()
  if (prompt.length < 40) throw new Error('invalid_operator_prompt')
  const urls = [...(input.signedInputUrls ?? [])]
  for (const raw of urls) {
    const url = new URL(raw)
    if (url.protocol !== 'https:') throw new Error('invalid_ai_video_input_url')
  }
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.seedanceModelId,
      content: [
        { type: 'text', text: prompt },
        ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
      generate_audio: input.plan.generateAudio,
      ratio: input.plan.ratio,
      duration: input.plan.durationSeconds,
      callback_url: config.callbackUrl,
    }),
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  const body = await safeJson(response) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : typeof body.task_id === 'string' ? body.task_id : ''
  if (!id || id.length > 200) throw new Error('modelark_invalid_task')
  return { id }
}

export async function getOperatorSeedanceTask(
  taskId: string,
  apiKey: string,
  config: OperatorModelArkConfig,
  fetchImpl: FetchLike = fetch,
): Promise<SeedanceTask> {
  return getSeedanceTask(taskId, apiKey, { ...config, promptModelId: 'unused' }, fetchImpl)
}

export function resolveArkVideoConfig(input: { baseUrl?: string; modelId?: string } = {}): ArkVideoConfig {
  const baseUrl = (input.baseUrl ?? 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.pathname !== '/api/v3') {
    throw new Error('invalid_modelark_base_url')
  }
  const modelId = input.modelId?.trim() || ARK_SEEDANCE_25_MODEL_ID
  if (!ARK_MODEL_ID_RE.test(modelId)) throw new Error('missing_modelark_model_config')
  return { baseUrl, modelId }
}

// Same ref role mapping as monid-run.ts. Refs may be https: or asset:// (verified identity assets).
export function arkSeedanceContentItem(ref: ArkSeedanceRef): Exclude<ArkSeedanceContentItem, { type: 'text' }> {
  const url = typeof ref.url === 'string' ? ref.url.trim() : ''
  const assetRef: boolean = isArkAssetUri(url)
  if (!assetRef) {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('invalid_ai_video_input_url') }
    if (parsed.protocol !== 'https:' || url.length > 2000) throw new Error('invalid_ai_video_input_url')
  }
  const role = inferOperatorRefRole(url, ref.role ?? null)
  if (role === 'reference_video') return { type: 'video_url', video_url: { url }, role: 'reference_video' }
  if (role === 'reference_audio') return { type: 'audio_url', audio_url: { url }, role: 'reference_audio' }
  return { type: 'image_url', image_url: { url }, role: role === 'first_frame' ? 'first_frame' : 'reference_image' }
}

export async function createArkSeedanceTask(input: {
  plan: ArkSeedancePlan
  refs?: readonly ArkSeedanceRef[]
}, apiKey: string, config: ArkVideoConfig = resolveArkVideoConfig(), fetchImpl: FetchLike = fetch): Promise<{ id: string }> {
  assertApiKey(apiKey)
  const plan = input.plan
  if (!ARK_RATIOS.has(plan.ratio)) throw new Error('invalid_operator_ratio')
  if (!ARK_RESOLUTIONS.has(plan.resolution)) throw new Error('invalid_operator_resolution')
  if (
    !Number.isInteger(plan.durationSeconds)
    || plan.durationSeconds < ARK_SEEDANCE_MIN_SECONDS
    || plan.durationSeconds > ARK_SEEDANCE_MAX_SECONDS
  ) {
    throw new Error('invalid_operator_duration')
  }
  if (typeof plan.generateAudio !== 'boolean') throw new Error('invalid_operator_audio_flag')
  const model = (plan.model ?? config.modelId).trim()
  if (!ARK_MODEL_ID_RE.test(model)) throw new Error('invalid_operator_model')
  const prompt = typeof plan.prompt === 'string' ? plan.prompt.trim() : ''
  if (!prompt) throw new Error('invalid_operator_prompt')
  if (prompt.length > ARK_SEEDANCE_PROMPT_MAX) throw new Error('modelark_prompt_limit')
  const media = [...(input.refs ?? [])].map(arkSeedanceContentItem)
  const images = media.filter((item) => item.type === 'image_url').length
  const videos = media.filter((item) => item.type === 'video_url').length
  const audios = media.filter((item) => item.type === 'audio_url').length
  if (images > AI_VIDEO_OPERATOR_MAX_IMAGE_REFS) throw new Error('operator_ref_cap')
  if (videos > AI_VIDEO_OPERATOR_MAX_VIDEO_REFS) throw new Error('operator_video_cap')
  if (audios > AI_VIDEO_OPERATOR_MAX_AUDIO_REFS) throw new Error('operator_audio_cap')
  const hasFirstFrame = media.some((item) => item.role === 'first_frame')
  if (plan.ratio === '21:9' && hasFirstFrame) throw new Error('invalid_operator_ratio')
  const content: ArkSeedanceContentItem[] = [{ type: 'text', text: prompt }, ...media]
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      content,
      generate_audio: plan.generateAudio,
      ratio: hasFirstFrame ? 'adaptive' : plan.ratio,
      duration: plan.durationSeconds,
      resolution: plan.resolution,
    }),
  })
  if (!response.ok) throw new Error(mapUpstreamError(response.status))
  const body = await safeJson(response) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : typeof body.task_id === 'string' ? body.task_id : ''
  if (!id || id.length > 200) throw new Error('modelark_invalid_task')
  return { id }
}

export async function getArkSeedanceTask(
  taskId: string,
  apiKey: string,
  config: ArkVideoConfig = resolveArkVideoConfig(),
  fetchImpl: FetchLike = fetch,
): Promise<SeedanceTask> {
  return getSeedanceTask(taskId, apiKey, {
    baseUrl: config.baseUrl,
    seedanceModelId: config.modelId,
    promptModelId: 'unused',
    callbackUrl: '',
  }, fetchImpl)
}

export async function deleteSeedanceTask(taskId: string, apiKey: string, config: ModelArkConfig, fetchImpl: FetchLike = fetch): Promise<void> {
  assertTaskId(taskId)
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok && response.status !== 404) throw new Error(mapUpstreamError(response.status))
}

function parsePlan(value: unknown, expectedCategory: AiVideoPromptCategory): AiVideoRenderPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('modelark_invalid_plan')
  const p = value as Record<string, unknown>
  if (
    p.category !== expectedCategory || typeof p.title !== 'string' || p.title.trim().length < 2 || p.title.length > 120 ||
    typeof p.prompt !== 'string' || p.prompt.trim().length < 20 || p.prompt.length > 4000 ||
    typeof p.ratio !== 'string' || !RATIOS.has(p.ratio as AiVideoRatio) ||
    typeof p.durationSeconds !== 'number' || !Number.isInteger(p.durationSeconds) || p.durationSeconds < 1 || p.durationSeconds > 20 ||
    typeof p.generateAudio !== 'boolean'
  ) throw new Error('modelark_invalid_plan')
  return {
    category: expectedCategory, title: p.title.trim(), prompt: p.prompt.trim(),
    ratio: p.ratio as AiVideoRatio, durationSeconds: p.durationSeconds, generateAudio: p.generateAudio,
  }
}

function extractOutputText(body: unknown): string {
  if (!body || typeof body !== 'object') throw new Error('modelark_invalid_plan')
  const value = body as Record<string, unknown>
  if (typeof value.output_text === 'string') return value.output_text
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!item || typeof item !== 'object') continue
      const content = (item as Record<string, unknown>).content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as Record<string, unknown>).text as string
        }
      }
    }
  }
  throw new Error('modelark_invalid_plan')
}

function extractUsage(body: Record<string, unknown>): SeedanceUsage {
  const raw = body.usage && typeof body.usage === 'object' && !Array.isArray(body.usage)
    ? body.usage as Record<string, unknown>
    : null
  if (!raw) return EMPTY_USAGE
  const completion = raw.completion_tokens
  return {
    completionTokens: typeof completion === 'number' && Number.isFinite(completion) ? completion : null,
    raw,
  }
}

function normalizeStatus(value: unknown): SeedanceTask['status'] {
  const status = String(value ?? '').toLowerCase()
  const map: Record<string, SeedanceTask['status']> = {
    queued: 'queued', pending: 'queued', running: 'running', processing: 'running',
    succeeded: 'succeeded', success: 'succeeded', failed: 'failed',
    cancelled: 'cancelled', canceled: 'cancelled', expired: 'expired',
  }
  if (!map[status]) throw new Error('modelark_invalid_task_status')
  return map[status]
}

function mapUpstreamError(status: number): string {
  if (status === 401 || status === 403) return 'modelark_unauthorized'
  if (status === 429) return 'modelark_rate_limited'
  if (status === 400 || status === 422) return 'modelark_moderation_rejected'
  return 'modelark_unavailable'
}

function assertApiKey(value: string): void {
  if (typeof value !== 'string' || value.trim().length < 16 || value.length > 1000) throw new Error('invalid_modelark_api_key')
}
function assertTaskId(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value)) throw new Error('invalid_modelark_task_id')
}
async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { throw new Error('modelark_invalid_response') }
}
