// welcome.html guard-render regression tests.
//
// Bug (2026-05-10): welcome.html rendered the success HERO ("Pembayaran
// berhasil" + "Selamat datang. Agent kamu sedang dibangun.") AND the
// STEPS list ("Yang akan terjadi") as static HTML, regardless of state.
// When renderState('E') fired (invalid_cid / null poll result), the
// "salah link" guard appeared INSIDE the status-box but the success
// messaging surrounding it stayed visible — founder saw both at once.
//
// Fix shape verified by these tests:
//   1. CSS gates exist for body[data-state="A"|"E"|"G"] hiding
//      .verified-only and showing .unverified-only.
//   2. Success HERO + STEPS sections wear .verified-only.
//   3. A neutral .unverified-only HERO exists for pre-verification.
//   4. renderState() sets document.body.dataset.state on every transition.
//   5. The 30-sec grace window prevents flipping to 'E' on the first
//      null pollOnce() (Xendit webhook race defense).
//   6. Default-no-state CSS treats body as unverified (guard-friendly
//      first paint — never flash the success HERO).
//
// Optional live probe: the prod alias serves the page and the rendered
// HTML source contains the gating wiring (catches deploy regressions
// where a future redesign drops the .verified-only structure).

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const WELCOME = path.join(ROOT, 'welcome.html')

// ─── Layer 1: schema-drift on welcome.html source ──────────────────

test('welcome.html exists', () => {
  assert.ok(fs.existsSync(WELCOME))
})

test('CSS hides .verified-only by default', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Match the rule: ".verified-only, .unverified-only { display: none; }"
  // with flexible whitespace.
  assert.ok(
    /\.verified-only\s*,\s*\.unverified-only\s*\{\s*display:\s*none/.test(src),
    'must hide both sections by default',
  )
})

test('CSS reveals .verified-only ONLY for verified states (B/C/C2/D/F)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Each verified state must have a body[data-state="X"] .verified-only
  // selector. Tested individually so a future regression that drops one
  // state surfaces immediately.
  for (const state of ['B', 'C', 'C2', 'D', 'F']) {
    const re = new RegExp(
      `body\\[data-state="${state}"\\]\\s+\\.verified-only`,
    )
    assert.ok(re.test(src), `state ${state} must reveal .verified-only`)
  }
})

test('CSS reveals .unverified-only for pre-verified + invalid + error states', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  for (const state of ['A', 'E', 'G']) {
    const re = new RegExp(
      `body\\[data-state="${state}"\\]\\s+\\.unverified-only`,
    )
    assert.ok(re.test(src), `state ${state} must reveal .unverified-only`)
  }
})

test('CSS reveals .unverified-only when body has NO data-state (first paint)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  assert.ok(
    /body:not\(\[data-state\]\)\s+\.unverified-only/.test(src),
    'no-state body must show unverified hero (prevents success-flash)',
  )
})

test('Success HERO pill ("Pembayaran berhasil") is wrapped in .verified-only', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Skip <title> and similar (anything outside a <section>).
  const matches = [...src.matchAll(/Pembayaran berhasil/g)]
  assert.ok(matches.length > 0, 'expected at least one "Pembayaran berhasil"')
  let pillsChecked = 0
  for (const m of matches) {
    const before = src.slice(0, m.index)
    const sectionStart = before.lastIndexOf('<section')
    if (sectionStart < 0) continue // <title> / comment / JS-string occurrence
    const sectionTag = src.slice(sectionStart, src.indexOf('>', sectionStart) + 1)
    assert.ok(
      /class="[^"]*verified-only/.test(sectionTag),
      `"Pembayaran berhasil" inside <section> must wear .verified-only (got: ${sectionTag.slice(0, 100)})`,
    )
    pillsChecked++
  }
  assert.ok(pillsChecked >= 1, 'expected at least one HERO pill wrapped in <section>')
})

