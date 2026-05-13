/**
 * Sesi A Phase 3 (2026-05-13): trust-signal /welcome polish.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md.
 *
 * In scope (trust-signal-flavored P3 items):
 *   - P3-CF-1 "Apa yang sedang terjadi?" always-visible 5-step explainer accordion in state B
 *   - P3-CF-2 micro-content during 6-min wait (sample prompts + founder note)
 *   - P3-CF-3 collapse setup-script log tail under "Detail teknis" expandable
 *   - P3-CF-6 footer trust-signal drift gate (already in place from earlier
 *             pair-UX-polish; this PR pins it against regression)
 *
 * Out of scope (skipped per founder rule on non-trust-signal P3s):
 *   - P3-CF-4 pair-code copy button failure feedback (UX polish, not trust)
 *   - P3-CF-5 first /<persona> affordance (Telegram-side, not /welcome)
 *
 * Holistic-fix note (per founder rule):
 *   The pre-existing `b-longer-than-usual` panel from PR #95 has its own
 *   "Apa yang sedang terjadi" expandable. Phase 3 introduces a separate
 *   "5 langkah" accordion below the progress bar. To avoid summary-text
 *   collision on the same page the older panel's summary is renamed to
 *   "Mengapa lebih lama?" — context-appropriate (the panel only fires
 *   after 5 min). Drift-gate test below pins both.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WELCOME = path.resolve(process.cwd(), 'welcome.html')

// ─── P3-CF-1: 5-step explainer accordion ─────────────────────────────

test('P3-CF-1: state B has an always-visible "Apa yang sedang terjadi?" 5-step accordion', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Stable id so future drift / Sesi D edits can target it.
  assert.match(
    src,
    /id=["']b-whats-happening["']/,
    'must have <details id="b-whats-happening"> for the 5-step explainer',
  )
  // Summary text — audit-locked phrasing.
  assert.match(
    src,
    /<summary[^>]*>[^<]*Apa yang sedang terjadi\?/i,
    'summary text must be "Apa yang sedang terjadi?"',
  )
})

test('P3-CF-1: explainer lists 5 numbered steps with timing estimates', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const block = src.match(
    /id=["']b-whats-happening["'][\s\S]*?<\/details>/,
  )
  assert.ok(block, 'b-whats-happening block findable')
  if (block) {
    // Five distinct list items inside an <ol> (or 5 lines via <br> /
    // similar structure). We don't pin every word — Sesi D may iterate
    // copy — but the structural shape (5 entries) stays.
    const liCount = (block[0].match(/<li\b/g) ?? []).length
    assert.ok(
      liCount >= 5,
      `5-step explainer must include >=5 <li> entries (found ${liCount})`,
    )
    // At least one timing estimate in parens (audit says ~3 menit / ~2 menit / etc.)
    assert.match(
      block[0],
      /~\d+\s*menit/i,
      'explainer must show at least one "~N menit" timing estimate',
    )
  }
})

test('P3-CF-1: explainer body must not reveal infra (VPS / Hermes / Vultr / Supabase)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const block = src.match(/id=["']b-whats-happening["'][\s\S]*?<\/details>/)
  assert.ok(block, 'b-whats-happening block findable')
  if (block) {
    for (const term of ['VPS', 'Hermes', 'Vultr', 'IDCloudHost', 'Supabase', 'OpenRouter']) {
      assert.equal(
        new RegExp(`\\b${term}\\b`).test(block[0]),
        false,
        `explainer must not reveal backend infra: ${term}`,
      )
    }
  }
})

// ─── P3-CF-2: micro-content during wait ──────────────────────────────

test('P3-CF-2: state B has a sample-first-message micro-content block', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Stable id for the wait-content card. Holds the sample prompts +
  // founder note.
  assert.match(
    src,
    /id=["']b-wait-content["']/,
    'must have id="b-wait-content" block for during-wait micro-content',
  )
})

test('P3-CF-2: wait-content includes at least 2 sample first-message ideas', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const block = src.match(/id=["']b-wait-content["'][\s\S]*?<\/div>\s*<!--\s*end b-wait-content/i)
  assert.ok(block, 'b-wait-content block findable (with end marker)')
  if (block) {
    // Audit suggests prompts like "briefing pagi" or "rangkum artikel". We
    // pin only the structural shape: at least 2 entries that read as
    // first-message ideas. The "Coba:" lead-in is one common idiom for
    // BI prompts; check for the existence of multiple bullets / li / br
    // patterns or distinct quoted prompts.
    // Simplest robust check: at least 2 lines containing distinct prompts.
    const promptCandidates = block[0].match(/(?:Coba\s*[:—]|"[A-Z][^"]{6,}")/gi) ?? []
    assert.ok(
      promptCandidates.length >= 2,
      `b-wait-content must include >= 2 sample prompts (found ${promptCandidates.length})`,
    )
  }
})

test('P3-CF-2: wait-content includes founder note with email', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const block = src.match(/id=["']b-wait-content["'][\s\S]*?<\/div>\s*<!--\s*end b-wait-content/i)
  assert.ok(block, 'b-wait-content block findable')
  if (block) {
    // Audit copy:
    //   "Dibuat di Jakarta untuk pengguna Indonesia. Pertanyaan teknis
    //    langsung ke saya: kidnovell.richie@gmail.com — Richie"
    assert.match(
      block[0],
      /Dibuat di Jakarta/i,
      'founder note must mention "Dibuat di Jakarta"',
    )
    assert.match(
      block[0],
      /kidnovell\.richie@gmail\.com/,
      'founder note must include the founder email',
    )
    assert.match(
      block[0],
      /Richie/,
      'founder note must sign off with "Richie"',
    )
  }
})

// ─── P3-CF-3: log tail collapse ─────────────────────────────────────

test('P3-CF-3: setup-script log tail is wrapped in "Detail teknis" expandable', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The existing #b-progress-tail (log line) must now live INSIDE a
  // <details> with summary "Detail teknis" — calmer default view.
  // Inferred-stage label (#b-progress-stage) stays visible directly,
  // not collapsed.
  assert.match(
    src,
    /<summary[^>]*>[^<]*Detail teknis/i,
    'progress overlay must have a "Detail teknis" summary',
  )
  // Stable id for the wrapping <details>.
  assert.match(
    src,
    /<details[^>]*id=["']b-progress-tail-details["']/,
    'log tail must be wrapped in <details id="b-progress-tail-details">',
  )
})

test('P3-CF-3: inferred_stage label (#b-progress-stage) stays OUTSIDE the Detail teknis collapse', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Structural: #b-progress-stage must NOT be inside #b-progress-tail-details.
  const detailsBlock = src.match(/<details[^>]*id=["']b-progress-tail-details["'][\s\S]*?<\/details>/)
  assert.ok(detailsBlock, 'b-progress-tail-details block findable')
  if (detailsBlock) {
    assert.equal(
      /id=["']b-progress-stage["']/.test(detailsBlock[0]),
      false,
      'b-progress-stage must remain OUTSIDE the Detail teknis collapse (always visible)',
    )
  }
})

// ─── P3-CF-6: footer trust-signal drift gate ─────────────────────────

test('P3-CF-6: welcome.html footer carries founder + Jakarta + contact', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Drift gate — already in place from earlier post-pair UX polish.
  // This test pins it against future refactors.
  assert.match(src, /Richie Kidnovell/, 'footer must name founder')
  assert.match(src, /Jakarta/i, 'footer must reference Jakarta')
  assert.match(
    src,
    /(support@weuseai|kidnovell\.richie@gmail)/i,
    'footer must include a contact email',
  )
  assert.match(
    src,
    /wa\.me\/6282154902561/,
    'footer must include the WhatsApp support number',
  )
})

// ─── Disambiguation: older b-longer-than-usual summary renamed ──────

test('Phase 3: b-longer-than-usual summary renamed to avoid collision with P3-CF-1', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The pre-existing panel from PR #95 had summary "Apa yang sedang
  // terjadi" — same text as the new P3-CF-1 accordion. To prevent
  // two identical summaries on the same page, the older panel's
  // summary is renamed to "Mengapa lebih lama?" (context-appropriate
  // since the panel only fires after 5 min).
  const longerBlock = src.match(/id=["']b-longer-than-usual-details["'][\s\S]*?<\/details>/)
  assert.ok(longerBlock, 'b-longer-than-usual-details still exists (PR #95 invariant)')
  if (longerBlock) {
    assert.match(
      longerBlock[0],
      /<summary[^>]*>[^<]*Mengapa lebih lama\?/i,
      'b-longer-than-usual summary must be renamed to "Mengapa lebih lama?"',
    )
  }
})

// ─── Brand-voice + scope guards ─────────────────────────────────────

test('Phase 3: all new copy passes brand-voice rules', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Scope to the three new blocks.
  const newBlocks = [
    src.match(/id=["']b-whats-happening["'][\s\S]*?<\/details>/)?.[0],
    src.match(/id=["']b-wait-content["'][\s\S]*?<\/div>\s*<!--\s*end b-wait-content/i)?.[0],
    src.match(/<details[^>]*id=["']b-progress-tail-details["'][\s\S]*?<\/details>/)?.[0],
  ].filter(Boolean) as string[]
  for (const block of newBlocks) {
    for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
      assert.equal(
        block.toLowerCase().includes(word),
        false,
        `Phase 3 block must not contain banned word: ${word}`,
      )
    }
    // Exclamation marks: none in visible text nodes.
    const textNodes = block.match(/>[^<>]{5,}</g) ?? []
    for (const t of textNodes) {
      assert.equal(
        t.includes('!'),
        false,
        `Phase 3 text node contains "!": ${t.slice(0, 80)}`,
      )
    }
  }
})

test('Phase 3: scope guard — pass-3 server-error mapping untouched', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  assert.equal(
    /tos_required|tos_stale|tier_does_not_grant_persona|x_cid_mismatch/.test(src),
    false,
    'pass-3 server-error codes must not leak into welcome.html copy',
  )
})
