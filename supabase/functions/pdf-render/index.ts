// Deno Edge Function entry — pdf-render (Phase 2E-3).
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md
// Sub-spec: docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md
// Pure handler: ../_shared/pdf-render-handler.ts
// CF client:    ../_shared/cloudflare-browser-rendering.ts
// Auth helper:  ../_shared/admin-auth.ts
//
// Admin-only endpoint. Called from `invoice-generator-handler` (and
// future doc handlers) to render an HTML doc → PDF, upload to Storage,
// return a 30-day signed URL.
//
// Required env (set via `supabase secrets set` against gtjgsligllbjcisiyrah):
//   - SUPABASE_URL                (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY   (auto-injected — sb_secret_* post-migration)
//   - CLOUDFLARE_ACCOUNT_ID       (founder set 2026-05-08)
//   - CLOUDFLARE_API_TOKEN        (with "Workers Browser Rendering" permission)
//
// Deploy:
//   supabase functions deploy pdf-render --project-ref gtjgsligllbjcisiyrah

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
import {
  pdfRenderHandler,
  type PdfUploader,
} from '../_shared/pdf-render-handler.ts'
import { renderPdfViaCloudflare } from '../_shared/cloudflare-browser-rendering.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Separate bucket per Q5 lock (2026-05-08): logical separation from
// workflow-outputs (HTML), 30-day signed-URL TTL.
const BUCKET = 'pdf-renders'
const SIGNED_URL_TTL_SEC = 30 * 24 * 60 * 60  // 30 days

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const uploader: PdfUploader = async ({ path, bytes, contentType }) => {
  const blob = new Blob([bytes as BlobPart], { type: contentType })
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType,
      upsert: true,
    })
  if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`)

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC)
  if (signError || !signed) {
    throw new Error(`signed-URL generation failed: ${signError?.message ?? 'no data'}`)
  }
  const expires_at = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString()
  return { signed_url: signed.signedUrl, expires_at }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }),
      req,
    )
  }

  if (!isServiceRoleCaller(req)) {
    return withCors(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      req,
    )
  }

  let body: { html: string; storage_path?: string; format?: 'A4' | 'Letter'; margin?: string }
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }),
      req,
    )
  }

  const result = await pdfRenderHandler(body, renderPdfViaCloudflare, uploader)

  if (!result.ok) {
    return withCors(
      new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  return withCors(
    new Response(JSON.stringify(result.body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    req,
  )
})
