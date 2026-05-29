/**
 * Vercel Function: POST /api/admin/customer-action
 *
 * Combined action dispatcher for the cookie-gated admin pages. Body:
 *   { action, ...args }
 *
 * Supported actions:
 *   - manual_provision    — Path 1 manual customer onboarding
 *                           (mirrors what the deleted admin-app sub-app did)
 *   - resend_onboarding   — re-send welcome email to an existing customer
 *   - restart_gateway     — STUB
 *   - mark_refunded       — STUB
 *   - escalate            — STUB
 *
 * Consolidated to stay under the Vercel Hobby Functions limit. The
 * stubs return `{ ok: false, todo: ... }` matching the contract the
 * deleted sub-app exposed.
 */

import { createHash } from 'node:crypto'

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'
import {
  isTier,
  personasForTier,
  setupFeeForTier,
  type Tier as CatalogTier,
} from '../_shared/tier-catalog.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'noreply@weuseai.agent'
const PROVISIONING_URL = process.env.PROVISIONING_URL ?? ''
const PROVISIONING_AUTH_TOKEN = process.env.PROVISIONING_AUTH_TOKEN ?? ''
const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL ?? ''
const ONBOARDING_BASE_URL =
  process.env.ONBOARDING_BASE_URL ?? 'https://weuseai-agent.vercel.app'
const BOT_TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]{20,}$/

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

type ActionKind =
  | 'manual_provision'
  | 'manual_provision_v2'
  | 'resend_onboarding'
  | 'restart_gateway'
  | 'mark_refunded'
  | 'escalate'
const ACTIONS: ActionKind[] = [
  'manual_provision',
  'manual_provision_v2',
  'resend_onboarding',
  'restart_gateway',
  'mark_refunded',
  'escalate',
]

type Tier = 'starter' | 'pro' | 'studio'
type PaymentMethod = 'manual_bank_transfer' | 'manual_qris' | 'manual_wise' | 'other'

const PAYMENT_METHODS: PaymentMethod[] = [
  'manual_bank_transfer',
  'manual_qris',
  'manual_wise',
  'other',
]

// Mirrors supabase/functions/_shared/tier-personas.ts (D1 lock 2026-05-12).
// Keep in lockstep with /admin/assets/admin-shared.js PERSONA_OPTIONS.
const PERSONA_TIER: Record<string, Tier> = {
  'the-pro': 'starter',
  'doc-expert': 'starter',
  'slide-master': 'starter',
  'deep-researcher': 'pro',
  'trade-pro': 'pro',
  'project-conductor': 'pro',
  'video-producer': 'pro',
  'social-conductor': 'pro',
  'web-app-builder': 'studio',
  'business-agent': 'studio',
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'content-type': 'application/json',
    accept: 'application/json',
  }
}

// ─── manual_provision ───────────────────────────────────────────────────

function buildManualProvisionWelcomeEmail(args: { display_name: string; tier: Tier }): {
  subject: string
  text: string
} {
  return {
    subject: 'Pembayaran kamu kami terima — weuseai.agent',
    text: [
      `Halo ${args.display_name},`,
      ``,
      `Pembayaran setup weuseai.agent kamu (paket ${args.tier}) sudah kami terima.`,
      `Terima kasih.`,
      ``,
      `Agent kamu lagi disiapkan. Kami kirim email aktivasi terpisah dengan link`,
      `ke dashboard onboarding begitu siap.`,
      ``,
      `Butuh bantuan atau perlu pengembalian dana?`,
      `Lihat https://weuseai-agent.vercel.app/refund-policy atau balas email ini.`,
      ``,
      `— weuseai.agent`,
      `Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.`,
    ].join('\n'),
  }
}

async function sendEmail(args: {
  to: string
  subject: string
  text: string
}): Promise<'sent' | 'stub' | 'failed'> {
  if (!RESEND_API_KEY) return 'stub'
  try {
    const r = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [args.to],
        subject: args.subject,
        text: args.text,
      }),
    })
    if (!r.ok) return 'failed'
    return 'sent'
  } catch {
    return 'failed'
  }
}

