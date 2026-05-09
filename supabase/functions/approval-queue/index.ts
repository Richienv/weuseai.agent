// Phase 5-3.b: approval-queue Deno Edge Function entry.
//
// Pure handler: ../_shared/approval-queue-handler.ts
// Schema: approval_requests (Phase 5-1.a)
//
// Three modes derived from method + path/query:
//   POST /approval-queue                              → create
//   GET  /approval-queue?customer_id=<uuid>           → list
//   POST /approval-queue?id=<uuid>&decision=approve   → decide (approve/reject)
//
// Deploy:
//   supabase functions deploy approval-queue \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// (no-verify-jwt: customer-side and BD v3 callers don't have a Supabase
//  JWT. Multi-tenant scoping enforced at handler layer; full per-customer
//  auth deferred to Phase 5-3c.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  approvalQueueHandler,
  type ApprovalRow,
  type ApprovalRowMutator,
  type ApprovalRowReader,
  type ApprovalRowWriter,
  type ApprovalStatus,
  type HandlerInput,
} from '../_shared/approval-queue-handler.ts'

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

// ─── Injected dependencies ─────────────────────────────────────────

const reader: ApprovalRowReader = async ({ customer_id, status }) => {
  let q = supabase
    .from('approval_requests')
    .select(
      'id, customer_id, action_kind, action_summary, action_payload, proposed_by_agent, status, approved_by, approved_at, expires_at, created_at',
    )
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error || !data) return []
  return data as ApprovalRow[]
}

const writer: ApprovalRowWriter = async (input) => {
  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      customer_id: input.customer_id,
      action_kind: input.action_kind,
      action_summary: input.action_summary,
      action_payload: input.action_payload,
      proposed_by_agent: input.proposed_by_agent,
      status: 'pending' as ApprovalStatus,
      expires_at: input.expires_at,
    })
    .select()
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'no row returned' }
  }
  return { ok: true, row: data as ApprovalRow }
}

const mutator: ApprovalRowMutator = async (id, updates) => {
  const { data, error } = await supabase
    .from('approval_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'no row updated' }
  }
  return { ok: true, row: data as ApprovalRow }
}

// ─── Deno entry ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const url = new URL(req.url)
  const query = Object.fromEntries(url.searchParams.entries()) as Record<
    string,
    string | undefined
  >

  const method = req.method

  let input: HandlerInput
  if (method === 'GET') {
    input = { method: 'GET', mode: 'list', query }
  } else if (method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      // empty body acceptable for decide
      body = {}
    }
    if (query.id && query.decision) {
      input = { method: 'POST', mode: 'decide', query, body }
    } else {
      input = { method: 'POST', mode: 'create', body }
    }
  } else {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  const result = await approvalQueueHandler(input, {
    reader,
    writer,
    mutator,
    now: () => new Date().toISOString(),
  })

  if (!result.ok) {
    return withCors(
      new Response(
        JSON.stringify({ error: result.error, detail: result.detail }),
        {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
      req,
    )
  }

  return withCors(
    new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    }),
    req,
  )
})