test('Success heading ("Selamat datang") is in a .verified-only section', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const idx = src.indexOf('Selamat datang')
  assert.ok(idx >= 0, 'expected "Selamat datang" string in welcome.html')
  const before = src.slice(0, idx)
  const sectionStart = before.lastIndexOf('<section')
  const sectionTag = src.slice(sectionStart, src.indexOf('>', sectionStart) + 1)
  assert.ok(
    /class="[^"]*verified-only/.test(sectionTag),
    '"Selamat datang. Agent kamu sedang dibangun." must be in .verified-only',
  )
})

test('STEPS section ("Yang akan terjadi") is in .verified-only', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const idx = src.indexOf('Yang akan terjadi')
  assert.ok(idx >= 0)
  const before = src.slice(0, idx)
  const sectionStart = before.lastIndexOf('<section')
  const sectionTag = src.slice(sectionStart, src.indexOf('>', sectionStart) + 1)
  assert.ok(
    /class="[^"]*verified-only/.test(sectionTag),
    'STEPS list must be in .verified-only (Telegram next-steps imply verified payment)',
  )
})

test('Neutral .unverified-only HERO exists', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The unverified hero must NOT use the verified copy ("Pembayaran
  // berhasil" / "Selamat datang"). It should be neutral, e.g.
  // "Sedang memeriksa".
  assert.ok(
    /<section[^>]*class="[^"]*unverified-only/.test(src),
    'must declare an .unverified-only section',
  )
  assert.ok(
    /unverified-only[\s\S]{0,500}Sedang memeriksa/.test(src),
    'unverified hero must use neutral copy ("Sedang memeriksa…"), not premature success',
  )
})

test('renderState() writes document.body.dataset.state', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  assert.ok(
    /document\.body\.dataset\.state\s*=\s*state/.test(src),
    'renderState must mutate body[data-state] so CSS gating activates',
  )
})

test('30-sec grace window before flipping null pollOnce → state E', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  assert.ok(
    /NULL_GRACE_MS\s*=\s*30_?000/.test(src),
    'must declare a NULL_GRACE_MS constant (30s) for webhook race defense',
  )
  // The check must compare elapsed ms against the constant before flipping
  // to renderState('E'); during the window we render 'A' (loading) instead.
  assert.ok(
    /Date\.now\(\)\s*-\s*startedAt\s*<\s*NULL_GRACE_MS[\s\S]{0,200}renderState\(\s*'A'\s*\)[\s\S]{0,200}renderState\(\s*'E'\s*\)/.test(
      src,
    ),
    'null pollOnce branch must hold state A inside grace, then flip to E',
  )
})

test('Network-error state (G) shows neutral copy, not "VPS sedang disiapkan"', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Find the case 'G' block and verify it does NOT reuse state-B copy
  // (which would imply payment verified before we've checked).
  const match = src.match(/case 'G':[\s\S]*?break;/)
  assert.ok(match, 'case G must exist')
  const block = match[0]
  assert.ok(
    !/VPS sedang disiapkan/.test(block),
    'state G (network error) must NOT show "VPS sedang disiapkan" — that implies verified',
  )
  assert.ok(
    /Koneksi sedang lambat|Mencoba lagi/i.test(block),
    'state G must show neutral retry copy',
  )
})

// ─── Layer 2: live probe against prod alias ────────────────────────

const PROD_URL = process.env.WELCOME_PROD_URL ?? 'https://weuseai-agent.vercel.app'
const liveSkip = process.env.SKIP_WELCOME_LIVE === '1'

test(
  'LIVE: prod welcome.html responds 200 and carries the gating CSS',
  { skip: liveSkip },
  async () => {
    const r = await fetch(`${PROD_URL}/welcome?cb=${Date.now()}`, {
      redirect: 'follow',
    })
    assert.equal(r.status, 200, `prod /welcome must serve 200 (got ${r.status})`)
    const html = await r.text()
    assert.ok(
      /\.verified-only\s*,\s*\.unverified-only\s*\{\s*display:\s*none/.test(html),
      'prod-deployed welcome.html must contain the state-gating CSS',
    )
    assert.ok(
      /document\.body\.dataset\.state\s*=\s*state/.test(html),
      'prod-deployed welcome.html must run renderState data-state writer',
    )
  },
)
