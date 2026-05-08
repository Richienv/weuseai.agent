// Deno Edge Function entry — bundle-pull-record (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
// Pure handler: ../_shared/bundle-pull-record-handler.ts
//
// Customer-side telemetry sink. Hermes' bundle-pull script POSTs here
// after each pull attempt. Best-effort write to bundle_pull_attempts;
// non-200 responses don't propagate to customer-facing UX.
//
// Deploy:
//   supabase functions deploy bundle-pull-record --project-ref gtjgsligllbjcisiyrah

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  bundlePullRecordHandler,
  type PullRecordInput,
  type RecordWriter,
} from '../_shared/bundle-pull-record-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }),
      req,
    )
  }

  let body: PullRecordInput
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }),
      req,
    )
  }

  const writer: RecordWriter = async (row) => {
    const { data, error } = await supabase
      .from('bundle_pull_attempts')
      .insert({
        customer_id: row.customer_id,
        agent_slug: row.agent_slug,
        version_requested: row.version_requested ?? null,
        version_installed: row.version_installed ?? null,
        status: row.status,
        error_detail: row.error_detail ?? null,
        bytes_pulled: row.bytes_pulled ?? null,
        duration_ms: row.duration_ms ?? null,
      })
      .select('id')
      .single()
    if (error || !data) {
      return { ok: false, error: error?.message ?? 'no row returned' }
    }
    return { ok: true, id: String((data as { id: number | string }).id) }
  }

  const result = await bundlePullRecordHandler(body, writer)

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
