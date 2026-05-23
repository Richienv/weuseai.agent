// Deno Edge Function entry — admin-send-refund-email (Phase A2 PR 5).
//
// Service-role-gated POST that ships the refund.md lifecycle email to
// a single customer. Manual founder trigger (CLI / dashboard) after a
// Xendit-side refund has been initiated.
//
// Pure handler: ../_shared/admin-send-refund-email-handler.ts
//
// Deploy:
//   supabase functions deploy admin-send-refund-email \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto-provided + secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto
//   RESEND_API_KEY                           — optional (stub mode when unset)
//
// Request body (JSON):
//   {
//     "customer_id":         "uuid",
//     "refund_amount_idr":   399000,
//     "refund_method":       "QRIS",
//     "refund_reason":       "permintaan pelanggan",
//     "invoice_id":          "INV-2026-001",   // optional
//     "eta_business_days":   7                  // optional, default 7
//   }
//
// Responses:
//   200 { ok:true, body: { sent_to, resend_id?, stub } }
//   400 { ok:false, error:'invalid_input', detail }
//   401 { error:'unauthorized' }
//   404 { ok:false, error:'customer_not_found' }
//   422 { ok:false, error:'customer_has_no_email' }
//   502 { ok:false, error:'email_send_failed', detail }
//   500 { ok:false, error:'internal', detail }

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { handleAdminSendRefundEmail } from '../_shared/admin-send-refund-email-handler.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const deps = {
  async findCustomer(customer_id: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('email, display_name')
      .eq('id', customer_id)
      .maybeSingle()
    if (error || !data) return null
    return data as { email: string; display_name: string | null }
  },
  sendEmail,
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 405, error: 'method_not_allowed' }),
        { status: 405, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  if (!isServiceRoleCaller(req)) {
    return withCors(
      new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 400, error: 'invalid_json' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  try {
    const result = await handleAdminSendRefundEmail(body as never, deps)
    return withCors(
      new Response(JSON.stringify(result), {
        status: result.status,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  } catch (e) {
    return withCors(
      new Response(
        JSON.stringify({
          ok: false,
          status: 500,
          error: 'internal',
          detail: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }
})
