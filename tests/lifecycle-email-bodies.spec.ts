// Unit tests for lifecycle-email-bodies.ts (Phase A2 PR 1).
//
// Six lifecycle-moment email body builders that each substitute the
// {{variables}} from assets/email-templates/*.md, produce { subject, text },
// and honor CLAUDE.md voice rules (BI primary, kamu form, zero exclamation
// marks, no banned words).
//
// Drift between the markdown source-of-truth and the TS string constants
// is covered by tests/email-template-drift.spec.ts — those tests fail loud
// if either side moves out of lockstep.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLifecycleWelcomeEmailBody,
  buildSetupHelpEmailBody,
  buildFlowPausedEmailBody,
  buildFlowExpiredEmailBody,
  buildRefundEmailBody,
  buildSupportHandoffEmailBody,
} from '../supabase/functions/_shared/lifecycle-email-bodies.ts'

const BANNED_WORDS = [
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
]

function assertVoiceRules(text: string, ctx: string): void {
  // kamu form, never Anda or lo/gue
  assert.match(text, /\bkamu\b/i, `${ctx}: must use "kamu"`)
  assert.doesNotMatch(text, /\bAnda\b/, `${ctx}: must not use "Anda"`)
  assert.doesNotMatch(text, /\bgue\b/i, `${ctx}: must not use "gue"`)
  assert.doesNotMatch(
    text,
    /(^|[^a-zA-Z])lo([^a-zA-Z]|$)/,
    `${ctx}: must not use slang "lo"`,
  )
  // Zero exclamation marks in body copy
  assert.equal(
    (text.match(/!/g) ?? []).length,
    0,
    `${ctx}: must have zero exclamation marks`,
  )
  // No banned words
  for (const word of BANNED_WORDS) {
    assert.doesNotMatch(
      text,
      new RegExp(`\\b${word}\\b`, 'i'),
      `${ctx}: contains banned word "${word}"`,
    )
  }
  // Brand signoff present
  assert.match(text, /weuseai\.agent/, `${ctx}: must sign off with weuseai.agent`)
}

function assertNoUnsubstituted(text: string, ctx: string): void {
  assert.doesNotMatch(
    text,
    /\{\{[a-z_]+\}\}/i,
    `${ctx}: unsubstituted template variable present`,
  )
}

// ─── welcome (lifecycle variant) ────────────────────────────────────────

describe('buildLifecycleWelcomeEmailBody — welcome.md', () => {
  const sample = buildLifecycleWelcomeEmailBody({
    display_name: 'Renita',
    tier: 'Pro',
    bot_username: 'renitabot',
    first_persona: 'The Pro',
    dashboard_url: 'https://weuseai-agent.vercel.app/dashboard?cid=abc',
  })

  test('subject mentions agent siap', () => {
    assert.match(sample.subject, /Agent kamu siap dipakai/i)
  })

  test('substitutes display_name, tier, bot_username, first_persona, dashboard_url', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /paket Pro/)
    assert.match(sample.text, /t\.me\/renitabot/)
    assert.match(sample.text, /persona The Pro/)
    assert.match(sample.text, /https:\/\/weuseai-agent\.vercel\.app\/dashboard\?cid=abc/)
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'welcome')
    assertNoUnsubstituted(sample.text, 'welcome')
  })
})

// ─── setup-help ─────────────────────────────────────────────────────────

describe('buildSetupHelpEmailBody — setup-help.md', () => {
  const sample = buildSetupHelpEmailBody({
    display_name: 'Renita',
    stuck_step: 'bot token Telegram',
    resume_url: 'https://weuseai-agent.vercel.app/onboarding?cid=abc&step=bot-token',
  })

  test('subject mentions setup tersangkut', () => {
    assert.match(sample.subject, /tersangkut/i)
  })

  test('substitutes display_name, stuck_step, resume_url', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /bot token Telegram/)
    assert.match(
      sample.text,
      /https:\/\/weuseai-agent\.vercel\.app\/onboarding\?cid=abc&step=bot-token/,
    )
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'setup-help')
    assertNoUnsubstituted(sample.text, 'setup-help')
  })
})

// ─── flow-paused ────────────────────────────────────────────────────────

