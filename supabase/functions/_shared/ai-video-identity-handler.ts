// Verified identity lane — one handler for the customer page, the founder
// Karakter panel (through the Vercel admin proxy) and the nightly gc cron.
//
// Actions: list, start, restart, confirm, upload_sign, register, status,
// revoke, gc. POST JSON `{ action, ...fields }`; errors are non-2xx with
// `{ error: '<code>' }`.
//
// Auth modes, resolved in this order:
//   internal — Bearer service_role JWT (isServiceRoleCaller), the same gate the
//              render worker uses for pg_cron / kick calls. Used by the Vercel
//              admin proxy (founder identities) and by cron `gc`.
//   customer — `x-ai-video-capability` exactly like ai-video-session; the bound
//              ai_video_orders row must be `paid`, else 402 not_paid.
//   confirm  — no auth beyond the single-use nonce in the CallbackURL.
//
// A verified face is biometric data (UU PDP sensitive personal data).
// BytePlus (ByteDance) is the verifier and processor. This file never logs or
// returns the BytedToken, the nonce, or the group id; customers never see a
// raw FailedReason either (they get a reason_code).

import {
  readAiVideoCapability,
  verifyAiVideoCapability,
  type AiVideoCapabilityScope,
} from './ai-video-capability.ts'
import {
  decryptCredential,
  encryptCredential,
  type CredentialCipher,
} from './integration-credential-crypto.ts'
import {
  createAsset as arkCreateAsset,
  createVisualValidateSession as arkCreateVisualValidateSession,
  deleteAsset as arkDeleteAsset,
  deleteAssetGroup as arkDeleteAssetGroup,
  getAsset as arkGetAsset,
  getVisualValidateResult as arkGetVisualValidateResult,
  resolveArkAssetConfig,
  type ArkAsset,
  type ArkAssetType,
  type ArkEnv,
} from './ark-asset-client.ts'

export const AI_VIDEO_IDENTITY_ACTIONS = [
  'list', 'start', 'restart', 'confirm', 'upload_sign', 'register', 'status', 'revoke', 'gc',
] as const
export type AiVideoIdentityAction = (typeof AI_VIDEO_IDENTITY_ACTIONS)[number]

export const AI_VIDEO_IDENTITY_SLOTS = ['full_body', 'close_up', 'voice'] as const
export type AiVideoIdentitySlot = (typeof AI_VIDEO_IDENTITY_SLOTS)[number]

export const AI_VIDEO_IDENTITY_BUCKET = 'ai-video-inputs'
export const AI_VIDEO_IDENTITY_SESSION_TTL_MS = 30 * 60 * 1000
export const AI_VIDEO_IDENTITY_DOWNLOAD_TTL_SECONDS = 2 * 60 * 60
export const AI_VIDEO_IDENTITY_IMAGE_MAX_BYTES = 30 * 1024 * 1024
export const AI_VIDEO_IDENTITY_AUDIO_MAX_BYTES = 15 * 1024 * 1024
// BytePlus Entry tier: CreateAsset 3 QPM, account-wide.
export const AI_VIDEO_IDENTITY_CREATE_BUDGET = 3
export const AI_VIDEO_IDENTITY_CREATE_WINDOW_MS = 60_000
export const AI_VIDEO_IDENTITY_POLL_INTERVAL_MS = 10_000
export const AI_VIDEO_IDENTITY_GC_BATCH = 20
// Mirrors the cap trigger in 20260914010000_ai_video_identities.sql.
export const AI_VIDEO_IDENTITY_ASSET_CAP: Record<'founder' | 'customer', number> = { founder: 6, customer: 2 }
// Kill switch if BytePlus starts charging liveness (`reqMeasureInfoValue`).
// Unset / anything other than true|1|on|yes = off. Not a paid product.
export const AI_VIDEO_IDENTITY_LIVENESS_BILLING_ENV = 'AI_VIDEO_IDENTITY_LIVENESS_BILLING'

