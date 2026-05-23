// Phase A2 PR 3 — integration test for flow-state-ttl-sweep wiring.
//
// Confirms the email notifier from flow-expired-email-notifier.ts plays
// nicely with the existing handleFlowStateTtlSweep pure handler:
//   - Notifier is called for every aborted row
//   - Send succeeds → notified_count++ (no notify_failure)
//   - Send fails    → notify_failures includes the row id
//   - Send is skipped (no customer_email) → notify_failures records it,
//     row still aborted (handler invariant)
//
// The unit tests for the notifier factory itself live in
// tests/flow-expired-email-notifier.spec.ts. This file is the seam
// test that proves the two compose correctly.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleFlowStateTtlSweep,
  type ExpiredRow,
  type FlowStateTtlSweepStore,
} from '../supabase/functions/_shared/flow-state-ttl-sweep-handler.ts'
import {
  makeFlowExpiredEmailNotifier,
  type FlowExpiredEmailRow,
} from '../supabase/functions/_shared/flow-expired-email-notifier.ts'
import type { SendEmailInput, SendEmailResult } from '../supabase/functions/_shared/email-delivery.ts'

const NOW = new Date('2026-06-05T12:00:00.000Z')

function row(id: string, over: Partial<FlowExpiredEmailRow> = {}): ExpiredRow {
  return {
    id,
    customer_id: 'c-' + id,
    playbook_id: 'pt-perorangan-registration',
    status: 'escalated',
    expires_at: '2026-05-22T12:00:00.000Z',
    customer_email: id + '@example.com',
    customer_display_name: 'Renita',
    state_data: {},
    ...over,
  } as ExpiredRow & FlowExpiredEmailRow
}

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

// ─── happy path ─────────────────────────────────────────────────────────

test('sweep + email notifier: aborts every row + emails each customer once', async () => {
  const sent: SendEmailInput[] = []
  const sendEmail = async (input: SendEmailInput): Promise<SendEmailResult> => {
    sent.push(input)
    return { ok: true, resend_id: 'r-' + sent.length }
  }
  const store = new FakeStore([row('a'), row('b'), row('c')])
  const notifier = makeFlowExpiredEmailNotifier({ sendEmail })
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.equal(r.body.swept_count, 3)
  assert.deepEqual(store.aborted.sort(), ['a', 'b', 'c'])
  assert.equal(r.body.notified_count, 3)
  assert.equal(r.body.notify_failures.length, 0)
  assert.equal(sent.length, 3)
  assert.deepEqual(
    sent.map((s) => s.to).sort(),
    ['a@example.com', 'b@example.com', 'c@example.com'],
  )
  for (const s of sent) {
    assert.match(s.subject, /ditutup otomatis setelah 14 hari/)
    assert.match(s.text, /Halo Renita,/)
  }
})

// ─── send failure ──────────────────────────────────────────────────────

test('send failure on one row: row STILL aborted, failure recorded, other rows email OK', async () => {
  const sendEmail = async (input: SendEmailInput): Promise<SendEmailResult> => {
    if (input.to === 'b@example.com') {
      return { ok: false, error: 'resend_http_error', detail: 'HTTP 503' }
    }
    return { ok: true, resend_id: 'r-1' }
  }
  const store = new FakeStore([row('a'), row('b'), row('c')])
  const notifier = makeFlowExpiredEmailNotifier({ sendEmail })
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.deepEqual(store.aborted.sort(), ['a', 'b', 'c'])
  assert.equal(r.body.notified_count, 2)
  assert.equal(r.body.notify_failures.length, 1)
  assert.equal(r.body.notify_failures[0].id, 'b')
  assert.match(r.body.notify_failures[0].detail, /resend_http_error.*HTTP 503/)
})

// ─── missing customer email row ────────────────────────────────────────

test('row with empty customer_email: still aborted, no send attempt, notify_failure detail set', async () => {
  let calls = 0
  const sendEmail = async (): Promise<SendEmailResult> => {
    calls += 1
    return { ok: true, resend_id: 'r-1' }
  }
  const store = new FakeStore([
    row('a', { customer_email: '' }),
    row('b'),
  ])
  const notifier = makeFlowExpiredEmailNotifier({ sendEmail })
  const r = await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.deepEqual(store.aborted.sort(), ['a', 'b'])
  // Only 1 actual send attempt (for b), since a had no email
  assert.equal(calls, 1)
  assert.equal(r.body.notify_failures.length, 1)
  assert.equal(r.body.notify_failures[0].id, 'a')
  assert.match(r.body.notify_failures[0].detail, /no_customer_email/)
})

// ─── playbook_label override ───────────────────────────────────────────

test('state_data.playbook_label overrides the slug-derived label in the email subject', async () => {
  const sent: SendEmailInput[] = []
  const sendEmail = async (input: SendEmailInput): Promise<SendEmailResult> => {
    sent.push(input)
    return { ok: true, resend_id: 'r-1' }
  }
  const store = new FakeStore([
    row('a', { state_data: { playbook_label: 'Pendaftaran PT Perorangan' } }),
  ])
  const notifier = makeFlowExpiredEmailNotifier({ sendEmail })
  await handleFlowStateTtlSweep({ now: NOW }, store, notifier)
  assert.match(sent[0].subject, /Pendaftaran PT Perorangan/)
  assert.match(sent[0].text, /Pendaftaran PT Perorangan/)
})
