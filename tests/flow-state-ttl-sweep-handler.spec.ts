// flow-state-ttl-sweep handler — pure handler tests.
//
// P4G parked-run TTL (2026-05-22 consult). The daily sweep that aborts
// parked customer_flow_state rows past their expiry. The flow-state
// handler is what STAMPS the TTL on park; this is the cleanup.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleFlowStateTtlSweep,
  type ExpiredRow,
  type FlowStateTtlNotifier,
  type FlowStateTtlSweepStore,
} from '../supabase/functions/_shared/flow-state-ttl-sweep-handler.ts'

class FakeStore implements FlowStateTtlSweepStore {
  expired: ExpiredRow[]
  aborted: string[] = []
  constructor(expired: ExpiredRow[]) {
    this.expired = expired
  }
  async findExpired(_now: Date): Promise<ExpiredRow[]> {
    return this.expired
  }
  async markAborted(id: string): Promise<void> {
    this.aborted.push(id)
  }
}

class FakeNotifier implements FlowStateTtlNotifier {
  calls: ExpiredRow[] = []
  nextResult: { ok: boolean; detail?: string } = { ok: true }
  perId: Record<string, { ok: boolean; detail?: string }> = {}
  async notifyExpired(row: ExpiredRow): Promise<{ ok: boolean; detail?: string }> {
    this.calls.push(row)
    return this.perId[row.id] ?? this.nextResult
  }
}

const NOW = new Date('2026-06-05T12:00:00.000Z')

function row(id: string, over: Partial<ExpiredRow> = {}): ExpiredRow {
  return {
    id,
    customer_id: '2f60325d-3c71-4c6e-9d9d-69d125ff5315',
    playbook_id: 'pt-perorangan-registration',
    status: 'escalated',
    expires_at: '2026-05-22T12:00:00.000Z',
    ...over,
  }
}

// ─── happy path ────────────────────────────────────────────────────────────

test('sweeps each expired row to aborted', async () => {
  const store = new FakeStore([row('a'), row('b'), row('c')])
  const r = await handleFlowStateTtlSweep({ now: NOW }, store)
  assert.equal(r.body.swept_count, 3)
  assert.deepEqual(r.body.aborted_ids.sort(), ['a', 'b', 'c'])
  assert.deepEqual(store.aborted.sort(), ['a', 'b', 'c'])
})

test('no expired rows is a clean no-op', async () => {
  const store = new FakeStore([])
  const r = await handleFlowStateTtlSweep({ now: NOW }, store)
  assert.equal(r.body.swept_count, 0)
  assert.equal(r.body.notified_count, 0)
  assert.deepEqual(r.body.aborted_ids, [])
})

test('records the examined_at timestamp', async () => {
  const store = new FakeStore([row('a')])
  const r = await handleFlowStateTtlSweep({ now: NOW }, store)
  assert.equal(r.body.examined_at, NOW.toISOString())
})

// ─── notifier ──────────────────────────────────────────────────────────────

test('notifies each customer when a notifier is supplied', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.equal(notifier.calls.length, 2)
  assert.equal(r.body.notified_count, 2)
  assert.deepEqual(r.body.notify_failures, [])
})

test('skipNotify suppresses notifications even when a notifier is supplied', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  const r = await handleFlowStateTtlSweep({ now: NOW, skipNotify: true }, store, notifier)
  assert.equal(notifier.calls.length, 0)
  assert.equal(r.body.notified_count, 0)
})

test('notifier failure does NOT block the abort — row still aborted, failure recorded', async () => {
  const store = new FakeStore([row('a'), row('b')])
  const notifier = new FakeNotifier()
  notifier.perId['a'] = { ok: false, detail: 'telegram 503' }
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.deepEqual(store.aborted.sort(), ['a', 'b']) // both still aborted
  assert.equal(r.body.notified_count, 1)
  assert.equal(r.body.notify_failures.length, 1)
  assert.equal(r.body.notify_failures[0].id, 'a')
  assert.match(r.body.notify_failures[0].detail, /telegram 503/)
})

test('a thrown notifier rejection is captured as a notify failure, not a crash', async () => {
  const store = new FakeStore([row('a')])
  const notifier: FlowStateTtlNotifier = {
    notifyExpired: async () => {
      throw new Error('boom')
    },
  }
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.equal(store.aborted.length, 1)
  assert.equal(r.body.notify_failures.length, 1)
  assert.match(r.body.notify_failures[0].detail, /boom/)
})

// ─── ordering ──────────────────────────────────────────────────────────────

test('aborts the row BEFORE attempting notification (avoids re-sweep loop on flaky notifier)', async () => {
  const store = new FakeStore([row('a')])
  const order: string[] = []
  const trackingStore: FlowStateTtlSweepStore = {
    async findExpired(_now: Date) {
      return store.expired
    },
    async markAborted(id: string) {
      order.push(`abort:${id}`)
      store.aborted.push(id)
    },
  }
  const notifier: FlowStateTtlNotifier = {
    async notifyExpired(r) {
      order.push(`notify:${r.id}`)
      return { ok: true }
    },
  }
  await handleFlowStateTtlSweep({ now: NOW }, trackingStore, notifier)
  assert.deepEqual(order, ['abort:a', 'notify:a'])
})