describe('buildFlowPausedEmailBody — flow-paused.md', () => {
  const sample = buildFlowPausedEmailBody({
    display_name: 'Renita',
    playbook_name: 'Pendaftaran PT Perorangan',
    parked_reason: 'menunggu kamu kirim KTP',
    days_remaining: 7,
    resume_url: 'https://weuseai-agent.vercel.app/dashboard/flow/run-123',
  })

  test('subject embeds playbook name', () => {
    assert.match(sample.subject, /Pendaftaran PT Perorangan/)
  })

  test('substitutes display_name, playbook_name, parked_reason, days_remaining, resume_url', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /Pendaftaran PT Perorangan/)
    assert.match(sample.text, /menunggu kamu kirim KTP/)
    assert.match(sample.text, /7 hari/)
    assert.match(
      sample.text,
      /https:\/\/weuseai-agent\.vercel\.app\/dashboard\/flow\/run-123/,
    )
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'flow-paused')
    assertNoUnsubstituted(sample.text, 'flow-paused')
  })
})

// ─── flow-expired ───────────────────────────────────────────────────────

describe('buildFlowExpiredEmailBody — flow-expired.md', () => {
  const sample = buildFlowExpiredEmailBody({
    display_name: 'Renita',
    playbook_name: 'Pendaftaran PT Perorangan',
    parked_at_label: 'menunggu KTP',
    restart_url: 'https://weuseai-agent.vercel.app/dashboard/flow/start?playbook=pt',
    dashboard_url: 'https://weuseai-agent.vercel.app/dashboard?cid=abc',
  })

  test('subject mentions ditutup otomatis 14 hari', () => {
    assert.match(sample.subject, /ditutup otomatis setelah 14 hari/i)
  })

  test('substitutes display_name, playbook_name, parked_at_label, restart_url, dashboard_url', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /Pendaftaran PT Perorangan/)
    assert.match(sample.text, /menunggu KTP/)
    assert.match(
      sample.text,
      /https:\/\/weuseai-agent\.vercel\.app\/dashboard\/flow\/start\?playbook=pt/,
    )
    assert.match(
      sample.text,
      /https:\/\/weuseai-agent\.vercel\.app\/dashboard\?cid=abc/,
    )
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'flow-expired')
    assertNoUnsubstituted(sample.text, 'flow-expired')
  })
})

// ─── refund ─────────────────────────────────────────────────────────────

describe('buildRefundEmailBody — refund.md', () => {
  const sample = buildRefundEmailBody({
    display_name: 'Renita',
    invoice_id: 'INV-2026-001',
    refund_amount_idr: 'Rp 399.000',
    refund_method: 'QRIS',
    eta_business_days: 7,
  })

  test('subject embeds invoice_id', () => {
    assert.match(sample.subject, /INV-2026-001/)
  })

  test('substitutes display_name, refund_amount_idr, refund_method, eta_business_days in body (invoice_id stays in subject only per template)', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /Rp 399\.000/)
    assert.match(sample.text, /QRIS/)
    assert.match(sample.text, /7 hari kerja/)
    // invoice_id appears in subject only per refund.md template
    assert.match(sample.subject, /INV-2026-001/)
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'refund')
    assertNoUnsubstituted(sample.text, 'refund')
  })
})

// ─── support-handoff ────────────────────────────────────────────────────

describe('buildSupportHandoffEmailBody — support-handoff.md', () => {
  const sample = buildSupportHandoffEmailBody({
    display_name: 'Renita',
    ticket_id: 'T-2026-0142',
    summary_done:
      'menyalakan ulang gateway dan menyegarkan koneksi LLM kamu',
    action_required: 'tidak ada',
    verified_at_label: 'tadi pagi pukul 10.42 WIB',
  })

  test('subject embeds ticket_id', () => {
    assert.match(sample.subject, /T-2026-0142/)
  })

  test('substitutes display_name, ticket_id, summary_done, action_required, verified_at_label', () => {
    assert.match(sample.text, /Halo Renita,/)
    assert.match(sample.text, /T-2026-0142/)
    assert.match(sample.text, /menyalakan ulang gateway/)
    assert.match(sample.text, /tidak ada/)
    assert.match(sample.text, /tadi pagi pukul 10\.42 WIB/)
  })

  test('passes voice rules', () => {
    assertVoiceRules(sample.text, 'support-handoff')
    assertNoUnsubstituted(sample.text, 'support-handoff')
  })
})