async function handleManualProvision(body: Record<string, unknown>, res: VercelResponse): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const display_name = String(body.display_name ?? '').trim()
  const persona_slug = String(body.persona_slug ?? '')
  const amountRaw = body.amount_idr
  const payment_method = String(body.payment_method ?? '')
  const payment_reference = body.payment_reference ? String(body.payment_reference).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'Email customer tidak valid.' })
    return
  }
  if (!display_name) {
    res.status(400).json({ ok: false, error: 'Nama display wajib diisi.' })
    return
  }
  if (!persona_slug || !(persona_slug in PERSONA_TIER)) {
    res.status(400).json({ ok: false, error: 'Persona tidak valid.' })
    return
  }
  const tier: Tier = PERSONA_TIER[persona_slug]
  const amount_idr =
    typeof amountRaw === 'number'
      ? amountRaw
      : typeof amountRaw === 'string'
        ? parseInt(amountRaw, 10)
        : NaN
  if (!Number.isFinite(amount_idr) || amount_idr <= 0) {
    res.status(400).json({ ok: false, error: 'Jumlah bayar harus angka positif.' })
    return
  }
  if (!PAYMENT_METHODS.includes(payment_method as PaymentMethod)) {
    res.status(400).json({ ok: false, error: 'Metode bayar tidak valid.' })
    return
  }

  // Step 1: lookup or insert customer.
  let customer_id: string
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=id,display_name&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: supabaseHeaders() },
  )
  if (!lookupRes.ok) {
    res.status(500).json({
      ok: false,
      error: `Gagal lookup customer: ${lookupRes.status}: ${(await lookupRes.text()).slice(0, 200)}`,
    })
    return
  }
  const lookupArr = (await lookupRes.json()) as { id: string; display_name: string | null }[]
  if (lookupArr[0]) {
    customer_id = lookupArr[0].id
    if (!lookupArr[0].display_name) {
      await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}`, {
        method: 'PATCH',
        headers: supabaseHeaders(),
        body: JSON.stringify({ display_name }),
      })
    }
  } else {
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), prefer: 'return=representation' },
      body: JSON.stringify({ email, display_name }),
    })
    if (!insRes.ok) {
      res.status(500).json({
        ok: false,
        error: `Gagal insert customer: ${insRes.status}: ${(await insRes.text()).slice(0, 300)}`,
      })
      return
    }
    const insArr = (await insRes.json()) as { id: string }[]
    if (!insArr[0]?.id) {
      res.status(500).json({ ok: false, error: 'insert_no_id' })
      return
    }
    customer_id = insArr[0].id
  }

  // Step 2: subscription.
  const subRes = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), prefer: 'return=representation' },
    body: JSON.stringify({ customer_id, tier, status: 'active', hosting_active: true }),
  })
  if (!subRes.ok) {
    res.status(500).json({
      ok: false,
      error: `Gagal insert subscription: ${subRes.status}: ${(await subRes.text()).slice(0, 300)}`,
    })
    return
  }
  const subArr = (await subRes.json()) as { id: string }[]
  const subscription_id = subArr[0]?.id
  if (!subscription_id) {
    res.status(500).json({ ok: false, error: 'sub_no_id' })
    return
  }

  // Step 3: audit (best-effort).
  const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/manual_provisions`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({
      customer_id,
      subscription_id,
      created_by: 'admin',
      payment_method,
      payment_reference,
      amount_idr,
      persona_slug,
      tier,
      notes,
    }),
  })
  const auditError = auditRes.ok ? null : `${auditRes.status}: ${(await auditRes.text()).slice(0, 200)}`

  // Step 4: email (best-effort).
  const emailBody = buildManualProvisionWelcomeEmail({ display_name, tier })
  const email_status = await sendEmail({
    to: email,
    subject: emailBody.subject,
    text: emailBody.text,
  })

  const baseMsg =
    `Customer ${email} berhasil di-provision. ` +
    `Subscription ID: ${subscription_id}. ` +
    `Cek Tab 2 (Customer List) buat status VPS.`
  const auditMsg = auditError ? ` (Catatan: audit row gagal disimpan — ${auditError})` : ''
  const emailMsg =
    email_status === 'sent'
      ? ' Email welcome terkirim.'
      : email_status === 'stub'
        ? ' Email welcome di-skip (RESEND_API_KEY belum di-set).'
        : ' Email welcome gagal terkirim — cek log.'

  res.status(200).json({
    ok: true,
    customer_id,
    subscription_id,
    email_status,
    message: baseMsg + auditMsg + emailMsg,
  })
}

