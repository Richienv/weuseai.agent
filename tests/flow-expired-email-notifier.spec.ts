// Tests for the flow-expired email notifier factory (Phase A2 PR 3).
//
// The flow-state-ttl-sweep handler already accepts an optional
// FlowStateTtlNotifier. This PR provides an email-backed implementation:
// renders flow-expired.md via buildFlowExpiredEmailBody and calls a
// dependency-injected sendEmail. The factory is pure — sendEmail
// passed in, no Resend dep at test time.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  makeFlowExpiredEmailNotifier,
  type FlowExpiredEmailRow,
} from '../supabase/functions/_shared/flow-expired-email-notifier.ts'

type SendEmailCall = {
  to: string
  subject: string
  text: string
}

function row(over: Partial<FlowExpiredEmailRow> = {}): FlowExpiredEmailRow {
  return {
    id: 'fs-1',
    customer_id: 'cust-1',
    playbook_id: 'pt-perorangan-registration',
    status: 'escalated',
    expires_at: '2026-06-05T12:00:00.000Z',
    customer_email: 'renita@example.com',
    customer_display_name: 'Renita',
    state_data: {},
    ...over,
  }
}

// ─── happy path ─────────────────────────────────────────────────────────

test('renders flow-expired.md and calls sendEmail with the right payload', async () => {
  const calls: SendEmailCall[] = []
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async (input) => {
      calls.push(input)
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  const r = await notifier.notifyExpired(row())
  assert.equal(r.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'renita@example.com')
  assert.match(calls[0].subject, /ditutup otomatis setelah 14 hari/)
  assert.match(calls[0].text, /Halo Renita,/)
  assert.match(calls[0].text, /Pt Perorangan Registration/)
  // dashboard + restart urls embed cid
  assert.match(calls[0].text, /https:\/\/weuseai-agent\.vercel\.app\/dashboard\?cid=cust-1/)
  assert.match(calls[0].text, /\/dashboard\/flow\/start\?playbook=pt-perorangan-registration&cid=cust-1/)
})

test('uses playbook_label from state_data when present (human-friendly)', async () => {
  const calls: SendEmailCall[] = []
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async (input) => {
      calls.push(input)
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  await notifier.notifyExpired(
    row({ state_data: { playbook_label: 'Pendaftaran PT Perorangan' } }),
  )
  assert.match(calls[0].subject, /Pendaftaran PT Perorangan/)
  assert.match(calls[0].text, /Pendaftaran PT Perorangan/)
})

test('uses parked_at_label from state_data when present', async () => {
  const calls: SendEmailCall[] = []
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async (input) => {
      calls.push(input)
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  await notifier.notifyExpired(
    row({ state_data: { parked_at_label: 'menunggu KTP' } }),
  )
  assert.match(calls[0].text, /menunggu KTP/)
})

// ─── falls back gracefully ──────────────────────────────────────────────

test('falls back to "pelanggan" when display_name is missing', async () => {
  const calls: SendEmailCall[] = []
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async (input) => {
      calls.push(input)
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  await notifier.notifyExpired(row({ customer_display_name: null }))
  assert.match(calls[0].text, /Halo pelanggan,/)
})

// ─── send failures ─────────────────────────────────────────────────────

test('reports send failure with detail (handler records as notify_failure)', async () => {
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async () => ({
      ok: false as const,
      error: 'resend_http_error',
      detail: 'HTTP 429: rate limit',
    }),
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  const r = await notifier.notifyExpired(row())
  assert.equal(r.ok, false)
  assert.match(r.detail!, /resend_http_error.*HTTP 429/)
})

test('skips rows with no customer email (returns ok:false detail noted)', async () => {
  let calls = 0
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async () => {
      calls += 1
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  const r = await notifier.notifyExpired(row({ customer_email: '' }))
  assert.equal(r.ok, false)
  assert.equal(calls, 0)
  assert.match(r.detail!, /no_customer_email/)
})

// ─── voice rules sanity check ──────────────────────────────────────────

test('rendered body honors voice rules (no exclamation, kamu form, no banned words)', async () => {
  const calls: SendEmailCall[] = []
  const notifier = makeFlowExpiredEmailNotifier({
    sendEmail: async (input) => {
      calls.push(input)
      return { ok: true as const, resend_id: 'r-1' }
    },
    dashboardBase: 'https://weuseai-agent.vercel.app',
  })
  await notifier.notifyExpired(
    row({ state_data: { playbook_label: 'Pendaftaran PT Perorangan' } }),
  )
  const text = calls[0].text
  assert.equal((text.match(/!/g) ?? []).length, 0)
  assert.match(text, /\bkamu\b/i)
  assert.doesNotMatch(text, /\bAnda\b/)
  for (const w of [
    'basically',
    'just',
    'literally',
    'honestly',
    'kind of',
    'pretty much',
    'revolutionary',
    'disrupt',
    '10x',
    'game-changer',
    'next-level',
  ]) {
    assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, 'i'))
  }
})
