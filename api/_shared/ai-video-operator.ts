export const AI_VIDEO_OPERATOR_PROVIDER = 'monid'
// Jobs that carry a verified-identity asset:// ref run on BytePlus ModelArk;
// everything else stays on Monid. Mirrors the DB CHECK in
// 20260914010000_ai_video_identities.sql.
export const AI_VIDEO_OPERATOR_PROVIDERS = ['monid', 'byteplus_modelark'] as const
export const AI_VIDEO_OPERATOR_MIN_SECONDS = 4
export const AI_VIDEO_OPERATOR_MAX_SECONDS = 30
export const AI_VIDEO_OPERATOR_V20_MAX_SECONDS = 15
export const AI_VIDEO_OPERATOR_ATTEMPT_CAP = 2
export const AI_VIDEO_OPERATOR_INFLIGHT_CAP = 3
// Seedance 2.5 multimodal cap is 50: 30 images + 10 video + 10 audio.
export const AI_VIDEO_OPERATOR_MAX_IMAGE_REFS = 30
export const AI_VIDEO_OPERATOR_MAX_VIDEO_REFS = 10
export const AI_VIDEO_OPERATOR_MAX_AUDIO_REFS = 10
export const AI_VIDEO_OPERATOR_MAX_REFS = 50
export const AI_VIDEO_OPERATOR_V20_MAX_REFS = 8
export const AI_VIDEO_OPERATOR_V20_MAX_VIDEO_REFS = 0
export const AI_VIDEO_OPERATOR_V20_MAX_AUDIO_REFS = 0
export const AI_VIDEO_OPERATOR_PROMPT_MIN = 40
// Draft storage limit is separate from the live Monid input contract.
export const AI_VIDEO_OPERATOR_PROMPT_MAX = 100_000
export const MONID_SEEDANCE_PROMPT_MAX = 6_000
export const SEEDANCE_25_PROMPT_HINT = MONID_SEEDANCE_PROMPT_MAX
export const AI_VIDEO_OPERATOR_LESSON_MAX = 8_000
export const AI_VIDEO_OPERATOR_TITLE_MIN = 2
export const AI_VIDEO_OPERATOR_TITLE_MAX = 80
export const SEEDANCE_25_USD_PER_5S_720P = 1.156
export const SEEDANCE_25_USD_PER_5S_480P = 0.52
// BytePlus ModelArk Seedance 2.5 list prices, per output second. Placeholders
// from the Sep 2026 pricing page (1080p about USD 0.41/s, 720p about USD 0.25/s);
// 480p is derived with the same 480p/720p ratio Monid publishes. Replace with
// the invoiced token rate once the first paid ModelArk job settles.
export const ARK_SEEDANCE_25_USD_PER_SECOND_1080P = 0.41
export const ARK_SEEDANCE_25_USD_PER_SECOND_720P = 0.25
export const ARK_SEEDANCE_25_USD_PER_SECOND_480P = 0.11

export const AI_VIDEO_OPERATOR_HEADINGS = [
  'SCENE',
  'REFERENCES',
  'PHYSICS',
  'LIGHT',
  'CAMERA',
  'TIMELINE',
  'PERFORMANCE',
  'SOUND',
  'LOCKS',
] as const

export const AI_VIDEO_OPERATOR_RATIOS = ['9:16', '16:9', '21:9', '1:1'] as const
export const AI_VIDEO_OPERATOR_MODELS = [
  'wan3.0', 'seedance-2.5', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini',
] as const
// 1080p is a ModelArk-only output; parseOperatorStartInput rejects it unless
// the job resolves to provider 'byteplus_modelark' (an asset:// ref is present).
export const AI_VIDEO_OPERATOR_RESOLUTIONS = ['480p', '720p', '1080p'] as const
// Character sheets carry likeness, so they are reference_image. first_frame is
// opt-in for scene stills only — a sheet as frame one puts the grey 4-panel
// plate on screen and wrecks the shot.
export const AI_VIDEO_OPERATOR_REF_ROLES = [
  'first_frame',
  'reference_image',
  'reference_video',
  'reference_audio',
] as const
export const AI_VIDEO_OPERATOR_CHARACTER_NAME_MIN = 2
export const AI_VIDEO_OPERATOR_CHARACTER_NAME_MAX = 60
export const AI_VIDEO_OPERATOR_CHARACTER_NOTES_MAX = 2_000
export const AI_VIDEO_OPERATOR_STATUSES = [
  'queued', 'submitted', 'running', 'succeeded', 'failed', 'cancelled',
] as const
export const AI_VIDEO_OPERATOR_NONTERMINAL = ['queued', 'submitted', 'running'] as const

export type AiVideoOperatorProvider = (typeof AI_VIDEO_OPERATOR_PROVIDERS)[number]
export type AiVideoOperatorRatio = (typeof AI_VIDEO_OPERATOR_RATIOS)[number]
export type AiVideoOperatorModel = (typeof AI_VIDEO_OPERATOR_MODELS)[number]
export type AiVideoOperatorResolution = (typeof AI_VIDEO_OPERATOR_RESOLUTIONS)[number]
export type AiVideoOperatorStatus = (typeof AI_VIDEO_OPERATOR_STATUSES)[number]
export type AiVideoOperatorRefRole = (typeof AI_VIDEO_OPERATOR_REF_ROLES)[number]

export type AiVideoOperatorCharacter = {
  id: string
  name: string
  sheetPath: string | null
  sheetUrl: string | null
  notes: string | null
  createdAt: string
}

