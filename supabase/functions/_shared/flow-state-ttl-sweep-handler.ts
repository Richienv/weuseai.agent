// flow-state-ttl-sweep handler.
//
// P4G parked-run TTL (2026-05-22 consult). Daily sweep that finds rows
// in customer_flow_state where status is awaiting_customer / escalated
// and expires_at < now, marks them aborted, and optionally notifies the
// customer via Telegram. The flow-state handler stamps expires_at at
// park time and clears it on resume / complete / abort.
//
// Pure module — persistence + notification are dependency-injected.

import type { FlowStatus } from './flow-state-handler.ts'

export type ExpiredRow = {
  id: string
  customer_id: string
  playbook_id: string
  status: FlowStatus
  expires_at: string
}

export interface FlowStateTtlSweepStore {
  /** Returns parked rows whose expires_at is at or before `now`. */
  findExpired(now: Date): Promise<ExpiredRow[]>
  /** Marks the row aborted + clears expires_at. */
  markAborted(id: string): Promise<void>
}

export interface FlowStateTtlNotifier {
  /** Best-effort customer notification. Resolves with whether send succeeded. */
  notifyExpired(row: ExpiredRow): Promise<{ ok: boolean; detail?: string }>
}

export type SweepInput = {
  /** Defaults to new Date(). */
  now?: Date
  /** Skip notifications (useful when running ad-hoc / when no notifier wired). */
  skipNotify?: boolean
}

export type SweepResult = {
  ok: true
  status: 200
  body: {
    swept_count: number
    notified_count: number
    notify_failures: { id: string; detail: string }[]
    aborted_ids: string[]
    examined_at: string
  }
}

export async function handleFlowStateTtlSweep(
  input: SweepInput,
  store: FlowStateTtlSweepStore,
  notifier?: FlowStateTtlNotifier,
): Promise<SweepResult> {
  const now = input.now ?? new Date()
  const expired = await store.findExpired(now)

  const aborted_ids: string[] = []
  const notify_failures: { id: string; detail: string }[] = []
  let notified_count = 0

  for (const row of expired) {
    // Mark aborted first — even if notification fails, the row must
    // leave the parked state so the daily sweep doesn't re-process it.
    await store.markAborted(row.id)
    aborted_ids.push(row.id)

    if (input.skipNotify || !notifier) continue
    const r = await notifier.notifyExpired(row).catch((e) => ({
      ok: false as const,
      detail: e instanceof Error ? e.message : String(e),
    }))
    if (r.ok) {
      notified_count += 1
    } else {
      notify_failures.push({ id: row.id, detail: r.detail ?? 'notify failed' })
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      swept_count: expired.length,
      notified_count,
      notify_failures,
      aborted_ids,
      examined_at: now.toISOString(),
    },
  }
}
