// Phase A2 PR 5 — admin-send-support-handoff-email pure handler tests.
//
// Service-role-gated POST that takes { customer_id, ticket_summary,
// resolution_summary, ticket_id?, action_required?, verified_at_label? }
// and emails the customer the support-handoff.md template.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleAdminSendSupportHandoffEmail,
  type AdminSendSupportHandoffEmailDeps,
  type AdminSendSupportHandoffEmailInput,
} from '../supabase/functions/_shared/admin-send-support-handoff-email-handler.ts'
import type { SendEmailInput, SendEmailResult } from '../supabase/functions/_shared/email-delivery.ts'

function makeDeps(over: Partial<AdminSendSupportHandoffEmailDeps> = {}): AdminSendSupportHandoffEmailDeps & {
  sent: SendEmailInput[]
} {
  const sent: SendEmailInput[] = []
  return {
    sent,
    findCustomer: over.findCustomer ?? (async () => ({
      email: 'renita@example.com',
      display_name: 'Renita',
    })),
    sendEmail:
      over.sendEmail ??
      (async (input: SendEmailInput): Promise<SendEmailResult> => {
        sent.push(input)
        return { ok: true, resend_id: 'r-1' }
      }),
  }
}

function input(over: Partial<AdminSendSupportHandoffEmailInput> = {}): AdminSendSupportHandoffEmailInput {
  return {
    customer_id: '00000000-0000-0000-0000-000000000001',
    ticket_summary: 'gateway tidak merespons setelah reboot VPS',
    resolution_summary: 'menyalakan ulang gateway dan menyegarkan koneksi LLM kamu',
    ...over,
  }
}

// ─── happy path ─────────────────────────────────────────────────────────

test('valid input → 200, support-handoff email shipped', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendSupportHandoffEmail(
    input({ ticket_id: 'T-2026-0142' }),
    deps,
  )
  assert.equal(r.ok, true)
  assert.equal(r.status, 200)
  assert.equal(deps.sent.length, 1)
  assert.equal(deps.sent[0].to, 'renita@example.com')
  assert.match(deps.sent[0].subject, /T-2026-0142/)
  assert.match(deps.sent[0].text, /Halo Renita,/)
  assert.match(deps.sent[0].text, /menyalakan ulang gateway/)
})

test('ticket_id omitted → handler generates a fallback like "T-AUTO-<timestamp>"', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.equal(r.ok, true)
  // Subject should still contain a ticket-id-shaped placeholder.
  assert.match(deps.sent[0].subject, /Tiket T-AUTO-/)
})

test('action_required defaults to "tidak ada" when omitted', async () => {
  const deps = makeDeps()
  await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.match(deps.sent[0].text, /tidak ada/)
})

test('verified_at_label defaults to current WIB-style label when omitted', async () => {
  const deps = makeDeps()
  await handleAdminSendSupportHandoffEmail(input(), deps)
  // We don't pin a specific value — just that the field rendered as
  // a non-empty string. The handler generates a default like
  // "tadi pukul HH.MM WIB".
  assert.match(deps.sent[0].text, /WIB/)
})

test('action_required override is honored', async () => {
  const deps = makeDeps()
  await handleAdminSendSupportHandoffEmail(
    input({ action_required: 'cek ulang Telegram dalam 5 menit' }),
    deps,
  )
  assert.match(deps.sent[0].text, /cek ulang Telegram dalam 5 menit/)
})

// ─── input validation ──────────────────────────────────────────────────

test('missing customer_id → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendSupportHandoffEmail(
    { ...input(), customer_id: '' } as AdminSendSupportHandoffEmailInput,
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

test('empty resolution_summary → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendSupportHandoffEmail(
    { ...input(), resolution_summary: '' },
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

// ticket_summary is meta-only — fed into the support thread but not the
// email — so it's required for audit trail but otherwise validated lightly.
test('empty ticket_summary → 400 invalid_input', async () => {
  const deps = makeDeps()
  const r = await handleAdminSendSupportHandoffEmail(
    { ...input(), ticket_summary: '' },
    deps,
  )
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
})

// ─── customer lookup ───────────────────────────────────────────────────

test('customer not found → 404 customer_not_found', async () => {
  const deps = makeDeps({ findCustomer: async () => null })
  const r = await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 404)
  assert.equal(r.error, 'customer_not_found')
})

test('customer with empty email → 422 customer_has_no_email', async () => {
  const deps = makeDeps({
    findCustomer: async () => ({ email: '', display_name: 'X' }),
  })
  const r = await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 422)
})

test('null display_name → falls back to "pelanggan"', async () => {
  const deps = makeDeps({
    findCustomer: async () => ({ email: 'renita@example.com', display_name: null }),
  })
  const r = await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.equal(r.ok, true)
  assert.match(deps.sent[0].text, /Halo pelanggan,/)
})

// ─── send failure ──────────────────────────────────────────────────────

test('sendEmail failure → 502 email_send_failed', async () => {
  const deps = makeDeps({
    sendEmail: async () => ({ ok: false, error: 'resend_http_error', detail: 'HTTP 503' }),
  })
  const r = await handleAdminSendSupportHandoffEmail(input(), deps)
  assert.equal(r.ok, false)
  assert.equal(r.status, 502)
  assert.match(r.detail!, /resend_http_error.*HTTP 503/)
})

// ─── voice rules sanity ────────────────────────────────────────────────

test('rendered body honors voice rules', async () => {
  const deps = makeDeps()
  await handleAdminSendSupportHandoffEmail(
    input({ ticket_id: 'T-1', action_required: 'cek dashboard sebentar' }),
    deps,
  )
  const text = deps.sent[0].text
  assert.equal((text.match(/!/g) ?? []).length, 0)
  assert.match(text, /\bkamu\b/i)
  assert.doesNotMatch(text, /\bAnda\b/)
})
