import {
  AI_VIDEO_CAPABILITY_SCOPES,
  generateAiVideoRecoveryToken,
  hashAiVideoRecoveryToken,
  issueAiVideoCapability,
  readAiVideoCapability,
  verifyAiVideoCapability,
  type AiVideoCapabilityScope,
} from './ai-video-capability.ts'
import { isAiVideoClaimCode } from './ai-video-claim-code.ts'
import { isAiVideoPromoSerial } from './ai-video-promo.ts'
import { AI_VIDEO_CURRENCY, resolveAiVideoSku } from './ai-video-product.ts'

export type BoundAiVideoState = {
  orderStatus: 'pending' | 'paid' | 'failed' | 'expired' | 'held_for_review' | 'refunded' | 'reversed' | 'chargeback'
  productCode: string
  amountIdr: number
  currency: string
  email: string
  claimCode: string | null
  paidAt: string | null
  promoSerial: string | null
  promoExpiresAt: string | null
  entitlementId: string | null
  entitlementStatus: 'active' | 'suspended' | null
  credentialConfigured: boolean
  telegramLinked: boolean
}

export type AiVideoSessionDeps = {
  capabilityKey: string
  telegramBotUsername: string
  store: {
    findBoundOrder(customerId: string, orderId: string): Promise<BoundAiVideoState | null>
    findPaidOrderByEmail(email: string): Promise<{ customerId: string; orderId: string } | null>
    createRecoveryGrant(input: { customerId: string; orderId: string; tokenHash: string; scopes: readonly AiVideoCapabilityScope[] }): Promise<boolean>
    revokeRecoveryGrant(tokenHash: string): Promise<void>
    consumeRecoveryGrant(tokenHash: string): Promise<{ customerId: string; orderId: string; scopes: AiVideoCapabilityScope[] } | null>
    createTelegramLink(input: { entitlementId: string; customerId: string; tokenHash: string }): Promise<boolean>
  }
  email: { sendRecovery(input: { email: string; recoveryUrl: string }): Promise<boolean> }
  publicBaseUrl: string
  now?: () => Date
}

export async function handleAiVideoSession(req: Request, deps: AiVideoSessionDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown>
  try { body = await req.json() as Record<string, unknown> } catch { return json({ error: 'invalid_json' }, 400) }
  const action = body.action

  if (action === 'request_recovery') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const identity = await deps.store.findPaidOrderByEmail(email)
      if (identity) {
        const token = generateAiVideoRecoveryToken()
        const digest = await hashAiVideoRecoveryToken(token)
        const created = await deps.store.createRecoveryGrant({
          customerId: identity.customerId,
          orderId: identity.orderId,
          tokenHash: digest,
          scopes: AI_VIDEO_CAPABILITY_SCOPES,
        })
        if (created) {
          const recoveryUrl = `${deps.publicBaseUrl.replace(/\/+$/, '')}/ai-video/welcome#recovery_token=${encodeURIComponent(token)}`
          if (!await deps.email.sendRecovery({ email, recoveryUrl })) {
            await deps.store.revokeRecoveryGrant(digest)
          }
        }
      }
    }
    return json({ accepted: true }, 202)
  }

  if (action === 'exchange') {
    const raw = typeof body.recovery_token === 'string' ? body.recovery_token.trim() : ''
    let digest: string
    try { digest = await hashAiVideoRecoveryToken(raw) } catch { return json({ error: 'invalid_recovery_token' }, 401) }
    const grant = await deps.store.consumeRecoveryGrant(digest)
    if (!grant) return json({ error: 'invalid_recovery_token' }, 401)
    const capability = await issueAiVideoCapability({
      customerId: grant.customerId,
      orderId: grant.orderId,
      scopes: grant.scopes,
      ttlSeconds: 60 * 60,
      now: deps.now?.() ?? new Date(),
    }, deps.capabilityKey)
    return json({ ai_video_capability: capability, expires_in: 3600 })
  }

  const required: AiVideoCapabilityScope[] = action === 'status'
    ? ['order:read']
    : action === 'create_telegram_link'
      ? ['profile:write']
      : []
  if (required.length === 0) return json({ error: 'invalid_action' }, 400)

  const verification = await verifyAiVideoCapability(
    readAiVideoCapability(req), deps.capabilityKey,
    { requiredScopes: required, now: deps.now?.() ?? new Date() },
  )
  if (!verification.ok) return json({ error: 'unauthorized' }, 401)
  const state = await deps.store.findBoundOrder(verification.claims.cid, verification.claims.oid)
  if (!state) return json({ error: 'not_found' }, 404)

  if (action === 'status') {
    const sku = resolveAiVideoSku(state.productCode)
    const paid = state.orderStatus === 'paid'
    const claimCode = paid && isAiVideoClaimCode(state.claimCode) ? state.claimCode : null
    const promoSerial = paid && isAiVideoPromoSerial(state.promoSerial) ? state.promoSerial : null
    const promo = claimCode && promoSerial && state.promoExpiresAt
      ? { serial: promoSerial, percent_off: 25, expires_at: state.promoExpiresAt, purchased_at: state.paidAt }
      : null
    return json({
      order: {
        status: state.orderStatus,
        sku: sku.code,
        label: sku.label,
        amount_idr: state.amountIdr,
        currency: state.currency || AI_VIDEO_CURRENCY,
        email: state.email,
        claim_code: claimCode,
        paid_at: paid ? state.paidAt : null,
        promo_serial: promoSerial,
        promo_expires_at: promo?.expires_at ?? null,
      },
      receipt: claimCode
        ? {
            claim_code: claimCode,
            sku: sku.code,
            label: sku.label,
            amount_idr: state.amountIdr,
            currency: state.currency || AI_VIDEO_CURRENCY,
            email: state.email,
            paid_at: state.paidAt,
            promo,
          }
        : null,
      entitlement: state.entitlementStatus ? { status: state.entitlementStatus } : null,
      setup: {
        credential_configured: state.credentialConfigured,
        telegram_linked: state.telegramLinked,
        whatsapp_available: Boolean(claimCode),
      },
    })
  }

  if (!state.entitlementId || state.entitlementStatus !== 'active' || state.orderStatus !== 'paid') {
    return json({ error: 'entitlement_required' }, 409)
  }
  const rawLink = generateAiVideoRecoveryToken()
  const linkHash = await hashAiVideoRecoveryToken(rawLink)
  if (!await deps.store.createTelegramLink({
    entitlementId: state.entitlementId,
    customerId: verification.claims.cid,
    tokenHash: linkHash,
  })) return json({ error: 'link_unavailable' }, 409)

  const username = deps.telegramBotUsername.replace(/^@/, '')
  return json({
    telegram_url: `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(rawLink)}`,
    expires_at: new Date((deps.now?.() ?? new Date()).getTime() + 15 * 60 * 1000).toISOString(),
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
