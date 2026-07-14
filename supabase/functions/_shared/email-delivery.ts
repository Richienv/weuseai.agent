// email-delivery.ts — Phase 2E-3 Resend integration (stub-mode tolerant).
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q5 follow-up).
//
// When RESEND_API_KEY is set on the Edge Function env: real email delivery
// via Resend's REST API. Subject/body in Bahasa per CLAUDE.md voice rules
// ("kamu", calm-premium, no banned words, no exclamation marks).
//
// When RESEND_API_KEY is missing: STUB MODE. Returns
// `{ ok: true, stub: true }` — caller treats as best-effort success and
// keeps going. Lets us ship the rest of Phase 2E-3 before the founder
// finalises Resend signup. When the key arrives, set the secret and the
// function activates — no code change needed.
//
// API: https://resend.com/docs/api-reference/emails/send-email
//
// Auth model: this module is imported by other admin-only handlers
// (invoice-generator-handler post-PDF render). It does NOT authenticate
// the inbound request — that's the caller's job. The Resend API key is
// never exposed to customers.

// @ts-ignore — Deno global available at runtime; ignored in Node typecheck.
declare const Deno:
  | {
      env: { get(key: string): string | undefined }
    }
  | undefined

const RESEND_API_URL = 'https://api.resend.com/emails'

// ─── env helpers ────────────────────────────────────────────────────────

/**
 * Resolve env both in Deno (Edge Function runtime) and Node (tests).
 * Tests can call `setEmailEnvOverride()` to inject without touching
 * process.env (avoids cross-test contamination).
 */
let envOverride: Record<string, string | undefined> | null = null

export function setEmailEnvOverride(env: Record<string, string | undefined> | null): void {
  envOverride = env
}

function readEnv(key: string): string | undefined {
  if (envOverride) return envOverride[key]
  // Deno first (Edge Function runtime), fallback to Node (tests).
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    return Deno.env.get(key)
  }
  // Node test path.
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key]
  }
  return undefined
}

// ─── input + output shapes ──────────────────────────────────────────────

export type SendEmailInput = {
  to: string                                     // single recipient email
  subject: string                                // typically Bahasa
  /** Plain-text body. HTML body optional and not used for invoice path. */
  text: string
  /** Sender. Default: noreply@weuseai.agent. */
  from?: string
  /**
   * Attachment with raw bytes. Resend's API takes content as base64.
   * For invoice PDFs this is typically <100KB.
   */
  attachment?: {
    filename: string
    content: Uint8Array
    contentType: 'application/pdf' | string
  }
}

export type SendEmailResult =
  | { ok: true; stub?: false; resend_id: string }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string; detail?: string }

// ─── core send function ─────────────────────────────────────────────────

const DEFAULT_FROM = 'noreply@weuseai.agent'

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Validate first — keeps the stub path informative.
  if (!input?.to || typeof input.to !== 'string' || !input.to.includes('@')) {
    return { ok: false, error: 'invalid_to' }
  }
  if (!input?.subject || typeof input.subject !== 'string') {
    return { ok: false, error: 'invalid_subject' }
  }
  if (typeof input?.text !== 'string') {
    return { ok: false, error: 'invalid_text' }
  }

  const apiKey = readEnv('RESEND_API_KEY')

  // ── Stub path ────────────────────────────────────────────────────────
  if (!apiKey) {
    return {
      ok: true,
      stub: true,
      reason:
        'RESEND_API_KEY not set; would-have-sent email skipped (caller treats as success)',
    }
  }

  // ── Real send path ───────────────────────────────────────────────────
  const body: Record<string, unknown> = {
    from: input.from ?? DEFAULT_FROM,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  }
  if (input.attachment) {
    // Resend wants attachments as { filename, content }, where content
    // is a base64 string OR a buffer. Base64 is safer over JSON.
    const b64 = btoa(
      Array.from(input.attachment.content)
        .map((b) => String.fromCharCode(b))
        .join(''),
    )
    body.attachments = [
      {
        filename: input.attachment.filename,
        content: b64,
        type: input.attachment.contentType,
      },
    ]
  }

  let r: Response
  try {
    r = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return {
      ok: false,
      error: 'resend_fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  if (!r.ok) {
    let detailText = ''
    try {
      detailText = (await r.text()).slice(0, 400)
    } catch { /* swallow */ }
    return {
      ok: false,
      error: 'resend_http_error',
      detail: `HTTP ${r.status}: ${detailText}`,
    }
  }

  let json: { id?: string }
  try {
    json = (await r.json()) as { id?: string }
  } catch {
    return { ok: false, error: 'resend_invalid_response' }
  }

  if (!json.id) {
    return { ok: false, error: 'resend_response_missing_id' }
  }

  return { ok: true, resend_id: json.id }
}

