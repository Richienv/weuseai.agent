// Deno Edge Function entry — xendit-webhook.
//
// Deploy: supabase functions deploy xendit-webhook
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   XENDIT_WEBHOOK_TOKEN, PROVISIONING_URL, PROVISIONING_AUTH_TOKEN,
//   BOT_TOKEN_ENC_KEY (Phase E 2026-05-14: needed to decrypt existing
//     customer bot tokens for the pre-wipe snapshot in handlePaid),
//   RICHIE_CHAT_ID (optional, for alerts).

// @ts-ignore — Deno-only
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { handleXenditWebhook } from '../_shared/xendit-webhook-handler.ts'
import { handleCors, withCors, webhookCorsHeaders } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
import type {
  IInvoiceStore,
  IProvisioningClient,
  SubscriptionRow,
  Tier,
} from '../_shared/types.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_TOKEN = Deno.env.get('XENDIT_WEBHOOK_TOKEN')!
// Prod-mode seam (CLAUDE.md § Deferred gate). Xendit uses the SAME
// x-callback-token verification scheme in test and live mode — only the
// token VALUE rotates per environment — so this does NOT change the auth
// comparison. It only lets the handler (a) enforce the empty-token guard
// and (b) tag rejection logs with the environment, so a cross-mode
// misconfig (live key + stale test token, or vice-versa) is visible on the
// first real webhook. Resolved from XENDIT_API_KEY's prefix: the founder
// rotates that secret to `xnd_production_*` to go live (the rotation is
// founder-only — see CLAUDE.md Production state). Until then it is
// `xnd_development_*` (or unset) and we run in 'test' mode. XENDIT_API_KEY
// is read ONLY for this mode flag here; invoice creation lives in the
// create-invoice function, so this never touches money-moving logic.
const XENDIT_API_KEY = Deno.env.get('XENDIT_API_KEY') ?? ''
const XENDIT_KEY_MODE: 'test' | 'live' = XENDIT_API_KEY.startsWith('xnd_production_')
  ? 'live'
  : 'test'
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
// Phase E (2026-05-14): used to decrypt the customer's existing bot
// token for the pre-wipe snapshot in handlePaid. When unset, the
// store's getDecryptedBotToken always returns null and the handler
// falls back to spinUp(customerTelegramBotToken: '') — the pre-Phase-E
// behavior. So missing this env is a degraded but functional state.
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY') ?? ''
const ALERT_CHAT_ID = Deno.env.get('RICHIE_CHAT_ID')
const TELEGRAM_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const db: IInvoiceStore = {
  async findCustomerByEmail(email) {
    const { data } = await supabase
      .from('customers')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()
    return data ?? null
  },
  async findCustomerById(customerId) {
    const { data } = await supabase
      .from('customers')
      .select('id, email, display_name')
      .eq('id', customerId)
      .maybeSingle()
    return data ?? null
  },
  async insertCustomer(input) {
    const { data, error } = await supabase
      .from('customers')
      .insert(input)
      .select('id, email')
      .single()
    if (error) throw error
    return data
  },
  async findSubscriptionByXenditInvoiceId(xenditInvoiceId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('xendit_invoice_id', xenditInvoiceId)
      .maybeSingle()
    return (data as SubscriptionRow | null) ?? null
  },
  async insertSubscription(input) {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({ ...input, hosting_active: false })
      .select('*')
      .single()
    if (error) throw error
    return data as SubscriptionRow
  },
  async updateSubscription(id, patch) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SubscriptionRow
  },
  async insertSubscriptionInvoice(input) {
    const { data, error } = await supabase
      .from('subscription_invoices')
      .insert(input)
      .select('id')
      .single()
    if (error) throw error
    return data
  },
  async markSubscriptionInvoicePaid(xenditInvoiceId) {
    const { error } = await supabase
      .from('subscription_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('xendit_invoice_id', xenditInvoiceId)
    if (error) throw error
  },
  async markSubscriptionInvoiceFailed(xenditInvoiceId, status) {
    const { error } = await supabase
      .from('subscription_invoices')
      .update({ status })
      .eq('xendit_invoice_id', xenditInvoiceId)
    if (error) throw error
  },
  async addStarterCredits(customerId, cents) {
    await supabase.from('credits').upsert({
      customer_id: customerId,
      balance_usd_cents: cents,
      updated_at: new Date().toISOString(),
    })
  },
  // HF-1 (2026-05-12 founder Q1 lock): wipe stale pair state on every
  // pending → active subscription transition. See xendit-webhook-handler.ts
  // handlePaid() for the full rationale. Service-role UPDATE — anon
  // can't trigger this through any path (Sesi D P0-2 column REVOKEs +
  // RLS on customers).
  async clearStalePairState(customerId) {
    const { error } = await supabase
      .from('customers')
      .update({
        telegram_bot_token: null,
        telegram_bot_username: null,
        telegram_chat_id: null,
        soul_md_text: null,
        pairing_code: null,
        pairing_code_expires_at: null,
      })
      .eq('id', customerId)
    if (error) throw error
  },
  // Phase E Option 2 part 2 (2026-05-14): pre-wipe snapshot path for
  // xendit-webhook handlePaid(). Two-step: SELECT the encrypted
  // telegram_bot_token column (service-role bypasses the anon SELECT
  // REVOKE from Sesi D P0-2), then call decrypt_bot_token RPC. Returns
  // null on any failure mode (missing key, no token, RPC error) — the
  // handler treats null as "no existing token, fall back to
  // empty-string spinUp." So a degraded BOT_TOKEN_ENC_KEY env setup
  // gracefully preserves the pre-Phase-E behavior.
  async getDecryptedBotToken(customerId) {
    if (!BOT_TOKEN_ENC_KEY) return null
    const { data: cust, error: custErr } = await supabase
      .from('customers')
      .select('telegram_bot_token')
      .eq('id', customerId)
      .maybeSingle()
    if (custErr || !cust || !cust.telegram_bot_token) return null
    const { data: dec, error: decErr } = await supabase.rpc('decrypt_bot_token', {
      encrypted: cust.telegram_bot_token,
      enc_key: BOT_TOKEN_ENC_KEY,
    })
    if (decErr) return null
    return typeof dec === 'string' && dec.length > 0 ? dec : null
  },
}

