// @ts-ignore Deno-only module
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, withCors } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
import { createMidtransSnapClient } from '../_shared/midtrans-client.ts'
import type { MidtransConfig } from '../_shared/midtrans-config.ts'
import { resolveAiVideoEnabledPayments } from '../_shared/ai-video-product.ts'
import {
  generateAiVideoRecoveryToken,
  hashAiVideoRecoveryToken,
  issueAiVideoCapability,
} from '../_shared/ai-video-capability.ts'
import {
  AI_VIDEO_CHECKOUT_SCOPES,
  handleCreateAiVideoOrder,
  type AiVideoOrderRow,
} from '../_shared/create-ai-video-order-handler.ts'

// @ts-ignore Deno global
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://www.weuseai.id'
const CAPABILITY_KEY = Deno.env.get('AI_VIDEO_CAPABILITY_HMAC_KEY') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function loadCheckoutConfig(): { midtrans: MidtransConfig; enabledPayments: string[] } {
  // Live create-invoice still stores lowercase sandbox|production.
  // Do not rewrite that shared secret — agent checkout depends on it.
  const rawEnvironment = Deno.env.get('MIDTRANS_ENVIRONMENT')?.trim()
  const environment = rawEnvironment === 'sandbox' || rawEnvironment === 'Sandbox'
    ? 'Sandbox'
    : rawEnvironment === 'production' || rawEnvironment === 'Production'
      ? 'Production'
      : null
  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY') ?? ''
  if (!environment) throw new Error('MIDTRANS_ENVIRONMENT must be sandbox or production')
  if (!serverKey) throw new Error('missing MIDTRANS_SERVER_KEY')
  if (environment === 'Production' && serverKey.startsWith('SB-Mid-server-')) {
    throw new Error('MIDTRANS_ENVIRONMENT does not match MIDTRANS_SERVER_KEY')
  }
  return {
    midtrans: environment === 'Sandbox'
      ? {
          environment: 'Sandbox',
          serverKey,
          snapBaseUrl: 'https://app.sandbox.midtrans.com',
          coreBaseUrl: 'https://api.sandbox.midtrans.com',
        }
      : {
          environment: 'Production',
          serverKey,
          snapBaseUrl: 'https://app.midtrans.com',
          coreBaseUrl: 'https://api.midtrans.com',
        },
    enabledPayments: resolveAiVideoEnabledPayments(Deno.env.get('MIDTRANS_AI_VIDEO_ENABLED_PAYMENTS')),
  }
}

const browserSecurity = {
  assertReady() {
    if (new TextEncoder().encode(CAPABILITY_KEY).length < 32) throw new Error('capability key missing')
  },
  async requestRecovery(input: { customerId: string; email: string }) {
    const raw = generateAiVideoRecoveryToken()
    const digest = await hashAiVideoRecoveryToken(raw)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const { error } = await supabase.from('ai_video_recovery_grants').insert({
      customer_id: input.customerId,
      order_id: null,
      token_hash: `\\x${digest}`,
      purpose: 'checkout_recovery',
      scopes: [...AI_VIDEO_CHECKOUT_SCOPES],
      expires_at: expiresAt,
    })
    if (error) throw error
    const url = `${PUBLIC_BASE.replace(/\/+$/, '')}/ai-video#recovery_token=${encodeURIComponent(raw)}`
    const delivery = await sendEmail({
      to: input.email,
      subject: 'Lanjutkan checkout AI Video Agent',
      text: ['Halo,', '', 'Buka link sekali pakai ini dalam 15 menit untuk melanjutkan checkout AI Video Agent:', url, '', 'Kalau kamu tidak meminta ini, abaikan email ini.', '', '— weuseai.agent'].join('\n'),
    })
    if (!delivery.ok || delivery.stub === true) {
      await supabase.from('ai_video_recovery_grants').update({ revoked_at: new Date().toISOString() }).eq('token_hash', `\\x${digest}`)
      throw new Error('recovery email not delivered')
    }
  },
  async consumeRecovery(input: { token: string; email: string }) {
    let digest: string
    try { digest = await hashAiVideoRecoveryToken(input.token) } catch { return null }
    const { data, error } = await supabase.rpc('consume_ai_video_recovery_grant', { p_token_hash: digest })
    if (error) throw error
    const grant = Array.isArray(data) ? data[0] : data
    if (!grant || grant.purpose !== 'checkout_recovery' || grant.order_id !== null) return null
    const { data: customer } = await supabase.from('customers').select('id,email').eq('id', grant.customer_id).maybeSingle()
    if (!customer || String(customer.email).trim().toLowerCase() !== input.email) return null
    return { customerId: String(customer.id) }
  },
  issueCapability(input: Parameters<typeof issueAiVideoCapability>[0]) {
    return issueAiVideoCapability(input, CAPABILITY_KEY)
  },
}

