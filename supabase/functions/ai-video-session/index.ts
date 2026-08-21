// @ts-ignore Deno-only module
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, withCors } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
import { handleAiVideoSession, type BoundAiVideoState } from '../_shared/ai-video-session-handler.ts'

// @ts-ignore Deno global
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CAPABILITY_KEY = Deno.env.get('AI_VIDEO_CAPABILITY_HMAC_KEY') ?? ''
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://www.weuseai.id'
const TELEGRAM_USERNAME = Deno.env.get('AI_VIDEO_TELEGRAM_BOT_USERNAME') ?? ''
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const store = {
  async findBoundOrder(customerId: string, orderId: string): Promise<BoundAiVideoState | null> {
    const { data: order, error } = await supabase.from('ai_video_orders')
      .select('id,status,product_code,amount_idr,currency,claim_code,paid_at')
      .eq('id', orderId).eq('customer_id', customerId).maybeSingle()
    if (error) throw error
    if (!order) return null
    const { data: customer, error: customerError } = await supabase.from('customers')
      .select('email').eq('id', customerId).maybeSingle()
    if (customerError) throw customerError
    const { data: entitlement, error: entitlementError } = await supabase.from('ai_video_entitlements')
      .select('id,status').eq('paid_order_id', orderId).eq('customer_id', customerId).maybeSingle()
    if (entitlementError) throw entitlementError
    let credentialConfigured = false
    let telegramLinked = false
    if (entitlement) {
      const [{ data: credential }, { data: channel }] = await Promise.all([
        supabase.from('integration_credentials').select('id').eq('customer_id', customerId)
          .eq('integration', 'byteplus_modelark').is('revoked_at', null).maybeSingle(),
        supabase.from('ai_video_channel_links').select('id').eq('entitlement_id', entitlement.id)
          .eq('channel', 'telegram').eq('status', 'active').maybeSingle(),
      ])
      credentialConfigured = Boolean(credential)
      telegramLinked = Boolean(channel)
    }
    const { data: promo } = await supabase.from('ai_video_promos')
      .select('serial,expires_at')
      .eq('source_order_id', orderId)
      .maybeSingle()
    return {
      orderStatus: order.status,
      productCode: String(order.product_code),
      amountIdr: Number(order.amount_idr),
      currency: String(order.currency),
      email: typeof customer?.email === 'string' ? customer.email : '',
      claimCode: typeof order.claim_code === 'string' ? order.claim_code : null,
      paidAt: typeof order.paid_at === 'string' ? order.paid_at : null,
      promoSerial: typeof promo?.serial === 'string' ? promo.serial : null,
      promoExpiresAt: typeof promo?.expires_at === 'string' ? promo.expires_at : null,
      entitlementId: entitlement?.id ?? null,
      entitlementStatus: entitlement?.status ?? null,
      credentialConfigured,
      telegramLinked,
    } as BoundAiVideoState
  },
  async findPaidOrderByEmail(email: string) {
    const { data: customer, error } = await supabase.from('customers').select('id').eq('email', email).maybeSingle()
    if (error) throw error
    if (!customer) return null
    const { data: order, error: orderError } = await supabase.from('ai_video_orders').select('id')
      .eq('customer_id', customer.id).eq('status', 'paid').order('paid_at', { ascending: false }).limit(1).maybeSingle()
    if (orderError) throw orderError
    return order ? { customerId: customer.id, orderId: order.id } : null
  },
  async createRecoveryGrant(input: { customerId: string; orderId: string; tokenHash: string; scopes: readonly string[] }) {
    const { data, error } = await supabase.rpc('create_ai_video_session_recovery_grant', {
      p_customer_id: input.customerId, p_order_id: input.orderId,
      p_token_hash: input.tokenHash, p_scopes: [...input.scopes], p_ttl_seconds: 900,
    })
    if (error) throw error
    return Boolean(data)
  },
  async revokeRecoveryGrant(tokenHash: string) {
    const { error } = await supabase.from('ai_video_recovery_grants').update({ revoked_at: new Date().toISOString() }).eq('token_hash', `\\x${tokenHash}`)
    if (error) throw error
  },
  async consumeRecoveryGrant(tokenHash: string) {
    const { data, error } = await supabase.rpc('consume_ai_video_recovery_grant', { p_token_hash: tokenHash })
    if (error) throw error
    const grant = Array.isArray(data) ? data[0] : data
    if (!grant || grant.purpose !== 'session_recovery' || !grant.order_id) return null
    return { customerId: grant.customer_id, orderId: grant.order_id, scopes: grant.scopes }
  },
  async createTelegramLink(input: { entitlementId: string; customerId: string; tokenHash: string }) {
    const { data, error } = await supabase.rpc('create_ai_video_link_code', {
      p_entitlement_id: input.entitlementId, p_customer_id: input.customerId,
      p_token_hash: input.tokenHash, p_channel: 'telegram', p_ttl_seconds: 900,
    })
    if (error) throw error
    return Boolean(data)
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight
  try {
    const response = await handleAiVideoSession(req, {
      capabilityKey: CAPABILITY_KEY,
      telegramBotUsername: TELEGRAM_USERNAME,
      publicBaseUrl: PUBLIC_BASE,
      store,
      email: {
        async sendRecovery({ email, recoveryUrl }) {
          const result = await sendEmail({
            to: email,
            subject: 'Pulihkan akses AI Video Agent',
            text: ['Halo,', '', 'Gunakan link sekali pakai ini dalam 15 menit:', recoveryUrl, '', 'Kalau kamu tidak meminta ini, abaikan email ini.', '', '— weuseai.agent'].join('\n'),
          })
          return result.ok && result.stub !== true
        },
      },
    })
    return withCors(response, req)
  } catch {
    return withCors(new Response(JSON.stringify({ error: 'server_error' }), { status: 503, headers: { 'content-type': 'application/json' } }), req)
  }
})