// ─── manual_provision_v2 ────────────────────────────────────────────────
//
// v2 flow:
//   1. validate inputs (cookie auth + email + tier + amount + payment method
//      + concierge bot-token format)
//   2. create / lookup customer (sets agent_slug = first persona of tier)
//   3. create subscription (status=active, tier, always_on=false)
//   4. write audit row with extended v2 columns
//   5. fire-and-forget VPS spin-up (PROVISIONING_URL/spin-up) — don't
//      block the form; on failure we mark vps_provisioning_status='failed'
//      in the response and keep the DB rows so founder can retry
//   6. concierge mode (optional): call validate-bot-token Edge Function
//      with founder-supplied bot token, then complete-onboarding to send
//      the proactive greeting once the VPS is up. STUBBED — see comment
//      block in handleManualProvisionV2 for the wiring contract.
//   7. email: send welcome via Resend when RESEND_API_KEY is set, else
//      surface onboarding URL in response so founder can DM via WhatsApp
//   8. return success card payload OR partial-failure payload (with
//      completed_steps + failed_step) — form preserves inputs on partial
//      failure so founder can adjust + re-submit
//
// Partial failures: customer + subscription rows persist (audit trail
// is the point — don't rollback). The response says exactly which step
// failed and what was already done.

function hashBotToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

type SpinUpStatus = 'initiated' | 'failed' | 'skipped'

