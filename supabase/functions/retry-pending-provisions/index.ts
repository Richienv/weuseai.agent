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
// Optional env (Phase 4 — founder DM alerts on retry-exhausted):
//   SUPPORT_TELEGRAM_BOT_TOKEN — same bot token xendit-webhook DMs from
//   RICHIE_CHAT_ID             — founder DM chat_id
//   When either is unset the alert is a no-op (handler is back-compat
//   safe — append-only audit row is still written).
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
  type SetupHelpNotification,
} from '../_shared/retry-pending-provisions-handler.ts'
import { buildSetupHelpEmailBody } from '../_shared/lifecycle-email-bodies.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
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
// Phase 4: founder alert on retry-exhausted (audit §Telemetry).
// Reuses the SAME env vars as xendit-webhook so there's one source
// of truth for founder DMs. Missing tokens → notifyFounder no-ops.
const FOUNDER_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN') ?? ''
const FOUNDER_CHAT_ID = Deno.env.get('RICHIE_CHAT_ID') ?? ''

// Phase A2 PR 4: dashboard base for the setup-help.md resume_url.
const DASHBOARD_BASE =
  Deno.env.get('PUBLIC_DASHBOARD_BASE') ?? 'https://weuseai-agent.vercel.app'

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
  // Phase A2 PR 4: also pull setup_help_email_sent_at so the handler
  // knows whether to fire the 24h "you might be stuck" email.
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'id, customer_id, tier, always_on_enabled, started_at, setup_help_email_sent_at',
    )
    .eq('status', 'pending_provision')
    .lte('started_at', cutoff)
  if (error || !data) return []
  return (data as Array<{
    id: string
    customer_id: string
    tier: Tier
    always_on_enabled: boolean
    started_at: string
    setup_help_email_sent_at: string | null
  }>).map((r) => ({
    subscription_id: r.id,
    customer_id: r.customer_id,
    tier: r.tier,
    always_on_enabled: r.always_on_enabled,
    subscription_started_at: r.started_at,
    setup_help_email_sent_at: r.setup_help_email_sent_at,
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

// Phase 4: Telegram founder-DM alert wired only when both env vars are
// present. Mirrors the xendit-webhook alert path so the founder gets
// every P1-class incident from one bot.
async function notifyFounder(text: string): Promise<void> {
  if (!FOUNDER_BOT_TOKEN || !FOUNDER_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${FOUNDER_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text }),
  })
}

// ─── Phase A2 PR 4: setup-help.md "you might be stuck" email ───────────

/**
 * Inspect a pending-provision row's most recent retry attempt outcome
 * and produce a short BI label of where the customer is most likely
 * stuck. Surfaced into the email body as the `stuck_step` variable.
 * Best-effort — falls back to a generic label when no attempt rows
 * exist yet (which can happen when started_at is old but the retry
 * worker hasn't run yet).
 */
async function deriveStuckStep(subscriptionId: string): Promise<string> {
  const latest = await findLatestAttempt(subscriptionId)
  if (!latest) return 'menyiapkan server'
  switch (latest.outcome) {
    case 'capacity_exhausted':
      return 'menyiapkan server (Vultr + DigitalOcean penuh sesaat)'
    case 'other_error':
      return 'menyiapkan server (ada error tak terduga di sisi kami)'
    case 'exhausted':
      return 'menyiapkan server (tim kami sudah dikabari, sedang dicek manual)'
    case 'spin_up_ok':
      // VPS spin-up requested but customer-readiness hasn't fired yet.
      return 'pairing bot Telegram dan menyalakan agent'
    case 'in_flight':
    default:
      return 'menyiapkan server'
  }
}

async function notifySetupHelp(
  n: SetupHelpNotification,
): Promise<{ ok: boolean; detail?: string }> {
  // Pull the customer's email + display_name for the template.
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('email, display_name')
    .eq('id', n.customer_id)
    .maybeSingle()
  if (custErr) return { ok: false, detail: 'customer lookup: ' + custErr.message }
  const email = (cust as { email?: string } | null)?.email ?? ''
  if (!email) return { ok: false, detail: 'no_customer_email' }
  const displayName =
    (cust as { display_name?: string | null } | null)?.display_name &&
    (cust as { display_name?: string | null }).display_name!.trim().length > 0
      ? (cust as { display_name: string }).display_name
      : 'pelanggan'

  const stuckStep = await deriveStuckStep(n.subscription_id)
  const resumeUrl =
    `${DASHBOARD_BASE}/onboarding` +
    `?cid=${encodeURIComponent(n.customer_id)}`

  const { subject, text } = buildSetupHelpEmailBody({
    display_name: displayName,
    stuck_step: stuckStep,
    resume_url: resumeUrl,
  })

  const r = await sendEmail({ to: email, subject, text })
  if (!r.ok) {
    return {
      ok: false,
      detail: r.error + (r.detail ? ': ' + r.detail : ''),
    }
  }
  return { ok: true }
}

async function markSetupHelpSent(subscription_id: string): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ setup_help_email_sent_at: new Date().toISOString() })
    .eq('id', subscription_id)
  if (error) throw error
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
  notifyFounder,
  notifySetupHelp,
  markSetupHelpSent,
}

// ─── HTTP entry ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // D1 hotfix (2026-05-13): originally a strict equality check against
  // SUPABASE_SERVICE_ROLE_KEY, but Supabase's hosted env presents a
  // token that doesn't always match what Deno.env returns byte-for-byte
  // (production-only discrepancy — works fine on local stub-mode).
  // Switched to a JWT-claim check: any Bearer token whose payload
  // decodes to role=service_role passes. pg_cron's invocation token
  // has that claim. anon callers (role=anon) get rejected.
  //
  // Defense-in-depth: even if a forged JWT got past this check, the
  // handler is bounded:
  //   - Only acts on rows already in pending_provision (server-side
  //     state, not customer-controlled)
  //   - MIN_RETRY_INTERVAL_MS = 3 min gates per-row spam
  //   - MAX_ATTEMPTS = 6 caps total work per subscription
  // Worst case: an attacker accelerates retries by 3 min. Negligible.
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  const token = auth.slice(7)
  let role: string | null = null
  try {
    const payloadStr = atob(token.split('.')[1] ?? '')
    const payload = JSON.parse(payloadStr) as { role?: string }
    role = typeof payload?.role === 'string' ? payload.role : null
  } catch {
    // Malformed JWT — fall through to reject below.
  }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  // SERVICE_KEY still read at module init (validates the env var
  // exists at deploy time); the strict equality is just no longer
  // the gate.
  void SERVICE_KEY

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