const provisioning: IProvisioningClient = {
  async spinUp(input) {
    const r = await fetch(`${PROVISIONING_URL}/spin-up`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        customerId: input.customerId,
        tier: input.tier as Tier,
        customerTelegramBotToken: input.customerTelegramBotToken,
        customerTelegramAllowedUserIds: input.customerTelegramAllowedUserIds,
        alwaysOnEnabled: input.alwaysOnEnabled,
        useStarterCredits: input.useStarterCredits,
      }),
    })
    if (r.ok) return { ok: true }
    return { ok: false, status: r.status, body: await r.text() }
  },
}

async function alertSend(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return
  // Best-effort: a Telegram outage must NEVER throw out of the webhook
  // handler — a throw here would 500 the webhook and trigger a Xendit
  // retry-storm. Swallow but LOG (greppable/alertable) on non-2xx + throw.
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    )
    if (!r.ok) {
      const body = await r.text().catch(() => '<unreadable>')
      console.error(
        `[xendit-webhook] alertSend Telegram non-2xx: ${r.status} ${body}`,
      )
    }
  } catch (err) {
    console.error(
      `[xendit-webhook] alertSend Telegram fetch threw: ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight

  const res = await handleXenditWebhook(req, {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
    // Prod-mode seam: 'live' once XENDIT_API_KEY rotates to xnd_production_*.
    // Same token check applies in both modes (Xendit scheme is mode-agnostic).
    keyMode: XENDIT_KEY_MODE,
    alertChatId: ALERT_CHAT_ID,
    alertSend,
    // Sesi B P0 #7 (2026-05-12): receipt email on PAID. Stub-tolerant —
    // sendEmail returns ok:true with stub:true when RESEND_API_KEY is
    // absent, so this is safe to leave wired in all environments.
    sendReceiptEmail: async (args) => sendEmail(args),
  })
  return withCors(res, webhookCorsHeaders)
})