export type AiVideoOperatorJob = {
  clientRequestId?: string | null
  // Missing on rows mapped before the identity lane; presenters fall back to
  // operatorJobProvider(refUrls).
  provider?: AiVideoOperatorProvider | null
  id: string
  orderId: string | null
  exampleId: string | null
  prompt: string
  lesson: string | null
  libraryId: string | null
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  generateAudio: boolean
  resolution: AiVideoOperatorResolution
  status: AiVideoOperatorStatus
  providerModelId: string | null
  providerTaskId: string | null
  providerVideoUrl: string | null
  resultPath: string | null
  attempt: number
  errorCode: string | null
  usage: Record<string, unknown>
  refPaths: string[]
  refUrls: string[]
  // Parallel to [...refUrls, ...refPaths] in submit order. Empty = all reference_image.
  refRoles: AiVideoOperatorRefRole[]
  createdAt: string
  updatedAt: string
}

export type AiVideoOperatorPromptSaveInput = {
  title: string
  prompt: string
  coverPath: string
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  model: AiVideoOperatorModel
  refPaths: string[]
}

export type AiVideoOperatorStartInput = {
  sourcePrompt?: string
  refTags?: string[]
  referenceSeconds?: number
  refDurations?: number[]
  clientRequestId?: string | null
  prompt: string
  lesson: string | null
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  generateAudio: boolean
  model: AiVideoOperatorModel
  resolution: AiVideoOperatorResolution
  provider: AiVideoOperatorProvider
  exampleId: string | null
  libraryId: string | null
  tid: string | null
  refPaths: string[]
  refUrls: string[]
  refRoles: AiVideoOperatorRefRole[]
}

// One ai_video_identity_assets row joined to its ai_video_identities parent,
// as the start handler needs it to decide whether an asset:// ref may be used.
export type AiVideoIdentityAssetLink = {
  assetId: string
  assetType: 'Image' | 'Video' | 'Audio'
  status: 'processing' | 'active' | 'failed'
  deletedAt: string | null
  identity: {
    id: string
    ownerKind: 'founder' | 'customer'
    customerId: string | null
    orderId: string | null
    verificationStatus: string
    revokedAt: string | null
  }
}

export type AiVideoOperatorLibraryItem = {
  id: string
  title: string
  prompt: string
  lesson: string | null
  ratio: AiVideoOperatorRatio
  durationSeconds: number
  model: AiVideoOperatorModel
  resultPath: string | null
  refPaths: string[]
  sourceJobId: string | null
  sourceOrderId: string | null
  createdAt: string
}

const RATIOS = new Set<string>(AI_VIDEO_OPERATOR_RATIOS)
const MODELS = new Set<string>(AI_VIDEO_OPERATOR_MODELS)
const RESOLUTIONS = new Set<string>(AI_VIDEO_OPERATOR_RESOLUTIONS)
const PROVIDERS = new Set<string>(AI_VIDEO_OPERATOR_PROVIDERS)
const STATUSES = new Set<string>(AI_VIDEO_OPERATOR_STATUSES)
// Same shape as ARK_ASSET_URI_RE in ark-asset-client.ts. Inlined on purpose:
// this file is bundled into the Studio UI and has no imports, and the twin
// drift test pins both copies byte-identical. tests/ai-video-operator.spec.ts
// pins the two regexes equal.
const ASSET_URI_RE = /^asset:\/\/[A-Za-z0-9._-]{8,120}$/
const TRANSITIONS: Record<AiVideoOperatorStatus, readonly AiVideoOperatorStatus[]> = {
  queued: ['submitted', 'failed', 'cancelled'],
  submitted: ['running', 'succeeded', 'failed', 'cancelled'],
  running: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
}

const BANNED = /higgsfield|cadence|@\[[^\]]+\]|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
const AT_TOKEN = /@([A-Za-z][\w-]{0,40})\b/g
const MEDIA_TOKEN = /@(Image(?:[1-9]|[1-2]\d|30)|Video(?:[1-9]|10)|Audio(?:[1-9]|10))\b/
const IMAGE_ORDINAL = /^Image(?:[1-9]|[1-2]\d|30)$/
const VIDEO_ORDINAL = /^Video(?:[1-9]|10)$/
const AUDIO_ORDINAL = /^Audio(?:[1-9]|10)$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TID_RE = /^WU-[2-9A-HJ-NP-Z]{4}$/
const IMAGE_EXT = 'jpe?g|png|webp'
const VIDEO_EXT = 'mp4|mov|webm'
const AUDIO_EXT = 'mp3|wav|m4a|aac'
const REF_PATH_RE = new RegExp(`^operator/[A-Za-z0-9._/-]+\\.(${IMAGE_EXT}|${VIDEO_EXT}|${AUDIO_EXT})$`, 'i')
const IMAGE_PATH_RE = new RegExp(`^operator/[A-Za-z0-9._/-]+\\.(${IMAGE_EXT})$`, 'i')
const UPLOAD_NAME_RE = new RegExp(`^[A-Za-z0-9._-]{1,80}\\.(${IMAGE_EXT}|${VIDEO_EXT}|${AUDIO_EXT})$`, 'i')

export function isAiVideoOperatorRatio(value: unknown): value is AiVideoOperatorRatio {
  return typeof value === 'string' && RATIOS.has(value)
}

export function isAiVideoOperatorModel(value: unknown): value is AiVideoOperatorModel {
  return typeof value === 'string' && MODELS.has(value)
}

export function isAiVideoOperatorResolution(value: unknown): value is AiVideoOperatorResolution {
  return typeof value === 'string' && RESOLUTIONS.has(value)
}

