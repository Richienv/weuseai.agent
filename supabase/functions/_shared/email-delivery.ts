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
