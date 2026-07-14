// admin-send-refund-email-handler.ts — Phase A2 PR 5.
//
// Pure handler for the admin-only Edge Function that sends the refund.md
// lifecycle email. The Edge Function entry handles auth (service-role
// JWT via isServiceRoleCaller) + CORS; this handler validates input,
// fetches customer email + display_name, renders refund.md, and ships
// via the injected sendEmail.
//
// Trigger: admin manual (founder dashboard, CLI, or curl with the
// service-role bearer). After Xendit-side refund actually initiates
// (which is a manual founder action — Xendit refund API requires the
// dashboard or a separately-signed admin API call), the founder fires
// this endpoint to send the customer-facing notice.

import { buildRefundEmailBody } from './lifecycle-email-bodies.ts'
import type { SendEmailInput, SendEmailResult } from './email-delivery.ts'

export type AdminSendRefundEmailInput = {
  /** Customer UUID (subscriptions.customer_id / customers.id). */
  customer_id: string
  /** Refund amount in IDR (no thousands separator). */
  refund_amount_idr: number
  /** Human-readable method label, e.g. "QRIS", "kartu kredit", "transfer bank". */
  refund_method: string
  /**
   * Free-text reason — for audit log + future internal use. Not currently
   * surfaced in the customer email body (the template is deliberately
   * reason-neutral). Captured so refund records have a paper trail.
   */
  refund_reason: string
  /** Optional Xendit invoice id for the original charge. Embedded in subject. */
  invoice_id?: string
  /** Optional ETA override; defaults to 7. */
  eta_business_days?: number
}

export type AdminSendRefundEmailOk = {
  ok: true
  status: 200
  body: {
    sent_to: string
    /** Resend message id when send_email returned ok:true with resend_id. */
    resend_id?: string
    /** True when sendEmail was in stub mode (no RESEND_API_KEY). */
    stub: boolean
  }
}

export type AdminSendRefundEmailErr = {
  ok: false
  status: 400 | 404 | 422 | 502
  error: string
  detail?: string
}

export type AdminSendRefundEmailResult =
  | AdminSendRefundEmailOk
  | AdminSendRefundEmailErr

export type AdminSendRefundEmailDeps = {
  findCustomer: (customer_id: string) => Promise<
    { email: string; display_name: string | null } | null
  >
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
}

function formatIdr(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

export async function handleAdminSendRefundEmail(
  input: AdminSendRefundEmailInput,
  deps: AdminSendRefundEmailDeps,
): Promise<AdminSendRefundEmailResult> {
  // ── Input validation ──────────────────────────────────────────────
  if (!input || typeof input !== 'object') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'body required' }
  }
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'customer_id required' }
  }
  if (
    typeof input.refund_amount_idr !== 'number' ||
    !Number.isFinite(input.refund_amount_idr) ||
    input.refund_amount_idr <= 0
  ) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_input',
      detail: 'refund_amount_idr must be a positive number',
    }
  }
  if (!input.refund_method || typeof input.refund_method !== 'string') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'refund_method required' }
  }
  if (!input.refund_reason || typeof input.refund_reason !== 'string') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'refund_reason required (audit trail)' }
  }

  // ── Customer lookup ───────────────────────────────────────────────
  const cust = await deps.findCustomer(input.customer_id)
  if (!cust) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }
  if (!cust.email || cust.email.length === 0) {
    return { ok: false, status: 422, error: 'customer_has_no_email' }
  }

  const displayName =
    cust.display_name && cust.display_name.trim().length > 0
      ? cust.display_name
      : 'pelanggan'

  // ── Render + send ─────────────────────────────────────────────────
  const { subject, text } = buildRefundEmailBody({
    display_name: displayName,
    invoice_id: input.invoice_id && input.invoice_id.length > 0 ? input.invoice_id : 'N/A',
    refund_amount_idr: formatIdr(input.refund_amount_idr),
    refund_method: input.refund_method,
    eta_business_days: input.eta_business_days ?? 7,
  })

  const sendRes = await deps.sendEmail({ to: cust.email, subject, text })
  if (!sendRes.ok) {
    return {
      ok: false,
      status: 502,
      error: 'email_send_failed',
      detail: sendRes.error + (sendRes.detail ? ': ' + sendRes.detail : ''),
    }
  }
  return {
    ok: true,
    status: 200,
    body: {
      sent_to: cust.email,
      resend_id: (sendRes as { resend_id?: string }).resend_id,
      stub: Boolean((sendRes as { stub?: boolean }).stub),
    },
  }
}