export function isAiVideoIdentityLivenessBillingBlocked(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes'
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/
const CONSENT_VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/
const RESULT_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/
const DISPLAY_NAME_MAX = 80

export type AiVideoIdentityOwnerKind = 'founder' | 'customer'
export type AiVideoIdentityVerificationStatus = 'pending' | 'verified' | 'failed' | 'expired'
export type AiVideoIdentityAssetStatus = 'processing' | 'active' | 'failed'
export type AiVideoIdentityReasonCode = 'face_mismatch' | 'multiple_faces' | 'asset_failed'

export type AiVideoIdentityRow = {
  id: string
  owner_kind: AiVideoIdentityOwnerKind
  customer_id: string | null
  order_id: string | null
  display_name: string
  group_id: string | null
  verification_status: AiVideoIdentityVerificationStatus
  byted_token_enc: string | null
  session_expires_at: string | null
  callback_nonce_hash: string | null
  callback_result_code: string | null
  consent_at: string | null
  consent_text_version: string | null
  verification_billed: boolean | null
  created_at: string
  revoked_at: string | null
}

export type AiVideoIdentityAssetRow = {
  id: string
  identity_id: string
  asset_id: string
  asset_type: ArkAssetType
  status: AiVideoIdentityAssetStatus
  failed_reason: string | null
  source_path: string | null
  name: string | null
  last_checked_at: string | null
  last_inference_at: string | null
  created_at: string
  deleted_at: string | null
}

export type AiVideoIdentityQuotaRow = {
  active_assets: number
  groups: number
  asset_limit: number
  group_limit: number
  alert: boolean
}

export type AiVideoIdentityInsert = {
  owner_kind: AiVideoIdentityOwnerKind
  customer_id: string | null
  order_id: string | null
  display_name: string
  verification_status: 'pending'
  consent_at: string
  consent_text_version: string
}

export type AiVideoIdentityAssetInsert = {
  identity_id: string
  asset_id: string
  asset_type: ArkAssetType
  status: 'processing'
  source_path: string
  name: string
}

export type AiVideoIdentityConsentInsert = {
  customer_id: string
  consent_type: 'ai_video_identity_face'
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
  version: string
}

export type AiVideoIdentityStore = {
  findOrder(orderId: string, customerId: string): Promise<{ id: string; customer_id: string; status: string } | null>
  /** Non-revoked identities, newest first. */
  listIdentities(filter: { ownerKind?: AiVideoIdentityOwnerKind; customerId?: string; orderId?: string }): Promise<AiVideoIdentityRow[]>
  getIdentity(id: string): Promise<AiVideoIdentityRow | null>
  findIdentityByNonceHash(hash: string): Promise<AiVideoIdentityRow | null>
  insertIdentity(input: AiVideoIdentityInsert): Promise<AiVideoIdentityRow>
  /** Rejects with Error('duplicate') on a unique violation (group_id / nonce). */
  updateIdentity(id: string, patch: Partial<AiVideoIdentityRow>): Promise<AiVideoIdentityRow>
  insertConsent(input: AiVideoIdentityConsentInsert): Promise<void>
  /** Non-deleted assets for the given identities, oldest first. */
  listAssets(identityIds: readonly string[]): Promise<AiVideoIdentityAssetRow[]>
  /** Rejects with Error('identity_asset_cap') when the cap trigger fires. */
  insertAsset(input: AiVideoIdentityAssetInsert): Promise<AiVideoIdentityAssetRow>
  updateAsset(id: string, patch: Partial<AiVideoIdentityAssetRow>): Promise<AiVideoIdentityAssetRow>
  /** Account-wide count of ai_video_identity_assets rows created at/after sinceIso (deleted included). */
  countAssetsCreatedSince(sinceIso: string): Promise<number>
  quota(): Promise<AiVideoIdentityQuotaRow>
  gcCandidates(limit: number): Promise<AiVideoIdentityAssetRow[]>
  createSignedUploadUrl(path: string): Promise<{ url: string; token: string | null }>
  statObject(path: string): Promise<{ size: number | null; contentType: string | null } | null>
  createSignedDownloadUrl(path: string, ttlSeconds: number): Promise<string>
}

export type AiVideoIdentityArk = {
  createVisualValidateSession(input: { callbackUrl: string }): Promise<{ bytedToken: string; h5Link: string }>
  getVisualValidateResult(input: { bytedToken: string }): Promise<{ groupId: string | null }>
  createAsset(input: { groupId: string; url: string; assetType: ArkAssetType; name?: string }): Promise<{ id: string }>
  getAsset(input: { id: string }): Promise<ArkAsset>
  deleteAsset(input: { id: string }): Promise<void>
  deleteAssetGroup(input: { id: string }): Promise<void>
}

export type AiVideoIdentityDeps = {
  capabilityKey: string
  encryptionKey: string
  /** Absolute https origin of the customer site; the CallbackURL is built on it. */
  siteOrigin: string
  store: AiVideoIdentityStore
  ark: AiVideoIdentityArk
  isInternalCaller(req: Request): boolean
  now?: () => Date
  log?: (event: Record<string, unknown>) => void
  /** When true, start/restart return liveness_billing_blocked. Default off. */
  livenessBillingBlocked?: boolean
}

export type AiVideoIdentityAssetView = {
  id: string
  asset_id: string
  asset_type: ArkAssetType
  slot: string | null
  status: AiVideoIdentityAssetStatus
  reason_code?: AiVideoIdentityReasonCode
  failed_reason?: string | null
  created_at: string
}

export type AiVideoIdentityView = {
  id: string
  display_name: string
  owner_kind: AiVideoIdentityOwnerKind
  verification_status: AiVideoIdentityVerificationStatus
  session_expires_at: string | null
  group_ready: boolean
  assets: AiVideoIdentityAssetView[]
  created_at: string
  revoked_at: string | null
}

type Scope =
  | { kind: 'internal' }
  | { kind: 'customer'; customerId: string; orderId: string }

type Ctx = {
  deps: AiVideoIdentityDeps
  req: Request
  now: Date
  log: (event: Record<string, unknown>) => void
}

const REQUIRED_SCOPES: Record<Exclude<AiVideoIdentityAction, 'confirm' | 'gc'>, AiVideoCapabilityScope[]> = {
  list: ['profile:read'],
  status: ['profile:read'],
  start: ['profile:write'],
  restart: ['profile:write'],
  upload_sign: ['profile:write'],
  register: ['profile:write'],
  revoke: ['profile:write'],
}

export async function handleAiVideoIdentity(req: Request, deps: AiVideoIdentityDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown>
  try {
    const parsed = await req.json() as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_json' }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const action = body.action
  if (!isAction(action)) return json({ error: 'invalid_action' }, 400)
  const ctx: Ctx = {
    deps,
    req,
    now: deps.now?.() ?? new Date(),
    log: deps.log ?? ((event) => console.log(JSON.stringify(event))),
  }

  try {
    if (action === 'confirm') return await confirm(body, ctx)
    const internal = deps.isInternalCaller(req)
    if (action === 'gc') {
      if (!internal) return json({ error: 'unauthorized' }, 401)
      return await gc(ctx)
    }
    let scope: Scope
    if (internal) {
      scope = { kind: 'internal' }
    } else {
      const verification = await verifyAiVideoCapability(
        readAiVideoCapability(req),
        deps.capabilityKey,
        { requiredScopes: REQUIRED_SCOPES[action], now: ctx.now },
      )
      if (!verification.ok) return json({ error: 'unauthorized' }, 401)
      const order = await deps.store.findOrder(verification.claims.oid, verification.claims.cid)
      if (!order || order.customer_id !== verification.claims.cid) return json({ error: 'not_found' }, 404)
      if (order.status !== 'paid') return json({ error: 'not_paid' }, 402)
      scope = { kind: 'customer', customerId: verification.claims.cid, orderId: verification.claims.oid }
    }
    switch (action) {
      case 'list': return await list(body, scope, ctx)
      case 'start': return await start(body, scope, ctx)
      case 'restart': return await restart(body, scope, ctx)
      case 'upload_sign': return await uploadSign(body, scope, ctx)
      case 'register': return await register(body, scope, ctx)
      case 'status': return await status(body, scope, ctx)
      case 'revoke': return await revoke(body, scope, ctx)
    }
  } catch (error) {
    return failure(error, ctx)
  }
}

// ─── list ────────────────────────────────────────────────────────────────

async function list(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  let filter: { ownerKind?: AiVideoIdentityOwnerKind; customerId?: string; orderId?: string }
  if (scope.kind === 'customer') {
    filter = { customerId: scope.customerId }
  } else {
    const customerId = optionalUuid(body.customer_id)
    const orderId = optionalUuid(body.order_id)
    if (customerId === undefined) return json({ error: 'invalid_customer_id' }, 400)
    if (orderId === undefined) return json({ error: 'invalid_order_id' }, 400)
    if (customerId || orderId) {
      filter = { ...(customerId ? { customerId } : {}), ...(orderId ? { orderId } : {}) }
    } else {
      const ownerKind = body.owner_kind ?? 'founder'
      if (ownerKind !== 'founder' && ownerKind !== 'customer') return json({ error: 'invalid_owner_kind' }, 400)
      filter = { ownerKind }
    }
  }
  const [identities, quota] = await Promise.all([
    ctx.deps.store.listIdentities(filter),
    ctx.deps.store.quota(),
  ])
  const assets = await ctx.deps.store.listAssets(identities.map((row) => row.id))
  const remaining = Math.max(0, Number(quota.asset_limit) - Number(quota.active_assets))
  return json({
    identities: identities.map((row) => present(row, assets, scope)),
    quota: scope.kind === 'internal'
      ? {
          remaining_assets: remaining,
          active_assets: Number(quota.active_assets),
          asset_limit: Number(quota.asset_limit),
          groups: Number(quota.groups),
          group_limit: Number(quota.group_limit),
          alert: quota.alert === true,
        }
      : { remaining_assets: remaining },
  })
}

// ─── start / restart ─────────────────────────────────────────────────────

async function start(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  const blocked = livenessBillingBlockedResponse(ctx)
  if (blocked) return blocked
  const displayName = parseDisplayName(body.display_name)
  if (!displayName) return json({ error: 'invalid_display_name' }, 400)
  const consentVersion = typeof body.consent_version === 'string' && CONSENT_VERSION_RE.test(body.consent_version)
    ? body.consent_version
    : null
  if (!consentVersion) return json({ error: 'invalid_consent_version' }, 400)

  let owner: { ownerKind: AiVideoIdentityOwnerKind; customerId: string | null; orderId: string | null }
  if (scope.kind === 'customer') {
    owner = { ownerKind: 'customer', customerId: scope.customerId, orderId: scope.orderId }
  } else {
    const ownerKind = body.owner_kind
    if (ownerKind !== 'founder' && ownerKind !== 'customer') return json({ error: 'invalid_owner_kind' }, 400)
    const customerId = optionalUuid(body.customer_id)
    const orderId = optionalUuid(body.order_id)
    if (customerId === undefined) return json({ error: 'invalid_customer_id' }, 400)
    if (orderId === undefined) return json({ error: 'invalid_order_id' }, 400)
    if (ownerKind === 'customer' && !customerId) return json({ error: 'customer_id_required' }, 400)
    owner = { ownerKind, customerId: customerId ?? null, orderId: orderId ?? null }
  }

  const nowIso = ctx.now.toISOString()
  const identity = await ctx.deps.store.insertIdentity({
    owner_kind: owner.ownerKind,
    customer_id: owner.customerId,
    order_id: owner.orderId,
    display_name: displayName,
    verification_status: 'pending',
    consent_at: nowIso,
    consent_text_version: consentVersion,
  })
  if (owner.customerId) {
    await ctx.deps.store.insertConsent({
      customer_id: owner.customerId,
      consent_type: 'ai_video_identity_face',
      accepted_at: nowIso,
      ip_address: extractClientIp(ctx.req),
      user_agent: ctx.req.headers.get('user-agent')?.slice(0, 500) ?? null,
      version: consentVersion,
    })
  }
  return openSession(identity, ctx)
}

async function restart(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  const blocked = livenessBillingBlockedResponse(ctx)
  if (blocked) return blocked
  const loaded = await loadOwned(body.identity_id, scope, ctx)
  if (loaded instanceof Response) return loaded
  if (loaded.revoked_at) return json({ error: 'identity_revoked' }, 409)
  const sessionOpen = loaded.session_expires_at !== null && Date.parse(loaded.session_expires_at) > ctx.now.getTime()
  const restartable = loaded.verification_status === 'failed'
    || loaded.verification_status === 'expired'
    || (loaded.verification_status === 'pending' && !sessionOpen)
  if (!restartable) return json({ error: 'identity_not_restartable' }, 409)
  return openSession(loaded, ctx)
}

// Fresh nonce + fresh BytedToken. The nonce only ever travels inside the
// CallbackURL and comes back through `confirm`; we store its sha256.
async function openSession(identity: AiVideoIdentityRow, ctx: Ctx): Promise<Response> {
  const nonce = generateNonce()
  const nonceHash = await hashAiVideoIdentityNonce(nonce)
  const callbackUrl = buildAiVideoIdentityCallbackUrl(ctx.deps.siteOrigin, nonce)
  let session: { bytedToken: string; h5Link: string }
  try {
    session = await ctx.deps.ark.createVisualValidateSession({ callbackUrl })
  } catch (error) {
    await ctx.deps.store.updateIdentity(identity.id, {
      verification_status: 'failed',
      byted_token_enc: null,
      callback_nonce_hash: null,
      session_expires_at: null,
    })
    throw error
  }
  const cipher = await encryptCredential(session.bytedToken, ctx.deps.encryptionKey)
  const expiresAt = new Date(ctx.now.getTime() + AI_VIDEO_IDENTITY_SESSION_TTL_MS).toISOString()
  await ctx.deps.store.updateIdentity(identity.id, {
    verification_status: 'pending',
    byted_token_enc: JSON.stringify(cipher),
    callback_nonce_hash: nonceHash,
    session_expires_at: expiresAt,
    callback_result_code: null,
  })
  ctx.log({ event: 'ai_video_identity_session_started', identity_id: identity.id, owner_kind: identity.owner_kind })
  return json({ identity_id: identity.id, h5_link: withEnglishUi(session.h5Link), expires_at: expiresAt })
}

// ─── confirm ─────────────────────────────────────────────────────────────

async function confirm(body: Record<string, unknown>, ctx: Ctx): Promise<Response> {
  const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : ''
  if (!NONCE_RE.test(nonce)) return json({ error: 'invalid_nonce' }, 404)
  const identity = await ctx.deps.store.findIdentityByNonceHash(await hashAiVideoIdentityNonce(nonce))
  if (!identity || identity.revoked_at) return json({ error: 'invalid_nonce' }, 404)

  // Informational only: the page forwards what the redirect carried.
  const patch: Partial<AiVideoIdentityRow> = {}
  const resultCode = typeof body.result_code === 'string' && RESULT_CODE_RE.test(body.result_code.trim())
    ? body.result_code.trim()
    : typeof body.result_code === 'number' && Number.isSafeInteger(body.result_code)
      ? String(body.result_code)
      : null
  if (resultCode) patch.callback_result_code = resultCode
  const billed = parseBilled(body.billed)
  if (billed !== null) {
    patch.verification_billed = billed
    ctx.log({
      event: 'ai_video_identity_verification_billed',
      identity_id: identity.id,
      owner_kind: identity.owner_kind,
      billed,
      result_code: resultCode,
    })
  }

  const closeSession = { byted_token_enc: null, callback_nonce_hash: null } as const
  if (!identity.session_expires_at || Date.parse(identity.session_expires_at) < ctx.now.getTime()) {
    await ctx.deps.store.updateIdentity(identity.id, { ...patch, ...closeSession, verification_status: 'expired' })
    return json({ error: 'verification_expired' }, 410)
  }

  let bytedToken: string
  try {
    const cipher = JSON.parse(identity.byted_token_enc ?? '') as CredentialCipher
    bytedToken = await decryptCredential(cipher, ctx.deps.encryptionKey)
  } catch (error) {
    if (isEncryptionConfigError(error)) throw error
    await ctx.deps.store.updateIdentity(identity.id, { ...patch, ...closeSession, verification_status: 'failed' })
    ctx.log({ event: 'ai_video_identity_verification_failed', identity_id: identity.id, code: 'token_unreadable' })
    return json({ identity_id: identity.id, verification_status: 'failed', reason_code: 'verification_failed' })
  }

  let result: { groupId: string | null }
  try {
    result = await ctx.deps.ark.getVisualValidateResult({ bytedToken })
  } catch (error) {
    const code = messageOf(error)
    if (code === 'ark_unavailable' || code === 'ark_rate_limited') {
      // Transient upstream trouble must not burn a liveness check the person
      // just passed; the page can retry while the session is still open.
      if (Object.keys(patch).length) await ctx.deps.store.updateIdentity(identity.id, patch)
      return json({ error: code }, code === 'ark_rate_limited' ? 429 : 503)
    }
    await ctx.deps.store.updateIdentity(identity.id, { ...patch, ...closeSession, verification_status: 'failed' })
    ctx.log({ event: 'ai_video_identity_verification_failed', identity_id: identity.id, code })
    return json({ identity_id: identity.id, verification_status: 'failed', reason_code: 'verification_failed' })
  }

  if (!result.groupId) {
    if (Object.keys(patch).length) await ctx.deps.store.updateIdentity(identity.id, patch)
    return json({ identity_id: identity.id, verification_status: 'pending' })
  }
  try {
    await ctx.deps.store.updateIdentity(identity.id, {
      ...patch,
      ...closeSession,
      group_id: result.groupId,
      verification_status: 'verified',
    })
  } catch (error) {
    if (messageOf(error) === 'duplicate') return json({ error: 'identity_group_conflict' }, 409)
    throw error
  }
  ctx.log({ event: 'ai_video_identity_verified', identity_id: identity.id, owner_kind: identity.owner_kind })
  return json({ identity_id: identity.id, verification_status: 'verified' })
}

// ─── upload_sign / register ──────────────────────────────────────────────

async function uploadSign(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  const loaded = await loadOwned(body.identity_id, scope, ctx)
  if (loaded instanceof Response) return loaded
  if (!groupReady(loaded)) return json({ error: 'identity_not_verified' }, 409)
  const slot = parseSlot(body.slot)
  if (!slot) return json({ error: 'invalid_slot' }, 400)
  const contentType = typeof body.content_type === 'string' ? body.content_type.trim().toLowerCase() : ''
  const ext = extensionFor(slot, contentType)
  if (!ext) return json({ error: 'invalid_content_type' }, 400)
  const bytes = body.bytes
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return json({ error: 'invalid_bytes' }, 400)
  if (bytes > maxBytesFor(slot)) return json({ error: 'file_too_large' }, 413)

  const path = `identity/${loaded.id}/${slot}-${crypto.randomUUID()}.${ext}`
  const signed = await ctx.deps.store.createSignedUploadUrl(path)
  return json({
    upload_url: signed.url,
    path,
    bucket: AI_VIDEO_IDENTITY_BUCKET,
    headers: {
      'content-type': contentType,
      'x-upsert': 'false',
      ...(signed.token ? { authorization: `Bearer ${signed.token}` } : {}),
    },
  })
}

async function register(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  const loaded = await loadOwned(body.identity_id, scope, ctx)
  if (loaded instanceof Response) return loaded
  if (!groupReady(loaded) || !loaded.group_id) return json({ error: 'identity_not_verified' }, 409)
  const slot = parseSlot(body.slot)
  if (!slot) return json({ error: 'invalid_slot' }, 400)
  const assetType = body.asset_type
  if (assetType !== 'Image' && assetType !== 'Video' && assetType !== 'Audio') return json({ error: 'invalid_asset_type' }, 400)
  if (assetType !== expectedAssetType(slot)) return json({ error: 'invalid_asset_type' }, 400)
  const path = typeof body.path === 'string' ? body.path.trim() : ''
  if (!isIdentityUploadPath(path, loaded.id, slot)) return json({ error: 'invalid_path' }, 400)

  const object = await ctx.deps.store.statObject(path)
  if (!object) return json({ error: 'upload_not_found' }, 404)
  if (typeof object.size === 'number' && object.size > maxBytesFor(slot)) return json({ error: 'file_too_large' }, 413)

  const existing = await ctx.deps.store.listAssets([loaded.id])
  const sameSlot = existing.filter((asset) => asset.name === slot)
  if (sameSlot.some((asset) => asset.status !== 'failed')) return json({ error: 'slot_occupied' }, 409)
  // A failed asset still occupies BytePlus quota and our cap. Free the slot
  // before the retry; DeleteAsset is best-effort, the soft-delete is not.
  for (const failed of sameSlot) {
    try {
      await ctx.deps.ark.deleteAsset({ id: failed.asset_id })
    } catch (error) {
      ctx.log({ event: 'ai_video_identity_asset_delete_failed', asset_id: failed.asset_id, code: messageOf(error) })
    }
    await ctx.deps.store.updateAsset(failed.id, { deleted_at: ctx.now.toISOString() })
  }
  const live = existing.length - sameSlot.length
  if (live >= AI_VIDEO_IDENTITY_ASSET_CAP[loaded.owner_kind]) return json({ error: 'identity_asset_cap' }, 409)

  const since = new Date(ctx.now.getTime() - AI_VIDEO_IDENTITY_CREATE_WINDOW_MS).toISOString()
  if (await ctx.deps.store.countAssetsCreatedSince(since) >= AI_VIDEO_IDENTITY_CREATE_BUDGET) {
    return json({ error: 'ark_rate_limited' }, 429)
  }

  const url = await ctx.deps.store.createSignedDownloadUrl(path, AI_VIDEO_IDENTITY_DOWNLOAD_TTL_SECONDS)
  const created = await ctx.deps.ark.createAsset({ groupId: loaded.group_id, url, assetType, name: slot })
  let row: AiVideoIdentityAssetRow
  try {
    row = await ctx.deps.store.insertAsset({
      identity_id: loaded.id,
      asset_id: created.id,
      asset_type: assetType,
      status: 'processing',
      source_path: path,
      name: slot,
    })
  } catch (error) {
    // The trigger won the race: do not leave an orphan in the BytePlus group.
    try { await ctx.deps.ark.deleteAsset({ id: created.id }) } catch { /* best-effort */ }
    throw error
  }
  ctx.log({ event: 'ai_video_identity_asset_registered', identity_id: loaded.id, asset_id: created.id, slot, asset_type: assetType })
  return json({ asset: presentAsset(row, scope) })
}

// ─── status ──────────────────────────────────────────────────────────────

async function status(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  let loaded = await loadOwned(body.identity_id, scope, ctx)
  if (loaded instanceof Response) return loaded
  if (
    loaded.verification_status === 'pending'
    && !loaded.revoked_at
    && loaded.session_expires_at !== null
    && Date.parse(loaded.session_expires_at) < ctx.now.getTime()
  ) {
    loaded = await ctx.deps.store.updateIdentity(loaded.id, {
      verification_status: 'expired',
      byted_token_enc: null,
      callback_nonce_hash: null,
    })
  }
  const assets = await ctx.deps.store.listAssets([loaded.id])
  const nowIso = ctx.now.toISOString()
  const refreshed: AiVideoIdentityAssetRow[] = []
  for (const asset of assets) {
    const stale = asset.last_checked_at === null
      || Date.parse(asset.last_checked_at) <= ctx.now.getTime() - AI_VIDEO_IDENTITY_POLL_INTERVAL_MS
    if (asset.status !== 'processing' || !stale) {
      refreshed.push(asset)
      continue
    }
    try {
      const remote = await ctx.deps.ark.getAsset({ id: asset.asset_id })
      refreshed.push(await ctx.deps.store.updateAsset(asset.id, {
        status: remote.status,
        failed_reason: remote.status === 'failed' ? (remote.failedReason ?? 'unknown').slice(0, 400) : null,
        last_checked_at: nowIso,
        last_inference_at: remote.lastInferenceTime ?? asset.last_inference_at,
      }))
      if (remote.status !== 'processing') {
        ctx.log({ event: 'ai_video_identity_asset_resolved', identity_id: loaded.id, asset_id: asset.asset_id, status: remote.status })
      }
    } catch (error) {
      // Keep it processing; only remember that we looked so we do not hammer Ark.
      ctx.log({ event: 'ai_video_identity_asset_poll_failed', asset_id: asset.asset_id, code: messageOf(error) })
      refreshed.push(await ctx.deps.store.updateAsset(asset.id, { last_checked_at: nowIso }))
    }
  }
  return json({ identity: present(loaded, refreshed, scope) })
}

// ─── revoke ──────────────────────────────────────────────────────────────

async function revoke(body: Record<string, unknown>, scope: Scope, ctx: Ctx): Promise<Response> {
  const loaded = await loadOwned(body.identity_id, scope, ctx)
  if (loaded instanceof Response) return loaded
  if (loaded.revoked_at) return json({ ok: true })
  const assets = await ctx.deps.store.listAssets([loaded.id])
  const failures: string[] = []
  for (const asset of assets) {
    try {
      await ctx.deps.ark.deleteAsset({ id: asset.asset_id })
    } catch (error) {
      failures.push(asset.asset_id)
      ctx.log({ event: 'ai_video_identity_asset_delete_failed', asset_id: asset.asset_id, code: messageOf(error) })
    }
  }
  if (loaded.group_id) {
    try {
      await ctx.deps.ark.deleteAssetGroup({ id: loaded.group_id })
    } catch (error) {
      failures.push('group')
      ctx.log({ event: 'ai_video_identity_group_delete_failed', identity_id: loaded.id, code: messageOf(error) })
    }
  }
  const nowIso = ctx.now.toISOString()
  await ctx.deps.store.updateIdentity(loaded.id, {
    revoked_at: nowIso,
    byted_token_enc: null,
    callback_nonce_hash: null,
  })
  for (const asset of assets) await ctx.deps.store.updateAsset(asset.id, { deleted_at: nowIso })
  ctx.log({ event: 'ai_video_identity_revoked', identity_id: loaded.id, owner_kind: loaded.owner_kind, ark_failures: failures.length })
  return json({ ok: true })
}

// ─── gc (internal) ───────────────────────────────────────────────────────

async function gc(ctx: Ctx): Promise<Response> {
  const candidates = await ctx.deps.store.gcCandidates(AI_VIDEO_IDENTITY_GC_BATCH)
  let deleted = 0
  for (const asset of candidates.slice(0, AI_VIDEO_IDENTITY_GC_BATCH)) {
    try {
      await ctx.deps.ark.deleteAsset({ id: asset.asset_id })
    } catch (error) {
      ctx.log({ event: 'ai_video_identity_gc_delete_failed', asset_id: asset.asset_id, code: messageOf(error) })
      continue
    }
    await ctx.deps.store.updateAsset(asset.id, { deleted_at: ctx.now.toISOString() })
    deleted++
  }
  ctx.log({ event: 'ai_video_identity_gc', candidates: candidates.length, deleted })
  return json({ deleted })
}

// ─── shared helpers ──────────────────────────────────────────────────────

async function loadOwned(rawId: unknown, scope: Scope, ctx: Ctx): Promise<AiVideoIdentityRow | Response> {
  const id = typeof rawId === 'string' && UUID_RE.test(rawId.trim()) ? rawId.trim().toLowerCase() : null
  if (!id) return json({ error: 'invalid_identity_id' }, 400)
  const identity = await ctx.deps.store.getIdentity(id)
  // Same answer for "missing" and "someone else's": never confirm existence.
  if (!identity || !owns(identity, scope)) return json({ error: 'not_found' }, 404)
  return identity
}

function owns(identity: AiVideoIdentityRow, scope: Scope): boolean {
  if (scope.kind === 'internal') return true
  return identity.owner_kind === 'customer'
    && identity.customer_id !== null
    && identity.customer_id.toLowerCase() === scope.customerId.toLowerCase()
}

function groupReady(identity: AiVideoIdentityRow): boolean {
  return identity.verification_status === 'verified' && identity.group_id !== null && identity.revoked_at === null
}

function present(identity: AiVideoIdentityRow, assets: readonly AiVideoIdentityAssetRow[], scope: Scope): AiVideoIdentityView {
  return {
    id: identity.id,
    display_name: identity.display_name,
    owner_kind: identity.owner_kind,
    verification_status: identity.verification_status,
    session_expires_at: identity.session_expires_at,
    group_ready: groupReady(identity),
    assets: assets
      .filter((asset) => asset.identity_id === identity.id && asset.deleted_at === null)
      .map((asset) => presentAsset(asset, scope)),
    created_at: identity.created_at,
    revoked_at: identity.revoked_at,
  }
}

function presentAsset(asset: AiVideoIdentityAssetRow, scope: Scope): AiVideoIdentityAssetView {
  return {
    id: asset.id,
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    slot: asset.name,
    status: asset.status,
    ...(asset.status === 'failed' ? { reason_code: mapAiVideoIdentityFailedReason(asset.failed_reason) } : {}),
    ...(scope.kind === 'internal' ? { failed_reason: asset.failed_reason } : {}),
    created_at: asset.created_at,
  }
}

export function mapAiVideoIdentityFailedReason(reason: string | null | undefined): AiVideoIdentityReasonCode {
  const text = reason ?? ''
  if (/FaceMismatch|mismatch/i.test(text)) return 'face_mismatch'
  if (/MultiFace|multiple|more than one/i.test(text)) return 'multiple_faces'
  return 'asset_failed'
}

export function buildAiVideoIdentityCallbackUrl(siteOrigin: string, nonce: string): string {
  return `${siteOrigin.replace(/\/+$/, '')}/ai-video-identity.html?stage=callback&n=${nonce}`
}

export function isIdentityUploadPath(path: string, identityId: string, slot: AiVideoIdentitySlot): boolean {
  if (path.length > 512) return false
  const re = new RegExp(`^identity/${identityId}/${slot}-[0-9a-f-]{36}\\.(jpg|png|webp|heic|heif|mp3|wav)$`, 'i')
  return re.test(path)
}

export async function hashAiVideoIdentityNonce(nonce: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function generateNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function withEnglishUi(h5Link: string): string {
  if (/[?&]lng=/.test(h5Link)) return h5Link
  return `${h5Link}${h5Link.includes('?') ? '&' : '?'}lng=en`
}

function parseDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX) return null
  // Keep control characters out of admin tables and prompts.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  return trimmed
}

function parseSlot(value: unknown): AiVideoIdentitySlot | null {
  return typeof value === 'string' && (AI_VIDEO_IDENTITY_SLOTS as readonly string[]).includes(value)
    ? value as AiVideoIdentitySlot
    : null
}

function parseBilled(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (lowered === 'true' || lowered === '1') return true
    if (lowered === 'false' || lowered === '0') return false
  }
  return null
}

