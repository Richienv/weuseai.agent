// Pure-handler tests for flow-paused-nudge-handler.ts (Phase A2 PR 2).
//
// Daily cron — finds customer_flow_state rows parked at awaiting_customer
// / escalated for >= 7 days (halfway to the 14-day TTL) that haven't been
// nudged yet, sends the flow-paused.md email, stamps paused_email_sent_at
// so we don't double-send.
//
// Persistence + notifier are dependency-injected (same pattern as
// flow-state-ttl-sweep-handler). All side effects mockable.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleFlowPausedNudge,
  type FlowPausedNudgeStore,
  type FlowPausedNudgeNotifier,
  type FlowPausedEligibleRow,
} from '../supabase/functions/_shared/flow-paused-nudge-handler.ts'

const NOW = new Date('2026-06-15T03:00:00.000Z')

function row(
  id: string,
  over: Partial<FlowPausedEligibleRow> = {},
): FlowPausedEligibleRow {
  return {
    id,
    customer_id: 'c-' + id,
    customer_email: id + '@example.com',
    customer_display_name: 'Renita',
    playbook_id: 'pt-perorangan-registration',
    status: 'awaiting_customer',
    expires_at: '2026-06-22T03:00:00.000Z', // exactly 7d from NOW
    paused_email_sent_at: null,
    state_data: {},
    ...over,
  }
}

class FakeStore implements FlowPausedNudgeStore {
  eligible: FlowPausedEligibleRow[]
  marked: { id: string; at: string }[] = []
  constructor(eligible: FlowPausedEligibleRow[]) {
    this.eligible = eligible
  }
  async findEligible(_now: Date): Promise<FlowPausedEligibleRow[]> {
    return this.eligible
  }
  async markEmailSent(id: string, at: Date): Promise<void> {
    this.marked.push({ id, at: at.toISOString() })
  }
}

class FakeNotifier implements FlowPausedNudgeNotifier {
  calls: FlowPausedEligibleRow[] = []
  nextResult: { ok: boolean; detail?: string } = { ok: true }
  perId: Record<string, { ok: boolean; detail?: string }> = {}
  async notifyPaused(
    r: FlowPausedEligibleRow,
  ): Promise<{ ok: boolean; detail?: string }> {
    this.calls.push(r)
    return this.perId[r.id] ?? this.nextResult
  }
}

// ─── happy path ─────────────────────────────────────────────────────────

test('emails each eligible row + stamps paused_email_sent_at', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  const r = await handleFlowPausedNudge({ now: NOW }, store, notifier)
  assert.equal(r.body.eligible_count, 2)
  assert.equal(r.body.notified_count, 2)
  assert.equal(r.body.notify_failures.length, 0)
  assert.deepEqual(notifier.calls.map((x) => x.id).sort(), ['a', 'b'])
  assert.deepEqual(store.marked.map((x) => x.id).sort(), ['a', 'b'])
  assert.equal(store.marked[0].at, NOW.toISOString())
})

test('empty eligible list is a clean no-op', async () => {
  const store = new FakeStore([])
  const notifier = new FakeNotifier()
  const r = await handleFlowPausedNudge({ now: NOW }, store, notifier)
  assert.equal(r.body.eligible_count, 0)
  assert.equal(r.body.notified_count, 0)
})

test('records examined_at', async () => {
  const store = new FakeStore([row('a')])
  const notifier = new FakeNotifier()
  const r = await handleFlowPausedNudge({ now: NOW }, store, notifier)
  assert.equal(r.body.examined_at, NOW.toISOString())
})

// ─── notifier failures ─────────────────────────────────────────────────

test('notifier failure does NOT stamp paused_email_sent_at — retry next day', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  notifier.perId['a'] = { ok: false, detail: 'resend 503' }
  const r = await handleFlowPausedNudge({ now: NOW }, store, notifier)
  assert.equal(r.body.notified_count, 1)
  assert.equal(r.body.notify_failures.length, 1)
  assert.equal(r.body.notify_failures[0].id, 'a')
  // Only the successful send marks the column
  assert.deepEqual(store.marked.map((x) => x.id), ['b'])
})

test('thrown notifier rejection is captured as a notify failure, not a crash', async () => {
  const store = new FakeStore([row('a')])
  const notifier: FlowPausedNudgeNotifier = {
    notifyPaused: async () => {
      throw new Error('boom')
    },
  }
  const r = await handleFlowPausedNudge({ now: NOW }, store, notifier)
  assert.equal(r.body.notify_failures.length, 1)
  assert.match(r.body.notify_failures[0].detail, /boom/)
  // Throw means no stamp
  assert.equal(store.marked.length, 0)
})

// ─── ordering ──────────────────────────────────────────────────────────

test('notifies BEFORE stamping (so stamp only happens on confirmed send)', async () => {
  const store = new FakeStore([row('a')])
  const order: string[] = []
  const trackingStore: FlowPausedNudgeStore = {
    async findEligible(_n: Date) {
      return store.eligible
    },
    async markEmailSent(id: string, _at: Date) {
      order.push('stamp:' + id)
      store.marked.push({ id, at: NOW.toISOString() })
    },
  }
  const notifier: FlowPausedNudgeNotifier = {
    async notifyPaused(r) {
      order.push('notify:' + r.id)
      return { ok: true }
    },
  }
  await handleFlowPausedNudge({ now: NOW }, trackingStore, notifier)
  assert.deepEqual(order, ['notify:a', 'stamp:a'])
})

// ─── skipNotify ────────────────────────────────────────────────────────

test('skipNotify suppresses everything cleanly (dry-run mode)', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  const r = await handleFlowPausedNudge(
    { now: NOW, skipNotify: true },
    store,
    notifier,
  )
  assert.equal(notifier.calls.length, 0)
  assert.equal(store.marked.length, 0)
  assert.equal(r.body.notified_count, 0)
  assert.equal(r.body.eligible_count, 2)
})
