/**
 * End-to-end transformLlmOutput tests covering allowlist + perf.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { transformLlmOutput } from '../src/index.ts'
import { resolveAllowedPii, ALLOWLIST } from '../src/allowlist.ts'

// ─── happy path ─────────────────────────────────────────────────────

test('transform: redacts PII + cleans voice in one pass', () => {
  const r = transformLlmOutput({
    text: 'Halo Anda, hubungi saya di +6281234567890 atau email founder@example.com. Mantap!',
    personaSlug: 'doc-expert',
    skillId: 'invoice-generator',
  })
  assert.match(r.text, /\[PHONE_REDACTED\]/)
  assert.match(r.text, /\[EMAIL_REDACTED\]/)
  assert.match(r.text, /Halo kamu/)
  assert.equal(r.text.includes('!'), false)
  assert.equal(r.text.includes('+62'), false)
  assert.equal(r.modified, true)
})

test('transform: clean text passes unchanged with modified=false', () => {
  const r = transformLlmOutput({
    text: 'Halo kamu, ini text bersih tanpa pelanggaran.',
    personaSlug: 'the-pro',
    skillId: 'briefing-builder',
  })
  assert.equal(r.modified, false)
  assert.equal(r.text, 'Halo kamu, ini text bersih tanpa pelanggaran.')
})

// ─── allowlist ──────────────────────────────────────────────────────

test('transform: all-in-one-business-agent/incorporation-advisor passes NPWP through', () => {
  const r = transformLlmOutput({
    text: 'NPWP contoh: 12.345.678.9-012.345 — wajib untuk PT.',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'incorporation-advisor',
  })
  assert.match(r.text, /12\.345\.678\.9-012\.345/, 'NPWP should be preserved')
  // But still REPORTED in piiMatches for audit.
  assert.ok(r.piiMatches.some((m) => m.kind === 'npwp'))
})

test('transform: all-in-one-business-agent/compliance-checker passes NPWP + KTP', () => {
  const r = transformLlmOutput({
    text: 'KTP: 1234567890123456, NPWP: 12.345.678.9-012.345',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'compliance-checker',
  })
  assert.match(r.text, /1234567890123456/)
  assert.match(r.text, /12\.345\.678\.9-012\.345/)
})

test('transform: all-in-one-business-agent/compliance-checker still redacts non-allowlisted PII', () => {
  const r = transformLlmOutput({
    text: 'Email tukang pajak: tax@kantorpajak.go.id',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'compliance-checker',
  })
  assert.match(r.text, /\[EMAIL_REDACTED\]/, 'email NOT in allowlist → should redact')
})

test('transform: NON-allowlisted skill in business-director still redacts NPWP', () => {
  const r = transformLlmOutput({
    text: 'NPWP: 12.345.678.9-012.345',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'business-roadmap-tracker',   // NOT on allowlist
  })
  assert.match(r.text, /\[NPWP_REDACTED\]/)
})

test('transform: other personas always redact NPWP regardless of skill id', () => {
  const r = transformLlmOutput({
    text: 'NPWP: 12.345.678.9-012.345',
    personaSlug: 'doc-expert',
    skillId: 'incorporation-advisor',   // matching ID but wrong persona
  })
  assert.match(r.text, /\[NPWP_REDACTED\]/)
})

// ─── allowlist resolution ───────────────────────────────────────────

test('resolveAllowedPii: exact persona+skill match returns allowedPii', () => {
  const allowed = resolveAllowedPii({
    text: 'x',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'incorporation-advisor',
  })
  assert.deepEqual([...allowed], ['npwp'])
})

test('resolveAllowedPii: no match returns empty', () => {
  const allowed = resolveAllowedPii({
    text: 'x',
    personaSlug: 'doc-expert',
    skillId: 'invoice-generator',
  })
  assert.deepEqual([...allowed], [])
})

test('ALLOWLIST: covers exactly the locked Q4 entries', () => {
  // Phase 4 Q4 lock: Business Director's incorporation-advisor +
  // compliance-checker only. Future entries require explicit founder
  // approval (per CLAUDE.md "When to STOP and ask founder").
  assert.equal(ALLOWLIST.length, 2)
  const ids = ALLOWLIST.map((e) => `${e.personaSlug}/${e.skillId}`).sort()
  assert.deepEqual(ids, [
    'all-in-one-business-agent/compliance-checker',
    'all-in-one-business-agent/incorporation-advisor',
  ])
})

// ─── audit reporting ────────────────────────────────────────────────

test('transform: reports all PII matches even when allowlisted (audit trail)', () => {
  const r = transformLlmOutput({
    text: 'NPWP A: 12.345.678.9-012.345, NPWP B: 11.222.333.4-555.666',
    personaSlug: 'all-in-one-business-agent',
    skillId: 'incorporation-advisor',
  })
  // Both NPWP found in matches; both pass through in text.
  assert.equal(r.piiMatches.length, 2)
  assert.equal(r.piiMatches.every((m) => m.kind === 'npwp'), true)
})

test('transform: reports voice findings even after auto-correction', () => {
  const r = transformLlmOutput({
    text: 'Anda basically genius!',
    personaSlug: 'doc-expert',
    skillId: 'invoice-generator',
  })
  // Findings array captures violations BEFORE rewrite.
  assert.ok(r.voiceFindings.some((f) => f.kind === 'banned_word'))
  assert.ok(r.voiceFindings.some((f) => f.kind === 'exclamation'))
  assert.ok(r.voiceFindings.some((f) => f.kind === 'address_form'))
})

// ─── Q5=A perf monitoring (no cap) ─────────────────────────────────

test('transform: durationMs reported (perf monitoring; no cap)', () => {
  const r = transformLlmOutput({
    text: 'Halo kamu',
    personaSlug: 'the-pro',
    skillId: 'briefing-builder',
  })
  assert.equal(typeof r.durationMs, 'number')
  assert.ok(r.durationMs >= 0)
})

test('transform: 5k-char text completes in reasonable time', () => {
  const longText =
    'Halo kamu. ' + 'Lorem ipsum dolor sit amet. '.repeat(180) + 'Email: x@y.id'
  // ~5400 chars; well within Q5=A's no-cap budget.
  const r = transformLlmOutput({
    text: longText,
    personaSlug: 'doc-expert',
    skillId: 'invoice-generator',
  })
  // Don't assert a specific duration — just that it returns reasonably.
  // Q5=A says 50-100ms is fine; 1000ms is the alarm threshold.
  assert.ok(r.durationMs < 1000, `5400-char transform took ${r.durationMs}ms (expected <1000ms)`)
  assert.ok(r.text.includes('[EMAIL_REDACTED]'))
})

// ─── emissionContext plumbing for Phase 4.5+ ────────────────────────

test('transform: emissionContext field is accepted (plumbing for 4.5)', () => {
  // Phase 4-4 v0 ignores it but Phase 4.5+ uses it for per-context
  // detection. Test asserts the API accepts the field.
  const r = transformLlmOutput({
    text: 'Halo kamu',
    personaSlug: 'social-conductor',
    skillId: 'post-drafter',
    emissionContext: 'social-post',
  })
  assert.ok(r)
})

// ─── edge cases ─────────────────────────────────────────────────────

test('transform: empty text returns empty', () => {
  const r = transformLlmOutput({
    text: '',
    personaSlug: 'the-pro',
    skillId: 'briefing-builder',
  })
  assert.equal(r.text, '')
  assert.equal(r.piiMatches.length, 0)
  assert.equal(r.voiceFindings.length, 0)
  assert.equal(r.modified, false)
})

test('transform: text with only PII (no narrative) still works', () => {
  const r = transformLlmOutput({
    text: '081234567890',
    personaSlug: 'the-pro',
    skillId: 'briefing-builder',
  })
  assert.equal(r.text, '[PHONE_REDACTED]')
})

test('transform: text mixing multiple PII kinds and voice violations', () => {
  const r = transformLlmOutput({
    text: 'Anda hubungi 081234567890 atau email founder@example.com! Honestly basically the best!',
    personaSlug: 'doc-expert',
    skillId: 'invoice-generator',
  })
  // Output: PII redacted, exclamations gone, banned words gone, Anda→kamu
  assert.match(r.text, /^kamu hubungi \[PHONE_REDACTED\]/)
  assert.match(r.text, /\[EMAIL_REDACTED\]/)
  assert.equal(r.text.includes('!'), false)
  assert.equal(r.text.toLowerCase().includes('honestly'), false)
  assert.equal(r.text.toLowerCase().includes('basically'), false)
})