export function isAiVideoOperatorStatus(value: unknown): value is AiVideoOperatorStatus {
  return typeof value === 'string' && STATUSES.has(value)
}

export function isAiVideoOperatorProvider(value: unknown): value is AiVideoOperatorProvider {
  return typeof value === 'string' && PROVIDERS.has(value)
}

// asset://<id> points at a BytePlus ModelArk identity asset (verified real person).
export function isOperatorAssetRef(value: unknown): value is string {
  return typeof value === 'string' && ASSET_URI_RE.test(value)
}

export function operatorAssetIdFromRef(value: string): string {
  if (!isOperatorAssetRef(value)) throw new Error('invalid_operator_ref_url')
  return value.slice('asset://'.length)
}

// Any asset:// ref forces the ModelArk lane; the DB CHECK enforces the same rule.
export function operatorJobProvider(refUrls: readonly string[]): AiVideoOperatorProvider {
  return refUrls.some(isOperatorAssetRef) ? 'byteplus_modelark' : 'monid'
}

// An asset:// ref has no extension, so its media kind follows the declared role.
export function operatorRefKindForRole(role: AiVideoOperatorRefRole): 'image' | 'video' | 'audio' {
  if (role === 'reference_video') return 'video'
  if (role === 'reference_audio') return 'audio'
  return 'image'
}

export function operatorModelMaxSeconds(model: AiVideoOperatorModel): number {
  return model === 'seedance-2.5' || model === 'wan3.0' ? AI_VIDEO_OPERATOR_MAX_SECONDS : AI_VIDEO_OPERATOR_V20_MAX_SECONDS
}

export function operatorMaxRefs(model: AiVideoOperatorModel): number {
  if (model === 'wan3.0') return 20
  return model === 'seedance-2.5' ? AI_VIDEO_OPERATOR_MAX_REFS : AI_VIDEO_OPERATOR_V20_MAX_REFS
}

export function operatorMaxImageRefs(model: AiVideoOperatorModel): number {
  if (model === 'wan3.0') return 10
  return model === 'seedance-2.5' ? AI_VIDEO_OPERATOR_MAX_IMAGE_REFS : AI_VIDEO_OPERATOR_V20_MAX_REFS
}

export function operatorMaxVideoRefs(model: AiVideoOperatorModel): number {
  if (model === 'wan3.0') return 5
  return model === 'seedance-2.5' ? AI_VIDEO_OPERATOR_MAX_VIDEO_REFS : AI_VIDEO_OPERATOR_V20_MAX_VIDEO_REFS
}

export function operatorMaxAudioRefs(model: AiVideoOperatorModel): number {
  if (model === 'wan3.0') return 5
  return model === 'seedance-2.5' ? AI_VIDEO_OPERATOR_MAX_AUDIO_REFS : AI_VIDEO_OPERATOR_V20_MAX_AUDIO_REFS
}

export function isOperatorImageHandle(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_ORDINAL.test(value)
}

export function isOperatorMediaHandle(value: unknown): value is string {
  return typeof value === 'string'
    && (IMAGE_ORDINAL.test(value) || VIDEO_ORDINAL.test(value) || AUDIO_ORDINAL.test(value))
}

export function isOperatorImagePath(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_PATH_RE.test(value) && !value.includes('..')
}