/** undefined = malformed; null = absent. */
function optionalUuid(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) return undefined
  return value.trim().toLowerCase()
}

function expectedAssetType(slot: AiVideoIdentitySlot): ArkAssetType {
  return slot === 'voice' ? 'Audio' : 'Image'
}

function extensionFor(slot: AiVideoIdentitySlot, contentType: string): string | null {
  const table = slot === 'voice' ? AUDIO_EXTENSIONS : IMAGE_EXTENSIONS
  return table[contentType] ?? null
}

function maxBytesFor(slot: AiVideoIdentitySlot): number {
  return slot === 'voice' ? AI_VIDEO_IDENTITY_AUDIO_MAX_BYTES : AI_VIDEO_IDENTITY_IMAGE_MAX_BYTES
}

function isAction(value: unknown): value is AiVideoIdentityAction {
  return typeof value === 'string' && (AI_VIDEO_IDENTITY_ACTIONS as readonly string[]).includes(value)
}

function livenessBillingBlockedResponse(ctx: Ctx): Response | null {
  if (!ctx.deps.livenessBillingBlocked) return null
  ctx.log({ event: 'ai_video_identity_liveness_billing_blocked' })
  return json({ error: 'liveness_billing_blocked' }, 403)
}

function isEncryptionConfigError(error: unknown): boolean {
  const code = messageOf(error)
  return code === 'encryption_key_unset' || code === 'invalid_key_length' || code === 'invalid_key_format'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}

