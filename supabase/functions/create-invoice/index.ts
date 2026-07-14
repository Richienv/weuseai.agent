// Deno Edge Function entry — wires real deps and serves over HTTP.
// Pure handler logic lives in ../_shared/create-invoice-handler.ts so Node
// tests can import and exercise it without Deno.
//
// Deploy: supabase functions deploy create-invoice
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XENDIT_API_KEY,
//   PUBLIC_BASE_URL (e.g. https://weuseai-agent.vercel.app)

// @ts-ignore — Deno-only import; not resolved during Node typecheck.
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { handleCreateInvoice } from '../_shared/create-invoice-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import type {
  IInvoiceStore,
  IXenditClient,
  SubscriptionRow,
} from '../_shared/types.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const XENDIT_SECRET = Deno.env.get('XENDIT_API_KEY')!
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://weuseai-agent.vercel.app'

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
    // Upsert credits row
    await supabase.from('credits').upsert({
      customer_id: customerId,
      balance_usd_cents: cents,
      updated_at: new Date().toISOString(),
    })
  },
  /**
   * Sesi D pass-3 P0 (2026-05-13): append consent_events row.
   * Service-role inserts only — anon is RLS-locked out.
   */
  async insertConsentEvent(input) {
    const { data, error } = await supabase
      .from('consent_events')
      .insert({
        customer_id: input.customer_id,
        consent_type: input.consent_type,
        accepted_at: input.accepted_at,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        ...(input.version ? { version: input.version } : {}),
      })
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  },
}

const xendit: IXenditClient = {
  async createInvoice(input) {
    const auth = btoa(`${XENDIT_SECRET}:`)
    const r = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        external_id: input.externalId,
        amount: input.amount,
        payer_email: input.payerEmail,
        description: input.description,
        payment_methods: input.paymentMethods,
        fees: input.fees,
        success_redirect_url: input.successRedirectUrl,
        failure_redirect_url: input.failureRedirectUrl,
        metadata: input.metadata,
        currency: 'IDR',
      }),
    })
    if (!r.ok) {
      const text = await r.text()
      throw new Error(`Xendit create invoice failed: ${r.status} ${text}`)
    }
    const data = (await r.json()) as { id: string; invoice_url: string }
    return { invoiceId: data.id, invoiceUrl: data.invoice_url }
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  try {
    const res = await handleCreateInvoice(req, {
      db,
      xendit,
      successRedirectBase: `${PUBLIC_BASE}/welcome`,
      failureRedirectBase: `${PUBLIC_BASE}/checkout.html`,
      // Paid count for the library-full 799→999 batch flip — same
      // status='active' definition as /api/public/subscription-count.
      countActiveSubscriptions: async () => {
        const { count, error } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
        if (error || typeof count !== 'number') throw (error ?? new Error('count unavailable'))
        return count
      },
    })
    return withCors(res, req)
  } catch (e) {
    // An uncaught error (e.g. Xendit rejecting the invoice) used to escape as a
    // raw 500 WITHOUT cors headers — the browser then mislabels it a CORS block.
    // Catch it, log it, and return a cors-wrapped JSON error the client can read.
    console.error('[create-invoice] uncaught:', e)
    return withCors(
      new Response(
        JSON.stringify({ error: 'server_error' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }
})