// ─── helper: invoice email body (Bahasa, calm-premium) ─────────────────
//
// CLAUDE.md voice rules:
//   - "kamu" form
//   - One idea per sentence
//   - No banned words (basically, just, literally, etc)
//   - Zero exclamation marks
//   - Calm-premium register

export function buildInvoiceEmailBody(args: {
  invoice_number: string
  client_name: string
  total_idr: number
}): { subject: string; text: string } {
  const formattedTotal =
    'Rp ' + args.total_idr.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  return {
    subject: `Invoice ${args.invoice_number} — ${args.client_name}`,
    text: [
      `Halo,`,
      ``,
      `Invoice ${args.invoice_number} buat ${args.client_name} sudah jadi.`,
      `Total: ${formattedTotal}.`,
      ``,
      `PDF terlampir di email ini. Simpan untuk arsip kamu — kalau butuh re-download,`,
      `signed URL berlaku 30 hari, tapi attachment ini permanen di inbox kamu.`,
      ``,
      `Pertanyaan? Reply email ini.`,
      ``,
      `— weuseai.agent`,
    ].join('\n'),
  }
}

// ─── helper: payment receipt email body (Sesi B P0 #7) ─────────────────
//
// Sent from xendit-webhook after a successful PAID event. BI primary,
// calm-premium, no exclamation marks, no banned words. Doubles as the
// customer's audit trail for accounting + refund eligibility window.

function formatIdr(amount_idr: number): string {
  return 'Rp ' + amount_idr.toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

function formatPaidAt(iso: string): string {
  // Format like "12 Mei 2026" in WIB-friendly Indonesian. Avoid
  // toLocaleString locale variation across Node/Deno by hand-building.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function buildPaymentReceiptEmailBody(args: {
  invoice_id: string
  tier: string
  amount_idr: number
  payment_method: string
  paid_at_iso: string
  /**
   * Customer UUID (from subscription.customer_id). When supplied, the
   * email body inserts a "Lanjutkan setup agent kamu di sini: …" line
   * with a welcome-URL embedded `?cid=<id>` query param so customers
   * who lose the welcome-tab can recover via email.
   *
   * Per audit doc §P2-CF-3 (closes P1-CF-5 lost-cid recovery loop).
   * Optional so legacy callers + future re-send flows that only have
   * the invoice_id still produce a valid email body.
   */
  customer_id?: string
}): { subject: string; text: string } {
  const formattedTotal = formatIdr(args.amount_idr)
  const formattedDate = formatPaidAt(args.paid_at_iso)

  // Audit doc §P2-CF-3: receipt email is the recovery path for the
  // lost-cid problem. URL-encode the cid defensively even though
  // production cids are always UUIDs — encoding cost is nil and
  // prevents any future schema change from emitting a broken link.
  const welcomeLines = args.customer_id && args.customer_id.length > 0
    ? [
        `Lanjutkan setup agent kamu di sini:`,
        `https://weuseai-agent.vercel.app/welcome?cid=${encodeURIComponent(args.customer_id)}`,
        ``,
      ]
    : []

  return {
    subject: `Bukti pembayaran — weuseai.agent (${args.invoice_id})`,
    text: [
      `Halo,`,
      ``,
      `Pembayaran setup weuseai.agent kamu sudah kami terima. Terima kasih.`,
      ``,
      `Ringkasan:`,
      `  • Paket: ${args.tier}`,
      `  • Invoice: ${args.invoice_id}`,
      `  • Total: ${formattedTotal}`,
      `  • Metode: ${args.payment_method}`,
      `  • Tanggal: ${formattedDate}`,
      ``,
      `Agent kamu sedang disiapkan. Begitu siap, kami kirim email`,
      `aktivasi terpisah dengan link ke dashboard onboarding.`,
      ``,
      ...welcomeLines,
      `Butuh bantuan atau perlu pengembalian dana? Lihat`,
      `https://weuseai-agent.vercel.app/refund-policy atau balas email ini.`,
      ``,
      `— weuseai.agent`,
      `Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.`,
    ].join('\n'),
  }
}

// ─── helper: welcome email body (Sesi B P0 #7) ─────────────────────────
//
// Sent from complete-onboarding handler after Hermes activates. BI
// primary. Encourages customer to send their first message to the
// Telegram bot.

export function buildWelcomeEmailBody(args: {
  display_name: string
  bot_username: string | null
  tier: string
}): { subject: string; text: string } {
  const botLine = args.bot_username
    ? `https://t.me/${args.bot_username}`
    : 'Buka Telegram dan cari bot kamu (sudah di-pair lewat onboarding).'
  return {
    subject: `Agent kamu sudah aktif — weuseai.agent`,
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
