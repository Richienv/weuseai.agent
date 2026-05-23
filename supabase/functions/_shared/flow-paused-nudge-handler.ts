// flow-paused-nudge handler (Phase A2 PR 2).
//
// Daily sweep that finds customer_flow_state rows parked at
// `awaiting_customer` / `escalated` for >= 7 days (halfway to the 14-day
// TTL stamped by the flow-state handler) and emails the customer the
// flow-paused.md nudge — "your playbook is paused, here's how to resume
// before the auto-close at 14 days".
//
// Companion to flow-state-ttl-sweep-handler.ts:
//   - TTL sweep aborts rows AT/AFTER expires_at.
//   - This nudge fires HALFWAY there, with a dedup column so we send
//     once per parked-run (not once per daily cron tick).
//
// Pure module — persistence + notification are dependency-injected.
//
// Migration (companion): adds customer_flow_state.paused_email_sent_at
// timestamptz column; populated here, cleared on resume / abort.

import type { FlowStatus } from './flow-state-handler.ts'

/**
 * Row shape pulled from customer_flow_state JOIN customers. The store
 * pre-joins so the handler can hand a complete payload to the notifier
 * without a second DB roundtrip per row.
 */
export type FlowPausedEligibleRow = {
  /** customer_flow_state.id */
  id: string
  customer_id: string
  customer_email: string
  customer_display_name: string | null
  playbook_id: string
  status: FlowStatus
  expires_at: string // ISO — the 14-day deadline
  /** NULL when never nudged; ISO when already nudged once. */
  paused_email_sent_at: string | null
  /** customer_flow_state.state_data — handler may surface a parked_reason
   *  string from here if the playbook stashed one. */
  state_data: Record<string, unknown>
}

export interface FlowPausedNudgeStore {
  /**
   * Returns parked rows that have been parked for >= 7d (i.e.
   * expires_at <= now + 7d, since TTL = 14d from park time) and have
   * never been nudged (paused_email_sent_at IS NULL). The query lives
   * in the store impl so this pure handler is DB-agnostic.
   */
  findEligible(now: Date): Promise<FlowPausedEligibleRow[]>
  /** Stamp paused_email_sent_at on the given row. */
  markEmailSent(id: string, at: Date): Promise<void>
}

export interface FlowPausedNudgeNotifier {
  /** Send the flow-paused email. Resolves with whether send succeeded. */
  notifyPaused(
    row: FlowPausedEligibleRow,
  ): Promise<{ ok: boolean; detail?: string }>
}

export type NudgeInput = {
  /** Defaults to new Date(). */
  now?: Date
  /** Skip notifications + stamps (dry-run / smoke mode). */
  skipNotify?: boolean
}

export type NudgeResult = {
  ok: true
  status: 200
  body: {
    eligible_count: number
    notified_count: number
    notify_failures: { id: string; detail: string }[]
    nudged_ids: string[]
    examined_at: string
  }
}

export async function handleFlowPausedNudge(
  input: NudgeInput,
  store: FlowPausedNudgeStore,
  notifier?: FlowPausedNudgeNotifier,
): Promise<NudgeResult> {
  const now = input.now ?? new Date()
  const eligible = await store.findEligible(now)

  const nudged_ids: string[] = []
  const notify_failures: { id: string; detail: string }[] = []
  let notified_count = 0

  for (const row of eligible) {
    if (input.skipNotify || !notifier) continue

    // Notify FIRST. Only stamp paused_email_sent_at after the send
    // confirms — failure leaves the column null so tomorrow's tick
    // retries. The 7-day window is wide enough that one retry/day
    // gives plenty of headroom before the 14-day TTL closes the run.
    const r = await notifier.notifyPaused(row).catch((e) => ({
      ok: false as const,
      detail: e instanceof Error ? e.message : String(e),
    }))

    if (r.ok) {
      await store.markEmailSent(row.id, now)
      notified_count += 1
      nudged_ids.push(row.id)
    } else {
      notify_failures.push({
        id: row.id,
        detail: r.detail ?? 'notify failed',
      })
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      eligible_count: eligible.length,
      notified_count,
      notify_failures,
      nudged_ids,
      examined_at: now.toISOString(),
    },
  }
}

// ─── helpers (exported for the notifier impl in the Edge Function entry) ──

/**
 * Convert a playbook_id slug ("pt-perorangan-registration") into a
 * human-friendly label for the email body ("Pt Perorangan Registration").
 * Used by the notifier when the row's state_data has no
 * `playbook_label` key. Public so handler tests + the Edge Function
 * entry share one source of truth.
 */
export function playbookLabelFromId(id: string): string {
  if (!id) return id
  return id
    .split(/[-_]/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/**
 * Compute the days_remaining figure passed into the flow-paused email
 * body. Floors at 1 to avoid a zero-day message — if a row is right on
 * the cusp we still tell the customer they have one day.
 */
export function daysRemainingUntil(expires_at: string, now: Date): number {
  const expiresMs = Date.parse(expires_at)
  if (Number.isNaN(expiresMs)) return 7
  const diffMs = expiresMs - now.getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  return Math.max(1, days)
}
