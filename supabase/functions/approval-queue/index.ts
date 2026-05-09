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
import { formatApprovalRequest } from '../_shared/approval-telegram-formatter.ts'
import { TelegramBotClient } from '../_shared/telegram-client.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Phase 5-5b: Telegram dispatch client. Constructed with empty platform
// token because we only call sendMessageWithButtonsAs(botToken, ...) —
// the platform token is unused in this Edge Function.
const telegram = new TelegramBotClient({ token: '' })

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

/** Phase 5-5b: dispatch the formatted approval message + inline keyboard
 *  to the customer's Telegram chat. Best-effort — caller wraps in try/catch
 *  and never fails the create response on dispatch errors. */
async function dispatchApprovalToTelegram(row: ApprovalRow): Promise<void> {
  // 1. Look up the customer's bot token (encrypted) + chat id
  const { data: customer, error } = await supabase
    .from('customers')
    .select('telegram_chat_id, telegram_bot_token')
    .eq('id', row.customer_id)
    .maybeSingle()
  if (error || !customer) {
    throw new Error(`customer lookup failed: ${error?.message ?? 'no row'}`)
  }
  const chatId = (customer as { telegram_chat_id: string | null }).telegram_chat_id
  const encryptedToken = (customer as { telegram_bot_token: string | null }).telegram_bot_token
  if (!chatId || !encryptedToken) {
    // Customer hasn't completed pairing yet — silent skip; row stays in
    // the queue so the customer can review via dashboard later.
    return
  }
  if (!BOT_TOKEN_ENC_KEY) {
    throw new Error('BOT_TOKEN_ENC_KEY env var unset')
  }

  // 2. Decrypt the bot token via the pgcrypto RPC helper (Block 2.5)
  const { data: decrypted, error: rpcErr } = await supabase.rpc(
    'decrypt_bot_token',
    { encrypted: encryptedToken, enc_key: BOT_TOKEN_ENC_KEY },
  )
  if (rpcErr || typeof decrypted !== 'string' || !decrypted) {
    throw new Error(`decrypt_bot_token failed: ${rpcErr?.message ?? 'no token'}`)
  }
  const botToken = decrypted

  // 3. Format + dispatch
  const formatted = formatApprovalRequest(
    {
      id: row.id,
      action_kind: row.action_kind,
      action_summary: row.action_summary,
      proposed_by_agent: row.proposed_by_agent,
      expires_at: row.expires_at,
    },
    new Date().toISOString(),
  )
  await telegram.sendMessageWithButtonsAs(
    botToken,
    chatId,
    formatted.text,
    formatted.reply_markup,
  )
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

  // ─── Phase 5-5b: post-create Telegram dispatch (best-effort) ──
  // After a successful create, look up the customer's bot token + chat
  // id, format the approval message, and send via inline-keyboard.
  // Failures are logged but never fail the create — the approval row
  // is the source of truth, the Telegram surface is convenience.
  if (
    result.ok &&
    result.status === 201 &&
    'row' in result.body
  ) {
    const row = result.body.row
    try {
      await dispatchApprovalToTelegram(row)
    } catch (e) {
      console.error('approval-queue: telegram dispatch failed', {
        approval_id: row.id,
        customer_id: row.customer_id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

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