async function triggerVpsSpinUp(args: {
  customerId: string
  tier: CatalogTier
  agentSlug: string
}): Promise<{ status: SpinUpStatus; vps_id: string | null; error: string | null }> {
  if (!PROVISIONING_URL || !PROVISIONING_AUTH_TOKEN) {
    return {
      status: 'skipped',
      vps_id: null,
      error: 'PROVISIONING_URL / PROVISIONING_AUTH_TOKEN not set — VPS spin-up skipped.',
    }
  }
  try {
    const r = await fetch(`${PROVISIONING_URL.replace(/\/$/, '')}/spin-up`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        customerId: args.customerId,
        tier: args.tier,
        // Manual provision: founder has not collected a bot token from the
        // customer (unless concierge mode runs separately) — pass empty so
        // setup-script defers bot start to refresh-env, matching the new-
        // customer back-compat path in xendit-webhook-handler.
        customerTelegramBotToken: '',
        alwaysOnEnabled: false,
        useStarterCredits: args.tier === 'starter',
        agentSlug: args.agentSlug,
      }),
    })
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 300)
      return { status: 'failed', vps_id: null, error: `HTTP ${r.status}: ${detail}` }
    }
    const json = (await r.json().catch(() => ({}))) as {
      vps_instance_id?: string
      jobId?: string
    }
    const vps_id = json.vps_instance_id ?? json.jobId ?? null
    return { status: 'initiated', vps_id, error: null }
  } catch (e) {
    return {
      status: 'failed',
      vps_id: null,
      error: `threw: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

type ConciergeOutcome = {
  // 'ready' = token validated + pairing code minted; the customer's one
  // remaining step is to send `/pair <code>` to the bot. We deliberately
  // do NOT call this 'paired' — chat_id binds only after the customer
  // sends the code (see VERIFIED FACTS in the v2.1 PR).
  status: 'ready' | 'failed' | 'skipped'
  bot_username: string | null
  pairing_code: string | null
  pairing_code_expires_at: string | null
  error: string | null
}

async function runConciergePair(args: {
  customerId: string
  botToken: string
}): Promise<ConciergeOutcome> {
  // Concierge mode (v2.1) composes 2 Edge Functions in sequence:
  //   1. validate-bot-token  → encrypts + persists the bot token on the
  //                            customers row, registers the Telegram
  //                            webhook, returns the bot username.
  //   2. rotate-pairing-code → mints a one-time 6-digit pairing code +
  //                            expiry the founder relays to the customer.
  //
  // The customer's ONE remaining step is to open the bot and send
  // `/pair <code>`. chat_id binds only on that command (deliberate
  // security control in pair-customer-bot-webhook-handler.ts — any other
  // message is a silent no-op). complete-onboarding gates on chat_id, so
  // it is NOT called here — it fires automatically through the existing
  // post-pair flow once the customer sends the code, which then sends the
  // proactive greeting. The concierge value: customer skips minting the
  // BotFather token (founder did it) AND skips the welcome-page visit
  // (founder relays the bot link + code directly).
  if (!SUPABASE_FUNCTIONS_URL) {
    return {
      status: 'skipped',
      bot_username: null,
      pairing_code: null,
      pairing_code_expires_at: null,
      error: 'SUPABASE_FUNCTIONS_URL not set — concierge skipped.',
    }
  }
  const fnBase = SUPABASE_FUNCTIONS_URL.replace(/\/$/, '')
  const fnHeaders = {
    'content-type': 'application/json',
    // anon-with-cid auth model — same as the customer-facing welcome flow
    ...(SUPABASE_SERVICE_KEY ? { authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } : {}),
  }

  // Step 1: validate-bot-token (validates + registers webhook + returns username).
  let bot_username: string | null
  try {
    const r = await fetch(`${fnBase}/validate-bot-token`, {
      method: 'POST',
      headers: fnHeaders,
      body: JSON.stringify({
        customer_id: args.customerId,
        bot_token: args.botToken,
      }),
    })
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 300)
      return {
        status: 'failed',
        bot_username: null,
        pairing_code: null,
        pairing_code_expires_at: null,
        error: `validate HTTP ${r.status}: ${detail}`,
      }
    }
    const json = (await r.json().catch(() => ({}))) as { bot_username?: string }
    bot_username = json.bot_username ?? null
  } catch (e) {
    return {
      status: 'failed',
      bot_username: null,
      pairing_code: null,
      pairing_code_expires_at: null,
      error: `concierge validate threw: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // Step 2: rotate-pairing-code (mints the 6-digit code the founder relays).
  try {
    const r = await fetch(`${fnBase}/rotate-pairing-code`, {
      method: 'POST',
      headers: fnHeaders,
      body: JSON.stringify({ customer_id: args.customerId }),
    })
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 300)
      // Token already validated + webhook set; only the code mint failed.
      // Surface bot_username so the founder still has the bot link, and
      // report the failure so the card shows it.
      return {
        status: 'failed',
        bot_username,
        pairing_code: null,
        pairing_code_expires_at: null,
        error: `rotate-pairing-code HTTP ${r.status}: ${detail}`,
      }
    }
    const json = (await r.json().catch(() => ({}))) as {
      code?: string
      expires_at?: string
    }
    return {
      status: 'ready',
      bot_username,
      pairing_code: json.code ?? null,
      pairing_code_expires_at: json.expires_at ?? null,
      error: null,
    }
  } catch (e) {
    return {
      status: 'failed',
      bot_username,
      pairing_code: null,
      pairing_code_expires_at: null,
      error: `concierge rotate threw: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

export async function handleManualProvisionV2(
  body: Record<string, unknown>,
  res: VercelResponse,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const display_name = String(body.display_name ?? '').trim()
  const tierRaw = String(body.tier ?? '')
  const amountRaw = body.amount_idr
  const payment_method = String(body.payment_method ?? '')
  const payment_reference = body.payment_reference ? String(body.payment_reference).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null
  const concierge_mode = body.concierge_mode === true
  const bot_token_raw = typeof body.bot_token === 'string' ? body.bot_token.trim() : ''
  const concierge_expectations =
    typeof body.concierge_expectations === 'string' ? body.concierge_expectations.trim() : ''

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'Email customer tidak valid.' })
    return
  }
  if (!display_name) {
    res.status(400).json({ ok: false, error: 'Nama display wajib diisi.' })
    return
  }
  if (!isTier(tierRaw)) {
    res.status(400).json({ ok: false, error: 'Tier tidak valid (pilih starter / pro / studio).' })
    return
  }
  const tier: CatalogTier = tierRaw
  const personas = personasForTier(tier)
  const defaultPersona = personas[0] // The Pro — default-at-index-0 invariant

  const amount_idr =
    typeof amountRaw === 'number'
      ? amountRaw
      : typeof amountRaw === 'string'
        ? parseInt(amountRaw, 10)
        : NaN
  if (!Number.isFinite(amount_idr) || amount_idr <= 0) {
    res.status(400).json({ ok: false, error: 'Jumlah bayar harus angka positif.' })
    return
  }
  if (!PAYMENT_METHODS.includes(payment_method as PaymentMethod)) {
    res.status(400).json({ ok: false, error: 'Metode bayar tidak valid.' })
    return
  }
  if (concierge_mode) {
    if (!bot_token_raw) {
      res.status(400).json({ ok: false, error: 'Concierge mode butuh BotFather token.' })
      return
    }
    if (!BOT_TOKEN_FORMAT.test(bot_token_raw)) {
      res.status(400).json({
        ok: false,
        error: 'Format BotFather token tidak valid (harus <digits>:<35+ chars>).',
      })
      return
    }
  }

  const tier_default_amount = setupFeeForTier(tier)
  const price_override = amount_idr !== tier_default_amount

  const completed_steps: string[] = []

  // Step 1 / 2: customer (lookup or insert).
  let customer_id: string
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=id,display_name&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: supabaseHeaders() },
  )
  if (!lookupRes.ok) {
    res.status(500).json({
      ok: false,
      partial_success: true,
      completed_steps,
      failed_step: 'customer_lookup',
      error: `Gagal lookup customer: ${lookupRes.status}`,
    })
    return
  }
  const lookupArr = (await lookupRes.json()) as { id: string; display_name: string | null }[]
  if (lookupArr[0]) {
    customer_id = lookupArr[0].id
    // Patch display_name + agent_slug if first-encounter for v2.
    await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}`, {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        ...(lookupArr[0].display_name ? {} : { display_name }),
        agent_slug: defaultPersona,
      }),
    })
  } else {
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), prefer: 'return=representation' },
      body: JSON.stringify({ email, display_name, agent_slug: defaultPersona }),
    })
    if (!insRes.ok) {
      res.status(500).json({
        ok: false,
        partial_success: true,
        completed_steps,
        failed_step: 'customer_insert',
        error: `Gagal insert customer: ${insRes.status}: ${(await insRes.text()).slice(0, 200)}`,
      })
      return
    }
    const insArr = (await insRes.json()) as { id: string }[]
    if (!insArr[0]?.id) {
      res.status(500).json({
        ok: false,
        partial_success: true,
        completed_steps,
        failed_step: 'customer_insert',
        error: 'insert_no_id',
      })
      return
    }
    customer_id = insArr[0].id
  }
  completed_steps.push('customer')

  // Step 3: subscription.
  const subRes = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), prefer: 'return=representation' },
    body: JSON.stringify({ customer_id, tier, status: 'active', hosting_active: true }),
  })
  if (!subRes.ok) {
    res.status(500).json({
      ok: false,
      partial_success: true,
      completed_steps,
      failed_step: 'subscription_insert',
      customer_id,
      error: `Gagal insert subscription: ${subRes.status}: ${(await subRes.text()).slice(0, 200)}`,
    })
    return
  }
  const subArr = (await subRes.json()) as { id: string }[]
  const subscription_id = subArr[0]?.id
  if (!subscription_id) {
    res.status(500).json({
      ok: false,
      partial_success: true,
      completed_steps,
      failed_step: 'subscription_insert',
      customer_id,
      error: 'sub_no_id',
    })
    return
  }
  completed_steps.push('subscription')

  const onboarding_url = `${ONBOARDING_BASE_URL.replace(/\/$/, '')}/welcome?cid=${customer_id}`

  // Step 4: VPS spin-up (fire-and-forget). We await the POST response so
  // we can record vps_id, but the actual VPS readiness is async — the
  // success card surfaces the initiated/failed status and the customer
  // detail page polls subscriptions.status.
  const vps = await triggerVpsSpinUp({ customerId: customer_id, tier, agentSlug: defaultPersona })
  if (vps.status === 'initiated') completed_steps.push('vps_trigger')

  // Step 5: concierge (optional).
  let concierge: ConciergeOutcome | null = null
  if (concierge_mode) {
    concierge = await runConciergePair({ customerId: customer_id, botToken: bot_token_raw })
    if (concierge.status === 'ready') {
      completed_steps.push('concierge_validate')
      if (concierge.pairing_code) completed_steps.push('pairing-code-generated')
    }
    // Pre-fill expectations: save-onboarding-profile would normally
    // collect the "harapan" field from the customer-facing onboarding
    // form. Persisted here as a best-effort PATCH on customers; if the
    // column doesn't exist on the customers row we swallow silently
    // (added in a future migration if needed).
    if (concierge_expectations) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}`, {
          method: 'PATCH',
          headers: supabaseHeaders(),
          body: JSON.stringify({ onboarding_expectations: concierge_expectations }),
        })
      } catch {
        /* best-effort */
      }
    }
  }

  // Step 6: audit row with extended v2 columns.
  const bot_telegram_link =
    concierge?.bot_username ? `https://t.me/${concierge.bot_username}` : null
  const auditPayload: Record<string, unknown> = {
    customer_id,
    subscription_id,
    created_by: 'admin',
    payment_method,
    payment_reference,
    amount_idr,
    persona_slug: defaultPersona, // v1 column — kept for back-compat
    tier,
    notes,
    // v2 columns
    persona_slugs: personas,
    tier_default_amount_idr: tier_default_amount,
    price_override,
    concierge_mode,
    bot_token_hash: concierge_mode && bot_token_raw ? hashBotToken(bot_token_raw) : null,
    vps_provisioning_status: vps.status,
    vps_id: vps.vps_id,
    onboarding_url,
    bot_telegram_link,
  }
  const auditRes = await fetch(`${SUPABASE_URL}/rest/v1/manual_provisions`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(auditPayload),
  })
  const auditOk = auditRes.ok
  if (auditOk) completed_steps.push('audit')

  // Step 7: email (best-effort).
  const emailBody = buildManualProvisionWelcomeEmail({ display_name, tier })
  const email_status = await sendEmail({
    to: email,
    subject: emailBody.subject,
    text: emailBody.text,
  })
  if (email_status === 'sent') completed_steps.push('email')

  // Patch audit row with final email + completed_steps state (best-effort).
  if (auditOk) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/manual_provisions?customer_id=eq.${customer_id}&subscription_id=eq.${subscription_id}`,
        {
          method: 'PATCH',
          headers: supabaseHeaders(),
          body: JSON.stringify({
            email_send_status: email_status,
            completed_steps,
            failed_step: vps.status === 'failed' ? 'vps_trigger' : concierge?.status === 'failed' ? 'concierge' : null,
            error_detail: vps.error ?? concierge?.error ?? null,
          }),
        },
      )
    } catch {
      /* best-effort */
    }
  }

  // Response shape.
  res.status(200).json({
    ok: true,
    customer_id,
    subscription_id,
    tier,
    personas,
    tier_default_amount_idr: tier_default_amount,
    price_override,
    vps_provisioning_status: vps.status,
    vps_id: vps.vps_id,
    vps_error: vps.error,
    concierge_mode,
    concierge_status: concierge?.status ?? null,
    concierge_error: concierge?.error ?? null,
    bot_username: concierge?.bot_username ?? null,
    bot_telegram_link,
    pairing_code: concierge?.pairing_code ?? null,
    pairing_code_expires_at: concierge?.pairing_code_expires_at ?? null,
    onboarding_url,
    email_status,
    audit_ok: auditOk,
    completed_steps,
  })
}

// ─── resend_onboarding ──────────────────────────────────────────────────

function buildOnboardingResendBody(args: {
  display_name: string
  tier: string
  bot_username: string | null
}): { subject: string; text: string } {
  const botLine = args.bot_username
    ? `https://t.me/${args.bot_username}`
    : 'Buka Telegram dan cari bot kamu (sudah di-pair lewat onboarding).'
  return {
    subject: 'Agent kamu sudah aktif — weuseai.agent',
    text: [
      `Halo ${args.display_name},`,
      ``,
      `Agent weuseai.agent kamu (paket ${args.tier}) sudah aktif.`,
      ``,
      `Kirim pesan pertama ke bot Telegram kamu:`,
      `  ${botLine}`,
      ``,
      `Beberapa hal yang bisa kamu coba di pesan pertama:`,
      `  • "Halo, kenalan dulu" — agent akan ingat preferensi kamu`,
      `  • "Bantu aku draft email ke klien" — produktivitas dasar`,
      `  • "Apa yang kamu bisa bantu?" — daftar kemampuan`,
      ``,
      `Kalau agent belum membalas dalam 5 menit, cek dashboard atau`,
      `hubungi kami via WhatsApp di +62 821-5490-2561.`,
      ``,
      `— weuseai.agent`,
      `Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.`,
    ].join('\n'),
  }
}

