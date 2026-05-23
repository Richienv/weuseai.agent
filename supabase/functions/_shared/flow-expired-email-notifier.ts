// flow-expired-email-notifier.ts — Phase A2 PR 3.
//
// Email-backed implementation of FlowStateTtlNotifier. The TTL sweep
// handler aborts a parked customer_flow_state row at the 14-day expiry
// and then calls the notifier with `notifyExpired(row)`. This factory
// renders the flow-expired.md template via buildFlowExpiredEmailBody
// and sends via a dependency-injected sendEmail.
//
// Pure factory — sendEmail is passed in, so unit tests don't touch
// Resend / network. The Edge Function entry binds the real sendEmail
// from email-delivery.ts.
//
// Companion to flow-paused-nudge: same lifecycle template family, same
// fallback semantics for state_data-derived labels.

import { buildFlowExpiredEmailBody } from './lifecycle-email-bodies.ts'
import type { FlowStatus } from './flow-state-handler.ts'
import type { SendEmailInput, SendEmailResult } from './email-delivery.ts'
import type {
  ExpiredRow,
  FlowStateTtlNotifier,
} from './flow-state-ttl-sweep-handler.ts'

/**
 * Extended row shape the store JOINs in for the email path. The base
 * ExpiredRow only carries id / customer_id / playbook_id / status /
 * expires_at; we add the customer fields the email needs so the
 * notifier doesn't have to round-trip the DB per row.
 */
export type FlowExpiredEmailRow = ExpiredRow & {
  customer_email: string
  customer_display_name: string | null
  /** customer_flow_state.state_data — playbook_label + parked_at_label
   *  optional keys read here when present. */
  state_data: Record<string, unknown>
}

export type FlowExpiredEmailNotifierDeps = {
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
  /** Defaults to https://weuseai-agent.vercel.app — override for tests. */
  dashboardBase?: string
}

/**
 * Convert a playbook_id slug into a human-friendly label. Mirrors the
 * helper used by flow-paused-nudge so the two emails address the same
 * playbook with the same wording.
 */
function playbookLabelFromId(id: string): string {
  if (!id) return id
  return id
    .split(/[-_]/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/**
 * Build a FlowStateTtlNotifier whose `notifyExpired` renders
 * flow-expired.md and ships via the injected sendEmail. The returned
 * value can be passed directly into handleFlowStateTtlSweep().
 *
 * The store is expected to JOIN `customers` and surface
 * customer_email + customer_display_name + state_data on the row.
 * The base ExpiredRow type does NOT require those fields, so existing
 * sweep callers that pass a bare ExpiredRow keep working — they just
 * won't render emails (notifier returns ok:false with detail
 * "no_customer_email" and the sweep handler records that as a notify
 * failure, leaving the abort itself untouched).
 */
export function makeFlowExpiredEmailNotifier(
  deps: FlowExpiredEmailNotifierDeps,
): FlowStateTtlNotifier {
  const dashboardBase =
    deps.dashboardBase ?? 'https://weuseai-agent.vercel.app'
  return {
    async notifyExpired(row: ExpiredRow) {
      // Defensive cast — store impl is responsible for populating the
      // extra fields. If they're missing, surface a clean detail so
      // the sweep records it as a notify failure.
      const enriched = row as FlowExpiredEmailRow
      if (!enriched.customer_email || enriched.customer_email.length === 0) {
        return {
          ok: false,
          detail: 'no_customer_email: store JOIN must populate customer.email',
        }
      }
      const stateData = (enriched.state_data ?? {}) as Record<string, unknown>
      const playbookName =
        typeof stateData.playbook_label === 'string' &&
        stateData.playbook_label.trim().length > 0
          ? stateData.playbook_label
          : playbookLabelFromId(row.playbook_id)
      const parkedAtLabel =
        typeof stateData.parked_at_label === 'string' &&
        stateData.parked_at_label.trim().length > 0
          ? stateData.parked_at_label
          : 'menunggu langkah berikutnya'
      const displayName =
        enriched.customer_display_name &&
        enriched.customer_display_name.trim().length > 0
          ? enriched.customer_display_name
          : 'pelanggan'

      const restartUrl =
        `${dashboardBase}/dashboard/flow/start` +
        `?playbook=${encodeURIComponent(row.playbook_id)}` +
        `&cid=${encodeURIComponent(row.customer_id)}`
      const dashboardUrl =
        `${dashboardBase}/dashboard?cid=${encodeURIComponent(row.customer_id)}`

      const { subject, text } = buildFlowExpiredEmailBody({
        display_name: displayName,
        playbook_name: playbookName,
        parked_at_label: parkedAtLabel,
        restart_url: restartUrl,
        dashboard_url: dashboardUrl,
      })

      const r = await deps.sendEmail({
        to: enriched.customer_email,
        subject,
        text,
      })
      if (!r.ok) {
        return {
          ok: false,
          detail: r.error + (r.detail ? ': ' + r.detail : ''),
        }
      }
      return { ok: true }
    },
  }
}

// Re-export for callers that want a single import surface.
export type { FlowStateTtlNotifier }
