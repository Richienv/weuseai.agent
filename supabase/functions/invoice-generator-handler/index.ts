// Deno Edge Function entry — invoice-generator-handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "Pilot 1: invoice-generator (Doc Expert) — template pattern"
//
// Pure handler: ../_shared/invoice-generator-handler.ts
//
// Persists rendered HTML to Supabase Storage bucket `workflow-outputs`
// at path `invoices/<customer_id>/<filename>`, returns a 24h signed URL.
//
// Deploy:
//   supabase functions deploy invoice-generator-handler --project-ref gtjgsligllbjcisiyrah
//
// Bucket setup (one-time, before first run):
//   supabase storage create workflow-outputs --public false
//
// Required env (Supabase auto-provided):
//   SUPABASE_URL                    auto
//   SUPABASE_SERVICE_ROLE_KEY       auto

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  renderInvoice,
  type InvoiceInput,
} from '../_shared/invoice-generator-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'workflow-outputs'
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24  // 24h

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  let body: { customer_id: string; parameters: InvoiceInput }
  try {
    body = await req.json()
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }))
  }

  if (!body.customer_id || typeof body.customer_id !== 'string') {
    return withCors(req, new Response(JSON.stringify({ error: 'missing_customer_id' }), { status: 400 }))
  }
  if (!body.parameters || typeof body.parameters !== 'object') {
    return withCors(req, new Response(JSON.stringify({ error: 'missing_parameters' }), { status: 400 }))
  }

  let rendered
  try {
    rendered = renderInvoice(body.parameters)
  } catch (e) {
    return withCors(req, new Response(JSON.stringify({
      error: 'render_failed',
      detail: e instanceof Error ? e.message : String(e),
    }), { status: 500 }))
  }

  // Upload to Storage.
  const path = `invoices/${body.customer_id}/${rendered.filename}`
  const blob = new Blob([rendered.html], { type: 'text/html; charset=utf-8' })
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    })
  if (uploadError) {
    return withCors(req, new Response(JSON.stringify({
      error: 'storage_upload_failed',
      detail: uploadError.message,
    }), { status: 500 }))
  }

  // Mint signed URL.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)
  if (signError || !signed) {
    return withCors(req, new Response(JSON.stringify({
      error: 'signed_url_failed',
      detail: signError?.message ?? 'unknown',
    }), { status: 500 }))
  }

  return withCors(req, new Response(JSON.stringify({
    file_url: signed.signedUrl,
    format: rendered.format,
    filename: rendered.filename,
    invoice_number: rendered.invoice_number,
    issue_date: rendered.issue_date,
    totals: rendered.totals,
    expires_in_seconds: SIGNED_URL_EXPIRY_SECONDS,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