async function handleResendOnboarding(customerId: string, res: VercelResponse): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }
  const select = 'email,display_name,telegram_bot_username,subscriptions(tier,status,started_at)'
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=${encodeURIComponent(select)}&id=eq.${customerId}&limit=1`,
    { headers: supabaseHeaders() },
  )
  if (!r.ok) {
    res.status(502).json({ ok: false, error: `Lookup gagal: ${r.status}` })
    return
  }
  const arr = (await r.json()) as {
    email: string
    display_name: string | null
    telegram_bot_username: string | null
    subscriptions: { tier: string; status: string; started_at: string | null }[] | null
  }[]
  const c = arr[0]
  if (!c) {
    res.status(404).json({ ok: false, error: 'Customer tidak ditemukan.' })
    return
  }
  const subs = c.subscriptions ?? []
  const active = subs.find((s) => s.status === 'active') ?? subs[0]
  const tier = active?.tier ?? 'starter'
  const displayName = c.display_name || c.email
  const body = buildOnboardingResendBody({
    display_name: displayName,
    tier,
    bot_username: c.telegram_bot_username,
  })
  const status = await sendEmail({ to: c.email, subject: body.subject, text: body.text })
  if (status === 'stub') {
    res.status(200).json({
      ok: true,
      stub: true,
      message: 'Welcome email di-skip (RESEND_API_KEY belum di-set).',
    })
    return
  }
  if (status === 'failed') {
    res.status(502).json({ ok: false, error: 'Resend gagal.' })
    return
  }
  res.status(200).json({ ok: true, message: `Welcome email ulang terkirim ke ${c.email}.` })
}

// ─── Entry ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!requireAdminCookie(req, res)) return

  let body: Record<string, unknown> = {}
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body) as Record<string, unknown>
    else if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_json' })
    return
  }

  const action = String(body.action ?? '') as ActionKind
  if (!ACTIONS.includes(action)) {
    res.status(400).json({ ok: false, error: 'invalid_action' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')

  if (action === 'manual_provision') {
    await handleManualProvision(body, res)
    return
  }
  if (action === 'manual_provision_v2') {
    await handleManualProvisionV2(body, res)
    return
  }

  // All remaining actions require a customerId.
  const customerId = String(body.customerId ?? '').trim()
  if (!customerId || !UUID_RE.test(customerId)) {
    res.status(400).json({ ok: false, error: 'Customer ID tidak valid.' })
    return
  }

  if (action === 'resend_onboarding') {
    await handleResendOnboarding(customerId, res)
    return
  }
  if (action === 'restart_gateway') {
    res.status(200).json({
      ok: false,
      todo: 'call admin-customer-vps-refresh',
      message:
        'TODO — wire ke Edge Function admin-customer-vps-refresh. Belum di-implementasi (scope: structural refactor).',
    })
    return
  }
  if (action === 'mark_refunded') {
    res.status(200).json({
      ok: false,
      todo: 'mark-refunded chain',
      message:
        'TODO — wire 3 langkah: (1) UPDATE subscriptions.status=refunded, ' +
        '(2) call admin-send-refund-email, (3) trigger VPS deprovision.',
    })
    return
  }
  if (action === 'escalate') {
    res.status(200).json({
      ok: false,
      todo: 'escalate flag',
      message:
        'TODO — perlu kolom baru customers.escalated_at + filter di Tab 2. ' +
        'Belum di-implementasi (akan butuh Supabase migration).',
    })
    return
  }
}
