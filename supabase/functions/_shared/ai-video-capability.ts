import { constantTimeEqual } from './constant-time-equal.ts'

export const AI_VIDEO_CAPABILITY_SCOPES = [
  'credential:write',
  'order:read',
  'profile:read',
  'profile:write',
] as const

export type AiVideoCapabilityScope = typeof AI_VIDEO_CAPABILITY_SCOPES[number]
export type AiVideoCapabilityClaims = {
  v: 1
  aud: 'ai-video-browser'
  cid: string
  oid: string
  scp: AiVideoCapabilityScope[]
  iat: number
  exp: number
  jti: string
}

export type AiVideoCapabilityVerification =
  | { ok: true; claims: AiVideoCapabilityClaims }
  | { ok: false; error: 'missing' | 'malformed' | 'signature' | 'claims' | 'expired' | 'scope' | 'binding' | 'configuration' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const B64_RE = /^[A-Za-z0-9_-]+$/
const RECOVERY_RE = /^[A-Za-z0-9_-]{43}$/
const SCOPE_SET = new Set<string>(AI_VIDEO_CAPABILITY_SCOPES)
const MAX_TTL = 24 * 60 * 60

export async function issueAiVideoCapability(input: {
  customerId: string
  orderId: string
  scopes: readonly AiVideoCapabilityScope[]
  now?: Date
  ttlSeconds?: number
  jti?: string
}, key: string): Promise<string> {
  assertKey(key)
  if (!UUID_RE.test(input.customerId) || !UUID_RE.test(input.orderId)) {
    throw new Error('invalid_ai_video_capability_binding')
  }
  const scopes = canonicalScopes(input.scopes)
  if (!scopes) throw new Error('invalid_ai_video_capability_scopes')
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  const ttl = input.ttlSeconds ?? 60 * 60
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL) {
    throw new Error('invalid_ai_video_capability_time')
  }
  const jti = input.jti ?? crypto.randomUUID()
  if (!UUID_RE.test(jti)) throw new Error('invalid_ai_video_capability_jti')
  const claims: AiVideoCapabilityClaims = {
    v: 1,
    aud: 'ai-video-browser',
    cid: input.customerId.toLowerCase(),
    oid: input.orderId.toLowerCase(),
    scp: scopes,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    jti: jti.toLowerCase(),
  }
  const payload = encode(new TextEncoder().encode(JSON.stringify(claims)))
  return `${payload}.${await sign(payload, key)}`
}

export async function verifyAiVideoCapability(
  token: string | null | undefined,
  key: string,
  options: {
    now?: Date
    expectedCustomerId?: string
    expectedOrderId?: string
    requiredScopes?: readonly AiVideoCapabilityScope[]
  } = {},
): Promise<AiVideoCapabilityVerification> {
  if (!token) return { ok: false, error: 'missing' }
  try { assertKey(key) } catch { return { ok: false, error: 'configuration' } }
  const parts = token.split('.')
  if (parts.length !== 2 || !B64_RE.test(parts[0] ?? '') || !B64_RE.test(parts[1] ?? '') || parts[1].length !== 43) {
    return { ok: false, error: 'malformed' }
  }
  if (!constantTimeEqual(parts[1], await sign(parts[0], key))) {
    return { ok: false, error: 'signature' }
  }
  let claims: AiVideoCapabilityClaims
  try {
    claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[0])))
  } catch {
    return { ok: false, error: 'malformed' }
  }
  if (!validClaims(claims)) return { ok: false, error: 'claims' }
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000)
  if (claims.iat > nowSeconds + 30 || nowSeconds >= claims.exp || claims.exp - claims.iat > MAX_TTL) {
    return { ok: false, error: 'expired' }
  }
  if (
    (options.expectedCustomerId && claims.cid !== options.expectedCustomerId.toLowerCase()) ||
    (options.expectedOrderId && claims.oid !== options.expectedOrderId.toLowerCase())
  ) return { ok: false, error: 'binding' }
  for (const required of options.requiredScopes ?? []) {
    if (!claims.scp.includes(required)) return { ok: false, error: 'scope' }
  }
  return { ok: true, claims }
}

export function readAiVideoCapability(req: Request): string | null {
  const value = req.headers.get('x-ai-video-capability')?.trim() ?? ''
  return value || null
}

export function generateAiVideoRecoveryToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return encode(bytes)
}

export async function hashAiVideoRecoveryToken(raw: string): Promise<string> {
  if (!RECOVERY_RE.test(raw)) throw new Error('invalid_ai_video_recovery_token')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', decode(raw)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validClaims(value: unknown): value is AiVideoCapabilityClaims {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const c = value as Record<string, unknown>
  if (Object.keys(c).sort().join(',') !== 'aud,cid,exp,iat,jti,oid,scp,v') return false
  const scopes = canonicalScopes(c.scp as readonly AiVideoCapabilityScope[])
  return c.v === 1 && c.aud === 'ai-video-browser' &&
    typeof c.cid === 'string' && UUID_RE.test(c.cid) && c.cid === c.cid.toLowerCase() &&
    typeof c.oid === 'string' && UUID_RE.test(c.oid) && c.oid === c.oid.toLowerCase() &&
    typeof c.jti === 'string' && UUID_RE.test(c.jti) && c.jti === c.jti.toLowerCase() &&
    Number.isSafeInteger(c.iat) && Number.isSafeInteger(c.exp) &&
    scopes !== null && JSON.stringify(scopes) === JSON.stringify(c.scp)
}

function canonicalScopes(scopes: readonly AiVideoCapabilityScope[]): AiVideoCapabilityScope[] | null {
  if (!Array.isArray(scopes) || scopes.length === 0) return null
  const normalized = [...scopes].sort()
  if (new Set(normalized).size !== normalized.length || normalized.some((scope) => !SCOPE_SET.has(scope))) return null
  return normalized
}

function assertKey(key: string): void {
  if (new TextEncoder().encode(key).length < 32) throw new Error('AI_VIDEO_CAPABILITY_HMAC_KEY is invalid')
}

async function sign(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload))))
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decode(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
