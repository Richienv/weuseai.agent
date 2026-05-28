/**
 * Vercel Function: POST /api/admin/customer-resend-onboarding
 *
 * Resends the welcome (post-onboarding) email to a customer. Cookie-gated.
 * Mirrors admin-app/app/customers/[id]/actions.ts → resendOnboardingEmail.
 *
 * Body: { customerId: string }
 *
 * If RESEND_API_KEY is unset the send becomes a no-op stub and the
 * response indicates that — same behaviour the deleted sub-app had.
 */

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'noreply@weuseai.agent'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    res.status(500).json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
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
  const customerId = String(body.customerId ?? '').trim()
  if (!customerId || !UUID_RE.test(customerId)) {
    res.status(400).json({ ok: false, error: 'Customer ID tidak valid.' })
    return
  }

  // Fetch customer + subscriptions.
  const select =
    'email,display_name,telegram_bot_username,subscriptions(tier,status,started_at)'
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=${encodeURIComponent(select)}&id=eq.${customerId}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        accept: 'application/json',
      },
    },
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

  const emailBody = buildOnboardingResendBody({
    display_name: displayName,
    tier,
    bot_username: c.telegram_bot_username,
  })

  if (!RESEND_API_KEY) {
    res.status(200).json({
      ok: true,
      stub: true,
      message: 'Welcome email di-skip (RESEND_API_KEY belum di-set).',
    })
    return
  }

  try {
    const sendRes = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [c.email],
        subject: emailBody.subject,
        text: emailBody.text,
      }),
    })
    if (!sendRes.ok) {
      const detail = (await sendRes.text()).slice(0, 300)
      res.status(502).json({ ok: false, error: `Resend HTTP ${sendRes.status}: ${detail}` })
      return
    }
    res.status(200).json({ ok: true, message: `Welcome email ulang terkirim ke ${c.email}.` })
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
