// Deno Edge Function entry — template-no-match-log.
//
// P1 of the 2026-05-22 strict template-fetch flow. When a persona's
// `template_fetch_required: true` skill cannot match the customer's
// request to any library template, the agent calls this to record the
// miss. Founder reviews accumulated misses monthly via
// api/admin/observability/template-no-match.ts.
//
// Pure handler: ../_shared/template-no-match-log-handler.ts
//
// Deploy:
//   supabase functions deploy template-no-match-log \
//     --project-ref gtjgsligllbjcisiyrah --use-api --no-verify-jwt
//
// Auth: X-CID header must equal body.customer_id (same gate as
// customer-progress-proxy + flow-state).

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleTemplateNoMatchLog,
  type TemplateNoMatchInput,
  type TemplateNoMatchRow,
  type TemplateNoMatchStore,
} from '../_shared/template-no-match-log-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// @ts-ignore — Deno-typed client
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const COLS =
  'id, customer_id, persona_slug, skill_id, requested_deliverable, match_context, created_at'

const store: TemplateNoMatchStore = {
  async insert(input) {
    const { data, error } = await supabase
      .from('template_no_match_log')
      .insert(input)
      .select(COLS)
      .single()
    if (error) throw error
    return data as TemplateNoMatchRow
  },
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

  let body: Partial<TemplateNoMatchInput> = {}
  try {
    body = (await req.json()) as Partial<TemplateNoMatchInput>
  } catch {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 400, error: 'bad_json' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  const input: TemplateNoMatchInput = {
    customer_id: body.customer_id ?? '',
    x_cid: req.headers.get('x-cid'),
    persona_slug: body.persona_slug ?? '',
    skill_id: body.skill_id ?? '',
    requested_deliverable: body.requested_deliverable ?? '',
    match_context: body.match_context,
  }

  let result
  try {
    result = await handleTemplateNoMatchLog(input, store)
  } catch (e) {
    result = {
      ok: false as const,
      status: 400 as const,
      error: 'insert_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const status = result.ok ? 200 : result.status
  return withCors(
    new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    req,
  )
})