// Consent audit rows carry the originating IP; consent_events.ip_address is
// Postgres inet, so anything not clearly IPv4/IPv6 degrades to null.
function extractClientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return sanitizeIp(cf)
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first ? sanitizeIp(first) : null
}

function sanitizeIp(raw: string): string | null {
  const ip = raw.trim()
  if (!ip || ip.length > 45) return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (v4) return v4.slice(1).every((octet) => Number(octet) <= 255) ? ip : null
  if (ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip)) return ip
  return null
}

function failure(error: unknown, ctx: Ctx): Response {
  const code = messageOf(error)
  if (code === 'identity_asset_cap') return json({ error: 'identity_asset_cap' }, 409)
  if (code === 'ark_quota_exceeded') return json({ error: 'ark_quota_exceeded' }, 409)
  if (code === 'ark_rate_limited') return json({ error: 'ark_rate_limited' }, 429)
  if (code === 'missing_ark_asset_credentials') return json({ error: 'ark_unconfigured' }, 503)
  if (isEncryptionConfigError(error)) return json({ error: 'encryption_unconfigured' }, 503)
  if (code === 'duplicate') return json({ error: 'conflict' }, 409)
  if (/^ark_/.test(code)) return json({ error: code }, 502)
  if (/^invalid_ark_/.test(code)) return json({ error: code }, 502)
  ctx.log({ event: 'ai_video_identity_error', code: code.slice(0, 120) })
  return json({ error: 'server_error' }, 500)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ─── Ark adapter ─────────────────────────────────────────────────────────

// Credentials resolve per call so a missing AK/SK surfaces as 503
// ark_unconfigured on the action that needs it, not at cold start.
export function createAiVideoIdentityArk(
  readEnv: () => ArkEnv,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): AiVideoIdentityArk {
  const config = () => resolveArkAssetConfig(readEnv())
  return {
    createVisualValidateSession: (input) => arkCreateVisualValidateSession(input, config(), fetchImpl),
    getVisualValidateResult: (input) => arkGetVisualValidateResult(input, config(), fetchImpl),
    createAsset: (input) => arkCreateAsset(input, config(), fetchImpl),
    getAsset: (input) => arkGetAsset(input, config(), fetchImpl),
    deleteAsset: (input) => arkDeleteAsset(input, config(), fetchImpl),
    deleteAssetGroup: (input) => arkDeleteAssetGroup(input, config(), fetchImpl),
  }
}
