// Deno Edge Function entry — invoice-generator-handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "Pilot 1: invoice-generator (Doc Expert) — template pattern"
// Phase 2E-3 upgrade: HTML → PDF (via Cloudflare Browser Rendering) +
//                     email delivery (via Resend, stub-tolerant).
//
// Pure handlers:
//   ../_shared/invoice-generator-handler.ts (HTML renderer)
//   ../_shared/pdf-render-handler.ts        (HTML → PDF wrapper)
//   ../_shared/cloudflare-browser-rendering.ts (CF API client)
//   ../_shared/email-delivery.ts            (Resend client, stub mode)
//
// Persists rendered HTML to `workflow-outputs` (back-compat) AND PDF to
// `pdf-renders` (Phase 2E-3, 30-day TTL per Q5 lock). Returns both
// signed URLs. Best-effort email delivery to the customer if their
// email is on file (Resend stub-mode no-ops when key absent).
//
// Deploy:
//   supabase functions deploy invoice-generator-handler --project-ref gtjgsligllbjcisiyrah
//
// Bucket setup (one-time):
//   supabase storage create workflow-outputs --public false
//   supabase storage create pdf-renders     --public false
//
// Required env (Supabase auto-provided + Phase 2E-3 secrets):
//   SUPABASE_URL                    auto
//   SUPABASE_SERVICE_ROLE_KEY       auto
//   CLOUDFLARE_ACCOUNT_ID           founder-set (Phase 2E-3)
//   CLOUDFLARE_API_TOKEN            founder-set (Phase 2E-3)
//   RESEND_API_KEY                  optional — email send activates
//                                   when set; stub-mode otherwise

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
import {
  renderInvoice,
  type InvoiceInput,
} from '../_shared/invoice-generator-handler.ts'
import {
  pdfRenderHandler,
  type PdfUploader,
} from '../_shared/pdf-render-handler.ts'
import { renderPdfViaCloudflare } from '../_shared/cloudflare-browser-rendering.ts'
import { sendEmail, buildInvoiceEmailBody } from '../_shared/email-delivery.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const HTML_BUCKET = 'workflow-outputs'
const HTML_SIGNED_URL_TTL_SEC = 60 * 60 * 24       // 24h, unchanged from Phase 2E-1
const PDF_BUCKET = 'pdf-renders'                    // Phase 2E-3 Q5 lock
const PDF_SIGNED_URL_TTL_SEC = 30 * 24 * 60 * 60    // 30 days

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// PDF uploader closure — passed into the pure handler. Uploads to
// pdf-renders bucket and mints a 30-day signed URL.
const pdfUploader: PdfUploader = async ({ path, bytes, contentType }) => {
  const blob = new Blob([bytes as BlobPart], { type: contentType })
  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, blob, { contentType, upsert: true })
  if (uploadError) throw new Error(`pdf storage upload failed: ${uploadError.message}`)

  const { data: signed, error: signError } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, PDF_SIGNED_URL_TTL_SEC)
  if (signError || !signed) {
    throw new Error(`pdf signed-URL failed: ${signError?.message ?? 'no data'}`)
  }
  const expires_at = new Date(Date.now() + PDF_SIGNED_URL_TTL_SEC * 1000).toISOString()
  return { signed_url: signed.signedUrl, expires_at }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  // Phase 2E-3: admin-only. Called by workflow-execute (server-to-server)
  // and now also potentially by customer-tier-bump → pdf-render pipeline.
  // Reject any non-service-role caller. See docs/security/jwt-role-pattern.md.
  if (!isServiceRoleCaller(req)) {
    return withCors(req, new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
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

  // ── 1. Upload HTML (back-compat). 24h signed URL. ──────────────────
  const htmlPath = `invoices/${body.customer_id}/${rendered.filename}`
  const htmlBlob = new Blob([rendered.html], { type: 'text/html; charset=utf-8' })
  const { error: uploadError } = await supabase.storage
    .from(HTML_BUCKET)
    .upload(htmlPath, htmlBlob, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    })
  if (uploadError) {
    return withCors(req, new Response(JSON.stringify({
      error: 'storage_upload_failed',
      detail: uploadError.message,
    }), { status: 500 }))
  }
  const { data: htmlSigned, error: htmlSignError } = await supabase.storage
    .from(HTML_BUCKET)
    .createSignedUrl(htmlPath, HTML_SIGNED_URL_TTL_SEC)
  if (htmlSignError || !htmlSigned) {
    return withCors(req, new Response(JSON.stringify({
      error: 'signed_url_failed',
      detail: htmlSignError?.message ?? 'unknown',
    }), { status: 500 }))
  }

  // ── 2. Render PDF via Cloudflare Browser Rendering. ────────────────
  // Phase 2E-3: not blocking on failure — the customer still gets the
  // HTML signed URL above, plus a `pdf` field with status='failed' so
  // the caller can surface the partial result.
  const pdfPath = `invoices/${body.customer_id}/${rendered.filename.replace(/\.html?$/, '.pdf')}`
  const pdfResult = await pdfRenderHandler(
    {
      html: rendered.html,
      storage_path: pdfPath,
    },
    renderPdfViaCloudflare,
    pdfUploader,
  )

  // ── 3. Best-effort email delivery (stub-mode when RESEND_API_KEY
  // missing — Phase 2E-3 Q5 follow-up). Look up the customer's email
  // from the customers table; skip silently when not on file.
  let emailStatus: 'sent' | 'stubbed' | 'skipped_no_email' | 'failed' = 'skipped_no_email'
  let emailDetail: string | undefined

  if (pdfResult.ok) {
    const { data: customerRow } = await supabase
      .from('customers')
      .select('email')
      .eq('id', body.customer_id)
      .maybeSingle()
    const customerEmail = (customerRow as { email?: string } | null)?.email
    if (customerEmail) {
      // Re-download the PDF from Storage to attach as bytes (Resend
      // wants base64-encoded content, not a URL — guarantees the
      // recipient keeps the file even after our 30-day TTL expires).
      const { data: pdfBlob } = await supabase.storage
        .from(PDF_BUCKET)
        .download(pdfPath)
      if (pdfBlob) {
        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
        const totalIdr =
          rendered.totals.currency === 'IDR' ? rendered.totals.total : 0
        const { subject, text } = buildInvoiceEmailBody({
          invoice_number: rendered.invoice_number,
          client_name: body.parameters.client_name,
          total_idr: totalIdr,
        })
        const sendResult = await sendEmail({
          to: customerEmail,
          subject,
          text,
          attachment: {
            filename: rendered.filename.replace(/\.html?$/, '.pdf'),
            content: pdfBytes,
            contentType: 'application/pdf',
          },
        })
        if (sendResult.ok) {
          emailStatus = sendResult.stub ? 'stubbed' : 'sent'
          emailDetail = sendResult.stub ? sendResult.reason : sendResult.resend_id
        } else {
          emailStatus = 'failed'
          emailDetail = sendResult.detail ?? sendResult.error
        }
      }
    }
  }

  // ── 4. Compose response. PDF + email payload always present, even
  // when partial (PDF failed or email skipped). Caller decides what to
  // surface to the end user.
  return withCors(req, new Response(JSON.stringify({
    // HTML (back-compat — same shape as Phase 2E-1).
    file_url: htmlSigned.signedUrl,
    format: rendered.format,
    filename: rendered.filename,
    invoice_number: rendered.invoice_number,
    issue_date: rendered.issue_date,
    totals: rendered.totals,
    expires_in_seconds: HTML_SIGNED_URL_TTL_SEC,
    // PDF + email (Phase 2E-3).
    pdf: pdfResult.ok
      ? {
          status: 'rendered',
          file_url: pdfResult.body.signed_url,
          path: pdfResult.body.path,
          bytes: pdfResult.body.bytes,
          expires_at: pdfResult.body.expires_at,
        }
      : {
          status: 'failed',
          error: pdfResult.error,
          detail: pdfResult.detail,
        },
    email: { status: emailStatus, detail: emailDetail },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