export function operatorRefKindFromName(value: string): 'image' | 'video' | 'audio' {
  if (/\.(mp4|mov|webm)(\?|#|$)/i.test(value)) return 'video'
  if (/\.(mp3|wav|m4a|aac)(\?|#|$)/i.test(value)) return 'audio'
  return 'image'
}

export function inferOperatorRefRole(
  source: string,
  declared?: string | null,
): AiVideoOperatorRefRole {
  if (isOperatorRefRole(declared)) return declared
  const kind = operatorRefKindFromName(source)
  if (kind === 'video') return 'reference_video'
  if (kind === 'audio') return 'reference_audio'
  return 'reference_image'
}

export function applyOperatorTransition(
  from: AiVideoOperatorStatus,
  to: AiVideoOperatorStatus,
): AiVideoOperatorStatus {
  if (!TRANSITIONS[from].includes(to)) throw new Error('invalid_operator_transition')
  return to
}

export function canCancelOperatorJob(job: Pick<AiVideoOperatorJob, 'status'> & { providerTaskId?: string | null; attempt?: number }): boolean {
  return job.status === 'queued' && !job.providerTaskId && !job.attempt
}

export function canSubmitOperatorJob(job: Pick<AiVideoOperatorJob, 'status' | 'attempt'>): boolean {
  return job.status === 'queued' && job.attempt < AI_VIDEO_OPERATOR_ATTEMPT_CAP
}

export function isOperatorRefPath(value: unknown): value is string {
  return typeof value === 'string' && REF_PATH_RE.test(value) && !value.includes('..')
}

export function isOperatorUploadName(value: unknown): value is string {
  return typeof value === 'string' && UPLOAD_NAME_RE.test(value)
}

export function isOperatorRefRole(value: unknown): value is AiVideoOperatorRefRole {
  return value === 'first_frame'
    || value === 'reference_image'
    || value === 'reference_video'
    || value === 'reference_audio'
}

export function isOperatorRefUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  if (isOperatorAssetRef(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

export function sanitizeOperatorPrompt(prompt: string): string {
  let next = String(prompt || '')
  for (let pass = 0; pass < 4; pass += 1) {
    AT_TOKEN.lastIndex = 0
    next = next
      .replace(/@image\s*((?:[1-9]|[1-2]\d|30))\b/gi, '@Image$1')
      .replace(/@video\s*((?:[1-9]|10))\b/gi, '@Video$1')
      .replace(/@audio\s*((?:[1-9]|10))\b/gi, '@Audio$1')
      .replace(/@\[([^\]]*)\]/g, (_, inner) => {
        const handle = String(inner || '').replace(/\s+/g, '')
          .replace(/^image/i, 'Image')
          .replace(/^video/i, 'Video')
          .replace(/^audio/i, 'Audio')
        if (isOperatorMediaHandle(handle)) return `@${handle}`
        return String(inner || '').trim()
      })
      .replace(/higgsfield/gi, '')
      .replace(/cadence/gi, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '')
    next = next.replace(AT_TOKEN, (token, name) => (isOperatorMediaHandle(name) ? token : String(name || '')))
    next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
    if (!operatorPromptHasBannedToken(next)) return next
  }
  return next
}

export function operatorPromptHasBannedToken(prompt: string): boolean {
  if (BANNED.test(prompt)) return true
  AT_TOKEN.lastIndex = 0
  for (const match of prompt.matchAll(AT_TOKEN)) {
    if (!isOperatorMediaHandle(match[1])) return true
  }
  return false
}

export function operatorPromptHasHeadings(prompt: string): boolean {
  return AI_VIDEO_OPERATOR_HEADINGS.every((heading) => prompt.includes(heading))
}

export function operatorPromptIsReady(prompt: string): boolean {
  if (operatorPromptHasHeadings(prompt)) return true
  MEDIA_TOKEN.lastIndex = 0
  if (MEDIA_TOKEN.test(prompt)) return true
  return prompt.length >= 400
}

export function estimateOperatorCostUsd(
  durationSeconds: number,
  resolution: AiVideoOperatorResolution = '720p',
  model: string = 'seedance-2.5',
  referenceSeconds = 0,
  provider: AiVideoOperatorProvider = 'monid',
): number {
  if (provider === 'byteplus_modelark') {
    // Direct ModelArk lane (Seedance 2.5 only). Reference clips are not billed
    // separately on Ark; output seconds set the price.
    const perSecond = resolution === '1080p'
      ? ARK_SEEDANCE_25_USD_PER_SECOND_1080P
      : resolution === '480p' ? ARK_SEEDANCE_25_USD_PER_SECOND_480P : ARK_SEEDANCE_25_USD_PER_SECOND_720P
    return Math.round(durationSeconds * perSecond * 1000) / 1000
  }
  if (model === 'wan3.0') return Math.round((durationSeconds + referenceSeconds) * (resolution === '480p' ? .05 : .10) * 1000) / 1000
  const perFive = resolution === '480p' ? SEEDANCE_25_USD_PER_5S_480P : SEEDANCE_25_USD_PER_5S_720P
  const rate = ({ 'seedance-2.5': 10.7, 'seedance-2.0': 7, 'seedance-2.0-fast': 5.6, 'seedance-2.0-mini': 3.5 } as Record<string, number>)[model] ?? 10.7
  return Math.round((perFive * durationSeconds / 5 * rate / 10.7) * 1000) / 1000
}

export function operatorCostFromUsage(usage: Record<string, unknown>): number | null {
  const direct = usage.cost_usd
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const cost = usage.cost
  if (cost && typeof cost === 'object' && !Array.isArray(cost)) {
    const value = (cost as { value?: unknown }).value
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export function operatorGenerateReady(env: {
  OPERATOR_GENERATE_ENABLED?: string
  MONID_API_KEY?: string
}): boolean {
  const key = env.MONID_API_KEY ?? ''
  return env.OPERATOR_GENERATE_ENABLED === 'true' && key.trim().length >= 16
}

export function parseOperatorLesson(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error('invalid_operator_lesson')
  const lesson = value.trim()
  if (!lesson) return null
  if (lesson.length > AI_VIDEO_OPERATOR_LESSON_MAX) throw new Error('invalid_operator_lesson')
  return lesson
}

export function parseOperatorLibraryTitle(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_operator_title')
  const title = value.trim()
  if (title.length < AI_VIDEO_OPERATOR_TITLE_MIN || title.length > AI_VIDEO_OPERATOR_TITLE_MAX) {
    throw new Error('invalid_operator_title')
  }
  return title
}

export function parseOperatorPromptSaveInput(body: Record<string, unknown>): AiVideoOperatorPromptSaveInput {
  const title = parseOperatorLibraryTitle(body.title)
  const prompt = sanitizeOperatorPrompt(typeof body.prompt === 'string' ? body.prompt : '')
  if (prompt.length < AI_VIDEO_OPERATOR_PROMPT_MIN) throw new Error('invalid_operator_prompt')
  if (prompt.length > AI_VIDEO_OPERATOR_PROMPT_MAX) throw new Error('invalid_operator_prompt_long')
  const coverPath = typeof body.cover_path === 'string' ? body.cover_path.trim() : ''
  if (!isOperatorImagePath(coverPath)) throw new Error('invalid_operator_cover')
  const ratio = isAiVideoOperatorRatio(body.ratio) ? body.ratio : '9:16'
  const model = body.model == null || body.model === ''
    ? 'seedance-2.5'
    : body.model
  if (!isAiVideoOperatorModel(model)) throw new Error('invalid_operator_model')
  const durationSeconds = typeof body.duration_seconds === 'number' && Number.isInteger(body.duration_seconds)
    ? body.duration_seconds
    : 6
  if (
    durationSeconds < AI_VIDEO_OPERATOR_MIN_SECONDS
    || durationSeconds > operatorModelMaxSeconds(model)
  ) {
    throw new Error('invalid_operator_duration')
  }
  const refPaths = asStringList(body.ref_paths).map((path) => {
    if (!isOperatorRefPath(path)) throw new Error('invalid_operator_ref_path')
    return path
  })
  if (refPaths.length > operatorMaxRefs(model)) throw new Error('operator_ref_cap')
  return { title, prompt, coverPath, ratio, durationSeconds, model, refPaths }
}

export function parseOperatorStartInput(body: Record<string, unknown>): AiVideoOperatorStartInput {
  const simple = body.prompt_mode === 'simple'
  const rawPrompt = typeof body.prompt === 'string' ? body.prompt : ''
  let prompt = simple ? simplePromptText(rawPrompt).trim() : sanitizeOperatorPrompt(rawPrompt)
  if (prompt.length < (simple ? 3 : AI_VIDEO_OPERATOR_PROMPT_MIN)) throw new Error('invalid_operator_prompt')
  if (prompt.length > AI_VIDEO_OPERATOR_PROMPT_MAX) throw new Error('invalid_operator_prompt_long')
  if (!simple && !operatorPromptHasHeadings(prompt) && !operatorPromptIsReady(prompt)) {
    throw new Error('operator_prompt_headings')
  }
  if (!isAiVideoOperatorRatio(body.ratio)) throw new Error('invalid_operator_ratio')
  const model = body.model == null || body.model === ''
    ? 'seedance-2.5'
    : body.model
  if (!isAiVideoOperatorModel(model)) throw new Error('invalid_operator_model')
  const resolution = body.resolution == null || body.resolution === ''
    ? '720p'
    : body.resolution
  if (!isAiVideoOperatorResolution(resolution)) throw new Error('invalid_operator_resolution')
  const durationSeconds = body.duration_seconds
  const maxSeconds = operatorModelMaxSeconds(model)
  if (
    typeof durationSeconds !== 'number'
    || !Number.isInteger(durationSeconds)
    || durationSeconds < AI_VIDEO_OPERATOR_MIN_SECONDS
    || durationSeconds > maxSeconds
  ) {
    throw new Error('invalid_operator_duration')
  }
  const generateAudio = body.generate_audio === true
  const exampleId = typeof body.example_id === 'string' && body.example_id.trim()
    ? body.example_id.trim().slice(0, 80)
    : null
  const libraryId = typeof body.library_id === 'string' && body.library_id.trim()
    ? body.library_id.trim()
    : null
  if (libraryId && !UUID_RE.test(libraryId)) throw new Error('invalid_operator_library')
  const tidRaw = typeof body.tid === 'string' ? body.tid.trim().toUpperCase() : ''
  if (tidRaw && !TID_RE.test(tidRaw)) throw new Error('invalid_operator_tid')
  const refPaths = asStringList(body.ref_paths).map((path) => {
    if (!isOperatorRefPath(path)) throw new Error('invalid_operator_ref_path')
    return path
  })
  const refUrls = asStringList(body.ref_urls).map((url) => {
    if (!isOperatorRefUrl(url)) throw new Error('invalid_operator_ref_url')
    return url
  })
  const provider = operatorJobProvider(refUrls)
  // Identity assets live in the ModelArk asset library; only Seedance 2.5 on
  // Ark can read them. Any other model with an asset:// ref is a bad ref.
  if (provider === 'byteplus_modelark' && model !== 'seedance-2.5') throw new Error('invalid_operator_ref_url')
  if (resolution === '1080p' && provider !== 'byteplus_modelark') throw new Error('invalid_operator_resolution')
  if (refPaths.length + refUrls.length > operatorMaxRefs(model)) throw new Error('operator_ref_cap')
  const declaredRoles = asStringList(body.ref_roles)
  if (declaredRoles.length && declaredRoles.length !== refPaths.length + refUrls.length) {
    throw new Error('invalid_operator_ref_role')
  }
  const sources = [...refUrls, ...refPaths]
  const assetFlags = sources.map(isOperatorAssetRef)
  const refRoles = sources.map((source, index) => {
    const declared = declaredRoles[index] ?? null
    if (declared && !isOperatorRefRole(declared)) throw new Error('invalid_operator_ref_role')
    const role = inferOperatorRefRole(source, declared)
    // asset:// carries no extension: the declared role names the media kind,
    // and the start handler checks it against the registered asset_type.
    const kind = assetFlags[index] ? operatorRefKindForRole(role) : operatorRefKindFromName(source)
    if (role === 'reference_video' && kind !== 'video') throw new Error('invalid_operator_ref_role')
    if (role === 'reference_audio' && kind !== 'audio') throw new Error('invalid_operator_ref_role')
    if ((role === 'first_frame' || role === 'reference_image') && kind !== 'image') {
      throw new Error('invalid_operator_ref_role')
    }
    return role
  })
  if (refRoles.filter((role) => role === 'first_frame').length > 1) {
    throw new Error('invalid_operator_ref_role')
  }
  if (refRoles.includes('first_frame') && body.ratio === '21:9') throw new Error('invalid_operator_ratio')
  const imageCount = refRoles.filter((role) => role === 'first_frame' || role === 'reference_image').length
  const videoCount = refRoles.filter((role) => role === 'reference_video').length
  const audioCount = refRoles.filter((role) => role === 'reference_audio').length
  if (imageCount > operatorMaxImageRefs(model)) throw new Error('operator_ref_cap')
  if (videoCount > operatorMaxVideoRefs(model)) throw new Error('operator_video_cap')
  if (audioCount > operatorMaxAudioRefs(model)) throw new Error('operator_audio_cap')
  let referenceSeconds = 0
  if (model === 'wan3.0') {
    if (body.ratio === '21:9') throw new Error('invalid_operator_ratio')
    if (refRoles.includes('first_frame') && refRoles.some((role) => role !== 'first_frame')) throw new Error('invalid_operator_ref_combination')
    const durations = Array.isArray(body.ref_durations) ? body.ref_durations : []
    let videoSeconds = 0
    sources.forEach((source, index) => {
      const role = refRoles[index]
      if (role !== 'reference_video' && role !== 'reference_audio') return
      if (role === 'reference_audio' && !/\.(wav|mp3)(?:[?#]|$)/i.test(source)) throw new Error('invalid_operator_audio_format')
      if (role === 'reference_video' && !/\.(mp4|mov)(?:[?#]|$)/i.test(source)) throw new Error('invalid_operator_media')
      const seconds = durations[index]
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 1 || seconds > 15) throw new Error('invalid_operator_media_duration')
      referenceSeconds += seconds
      if (role === 'reference_video') videoSeconds += seconds
    })
    if (referenceSeconds > 15 || videoSeconds + durationSeconds > 30) throw new Error('invalid_operator_media_duration')
  }
  if (simple && model === 'seedance-2.5') {
    const durations = Array.isArray(body.ref_durations) ? body.ref_durations : []
    // Identity assets were measured by BytePlus at registration; the UI has no
    // duration for them, so they are exempt from the clip-length checks.
    const referenceError = simpleReferenceError(model, refRoles.map((role, index) => ({ role, seconds: durations[index], asset: assetFlags[index] })), durationSeconds)
    if (referenceError) throw new Error('invalid_operator_media_duration')
    referenceSeconds = refRoles.reduce((total, role, index) => total + (role === 'reference_audio' || role === 'reference_video' ? (Number(durations[index]) || 0) : 0), 0)
  }
  let binding: ReturnType<typeof bindReferenceTags> | undefined
  if (simple) {
    binding = bindReferenceTags(prompt, refRoles, body.ref_tags)
    prompt = compileSimplePrompt(sanitizeOperatorPrompt(binding.prompt), refRoles)
    if (prompt.length > SIMPLE_PROMPT_LIMIT) throw new Error('monid_prompt_limit')
  }
  return {
    prompt,
    ...(binding ? { sourcePrompt: binding.sourcePrompt, refTags: binding.tags } : {}),
    referenceSeconds,
    refDurations: sources.map((_, index) => Array.isArray(body.ref_durations) && typeof body.ref_durations[index] === 'number' ? body.ref_durations[index] : 0),
    clientRequestId: body.client_request_id == null ? null : isOperatorJobId(body.client_request_id) ? body.client_request_id : (() => { throw new Error('invalid_operator_request_id') })(),
    lesson: parseOperatorLesson(body.lesson),
    ratio: body.ratio,
    durationSeconds,
    generateAudio: generateAudio || audioCount > 0,
    model,
    resolution,
    provider,
    exampleId,
    libraryId,
    tid: tidRaw || null,
    refPaths,
    refUrls,
    refRoles,
  }
}

export function presentAiVideoOperatorJob(job: AiVideoOperatorJob) {
  const resolution = isAiVideoOperatorResolution(job.resolution) ? job.resolution : '720p'
  const provider = isAiVideoOperatorProvider(job.provider) ? job.provider : operatorJobProvider(job.refUrls)
  return {
    id: job.id,
    client_request_id: job.clientRequestId ?? null,
    provider,
    order_id: job.orderId,
    example_id: job.exampleId,
    library_id: job.libraryId,
    prompt: job.prompt,
    source_prompt: typeof job.usage.source_prompt === 'string' ? job.usage.source_prompt : null,
    ref_tags: Array.isArray(job.usage.reference_tags) ? job.usage.reference_tags : null,
    ref_durations: Array.isArray(job.usage.reference_durations) ? job.usage.reference_durations : [],
    lesson: job.lesson,
    ratio: job.ratio,
    duration_seconds: job.durationSeconds,
    generate_audio: job.generateAudio,
    model: job.providerModelId,
    resolution,
    status: job.status,
    phase: job.status === 'succeeded' && job.resultPath ? 'ready'
      : !['failed', 'cancelled'].includes(job.status) && job.providerVideoUrl ? 'saving' : job.status,
    can_cancel: canCancelOperatorJob(job),
    can_sync: Boolean(job.providerTaskId) && ['operator_sync_timeout', 'operator_result_store_failed'].includes(job.errorCode ?? ''),
    provider_task_id: job.providerTaskId,
    error_code: job.errorCode,
    attempt: job.attempt,
    ref_count: job.refPaths.length + job.refUrls.length,
    ref_paths: job.refPaths,
    ref_urls: job.refUrls,
    ref_roles: job.refRoles,
    result_path: job.resultPath,
    estimate_usd: estimateOperatorCostUsd(job.durationSeconds, resolution, job.providerModelId ?? 'seedance-2.5', Number(job.usage.reference_seconds) || 0, provider),
    cost_usd: operatorCostFromUsage(job.usage),
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  }
}

export function presentAiVideoOperatorLibrary(item: AiVideoOperatorLibraryItem) {
  return {
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    lesson: item.lesson,
    ratio: item.ratio,
    duration_seconds: item.durationSeconds,
    model: item.model,
    result_path: item.resultPath,
    ref_paths: item.refPaths,
    source_job_id: item.sourceJobId,
    source_order_id: item.sourceOrderId,
    created_at: item.createdAt,
  }
}

export function parseOperatorCharacterInput(body: Record<string, unknown>): {
  name: string
  sheetPath: string
  notes: string | null
} {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (
    name.length < AI_VIDEO_OPERATOR_CHARACTER_NAME_MIN
    || name.length > AI_VIDEO_OPERATOR_CHARACTER_NAME_MAX
  ) {
    throw new Error('invalid_operator_character_name')
  }
  const sheetPath = body.sheet_path
  if (!isOperatorImagePath(sheetPath)) throw new Error('invalid_operator_character_sheet')
  const rawNotes = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (rawNotes.length > AI_VIDEO_OPERATOR_CHARACTER_NOTES_MAX) {
    throw new Error('invalid_operator_character_notes')
  }
  return { name, sheetPath, notes: rawNotes || null }
}

export function presentAiVideoOperatorCharacter(
  item: AiVideoOperatorCharacter,
  signedSheetUrl?: string | null,
) {
  return {
    id: item.id,
    name: item.name,
    sheet_path: item.sheetPath,
    sheet_url: signedSheetUrl ?? item.sheetUrl,
    notes: item.notes,
    created_at: item.createdAt,
  }
}

export function isOperatorJobId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Ownership gate for asset:// refs. Every asset must be active, undeleted, on a
// verified and unrevoked identity, and either founder-owned or tied to the
// order behind the job's claim code (by order_id or customer_id). The declared
// role must also match the registered asset_type. Returns an error code or null.
export function identityAssetRefsError(
  input: { refUrls: readonly string[]; refRoles: readonly string[] },
  assets: readonly AiVideoIdentityAssetLink[],
  order: { id: string; customerId?: string | null } | null,
): 'identity_asset_not_active' | 'invalid_operator_ref_role' | null {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]))
  for (let index = 0; index < input.refUrls.length; index += 1) {
    const ref = input.refUrls[index]
    if (!isOperatorAssetRef(ref)) continue
    const asset = byId.get(operatorAssetIdFromRef(ref))
    if (!asset || asset.status !== 'active' || asset.deletedAt) return 'identity_asset_not_active'
    const identity = asset.identity
    if (identity.revokedAt || identity.verificationStatus !== 'verified') return 'identity_asset_not_active'
    if (identity.ownerKind !== 'founder') {
      if (!order) return 'identity_asset_not_active'
      const sameOrder = Boolean(identity.orderId) && identity.orderId === order.id
      const sameCustomer = Boolean(identity.customerId) && Boolean(order.customerId) && identity.customerId === order.customerId
      if (!sameOrder && !sameCustomer) return 'identity_asset_not_active'
    }
    const role = input.refRoles[index] ?? 'reference_image'
    const expected = asset.assetType === 'Video' ? 'video' : asset.assetType === 'Audio' ? 'audio' : 'image'
    if (!isOperatorRefRole(role) || operatorRefKindForRole(role) !== expected) return 'invalid_operator_ref_role'
  }
  return null
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

// Shared by the simple composer and server. No credentials or environment access.
export const SIMPLE_MODEL = 'seedance-2.5'
export const SIMPLE_MODELS = ['seedance-2.5', 'wan3.0'] as const
export const SIMPLE_PROMPT_LIMIT = 6000
const GUIDANCE = '\n\n[Video guidance]\n'

export function simpleModelSettings(model: string) {
  const id = model === 'wan3.0' ? 'wan3.0' : SIMPLE_MODEL
  return {
    id, label: id === 'wan3.0' ? 'Wan 3.0' : 'Seedance 2.5',
    photoLimit: operatorMaxImageRefs(id), audioLimit: operatorMaxAudioRefs(id), videoLimit: operatorMaxVideoRefs(id),
    minClipSeconds: id === 'wan3.0' ? 1 : 2,
    maxClipSeconds: id === 'wan3.0' ? 15 : 30,
  }
}

// `asset: true` marks a verified-identity asset:// ref; its clip length is
// unknown to the UI and already validated by BytePlus, so it skips the checks.
export function simpleReferenceError(model: string, refs: readonly { role: string; seconds?: number; asset?: boolean }[], outputSeconds: number): string {
  const settings = simpleModelSettings(model)
  const photos = refs.filter((ref) => ref.role === 'reference_image' || ref.role === 'first_frame')
  const audio = refs.filter((ref) => ref.role === 'reference_audio')
  const videos = refs.filter((ref) => ref.role === 'reference_video')
  if (photos.length > settings.photoLimit) return 'photo_limit'
  if (audio.length > settings.audioLimit) return 'audio_limit'
  if (videos.length > settings.videoLimit) return 'video_limit'
  for (const ref of [...audio, ...videos]) {
    if (ref.asset === true) continue
    if (typeof ref.seconds !== 'number' || !Number.isFinite(ref.seconds) || ref.seconds < settings.minClipSeconds || ref.seconds > settings.maxClipSeconds) return ref.role === 'reference_audio' ? 'audio_duration' : 'video_duration'
  }
  const audioSeconds = audio.reduce((total, ref) => total + (ref.seconds || 0), 0)
  const videoSeconds = videos.reduce((total, ref) => total + (ref.seconds || 0), 0)
  if (audioSeconds > settings.maxClipSeconds) return 'audio_total'
  if (videoSeconds > settings.maxClipSeconds) return 'video_total'
  if (settings.id === 'wan3.0') {
    if (audioSeconds + videoSeconds > 15) return 'media_total'
    if (videoSeconds + outputSeconds > 30) return 'video_output_total'
  }
  return ''
}

export function referenceTagPrefix(role: string): string {
  return role === 'reference_audio' ? 'Audio' : role === 'reference_video' ? 'Video' : 'Image'
}

export function referenceTagsForRoles(roles: readonly string[]): string[] {
  const counts: Record<string, number> = {}
  return roles.map((role) => {
    const prefix = referenceTagPrefix(role)
    counts[prefix] = (counts[prefix] || 0) + 1
    return '@' + prefix + counts[prefix]
  })
}

export function normalizeReferenceTag(value: string): string {
  const compact = value.replace(/^@\[/, '@').replace(/\]$/, '').replace(/[ \t]/g, '')
  const match = /^@(Image|Audio|Video)([1-9]\d{0,5})$/i.exec(compact)
  return match ? '@' + match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() + match[2] : value
}

export function referenceMentions(prompt: string) {
  const pattern = /@\[(?:Image|Audio|Video)[ \t]*\d+\]|@(?:Image|Audio|Video)[ \t]*\d+\b|@[A-Za-z][A-Za-z0-9_]*/gi
  return Array.from(prompt.matchAll(pattern))
    .filter((match) => !match.index || !/[\w@]/.test(prompt[match.index - 1]))
    .map((match) => ({ tag: normalizeReferenceTag(match[0]), start: match.index!, end: match.index! + match[0].length }))
}

export function missingReferenceTags(prompt: string, tags: readonly string[]): string[] {
  return [...new Set(referenceMentions(simplePromptText(prompt)).map((mention) => mention.tag).filter((tag) => !tags.includes(tag)))]
}

function rewriteReferenceMentions(prompt: string, replacement: (tag: string) => string): string {
  let output = '', cursor = 0
  for (const mention of referenceMentions(prompt)) {
    output += prompt.slice(cursor, mention.start) + replacement(mention.tag)
    cursor = mention.end
  }
  return output + prompt.slice(cursor)
}

// UI handles stay attached to assets. Provider ordinals follow the submitted media order.
export function bindReferenceTags(prompt: string, roles: readonly string[], declaredTags?: unknown) {
  const ordinals = referenceTagsForRoles(roles)
  const tags = declaredTags === undefined ? ordinals : declaredTags
  if (!Array.isArray(tags) || tags.length !== roles.length || new Set(tags).size !== tags.length
    || tags.some((tag, index) => typeof tag !== 'string' || !new RegExp('^@' + referenceTagPrefix(roles[index]) + '[1-9]\\d{0,5}$').test(tag))) {
    throw new Error('invalid_operator_reference_binding')
  }
  const sourcePrompt = rewriteReferenceMentions(simplePromptText(prompt).trim(), normalizeReferenceTag)
  if (missingReferenceTags(sourcePrompt, tags).length) throw new Error('invalid_operator_reference_tag')
  const mapping = new Map(tags.map((tag, index) => [tag, ordinals[index]]))
  return { sourcePrompt, tags: tags as string[], prompt: rewriteReferenceMentions(sourcePrompt, (tag) => mapping.get(tag)!) }
}

export function providerReferencePrompt(prompt: string, model: string): string {
  if (model !== 'wan3.0') return prompt
  return rewriteReferenceMentions(prompt, (tag) => tag.replace(/^@(Image|Video|Audio)(\d+)$/, '$1 $2'))
}

export function simplePromptText(prompt: string): string {
  const split = prompt.lastIndexOf(GUIDANCE)
  return split < 0 ? prompt : prompt.slice(0, split)
}

export function compileSimplePrompt(prompt: string, roles: readonly string[] = []): string {
  const source = simplePromptText(prompt).trim()
  const lines = ['Create a video following the description above. Follow its actions, setting and language.']
  const images = roles.filter((role) => role === 'reference_image').length
  const audio = roles.filter((role) => role === 'reference_audio').length
  const videos = roles.filter((role) => role === 'reference_video').length
  if (images) {
    const names = Array.from({ length: images }, (_, i) => '@Image' + (i + 1)).join(', ')
    lines.push('Use ' + names + ' as visual references, with the specific role assigned to each tag in the prompt. For character identity references, preserve each depicted subject\'s identity, face proportions, hair, skin texture and clothing throughout the video; preserve referenced products\' shape and markings. Photos or character-sheet views of the same subject show one identity, not extra people. Keep distinct characters and their assigned references separate in every shot. Do not merge distinct subjects or beautify faces. Do not show a reference sheet or collage in the video.')
  }
  if (audio) lines.push('Use ' + Array.from({ length: audio }, (_, i) => '@Audio' + (i + 1)).join(', ') + ' as audio references. Keep each voice assigned to the character specified in the prompt; never swap voices. Follow the referenced voice or music as directed by the prompt. For speech, preserve the words and language and synchronize visible speech; do not replace it with unrelated dialogue.')
  if (videos) lines.push('Use the attached reference videos for the subjects and motion requested in the prompt.')
  return source + GUIDANCE + lines.join('\n')
}

export function simpleEstimate(
  duration: number,
  referenceSeconds = 0,
  model: string = SIMPLE_MODEL,
  resolution: AiVideoOperatorResolution = '720p',
  provider: AiVideoOperatorProvider = 'monid',
): number {
  return estimateOperatorCostUsd(duration, resolution, model, referenceSeconds, provider)
}
