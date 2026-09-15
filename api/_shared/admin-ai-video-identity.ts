// Thin admin proxy for the ai-video-identity Edge Function (founder Karakter
// panel). Builds the same URL + service-role auth kickWorker() uses in
// admin-ai-video-generate.ts, forwards `{ action, owner_kind: 'founder',
// ...whitelisted fields }`, and hands the function's JSON back to the admin
// page. No identity logic lives here.

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL ?? ''
const REQUEST_TIMEOUT_MS = 25_000

export const AI_VIDEO_IDENTITY_ADMIN_ACTIONS = [
  'ai_video_identity_list',
  'ai_video_identity_start',
  'ai_video_identity_restart',
  'ai_video_identity_upload_sign',
  'ai_video_identity_register',
  'ai_video_identity_status',
  'ai_video_identity_revoke',
  'ai_video_identity_quota',
] as const
export type AiVideoIdentityAdminAction = (typeof AI_VIDEO_IDENTITY_ADMIN_ACTIONS)[number]

// Only these body fields ever reach the function. Anything else (cookies,
// stray form state, a forged owner_kind) is dropped here.
const FORWARDED_FIELDS = [
  'identity_id',
  'display_name',
  'consent_version',
  'slot',
  'content_type',
  'bytes',
  'path',
  'asset_type',
  'customer_id',
  'order_id',
] as const

export type AiVideoIdentityProxyEnv = { functionsUrl: string; serviceKey: string }

export function isAiVideoIdentityAdminAction(value: unknown): value is AiVideoIdentityAdminAction {
  return typeof value === 'string' && (AI_VIDEO_IDENTITY_ADMIN_ACTIONS as readonly string[]).includes(value)
}

export const aiVideoIdentityConfigured = (): boolean => Boolean(SUPABASE_FUNCTIONS_URL && SUPABASE_SERVICE_KEY)

export function functionActionFor(action: AiVideoIdentityAdminAction): string {
  const bare = action.replace(/^ai_video_identity_/, '')
  // The function has no quota action; `list` already carries the quota view.
  return bare === 'quota' ? 'list' : bare
}

export function buildAiVideoIdentityProxyRequest(
  action: AiVideoIdentityAdminAction,
  body: Record<string, unknown>,
  env: AiVideoIdentityProxyEnv,
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  if (!env.functionsUrl || !env.serviceKey) throw new Error('identity_proxy_unconfigured')
  const payload: Record<string, unknown> = { action: functionActionFor(action), owner_kind: 'founder' }
  for (const field of FORWARDED_FIELDS) {
    const value = body[field]
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string' && typeof value !== 'number') continue
    payload[field] = value
  }
  // Admin may manage a customer's identity when it names the customer.
  if (body.owner_kind === 'customer' && typeof payload.customer_id === 'string') payload.owner_kind = 'customer'
  return {
    url: `${env.functionsUrl.replace(/\/+$/, '')}/ai-video-identity`,
    init: {
      method: 'POST',
      headers: {
        apikey: env.serviceKey,
        authorization: `Bearer ${env.serviceKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  }
}

export type AiVideoIdentityProxyResult = { status: number; body: Record<string, unknown> }

export async function proxyAiVideoIdentityAction(
  action: AiVideoIdentityAdminAction,
  body: Record<string, unknown>,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  env: AiVideoIdentityProxyEnv = { functionsUrl: SUPABASE_FUNCTIONS_URL, serviceKey: SUPABASE_SERVICE_KEY },
): Promise<AiVideoIdentityProxyResult> {
  const request = buildAiVideoIdentityProxyRequest(action, body, env)
  let response: Response
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    return { status: 502, body: { ok: false, error: 'identity_unavailable' } }
  }
  const parsed = await response.json().catch(() => null) as unknown
  const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
  if (!response.ok) {
    const error = typeof payload.error === 'string' && payload.error ? payload.error : `identity_http_${response.status}`
    return { status: response.status >= 400 && response.status <= 599 ? response.status : 502, body: { ok: false, error } }
  }
  if (action === 'ai_video_identity_quota') {
    return { status: 200, body: { ok: true, quota: payload.quota ?? null } }
  }
  return { status: 200, body: { ok: true, ...payload } }
}
