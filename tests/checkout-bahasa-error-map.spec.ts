/**
 * Batch A2 (2026-05-13): Bahasa error mapping on checkout submit.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-1.
 *
 * Pre-fix: any server error code (invalid_email, invalid_methodId,
 * invalid_plan, consent_persist_failed) surfaced verbatim in the UI as
 * `Gagal: invalid_methodId. Coba lagi atau pilih method lain.` Customer
 * sees English error codes in a Bahasa flow. Premium voice broken at
 * the first stumble.
 *
 * Fix: map each server error code to calm-premium BI. After ≥ 2
 * failed retries, surface an inline WhatsApp escalation link.
 *
 * Source-grep tests only — checkout.html is vanilla JS in a script
 * tag, no jsdom. Behavioural verification is the Vercel preview.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CHECKOUT = path.resolve(process.cwd(), 'checkout.html')

// ─── 1. Bahasa mapping per server error code ──────────────────────────

test('A2: invalid_email maps to Bahasa email-format hint', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Audit-locked copy. Includes the example pattern "(mis. kamu@email.com)"
  // so the customer knows the expected shape without having to leave the
  // page. Stable substring — the mapper exists and uses this verbatim.
  assert.match(
    src,
    /invalid_email[\s\S]{0,200}Email belum benar/i,
    'invalid_email branch must surface "Email belum benar" Bahasa copy',
  )
  assert.match(
    src,
    /Email belum benar[^"']*?mis\. kamu@email\.com/i,
    'invalid_email copy must include the example pattern "mis. kamu@email.com"',
  )
})

test('A2: invalid_methodId maps to Bahasa "pilih cara bayar lain" copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  assert.match(
    src,
    /invalid_methodId[\s\S]{0,250}Cara bayar yang dipilih/i,
    'invalid_methodId branch must surface "Cara bayar yang dipilih" Bahasa copy',
  )
})

test('A2: invalid_plan maps to calm Bahasa "Paket belum kepilih" copy', () => {
  // 2026-06-09 checkout redesign: softened from the alarming "Paket tidak
  // dikenali. Refresh halaman..." to a calm "Paket belum kepilih. Balik ke
  // halaman harga dan pilih paket ya." (no alarm, no "hubungi tim").
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  assert.match(
    src,
    /invalid_plan[\s\S]{0,300}Paket belum kepilih/i,
    'invalid_plan branch must surface the calm "Paket belum kepilih" copy',
  )
})

test('A2: consent_persist_failed maps to "Persetujuan tidak tersimpan" copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Distinct from tos_required / tos_stale (already handled pre-A2 in
  // the pass-3 PR #91 — those surface under the ToS checkbox inline
  // error). consent_persist_failed is a DB-write failure on the
  // consent_events insert — handler returns 500 with this code. The
  // customer-facing remediation is the same as tos_required ("centang
  // ulang"), so the audit copy explicitly mirrors that framing.
  assert.match(
    src,
    /consent_persist_failed[\s\S]{0,300}Persetujuan tidak tersimpan/i,
    'consent_persist_failed branch must surface "Persetujuan tidak tersimpan" copy',
  )
})

// ─── 2. Unknown-code fallback ──────────────────────────────────────────

test('A2: unknown server code falls back to generic calm Bahasa copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The fallback string is what customers see for ANY error code that
  // isn't in the explicit map (network blip, timeout, future server-
  // side code we haven't mapped yet, etc.). Must be calm-premium and
  // suggest a 1-min retry before escalating to WhatsApp.
  assert.match(
    src,
    /Pembayaran tidak bisa disiapkan saat ini/i,
    'fallback copy must mention "Pembayaran tidak bisa disiapkan saat ini"',
  )
  assert.match(
    src,
    /Coba lagi dalam 1 menit/i,
    'fallback copy must invite a 1-min retry',
  )
})

test('A2: NO raw "Gagal: ${err.message}" template-literal echoing remains', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Pre-fix line was:
  //   errEl.textContent = `Gagal: ${err.message}. Coba lagi atau pilih method lain.`
  // After the mapper lands, raw err.message MUST NOT be the primary
  // user-facing surface — at most a `console.warn` for telemetry. This
  // gate catches a regression that re-introduces the echo.
  assert.equal(
    /errEl\.textContent\s*=\s*[`'"]Gagal:\s*\$\{err\.message\}/.test(src),
    false,
    'raw "Gagal: ${err.message}" template-literal must not be the customer-facing surface',
  )
})

// ─── 3. Retry-count + inline WhatsApp escalation ──────────────────────

test('A2: retry counter exists in submit-handler scope', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The counter must be a named variable so future audit / Sesi D
  // tuning can reference it without grep-archaeology.
  assert.match(
    src,
    /(?:let|const)\s+submitFailCount\s*=\s*0/,
    'submitFailCount counter must exist (defaults to 0)',
  )
})

test('A2: after 2+ failed retries, an inline WhatsApp link surfaces', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The escalation surface is an inline link rendered below the error
  // banner when submitFailCount >= 2. The 6282154902561 number matches
  // the existing welcome.html WA fallback (single number for all
  // founder-side escalation).
  assert.match(
    src,
    /submitFailCount\s*>=?\s*2/,
    'WA escalation must be gated by submitFailCount >= 2',
  )
  assert.match(
    src,
    /wa\.me\/6282154902561/,
    'WA escalation link must point to the canonical support number',
  )
  // The WA CTA must include some prefill describing the situation,
  // so the founder receiving the message knows the context.
  assert.match(
    src,
    /Halo\s+tim\s+weuseai[^"'`]{0,200}pembayaran/i,
    'WA prefilled message must mention "Halo tim weuseai" + "pembayaran"',
  )
})

// ─── 4. Telemetry breadcrumb (per audit recommendation) ───────────────

test('A2: server error code logged via console.warn for founder visibility', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Audit-recommended: client should log the raw server error code so
  // the founder can grep Vercel logs and see failure-class distribution
  // until proper analytics lands. console.warn (not console.error)
  // because these are USER-side failures, not server-side bugs.
  assert.match(
    src,
    /console\.warn\([\s\S]{0,80}\[checkout\][\s\S]{0,80}submit/i,
    'console.warn("[checkout] submit ...") breadcrumb must exist',
  )
})

// ─── 5. Brand-voice + scope guard ──────────────────────────────────────

test('A2: no banned marketing words introduced in new copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The new mapper strings must respect CLAUDE.md voice rules. Scope
  // this check to the submit handler's error-mapping region so
  // pre-existing strings elsewhere don't trip the gate.
  const submitRegion = src.slice(
    Math.max(0, src.indexOf('submitFailCount') - 200),
    src.indexOf('window.location.href') + 200,
  )
  for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
    assert.equal(
      submitRegion.toLowerCase().includes(word),
      false,
      `submit error region must not contain banned word: ${word}`,
    )
  }
})

test('A2: no exclamation marks introduced in the new error copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // We scope to JUST the new error-mapping region. Other parts of
  // checkout.html may have legitimate exclamation marks in script
  // strings (not customer-facing).
  const submitRegion = src.slice(
    src.indexOf('submitFailCount'),
    src.indexOf('window.location.href') + 200,
  )
  // Allow exclamation marks ONLY in JS operators (! before a variable,
  // !== comparison). Customer-facing strings should have none.
  const userFacingStrings = submitRegion.match(/['"][^'"]{5,}['"]/g) ?? []
  for (const s of userFacingStrings) {
    assert.equal(
      s.includes('!'),
      false,
      `user-facing string in submit region contains exclamation mark: ${s.slice(0, 80)}`,
    )
  }
})

test('A2: scope guard — no pass-3 server error codes (tos_required / tier / x_cid) reframed', () => {
  // The pass-3 gates remain intact. This test fails if a future PR
  // accidentally rewrites the tos_required / tos_stale branches in
  // a way that breaks the regression contract at PR #94.
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The tos_required + tos_stale branches must still exist from PR #91.
  assert.match(src, /'tos_required'/, 'tos_required branch must still exist (PR #91 invariant)')
  assert.match(src, /'tos_stale'/, 'tos_stale branch must still exist (PR #91 invariant)')
})
