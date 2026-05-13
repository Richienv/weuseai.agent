// Deno Edge Function entry — retry-pending-provisions.
//
// Sesi A D1 (2026-05-13). Audit §P1-CF-6 Phase 2.
// Pure handler: ../_shared/retry-pending-provisions-handler.ts
// Migration:    ../../migrations/20260513020000_sesi_a_d1_provision_retry_attempts.sql
//
// Deploy:
//   supabase functions deploy retry-pending-provisions --project-ref gtjgsligllbjcisiyrah
//
// Invocation: pg_cron schedule runs every 3 minutes via net.http_post
// (see migration). Customers and the founder never call this directly.
//
// Required env (set automatically by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Required env (set manually):
//   PROVISIONING_URL          — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN   — bearer for the Fly /spin-up route
//   BOT_TOKEN_ENC_KEY         — base64 key for decrypt_bot_token RPC
//                                (same key complete-onboarding uses)
//
// Auth: service-role JWT. The migration's pg_cron schedule passes
// `Authorization: Bearer <service-role-token>`. The Edge Function
// hardens this with an explicit check so a stolen anon JWT can't fire
// retries (defense-in-depth — RLS already blocks anon writes).

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  retryPendingProvisionsHandler,
  PENDING_STALE_AGE_MS,
  type PendingProvisionRow,
  type RetryAttempt,
  type RetryHandlerDeps,
} from '../_shared/retry-pending-provisions-handler.ts'
import type {
  IProvisioningClient,
  SpinUpInput,
  SpinUpResult,
  Tier,
} from '../_shared/types.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Provisioning client (HTTP call to Fly /spin-up) ─────────────────

const provisioning: IProvisioningClient = {
  async spinUp(input: SpinUpInput): Promise<SpinUpResult> {
    const url = PROVISIONING_URL.replace(/\/$/, '') + '/spin-up'
    let r: Response
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + PROVISIONING_AUTH_TOKEN,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, status: 0, body: 'fetch_failed: ' + msg }
    }
    const text = await r.text()
    if (!r.ok) return { ok: false, status: r.status, body: text }
    try {
      const j = JSON.parse(text) as { jobId?: string }
      return { ok: true, jobId: j.jobId ?? 'unknown' }
    } catch {
      return { ok: true, jobId: 'unparseable' }
    }
  },
}

// ─── Real-store implementations of RetryHandlerDeps ──────────────────

async function findStalePendingProvisions(): Promise<PendingProvisionRow[]> {
  const cutoff = new Date(Date.now() - PENDING_STALE_AGE_MS).toISOString()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, customer_id, tier, always_on_enabled, started_at')
    .eq('status', 'pending_provision')
    .lte('started_at', cutoff)
  if (error || !data) return []
  return (data as Array<{
    id: string
    customer_id: string
    tier: Tier
    always_on_enabled: boolean
    started_at: string
  }>).map((r) => ({
    subscription_id: r.id,
    customer_id: r.customer_id,
    tier: r.tier,
    always_on_enabled: r.always_on_enabled,
    subscription_started_at: r.started_at,
  }))
}

async function findLatestAttempt(subscriptionId: string): Promise<RetryAttempt | null> {
  const { data, error } = await supabase
    .from('provision_retry_attempts')
    .select('subscription_id, attempted_at, attempt_number, outcome')
    .eq('subscription_id', subscriptionId)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as RetryAttempt
}

async function buildSpinUpInput(row: PendingProvisionRow): Promise<SpinUpInput | null> {
  // Read customer row + decrypt bot token. Mirrors what
  // complete-onboarding-handler.ts does at first spin-up time.
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('id, telegram_chat_id, soul_md_text')
    .eq('id', row.customer_id)
    .maybeSingle()
  if (custErr || !cust) return null

  // Decrypt bot token via RPC (same path as complete-onboarding).
  const { data: tokRows, error: tokErr } = await supabase
    .rpc('decrypt_bot_token', {
      cust_id: row.customer_id,
      enc_key: BOT_TOKEN_ENC_KEY,
    })
  if (tokErr) return null
  const telegramBotToken = (tokRows && typeof tokRows === 'string') ? tokRows : ''

  // OpenRouter key from customer_openrouter_keys.
  const { data: orRow } = await supabase
    .from('customer_openrouter_keys')
    .select('api_key')
    .eq('customer_id', row.customer_id)
    .maybeSingle()
  const openrouterApiKey = (orRow as { api_key?: string } | null)?.api_key ?? ''

  // Sanity: missing critical fields → return null so the worker logs
  // a one-time "skipped_invalid" + doesn't loop forever.
  if (!telegramBotToken || !cust.telegram_chat_id || !cust.soul_md_text || !openrouterApiKey) {
    return null
  }

  return {
    customerId: row.customer_id,
    tier: row.tier,
    telegramChatId: cust.telegram_chat_id,
    telegramBotToken,
    openrouterApiKey,
    soulMdContent: cust.soul_md_text,
    alwaysOnEnabled: row.always_on_enabled,
  }
}

async function insertAttempt(input: {
  subscription_id: string
  customer_id: string
  attempt_number: number
  outcome: RetryAttempt['outcome']
  detail?: string
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('provision_retry_attempts')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

const deps: RetryHandlerDeps = {
  findStalePendingProvisions,
  findLatestAttempt,
  buildSpinUpInput,
  insertAttempt,
  provisioning,
  log: (msg, extra) => {
    console.log(msg, extra ?? {})
  },
}

// ─── HTTP entry ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Service-role bearer required. The pg_cron schedule supplies this.
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await retryPendingProvisionsHandler(deps)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ ok: false, error: 'internal', detail: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
})
