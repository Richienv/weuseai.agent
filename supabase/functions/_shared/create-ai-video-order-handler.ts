import type { MidtransSnapClient } from './midtrans-client.ts'
import {
  AI_VIDEO_CAPABILITY_TTL_SECONDS,
  AI_VIDEO_POLICY_VERSION,
  buildAiVideoOrderId,
  discountedAiVideoListAmount,
  resolveAiVideoSku,
  sanitizeAiVideoAttribution,
} from './ai-video-product.ts'
import { isAiVideoPromoSerial, promoStatus } from './ai-video-promo.ts'
import type { AiVideoCapabilityScope } from './ai-video-capability.ts'

export const AI_VIDEO_CHECKOUT_SCOPES = [
  'credential:write', 'order:read', 'profile:read', 'profile:write',
] as const satisfies readonly AiVideoCapabilityScope[]

export type AiVideoOrderRow = {
  id: string
  customer_id: string
  provider_order_id: string
  provider_redirect_url: string | null
  status: string
}

export type CreateAiVideoOrderDeps = {
  store: {
    findCustomerByEmail(email: string): Promise<{ id: string; email: string } | null>
    insertCustomer(input: { email: string; display_name?: string }): Promise<{ id: string; email: string }>
    hasEntitlement(customerId: string): Promise<boolean>
    insertConsent(input: {
      customer_id: string
      consent_type: 'tos' | 'marketing'
      accepted_at: string
      ip_address: string | null
      user_agent: string | null
      version: string
    }): Promise<void>
    lookupPromo(serial: string): Promise<{
      serial: string
      expiresAt: string
      redeemedAt: string | null
      reservedOrderId: string | null
    } | null>
    createPendingOrder(input: {
      id: string
      customerId: string
      attribution: Record<string, string>
      policyVersion: string
      productCode: string
      amountIdr: number
      promoSerial?: string
    }): Promise<AiVideoOrderRow>
    claimSnapCreation(orderId: string): Promise<boolean>
    completeSnapCreation(orderId: string, redirectUrl: string): Promise<void>
    findOrder(orderId: string): Promise<AiVideoOrderRow | null>
    markOrderFailed(providerOrderId: string): Promise<void>
    releasePromo(orderId: string): Promise<void>
  }
  browserSecurity: {
    assertReady(): void | Promise<void>
    requestRecovery(input: { customerId: string; email: string }): Promise<void>
    consumeRecovery(input: { token: string; email: string }): Promise<{ customerId: string } | null>
    issueCapability(input: {
      customerId: string
      orderId: string
      scopes: readonly AiVideoCapabilityScope[]
      ttlSeconds: number
      now: Date
    }): Promise<string>
  }
  midtrans: MidtransSnapClient
  enabledPayments: readonly string[]
  publicBaseUrl: string
  salesOpen: boolean
  now?: () => Date
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONSENT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function readPromoSerial(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') return ''
  return raw.trim()
}

async function quotePromo(
  skuPriceIdr: number,
  rawSerial: string | null,
  deps: CreateAiVideoOrderDeps,
  now: Date,
): Promise<{ amountIdr: number; promoSerial?: string } | { error: string; status: number }> {
  if (rawSerial == null) return { amountIdr: skuPriceIdr }
  if (!isAiVideoPromoSerial(rawSerial)) return { error: 'invalid_promo_serial', status: 400 }
  const promo = await deps.store.lookupPromo(rawSerial)
  if (!promo) return { error: 'unknown_promo', status: 404 }
  const status = promoStatus({ redeemedAt: promo.redeemedAt, expiresAt: promo.expiresAt, now })
  if (status === 'redeemed' || promo.reservedOrderId) return { error: 'promo_redeemed', status: 409 }
  if (status === 'expired') return { error: 'promo_expired', status: 409 }
  return { amountIdr: discountedAiVideoListAmount(skuPriceIdr), promoSerial: promo.serial }
}

export async function handleCreateAiVideoOrder(req: Request, deps: CreateAiVideoOrderDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!deps.salesOpen) return json({ error: 'checkout_closed' }, 503)
  let body: Record<string, unknown>
  try { body = await req.json() as Record<string, unknown> } catch { return json({ error: 'invalid_json' }, 400) }

  const now = deps.now?.() ?? new Date()
  const sku = resolveAiVideoSku(body.sku)
  const promoSerial = readPromoSerial(body.promo_serial)
  if (body.action === 'quote') {
    const quoted = await quotePromo(sku.priceIdr, promoSerial, deps, now)
    if ('error' in quoted) return json({ error: quoted.error }, quoted.status)
    return json({
      sku: sku.code,
      list_amount_idr: sku.priceIdr,
      amount_idr: quoted.amountIdr,
      currency: 'IDR',
      percent_off: quoted.promoSerial ? 25 : 0,
    })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400)
  if (body.policy_version !== AI_VIDEO_POLICY_VERSION) return json({ error: 'invalid_policy_version' }, 400)

  const acceptedAt = typeof body.tos_accepted_at === 'string' ? new Date(body.tos_accepted_at) : new Date(NaN)
  if (
    !Number.isFinite(acceptedAt.getTime()) || acceptedAt.getTime() > now.getTime() + 30_000 ||
    now.getTime() - acceptedAt.getTime() > CONSENT_MAX_AGE_MS
  ) return json({ error: 'tos_required' }, 400)

  const marketingAt = body.marketing_opt_in_at === null || body.marketing_opt_in_at === undefined
    ? null
    : new Date(String(body.marketing_opt_in_at))
  if (marketingAt && (!Number.isFinite(marketingAt.getTime()) || Math.abs(now.getTime() - marketingAt.getTime()) > CONSENT_MAX_AGE_MS)) {
    return json({ error: 'invalid_marketing_consent' }, 400)
  }

  try { await deps.browserSecurity.assertReady() } catch { return json({ error: 'server_error' }, 500) }

  const quoted = await quotePromo(sku.priceIdr, promoSerial, deps, now)
  if ('error' in quoted) return json({ error: quoted.error }, quoted.status)

  let customer = await deps.store.findCustomerByEmail(email)
  if (customer) {
    const token = typeof body.recovery_token === 'string' ? body.recovery_token.trim() : ''
    const recovered = token ? await deps.browserSecurity.consumeRecovery({ token, email }) : null
    if (!recovered || recovered.customerId !== customer.id) {
      await deps.browserSecurity.requestRecovery({ customerId: customer.id, email: customer.email })
      return json({ recovery_required: true }, 202)
    }
    if (sku.fulfillment === 'agent' && await deps.store.hasEntitlement(customer.id)) {
      return json({ error: 'already_owned' }, 409)
    }
  } else {
    try {
      customer = await deps.store.insertCustomer({
        email,
        ...(typeof body.display_name === 'string' && body.display_name.trim()
          ? { display_name: body.display_name.trim().slice(0, 120) }
          : {}),
      })
    } catch {
      customer = await deps.store.findCustomerByEmail(email)
      if (!customer) return json({ error: 'server_error' }, 500)
      await deps.browserSecurity.requestRecovery({ customerId: customer.id, email: customer.email })
      return json({ recovery_required: true }, 202)
    }
  }

  const clientIp = req.headers.get('cf-connecting-ip')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const commonConsent = {
    customer_id: customer.id,
    ip_address: clientIp,
    user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    version: AI_VIDEO_POLICY_VERSION,
  }
  await deps.store.insertConsent({
    ...commonConsent,
    consent_type: 'tos',
    accepted_at: acceptedAt.toISOString(),
  })
  if (marketingAt) {
    await deps.store.insertConsent({
      ...commonConsent,
      consent_type: 'marketing',
      accepted_at: marketingAt.toISOString(),
    })
  }

  const orderUuid = crypto.randomUUID()
  const order = await deps.store.createPendingOrder({
    id: orderUuid,
    customerId: customer.id,
    attribution: sanitizeAiVideoAttribution(body.attribution),
    policyVersion: AI_VIDEO_POLICY_VERSION,
    productCode: sku.code,
    amountIdr: quoted.amountIdr,
    ...(quoted.promoSerial ? { promoSerial: quoted.promoSerial } : {}),
  })

  let redirectUrl = order.provider_redirect_url
  if (!redirectUrl) {
    const claimed = await deps.store.claimSnapCreation(order.id)
    if (!claimed) {
      const refreshed = await deps.store.findOrder(order.id)
      if (!refreshed?.provider_redirect_url) return json({ error: 'order_in_progress' }, 409)
      redirectUrl = refreshed.provider_redirect_url
    } else {
      try {
        const base = deps.publicBaseUrl.replace(/\/+$/, '')
        const created = await deps.midtrans.createTransaction({
          orderId: buildAiVideoOrderId(order.id),
          grossAmount: quoted.amountIdr,
          customerEmail: customer.email,
          description: sku.description,
          itemId: sku.code,
          enabledPayments: [...deps.enabledPayments],
          finishUrl: `${base}/ai-video/welcome?sku=${encodeURIComponent(sku.code)}`,
          errorUrl: `${base}/ai-video?payment=failed&sku=${encodeURIComponent(sku.code)}`,
        })
        redirectUrl = created.redirectUrl
        await deps.store.completeSnapCreation(order.id, redirectUrl)
      } catch {
        await deps.store.releasePromo(order.id)
        await deps.store.markOrderFailed(order.provider_order_id)
        return json({ error: 'payment_provider_unavailable' }, 502)
      }
    }
  }

  const capability = await deps.browserSecurity.issueCapability({
    customerId: customer.id,
    orderId: order.id,
    scopes: AI_VIDEO_CHECKOUT_SCOPES,
    ttlSeconds: AI_VIDEO_CAPABILITY_TTL_SECONDS,
    now,
  })
  return json({
    redirect_url: redirectUrl,
    amount_idr: quoted.amountIdr,
    list_amount_idr: sku.priceIdr,
    sku: sku.code,
    ai_video_capability: capability,
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
