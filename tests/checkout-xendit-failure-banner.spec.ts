/**
 * Batch B2 (2026-05-13): Xendit failure-redirect acknowledgment.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-2.
 *
 * Pre-fix: Xendit invoice expires or is rejected → Xendit redirects to
 *   /checkout.html?plan=<tier>&error=failed
 * but checkout.html only reads `plan` and `alwaysOn` from the URL. The
 * `error=failed` flag is silently dropped. Customer lands on a fresh-
 * looking form with no acknowledgment that the previous attempt just
 * failed.
 *
 * Audit-locked banner copy:
 *   "Pembayaran kamu belum selesai — link Xendit kadaluarsa atau
 *    ditolak. Coba bayar lagi dari sini, atau hubungi tim kalau
 *    berlanjut."
 * + inline "Hubungi tim via WhatsApp" CTA.
 *
 * "Xendit" is intentionally named — it's a customer-facing brand
 * (they were just on the Xendit hosted payment page) not a backend
 * infrastructure name like VPS / Hermes / BotFather. Naming it is
 * honest framing, not jargon-leaking.
 *
 * Telemetry breadcrumb: console.log('[checkout] xendit_failed_return',
 * {plan}) so the founder can grep Vercel logs for Xendit failure rate.
 *
 * Source-grep tests only — checkout.html is vanilla JS.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CHECKOUT = path.resolve(process.cwd(), 'checkout.html')

// ─── 1. Banner DOM element exists ─────────────────────────────────────

test('B2: failure banner DOM element exists with stable id', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Stable id so Sesi D follow-ups can target it.
  assert.match(
    src,
    /id=["']xendit-failure-banner["']/,
    'banner element must have id="xendit-failure-banner"',
  )
})

test('B2: banner is hidden by default (only shows on error=failed)', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The banner must start hidden — only the error-param handler reveals
  // it. Check the element has `hidden` attribute OR `display: none` in
  // its inline style by default.
  const bannerMatch = src.match(/id=["']xendit-failure-banner["'][^>]*>/)
  assert.ok(bannerMatch, 'banner opening tag findable')
  if (bannerMatch) {
    assert.ok(
      /\bhidden\b/.test(bannerMatch[0]) || /display:\s*none/.test(bannerMatch[0]),
      `banner must start hidden (markup found: ${bannerMatch[0]})`,
    )
  }
})

// ─── 2. Audit-locked copy lands ──────────────────────────────────────

test('B2: banner contains the audit-locked Bahasa copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Verbatim audit copy. "Xendit" is customer-facing (they just left
  // the Xendit page) — same status as PayPal/Apple Pay would be.
  assert.match(
    src,
    /Pembayaran kamu belum selesai/i,
    'banner must include "Pembayaran kamu belum selesai" lead',
  )
  assert.match(
    src,
    /link Xendit kadaluarsa atau ditolak/i,
    'banner must mention "link Xendit kadaluarsa atau ditolak"',
  )
  assert.match(
    src,
    /Coba bayar lagi dari sini/i,
    'banner must invite retry with "Coba bayar lagi dari sini"',
  )
  assert.match(
    src,
    /hubungi tim kalau berlanjut/i,
    'banner must include "hubungi tim kalau berlanjut" fallback',
  )
})

// ─── 3. WA CTA in banner ─────────────────────────────────────────────

test('B2: banner has inline WhatsApp CTA with prefilled context', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The WA CTA must be inside the banner block. Check both that
  // wa.me/6282154902561 appears + the banner-scoped portion has the
  // expected hubungi-tim button text.
  const bannerBlock = src.match(/id=["']xendit-failure-banner["'][\s\S]+?<\/div>\s*<!--\s*end xendit-failure-banner/i)
  assert.ok(bannerBlock, 'banner block findable (with closing comment marker)')
  if (bannerBlock) {
    assert.match(
      bannerBlock[0],
      /wa\.me\/6282154902561/,
      'banner must contain the canonical WA support number',
    )
    assert.match(
      bannerBlock[0],
      /Hubungi tim/i,
      'banner must have a "Hubungi tim" CTA label',
    )
    // Prefilled WA message must mention the failure context so the
    // founder receiving it knows what happened.
    assert.match(
      bannerBlock[0],
      /pembayaran/i,
      'WA prefill must mention "pembayaran" failure context',
    )
  }
})

// ─── 4. JS reads error=failed and unhides banner ────────────────────

test('B2: JS reads `error` URL param and unhides banner on "failed"', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Must read the URL searchParam `error`. The literal name must
  // appear in a searchParams.get call.
  assert.match(
    src,
    /searchParams\.get\(\s*['"]error['"]\s*\)/,
    'JS must read `error` URL searchParam',
  )
  // And must compare to 'failed' to gate the banner reveal.
  assert.match(
    src,
    /=== ['"]failed['"]|== ['"]failed['"]|=== \s*['"]failed['"]/,
    'JS must compare error param to "failed"',
  )
  // And must unhide the banner — assert by checking a reference to
  // the banner id somewhere near the comparison.
  assert.match(
    src,
    /xendit-failure-banner['"][\s\S]{0,300}hidden\s*=\s*false|hidden\s*=\s*false[\s\S]{0,300}xendit-failure-banner/,
    'JS must unhide xendit-failure-banner when error=failed',
  )
})

// ─── 5. Telemetry breadcrumb fires ──────────────────────────────────

test('B2: console.log telemetry breadcrumb fires on Xendit failure return', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Audit recommendation: console.log('[checkout] xendit_failed_return',
  // {plan}). Lets the founder grep Vercel logs for Xendit failure rate.
  assert.match(
    src,
    /console\.log\(\s*['"]\[checkout\]\s+xendit_failed_return['"]/,
    'console.log("[checkout] xendit_failed_return", …) breadcrumb must exist',
  )
  // Payload must include the plan so per-tier failure rate is visible.
  assert.match(
    src,
    /xendit_failed_return[\s\S]{0,200}plan/i,
    'telemetry payload must include `plan`',
  )
})

// ─── 6. Brand-voice gates ───────────────────────────────────────────

test('B2: banner copy passes brand-voice rules', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  const bannerBlock = src.match(/id=["']xendit-failure-banner["'][\s\S]+?<\/div>\s*<!--\s*end xendit-failure-banner/i)
  assert.ok(bannerBlock, 'banner block findable for voice check')
  if (bannerBlock) {
    for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
      assert.equal(
        bannerBlock[0].toLowerCase().includes(word),
        false,
        `banner must not contain banned word: ${word}`,
      )
    }
    // No exclamation marks in visible text — find any text nodes
    // between > and < tags inside the banner.
    const textNodes = bannerBlock[0].match(/>[^<>]{3,}</g) ?? []
    for (const t of textNodes) {
      assert.equal(
        t.includes('!'),
        false,
        `banner text node contains "!": ${t.slice(0, 80)}`,
      )
    }
  }
})

// ─── 7. Scope guard — pass-3 surfaces untouched ─────────────────────

test('B2: scope guard — pass-3 ToS / tier / X-CID surfaces unchanged', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The pass-3 server-error mapping from PR #91/A2 must remain intact.
  assert.match(src, /'tos_required'/, 'tos_required branch must still exist (PR #91)')
  assert.match(src, /'tos_stale'/, 'tos_stale branch must still exist (PR #91)')
  assert.match(src, /CHECKOUT_ERROR_MAP/, 'A2 Bahasa error mapper must still exist (PR #100)')
})
