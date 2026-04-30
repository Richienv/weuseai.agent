// Deno Edge Function entry — xendit-webhook.
//
// Deploy: supabase functions deploy xendit-webhook
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   XENDIT_WEBHOOK_TOKEN, PROVISIONING_URL, PROVISIONING_AUTH_TOKEN,
//   RICHIE_CHAT_ID (optional, for alerts).

// @ts-ignore — Deno-only
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { handleXenditWebhook } from '../_shared/xendit-webhook-handler.ts'
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
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
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
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

Deno.serve((req) =>
  handleXenditWebhook(req, {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
    alertChatId: ALERT_CHAT_ID,
    alertSend,
  }),
)