const store = {
  async findCustomerByEmail(email: string) {
    const { data, error } = await supabase.from('customers').select('id,email').eq('email', email).maybeSingle()
    if (error) throw error
    return data ?? null
  },
  async insertCustomer(input: { email: string; display_name?: string }) {
    const { data, error } = await supabase.from('customers').insert(input).select('id,email').single()
    if (error) throw error
    return data
  },
  async hasEntitlement(customerId: string) {
    const { data, error } = await supabase.from('ai_video_entitlements').select('id').eq('customer_id', customerId).eq('status', 'active').maybeSingle()
    if (error) throw error
    return Boolean(data)
  },
  async insertConsent(input: Record<string, unknown>) {
    const { error } = await supabase.from('consent_events').insert(input)
    if (error) throw error
  },
  async lookupPromo(serial: string) {
    const { data, error } = await supabase.from('ai_video_promos')
      .select('serial,expires_at,redeemed_at,reserved_order_id')
      .eq('serial', serial).maybeSingle()
    if (error) throw error
    return data ? {
      serial: String(data.serial),
      expiresAt: String(data.expires_at),
      redeemedAt: data.redeemed_at ? String(data.redeemed_at) : null,
      reservedOrderId: data.reserved_order_id ? String(data.reserved_order_id) : null,
    } : null
  },
  async createPendingOrder(input: { id: string; customerId: string; attribution: Record<string, string>; policyVersion: string; productCode: string; amountIdr: number; promoSerial?: string }) {
    const { data, error } = await supabase.rpc('create_ai_video_pending_order', {
      p_order_id: input.id,
      p_customer_id: input.customerId,
      p_attribution: input.attribution,
      p_policy_version: input.policyVersion,
      p_product_code: input.productCode,
      p_amount_idr: input.amountIdr,
      p_promo_serial: input.promoSerial ?? null,
    })
    if (error) throw error
    return (Array.isArray(data) ? data[0] : data) as AiVideoOrderRow
  },
  async claimSnapCreation(orderId: string) {
    const { data, error } = await supabase.rpc('claim_ai_video_snap_creation', { p_order_id: orderId, p_lease_seconds: 60 })
    if (error) throw error
    return data === true
  },
  async completeSnapCreation(orderId: string, redirectUrl: string) {
    const { error } = await supabase.rpc('complete_ai_video_snap_creation', { p_order_id: orderId, p_redirect_url: redirectUrl })
    if (error) throw error
  },
  async findOrder(orderId: string) {
    const { data, error } = await supabase.from('ai_video_orders').select('id,customer_id,provider_order_id,provider_redirect_url,status').eq('id', orderId).maybeSingle()
    if (error) throw error
    return data as AiVideoOrderRow | null
  },
  async markOrderFailed(providerOrderId: string) {
    const { error } = await supabase.from('ai_video_orders').update({
      status: 'failed', checkout_create_lease_until: null, reserved_promo_id: null, updated_at: new Date().toISOString(),
    }).eq('provider_order_id', providerOrderId).eq('status', 'pending')
    if (error) throw error
  },
  async releasePromo(orderId: string) {
    const { error } = await supabase.rpc('release_ai_video_promo', { p_order_id: orderId })
    if (error) throw error
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight
  const salesOpen = Deno.env.get('AI_VIDEO_SALES_OPEN') === 'true'
  try {
    const config = loadCheckoutConfig()
    if (!salesOpen) {
      return withCors(new Response(JSON.stringify({ error: 'checkout_closed' }), { status: 503, headers: { 'content-type': 'application/json' } }), req)
    }
    return withCors(await handleCreateAiVideoOrder(req, {
      store,
      browserSecurity,
      midtrans: createMidtransSnapClient(config.midtrans),
      enabledPayments: config.enabledPayments,
      publicBaseUrl: PUBLIC_BASE,
      salesOpen: true,
    }), req)
  } catch {
    return withCors(new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'content-type': 'application/json' } }), req)
  }
})
