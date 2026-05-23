// admin-send-support-handoff-email-handler.ts — Phase A2 PR 5.
//
// Pure handler for the admin-only Edge Function that sends the
// support-handoff.md lifecycle email. The Edge Function entry handles
// auth (service-role JWT) + CORS; this handler validates input,
// fetches customer email + display_name, renders support-handoff.md,
// and ships via the injected sendEmail.
//
// Trigger: admin manual (founder dashboard, CLI). After a support
// ticket has been handled manually (gateway restart, LLM key reset,
// VPS migration, etc.), the founder fires this endpoint to hand back
// to the customer with a clean summary.

import { buildSupportHandoffEmailBody } from './lifecycle-email-bodies.ts'
import type { SendEmailInput, SendEmailResult } from './email-delivery.ts'

export type AdminSendSupportHandoffEmailInput = {
  customer_id: string
  /**
   * Internal-only summary of what the ticket was about — captured for
   * audit trail. Not surfaced in the customer email. Required so each
   * dispatch has a paper trail of WHY we engaged.
   */
  ticket_summary: string
  /** Customer-facing summary of what we did. Becomes summary_done. */
  resolution_summary: string
  /**
   * Optional internal ticket id like "T-2026-0142". When omitted, the
   * handler generates a fallback like "T-AUTO-<unix-ms>" so the email
   * still has a stable reference the customer can quote back.
   */
  ticket_id?: string
  /** Optional. Defaults to "tidak ada". */
  action_required?: string
  /** Optional. Defaults to a generated "tadi pukul HH.MM WIB" label. */
  verified_at_label?: string
}

export type AdminSendSupportHandoffEmailOk = {
  ok: true
  status: 200
  body: {
    sent_to: string
    ticket_id: string
    resend_id?: string
    stub: boolean
  }
}

export type AdminSendSupportHandoffEmailErr = {
  ok: false
  status: 400 | 404 | 422 | 502
  error: string
  detail?: string
}

export type AdminSendSupportHandoffEmailResult =
  | AdminSendSupportHandoffEmailOk
  | AdminSendSupportHandoffEmailErr

export type AdminSendSupportHandoffEmailDeps = {
  findCustomer: (customer_id: string) => Promise<
    { email: string; display_name: string | null } | null
  >
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
  /** Optional clock for deterministic tests. */
  now?: () => Date
}

/** Format the current time as "tadi pukul HH.MM WIB" (WIB = UTC+7). */
function defaultVerifiedAtLabel(now: Date): string {
  // WIB is UTC+7; build it without locale-dependent toLocaleString.
  const utcMs = now.getTime()
  const wibMs = utcMs + 7 * 60 * 60 * 1000
  const w = new Date(wibMs)
  const hh = String(w.getUTCHours()).padStart(2, '0')
  const mm = String(w.getUTCMinutes()).padStart(2, '0')
  return `tadi pukul ${hh}.${mm} WIB`
}

export async function handleAdminSendSupportHandoffEmail(
  input: AdminSendSupportHandoffEmailInput,
  deps: AdminSendSupportHandoffEmailDeps,
): Promise<AdminSendSupportHandoffEmailResult> {
  const now = deps.now ?? (() => new Date())

  // ── Input validation ──────────────────────────────────────────────
  if (!input || typeof input !== 'object') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'body required' }
  }
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_input', detail: 'customer_id required' }
  }
  if (!input.ticket_summary || typeof input.ticket_summary !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'invalid_input',
      detail: 'ticket_summary required (internal audit trail)',
    }
  }
  if (!input.resolution_summary || typeof input.resolution_summary !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'invalid_input',
      detail: 'resolution_summary required (customer-facing summary_done)',
    }
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

  const ticketId =
    input.ticket_id && input.ticket_id.length > 0
      ? input.ticket_id
      : `T-AUTO-${now().getTime()}`

  const verifiedAtLabel =
    input.verified_at_label && input.verified_at_label.length > 0
      ? input.verified_at_label
      : defaultVerifiedAtLabel(now())

  const actionRequired =
    input.action_required && input.action_required.length > 0
      ? input.action_required
      : 'tidak ada'

  // ── Render + send ─────────────────────────────────────────────────
  const { subject, text } = buildSupportHandoffEmailBody({
    display_name: displayName,
    ticket_id: ticketId,
    summary_done: input.resolution_summary,
    action_required: actionRequired,
    verified_at_label: verifiedAtLabel,
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
      ticket_id: ticketId,
      resend_id: (sendRes as { resend_id?: string }).resend_id,
      stub: Boolean((sendRes as { stub?: boolean }).stub),
    },
  }
}
