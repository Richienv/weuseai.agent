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

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'noreply@weuseai.agent'

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
  | 'resend_onboarding'
  | 'restart_gateway'
  | 'mark_refunded'
  | 'escalate'
const ACTIONS: ActionKind[] = [
  'manual_provision',
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
