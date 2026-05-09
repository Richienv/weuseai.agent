// Phase 4-5b: hermes-kanban-proxy Deno Edge Function entry.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-5b)
// Pure handler: ../_shared/hermes-kanban-proxy-handler.ts
// Schema: supabase/migrations/20260510120000_phase_4_5b_hermes_kanban_mirror.sql
//
// Customer VPS Hermes runtime POSTs board snapshots here on update. We:
//   1. Validate input + customer ownership (handler).
//   2. Atomically upsert hermes_kanban_boards + hermes_kanban_tasks.
//      Tasks: full replace (delete-by-board_id then insert). Bounded by
//      board task count which is small (~100s, not 100k).
//
// Deploy:
//   supabase functions deploy hermes-kanban-proxy \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// (no-verify-jwt: customer VPS Hermes does not have a Supabase JWT;
//  customer_id existence check is the multi-tenant gate. Same convention
//  as bundle-pull-record / bundle-fetch.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  hermesKanbanProxyHandler,
  type ProxyInput,
  type CustomerExistsCheck,
  type BoardMirrorWriter,
  type CustomerTokenVerifier,
  type Task,
} from '../_shared/hermes-kanban-proxy-handler.ts'
import {
  extractBearerToken,
  verifyCustomerToken,
} from '../_shared/hermes-instance-auth.ts'

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

// ─── Injected dependencies ─────────────────────────────────────────────

const customerExists: CustomerExistsCheck = async (customer_id) => {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .maybeSingle()
  if (error) {
    // Treat lookup error as "not found" so we 404 rather than 500.
    // The downstream caller can retry; we don't want to flood logs with
    // false 500s on transient PG hiccups.
    return false
  }
  return data !== null
}

const writer: BoardMirrorWriter = async ({ board, hermes_version }) => {
  // 1. Upsert hermes_kanban_boards — full row replacement (board_jsonb
  //    holds the source-of-truth snapshot).
  const { error: boardError } = await supabase
    .from('hermes_kanban_boards')
    .upsert(
      {
        id: board.id,
        customer_id: board.customer_id,
        title: board.title,
        board_jsonb: board,
        hermes_version,
        created_at: board.created_at,
        updated_at: board.updated_at,
        mirrored_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  if (boardError) {
    return { ok: false, error: `boards upsert: ${boardError.message}` }
  }

  // 2. Replace hermes_kanban_tasks for this board (delete + insert).
  //    Bounded by board task count; small enough for a single pair of
  //    PostgREST calls. No transaction — but the delete-then-insert
  //    pattern is acceptable here because the proxy is the only writer
  //    and concurrent calls for the same board are rare.
  const { error: deleteError } = await supabase
    .from('hermes_kanban_tasks')
    .delete()
    .eq('board_id', board.id)
  if (deleteError) {
    return { ok: false, error: `tasks delete: ${deleteError.message}` }
  }

  const taskRows = Object.values(board.tasks).map((t: Task) => ({
    board_id: board.id,
    task_id: t.id,
    title: t.title,
    owner_persona: t.owner_persona,
    status: t.status,
    due_date: t.due_date ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    mirrored_at: new Date().toISOString(),
  }))

  if (taskRows.length > 0) {
    const { error: insertError } = await supabase
      .from('hermes_kanban_tasks')
      .insert(taskRows)
    if (insertError) {
      return { ok: false, error: `tasks insert: ${insertError.message}` }
    }
  }

  return {
    ok: true,
    board_id: board.id,
    task_count: taskRows.length,
  }
}

// ─── Deno entry ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  let body: ProxyInput
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  // Phase 5-3.c: parse Authorization header + wire HMAC verifier when
  // HERMES_INSTANCE_HMAC_KEY is set. Backward-compat: if env var is unset,
  // verifier is omitted and the handler falls back to MVP customer
  // existence check only.
  body.bearer_token = extractBearerToken(req.headers.get('authorization'))
  const HMAC_KEY = Deno.env.get('HERMES_INSTANCE_HMAC_KEY') ?? ''
  const verifier: CustomerTokenVerifier | undefined = HMAC_KEY
    ? (claimed_id, token) =>
        verifyCustomerToken(claimed_id, token ?? '', HMAC_KEY)
    : undefined

  const result = await hermesKanbanProxyHandler(
    body,
    customerExists,
    writer,
    verifier,
  )

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
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    req,
  )
})
