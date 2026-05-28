/**
 * Vercel Function: POST /api/admin/manual-provision
 *
 * Backs /admin/manual-provision.html — Path 1 manual customer onboarding
 * (bank transfer / QRIS manual / Wise / other; no Xendit invoice).
 *
 * Flow (mirrors what the now-deleted admin-app sub-app did):
 *   1. Validate inputs.
 *   2. Upsert customers row by email (reuse if exists).
 *   3. Insert subscriptions row (tier inferred from persona).
 *   4. Insert manual_provisions audit row.
 *   5. Send welcome email (best-effort; stub if RESEND_API_KEY unset).
 *
 * VPS provisioning is NOT triggered here — the form doesn't collect the
 * customer's Telegram bot token / OpenRouter key / SOUL.md. Founder runs
 * the standard onboarding flow with the customer after this row exists.
 *
 * Request body:
 *   { email, display_name, persona_slug, amount_idr,
 *     payment_method, payment_reference?, notes? }
 *
 * Response:
 *   200 { ok: true, customer_id, subscription_id, email_status, message }
 *   400 { ok: false, error }
 *   401 { error: 'unauthorized' }
 */

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'noreply@weuseai.agent'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAYMENT_METHODS = [
  'manual_bank_transfer',
  'manual_qris',
  'manual_wise',
  'other',
] as const
type PaymentMethod = (typeof PAYMENT_METHODS)[number]
type Tier = 'starter' | 'pro' | 'studio'

// Mirrors supabase/functions/_shared/tier-personas.ts (D1 lock 2026-05-12).
// Keep in lockstep — see /admin/assets/admin-personas.js for the same list
// surfaced to the browser dropdown.
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

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'content-type': 'application/json',
    accept: 'application/json',
  }
}

async function lookupCustomerByEmail(email: string): Promise<
  | { ok: true; row: { id: string; display_name: string | null } | null }
  | { ok: false; error: string }
> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=id,display_name&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: supabaseHeaders() },
  )
  if (!r.ok) return { ok: false, error: `lookup_${r.status}: ${(await r.text()).slice(0, 200)}` }
  const arr = (await r.json()) as { id: string; display_name: string | null }[]
  return { ok: true, row: arr[0] ?? null }
}

async function insertCustomer(
  email: string,
  display_name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), prefer: 'return=representation' },
    body: JSON.stringify({ email, display_name }),
  })
  if (!r.ok) return { ok: false, error: `insert_${r.status}: ${(await r.text()).slice(0, 300)}` }
  const arr = (await r.json()) as { id: string }[]
  if (!arr[0]?.id) return { ok: false, error: 'insert_no_id' }
  return { ok: true, id: arr[0].id }
}

async function patchCustomerDisplayName(id: string, display_name: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ display_name }),
  })
}

async function insertSubscription(
  customer_id: string,
  tier: Tier,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), prefer: 'return=representation' },
    body: JSON.stringify({
      customer_id,
      tier,
      status: 'active',
      hosting_active: true,
    }),
  })
  if (!r.ok) return { ok: false, error: `sub_${r.status}: ${(await r.text()).slice(0, 300)}` }
  const arr = (await r.json()) as { id: string }[]
  if (!arr[0]?.id) return { ok: false, error: 'sub_no_id' }
  return { ok: true, id: arr[0].id }
}

async function insertManualProvisionAudit(args: {
  customer_id: string
  subscription_id: string
  payment_method: PaymentMethod
  payment_reference: string | null
  amount_idr: number
  persona_slug: string
  tier: Tier
  notes: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/manual_provisions`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({
      customer_id: args.customer_id,
      subscription_id: args.subscription_id,
      created_by: 'admin',
      payment_method: args.payment_method,
      payment_reference: args.payment_reference,
      amount_idr: args.amount_idr,
      persona_slug: args.persona_slug,
      tier: args.tier,
      notes: args.notes,
    }),
  })
  if (!r.ok) return { ok: false, error: `audit_${r.status}: ${(await r.text()).slice(0, 300)}` }
  return { ok: true }
}

function buildManualProvisionWelcomeEmail(args: {
  display_name: string
  tier: Tier
}): { subject: string; text: string } {
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

async function sendWelcomeEmail(args: {
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!requireAdminCookie(req, res)) return
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  let body: Record<string, unknown> = {}
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body) as Record<string, unknown>
    else if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_json' })
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
  const lookup = await lookupCustomerByEmail(email)
  if (!lookup.ok) {
    res.status(500).json({ ok: false, error: `Gagal lookup customer: ${lookup.error}` })
    return
  }
  if (lookup.row) {
    customer_id = lookup.row.id
    if (!lookup.row.display_name) {
      await patchCustomerDisplayName(customer_id, display_name)
    }
  } else {
    const ins = await insertCustomer(email, display_name)
    if (!ins.ok) {
      res.status(500).json({ ok: false, error: `Gagal insert customer: ${ins.error}` })
      return
    }
    customer_id = ins.id
  }

  // Step 2: subscription.
  const sub = await insertSubscription(customer_id, tier)
  if (!sub.ok) {
    res.status(500).json({ ok: false, error: `Gagal insert subscription: ${sub.error}` })
    return
  }
  const subscription_id = sub.id

  // Step 3: audit row (best-effort).
  const audit = await insertManualProvisionAudit({
    customer_id,
    subscription_id,
    payment_method: payment_method as PaymentMethod,
    payment_reference,
    amount_idr: amount_idr as number,
    persona_slug,
    tier,
    notes,
  })
  const auditError = audit.ok ? null : audit.error

  // Step 4: welcome email (best-effort).
  const emailBody = buildManualProvisionWelcomeEmail({ display_name, tier })
  const email_status = await sendWelcomeEmail({
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

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    customer_id,
    subscription_id,
    email_status,
    message: baseMsg + auditMsg + emailMsg,
  })
}
