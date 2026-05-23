// Deno Edge Function entry — admin-send-support-handoff-email (Phase A2 PR 5).
//
// Service-role-gated POST that ships the support-handoff.md lifecycle
// email after a ticket has been resolved manually from the team's side.
//
// Pure handler: ../_shared/admin-send-support-handoff-email-handler.ts
//
// Deploy:
//   supabase functions deploy admin-send-support-handoff-email \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto-provided + secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto
//   RESEND_API_KEY                           — optional (stub mode when unset)
//
// Request body (JSON):
//   {
//     "customer_id":          "uuid",
//     "ticket_summary":       "gateway tidak merespons setelah reboot",
//     "resolution_summary":   "menyalakan ulang gateway dan menyegarkan koneksi LLM kamu",
//     "ticket_id":            "T-2026-0142",          // optional, auto-generated if missing
//     "action_required":      "cek dashboard sebentar", // optional, default "tidak ada"
//     "verified_at_label":    "tadi pagi pukul 10.42 WIB" // optional, current-time WIB default
//   }
//
// Responses: same shape family as admin-send-refund-email.

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { handleAdminSendSupportHandoffEmail } from '../_shared/admin-send-support-handoff-email-handler.ts'
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
    const result = await handleAdminSendSupportHandoffEmail(body as never, deps)
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
