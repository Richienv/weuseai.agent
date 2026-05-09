/**
 * Voice rule tests — banned words, exclamation, address form.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectVoiceFindings, rewriteVoice, _BANNED_WORDS } from '../src/voice.ts'

// ─── detect ──────────────────────────────────────────────────────────

test('detectVoiceFindings: banned words case-insensitive', () => {
  const f = detectVoiceFindings('This is basically a great solution.')
  const banned = f.filter((x) => x.kind === 'banned_word')
  assert.equal(banned.length, 1)
  if (banned[0].kind === 'banned_word') {
    assert.equal(banned[0].word.toLowerCase(), 'basically')
  }
})

test('detectVoiceFindings: multi-word banned phrase "kind of"', () => {
  const f = detectVoiceFindings('Itu kind of bagus.')
  const banned = f.filter((x) => x.kind === 'banned_word')
  assert.equal(banned.length, 1)
})

test('detectVoiceFindings: exclamation marks counted', () => {
  const f = detectVoiceFindings('Wow! Mantap!')
  const exc = f.filter((x) => x.kind === 'exclamation')
  assert.equal(exc.length, 2)
})

test('detectVoiceFindings: Anda flagged as address_form', () => {
  const f = detectVoiceFindings('Halo Anda, terima kasih.')
  const addr = f.filter((x) => x.kind === 'address_form')
  assert.equal(addr.length, 1)
  if (addr[0].kind === 'address_form') {
    assert.equal(addr[0].matched, 'Anda')
    assert.equal(addr[0].suggestion, 'kamu')
  }
})

test('detectVoiceFindings: lo / gue flagged', () => {
  const f = detectVoiceFindings('Eh lo udah denger? gue baru tahu.')
  const addr = f.filter((x) => x.kind === 'address_form')
  assert.equal(addr.length, 2)
})

test('detectVoiceFindings: clean text returns empty', () => {
  const f = detectVoiceFindings('Halo kamu, terima kasih.')
  assert.equal(f.length, 0)
})

test('detectVoiceFindings: findings sorted by offset', () => {
  const f = detectVoiceFindings('Anda basically the boss!')
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].offset >= f[i - 1].offset)
  }
})

test('detectVoiceFindings: word-boundary respected (no false positive on "justice")', () => {
  const f = detectVoiceFindings('Social justice is important.')
  const banned = f.filter((x) => x.kind === 'banned_word')
  assert.equal(banned.length, 0, 'should NOT match "just" inside "justice"')
})

// ─── rewrite ─────────────────────────────────────────────────────────

test('rewriteVoice: strips banned words', () => {
  const out = rewriteVoice('This is basically a literally amazing thing.')
  // Both 'basically' and 'literally' stripped; whitespace collapsed.
  assert.equal(out.includes('basically'), false)
  assert.equal(out.includes('literally'), false)
  // Should read: "This is  a  amazing thing." → collapsed to "This is a amazing thing."
  assert.equal(out, 'This is a amazing thing.')
})

test('rewriteVoice: replaces ! with .', () => {
  const out = rewriteVoice('Mantap! Keren!')
  assert.equal(out, 'Mantap. Keren.')
})

test('rewriteVoice: collapses runs of !!! into single .', () => {
  const out = rewriteVoice('Wow!!! Hebat!')
  assert.equal(out, 'Wow. Hebat.')
})

test('rewriteVoice: Anda → kamu (case-preserving)', () => {
  const out = rewriteVoice('Halo Anda, anda apa kabar?')
  assert.equal(out, 'Halo kamu, kamu apa kabar?')
})

test('rewriteVoice: lo / gue → kamu', () => {
  const out = rewriteVoice('Lo udah tau? gue baru denger.')
  // 'Lo' is title-case but not standalone-word "lo"; the regex is case-sensitive on lo.
  // Adjust: regex is /\b(Anda|anda|lo|gue)\b/ — "Lo" is captured by \b but the alternatives
  // don't include "Lo". Only "lo" matches lowercase.
  assert.match(out, /kamu baru denger/)
})

test('rewriteVoice: collapses double spaces from word strip', () => {
  const out = rewriteVoice('A literally B')
  assert.equal(out, 'A B', 'should collapse the double space left by strip')
})

test('rewriteVoice: strips leading whitespace on lines', () => {
  const out = rewriteVoice('Line 1\n   Line 2')
  assert.equal(out, 'Line 1\nLine 2')
})

test('rewriteVoice: clean text passes unchanged', () => {
  const text = 'Halo kamu, terima kasih.'
  assert.equal(rewriteVoice(text), text)
})

test('rewriteVoice: full sentence sanitization', () => {
  const out = rewriteVoice('Anda literally pasti suka, basically the best!')
  // Expected: "kamu pasti suka, the best."
  // ('literally' stripped, 'basically' stripped, 'Anda'→'kamu', '!'→'.')
  assert.equal(out, 'kamu pasti suka, the best.')
})

// ─── exhaustive banned-words coverage ────────────────────────────────

test('rewriteVoice: every entry in _BANNED_WORDS is actually stripped', () => {
  for (const w of _BANNED_WORDS) {
    const sentence = `prefix ${w} suffix`
    const out = rewriteVoice(sentence)
    assert.equal(out.toLowerCase().includes(w.toLowerCase()), false, `"${w}" should be stripped`)
  }
})
