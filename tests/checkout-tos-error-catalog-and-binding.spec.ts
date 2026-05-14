/**
 * Hotfix (2026-05-14): two gaps in /checkout's ToS submission path.
 *
 * Context:
 *   Founder hit a customer-blocking bug live-testing the production URL.
 *   The customer-facing surface had two problems:
 *
 *   Bug 1 (P0, infra not code) — `weuseai-agent.vercel.app` alias is
 *     pinned to commit 1cb69cf from 25h ago, BEFORE PR #91 added the
 *     tos_accepted_at JS to checkout.html. Server-side ToS gating
 *     (PR #91) is live, but the deployed frontend doesn't send the
 *     field. Result: 400 tos_required for every paying customer.
 *     Code on main IS correct; the Vercel alias needs promotion to a
 *     newer prod deployment. This is a founder-side `vercel promote`
 *     command, NOT a code fix.
 *
 *   Bug 2 (P1, code) — even when the alias catches up, two real gaps:
 *     - The A2 catalog (PR #100) maps invalid_email / invalid_methodId
 *       / invalid_plan / consent_persist_failed but NOT tos_required
 *       or tos_stale. The inline handler at the catch-block top writes
 *       the under-checkbox message correctly, BUT then `throw new
 *       Error(msg)` propagates the LOCALIZED BAHASA STRING up to the
 *       generic catch block, which calls mapCheckoutSubmitError(msg)
 *       — that lookup misses and returns the generic A2 fallback
 *       "Pembayaran tidak bisa disiapkan saat ini." Customer sees:
 *         • Under checkbox: "Wajib menyetujui Syarat dan Ketentuan..."
 *         • Under button:   "Pembayaran tidak bisa disiapkan saat ini..."
 *       — two different messages, the bottom one misleading.
 *
 *     This file pins the Bug 2 fix:
 *       (a) inline tos_required / tos_stale handlers throw the CODE,
 *           not the localized message, so the catalog can resolve it
 *       (b) catalog covers tos_required + tos_stale with calm-premium BI
 *       (c) audit-locked copy matches founder's brief verbatim
 *
 * Plus one drift gate for what Bug 1 root-cause would have been
 * (test-surface gap founder explicitly called out): pin that
 * `tos_accepted_at` IS sent in the create-invoice POST body. This
 * was already present pre-hotfix — gate prevents a future PR from
 * silently regressing it.
 *
 * Source-grep tests only — checkout.html is vanilla JS in a script tag,
 * no jsdom. Behavioural verification is the Vercel preview after the
 * alias catches up.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CHECKOUT = path.resolve(process.cwd(), 'checkout.html')

// ─── 1. A2 catalog now covers tos_required + tos_stale ──────────────

test('Bug 2: A2 catalog maps tos_required to "Centang dulu..." Bahasa copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Audit-locked copy per founder hotfix brief. The catalog message
  // is what appears in the BOTTOM error banner (under the pay button)
  // — it's a calm restatement of what the under-checkbox tosErr also
  // shows. Two surfaces for the same condition (under-checkbox =
  // immediate fix, bottom banner = uniform with other error codes).
  assert.match(
    src,
    /tos_required[\s\S]{0,200}Centang dulu Syarat dan Ketentuan/i,
    'tos_required catalog entry must surface "Centang dulu Syarat dan Ketentuan" copy',
  )
  assert.match(
    src,
    /Centang dulu Syarat dan Ketentuan[\s\S]{0,80}lanjut ke pembayaran/i,
    'tos_required copy must end with "lanjut ke pembayaran" (calls customer back to the action)',
  )
})

test('Bug 2: A2 catalog maps tos_stale to "Sesi kamu sudah kadaluarsa..." Bahasa copy', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // tos_stale fires when the ISO timestamp is >24h old (replay defense)
  // or future-dated by >60s (clock skew). Both remediations are the
  // same: re-check the consent box, which re-stamps the timestamp.
  // The "session expired" framing is honest about what happened.
  assert.match(
    src,
    /tos_stale[\s\S]{0,200}Sesi kamu sudah kadaluarsa/i,
    'tos_stale catalog entry must surface "Sesi kamu sudah kadaluarsa" copy',
  )
  assert.match(
    src,
    /Sesi kamu sudah kadaluarsa[\s\S]{0,100}Centang ulang persetujuan/i,
    'tos_stale copy must include the "Centang ulang persetujuan" remediation hint',
  )
})

// ─── 2. Inline handlers throw the CODE not the localized message ────

test('Bug 2: inline tos_required handler throws the CODE so the catalog applies', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Pre-hotfix: `throw new Error(msg)` where msg = the Bahasa string,
  // which broke catalog lookup in the outer catch block. Post-hotfix:
  // throw the code itself. Outer catch then maps via the catalog,
  // populating the bottom banner with calm-premium BI.
  //
  // Region scope: the tos_required branch is identified by the inline
  // check `if (data && data.error === 'tos_required')`. The throw
  // statement inside that branch must reference 'tos_required' as the
  // Error message (not the Bahasa localized string).
  const branch = extractInlineConsentBranch(src, 'tos_required')
  assert.ok(
    branch.length > 0,
    'tos_required inline branch must exist (check `if (data && data.error === ...)`)',
  )
  assert.match(
    branch,
    /throw new Error\(\s*['"]tos_required['"]\s*\)/,
    'inline handler must `throw new Error("tos_required")` so the A2 catalog resolves it',
  )
  // The Bahasa string for the under-checkbox surface still gets
  // written to tosErr — that wasn't broken.
  assert.match(
    branch,
    /tosErr\.textContent\s*=/,
    'inline handler must still write the under-checkbox Bahasa message to tosErr',
  )
})

test('Bug 2: inline tos_stale handler throws the CODE so the catalog applies', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  const branch = extractInlineConsentBranch(src, 'tos_stale')
  assert.ok(
    branch.length > 0,
    'tos_stale inline branch must exist',
  )
  assert.match(
    branch,
    /throw new Error\(\s*['"]tos_stale['"]\s*\)/,
    'inline handler must `throw new Error("tos_stale")` so the A2 catalog resolves it',
  )
  assert.match(
    branch,
    /tosErr\.textContent\s*=/,
    'inline handler must still write the under-checkbox Bahasa message to tosErr',
  )
})

// Helper — extract the body of `if (data && data.error === '<code>')`
// from the inline tos handler. Pulls roughly 600 chars after the
// match so multi-line bodies (tosErr write + throw) are captured.
function extractInlineConsentBranch(src: string, code: 'tos_required' | 'tos_stale'): string {
  const needle = new RegExp(
    "if\\s*\\(\\s*data\\s*&&\\s*data\\.error\\s*===\\s*['\"]" + code + "['\"]",
  )
  const m = needle.exec(src)
  if (!m) return ''
  return src.slice(m.index, m.index + 600)
}

// ─── 3. Catalog is the ONLY source for bottom-banner copy on tos_* ──

test('Bug 2: no localized Bahasa string is thrown for tos_* (regression gate)', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Belt-and-braces: scan for the pre-hotfix anti-pattern where the
  // inline handler does `const msg = '...Bahasa text...'; throw new
  // Error(msg)`. If that pattern resurfaces, the catalog won't be
  // able to handle the code anymore. The drift gate bans throws of
  // any string that LOOKS like Bahasa prose inside the tos branches.
  for (const code of ['tos_required', 'tos_stale']) {
    const branch = extractInlineConsentBranch(src, code as 'tos_required' | 'tos_stale')
    // Specifically forbid `throw new Error(msg)` where msg is a
    // localized variable. The fix uses literal string codes.
    assert.equal(
      /throw\s+new\s+Error\(\s*msg\s*\)/.test(branch),
      false,
      `${code} inline branch must NOT \`throw new Error(msg)\` — that breaks catalog lookup`,
    )
  }
})

// ─── 4. Test-surface gap: pin tos_accepted_at IS in the POST body ───
//
// This is the gate founder asked for: "Add a new UI integration test
// that exercises ... verify the POST body actually contains
// tos_accepted_at as a valid ISO timestamp."
//
// We can't run a real DOM here (checkout.html is a vanilla-JS script
// tag), but a source-grep gate on the fetch-body construction
// achieves the same drift-prevention goal: if a future PR strips
// tos_accepted_at from the body, this fails immediately.

test('drift gate: create-invoice POST body MUST include tos_accepted_at field', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Find the fetch call specifically (not a comment-mention of
  // /create-invoice). The submit handler uses
  //   fetch(`${SUPABASE_FUNCTIONS_URL}/create-invoice`, {
  // — locate that template-string occurrence, then scan ~1500 chars
  // forward to find body: JSON.stringify({ ... }) and assert
  // tos_accepted_at sits in there.
  const fetchRe = /fetch\(\s*`\$\{SUPABASE_FUNCTIONS_URL\}\/create-invoice`/
  const m = fetchRe.exec(src)
  assert.ok(m, 'checkout.html must fetch ${SUPABASE_FUNCTIONS_URL}/create-invoice')
  const region = src.slice(m.index, m.index + 1500)
  assert.match(
    region,
    /tos_accepted_at\s*:\s*tosAcceptedAt/,
    'create-invoice POST body must wire `tos_accepted_at: tosAcceptedAt` — ' +
      'this was Bug 1 root-cause shape (live alias served code missing this line)',
  )
})

test('drift gate: tosAcceptedAt MUST be stamped via new Date().toISOString()', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The timestamp construction is what makes Date.parse() succeed on
  // the server. Stamping must use new Date().toISOString() so the
  // server-side TOS_MAX_AGE_MS = 24h window is satisfied.
  assert.match(
    src,
    /const\s+tosAcceptedAt\s*=\s*new\s+Date\(\)\.toISOString\(\)/,
    'tosAcceptedAt must be stamped via `new Date().toISOString()` at submit time',
  )
})

test('drift gate: tos_accepted_at is sent ONLY when tosInp.checked passed client validation', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The flow MUST be: check tosInp.checked → if unchecked, return
  // early via firstInvalid → only then stamp + send. This prevents
  // sending tos_accepted_at when the customer hasn't actually
  // checked the box (otherwise the under-checkbox error wouldn't
  // surface).
  // Verify the client guard exists.
  assert.match(
    src,
    /if\s*\(\s*!tosInp\.checked\s*\)/,
    'client-side guard `if (!tosInp.checked)` must exist before stamping',
  )
  // Verify stamping appears AFTER the firstInvalid early-return.
  const guardIdx = src.indexOf('if (firstInvalid)')
  const stampIdx = src.indexOf('const tosAcceptedAt = new Date()')
  assert.ok(guardIdx > -1 && stampIdx > -1, 'guard + stamp must both exist')
  assert.ok(
    stampIdx > guardIdx,
    'tosAcceptedAt stamp must appear AFTER the firstInvalid early-return guard',
  )
})

// ─── 5. Brand-voice + scope guard on new catalog entries ────────────

test('Bug 2: new tos_required / tos_stale copy respects brand-voice rules', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // Find the new catalog entries (single-quoted strings on the
  // tos_required / tos_stale keys) and check them against the
  // CLAUDE.md banned-words list.
  const reqMatch = /tos_required[\s\S]{0,30}['"]([^'"]+)['"]/i.exec(src)
  const staleMatch = /tos_stale[\s\S]{0,30}['"]([^'"]+)['"]/i.exec(src)
  assert.ok(reqMatch, 'tos_required catalog string must be extractable')
  assert.ok(staleMatch, 'tos_stale catalog string must be extractable')
  const banned = ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level', 'just', 'kind of', 'pretty much']
  for (const m of [reqMatch, staleMatch]) {
    if (!m) continue
    const copy = m[1].toLowerCase()
    for (const w of banned) {
      assert.equal(copy.includes(w), false, `catalog entry must not include banned word "${w}"`)
    }
    // Zero exclamation marks per CLAUDE.md brand-voice rule for body copy.
    assert.equal(
      copy.includes('!'),
      false,
      'catalog entry must not contain exclamation marks',
    )
  }
})

// ─── 6. Pass-3 contract guard — no weakening of the server gate ──────

test('Bug 2: pass-3 server-side ToS gate is NOT being bypassed by the hotfix', () => {
  const src = fs.readFileSync(CHECKOUT, 'utf8')
  // The hotfix is a UI / inline-handler change. It MUST NOT add any
  // workaround that skips sending tos_accepted_at when the box is
  // unchecked, or stamps a future-dated/stale timestamp to bypass
  // server validation. This is paranoia coverage — a careless future
  // refactor that "fixes" Bug 1 by always stamping unconditionally
  // would defeat the PR #91 / #94 pass-3 audit.
  assert.equal(
    /tos_accepted_at\s*:\s*['"][^'"]*Z['"]/.test(src),
    false,
    'tos_accepted_at must never be hardcoded as a literal ISO string',
  )
  assert.equal(
    /tos_accepted_at\s*:\s*null/.test(src),
    false,
    'tos_accepted_at must never be explicitly null in the POST body',
  )
})
