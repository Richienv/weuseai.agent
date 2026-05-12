/**
 * Tests for bundle-pull-script.ts (Phase 2E-2 Day 3 + D1 multi-persona).
 *
 * Generator-level tests: assert the produced bash script contains the
 * structural elements we depend on (env reads, idempotency gate, tier
 * filter, telemetry call, graceful-failure paths). Doesn't run the
 * script — that happens in the live VPS smoke test.
 *
 * D1 lock 2026-05-12: multi-persona loop replaces the single-bundle
 * flow. Each persona has its own fetch/extract/filter cycle; one
 * persona's failure doesn't block the others.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildBundlePullScript } from '../services/provisioning/src/bundle-pull-script.ts'

const baseParams = {
  customerId: 'cust_test_1',
}

// ─── shape ────────────────────────────────────────────────────────────

test('script: starts with bash shebang', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /^#!\/bin\/bash/)
})

test('script: NOT set -e (graceful failure path requires unset -e)', () => {
  const s = buildBundlePullScript(baseParams)
  // We use `set -u` (unset vars caught) but never `set -e` (errors
  // would crash Hermes boot — we want graceful degrade instead).
  assert.match(s, /set -u/)
  assert.equal(s.includes('set -e\n'), false, 'set -e would block graceful failure')
})

// ─── env reads ────────────────────────────────────────────────────────

test('script: reads /home/weuseai/.hermes/.env', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /source \/home\/weuseai\/\.hermes\/\.env/)
})

test('script: pulls customer_id from env with fallback', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /CID="\$\{WEUSEAI_CUSTOMER_ID:-/)
})

test('script: pulls tier from env with starter fallback', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /TIER="\$\{WEUSEAI_TIER:-starter\}"/)
})

test('script: prefers WEUSEAI_AGENT_SLUGS, falls back to legacy single-slug', () => {
  const s = buildBundlePullScript(baseParams)
  // The double-fallback: WEUSEAI_AGENT_SLUGS → WEUSEAI_AGENT_SLUG → the-pro
  assert.match(s, /SLUGS_CSV="\$\{WEUSEAI_AGENT_SLUGS:-\$\{WEUSEAI_AGENT_SLUG:-the-pro\}\}"/)
})

test('script: customerId from params injected as fallback', () => {
  const s = buildBundlePullScript({ customerId: 'cust_specific_id' })
  assert.match(s, /CID="\$\{WEUSEAI_CUSTOMER_ID:-cust_specific_id\}"/)
})

// ─── multi-persona loop (D1 lock 2026-05-12) ─────────────────────────

test('script: splits CSV into bash array (multi-persona iteration)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /IFS=',' read -r -a SLUGS_ARR <<< "\$SLUGS_CSV"/)
})

test('script: loops over SLUGS_ARR calling pull_bundle per slug', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /for slug in "\$\{SLUGS_ARR\[@\]\}"/)
  assert.match(s, /pull_bundle "\$slug"/)
})

test('script: tracks per-persona success / fail counts', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /SUCCESS_COUNT=\$\(\(SUCCESS_COUNT \+ 1\)\)/)
  assert.match(s, /FAIL_COUNT=\$\(\(FAIL_COUNT \+ 1\)\)/)
})

test('script: trims whitespace from CSV entries (defensive)', () => {
  const s = buildBundlePullScript(baseParams)
  // The bash parameter expansion ${var// /} removes all spaces
  assert.match(s, /slug="\$\{slug\/\/ \/\}"/)
})

test('script: pull_bundle is its own function (encapsulated per-bundle logic)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /^pull_bundle\(\) \{/m)
})

test('script: persona-shell SKILL.md copied to ~/.hermes/skills/<slug>/SKILL.md (Hermes auto-routes /<slug>)', () => {
  const s = buildBundlePullScript(baseParams)
  // Look for the explicit shell-SKILL install block (D1 lock)
  assert.match(s, /shell_src="\/var\/lib\/weuseai\/bundle\/\$slug\/\$version\/SKILL\.md"/)
  assert.match(s, /shell_dst="\/home\/weuseai\/\.hermes\/skills\/\$slug\/SKILL\.md"/)
})

// ─── default URLs ────────────────────────────────────────────────────

test('script: default bundleFetchUrl points at production Supabase project', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /https:\/\/gtjgsligllbjcisiyrah\.supabase\.co\/functions\/v1\/bundle-fetch/)
})

test('script: default bundlePullRecordUrl points at production', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /https:\/\/gtjgsligllbjcisiyrah\.supabase\.co\/functions\/v1\/bundle-pull-record/)
})

test('script: custom URLs respected', () => {
  const s = buildBundlePullScript({
    customerId: 'cust_1',
    bundleFetchUrl: 'http://localhost:54321/functions/v1/bundle-fetch',
    bundlePullRecordUrl: 'http://localhost:54321/functions/v1/bundle-pull-record',
  })
  assert.match(s, /localhost:54321\/functions\/v1\/bundle-fetch/)
  assert.match(s, /localhost:54321\/functions\/v1\/bundle-pull-record/)
})

// ─── idempotency gate ────────────────────────────────────────────────

test('script: checks per-slug /var/lib/weuseai/bundle/<slug>/.installed-version', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /installed_file="\/var\/lib\/weuseai\/bundle\/\$slug\/\.installed-version"/)
})

test('script: skips re-download when installed version matches target', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /already installed; re-applying tier filter only/)
})

// ─── tier filter ─────────────────────────────────────────────────────

test('script: tier filter inline Python reads enabled_for_tiers', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /enabled_for_tiers/)
  // Falls back to legacy `tier` when canonical absent
  assert.match(s, /skill\.get\('tier'\)/)
})

test('script: tier filter Python builds canonical at-or-above for legacy tier', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /'starter': 1/)
  assert.match(s, /'pro': 2/)
  assert.match(s, /'studio': 3/)
})

test('script: tier filter installs SKILL.md to ~/.hermes/skills/<id>/', () => {
  const s = buildBundlePullScript(baseParams)
  // Per-skill destination uses lower-cased $skill_id (now function-local)
  assert.match(s, /\/home\/weuseai\/\.hermes\/skills\/\$skill_id\/SKILL\.md/)
})

test('script: tier filter removes SKILL.md on tier downgrade (SKIP path)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /rm -f.*\.hermes\/skills\/\$skill_id\/SKILL\.md/)
})

// ─── graceful failure paths ──────────────────────────────────────────

test('script: bundle-fetch failure → record storage_unavailable + skip this slug', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /record_attempt "\$slug" "storage_unavailable"/)
  assert.match(s, /bundle-fetch failed for \$slug; skipping/)
})

test('script: malformed bundle-fetch response → record failed + continue', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /bundle-fetch returned malformed response/)
})

test('script: download failure → record failed + return 1 (loop continues)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /Download failed for \$slug/)
  // The download branch records failed via record_attempt + returns 1
  assert.match(s, /record_attempt "\$slug" "failed" "\$version" "" "download HTTP failure"/)
  // Final `exit 0` is at script end after the loop (graceful)
  assert.ok(s.trimEnd().endsWith('exit 0'))
})

test('script: extract failure → record failed + continue', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /Extract failed for \$slug/)
})

test('script: missing .env → log + exit 0 (don\'t fail Hermes boot)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\.env missing/)
})

// ─── telemetry contract ──────────────────────────────────────────────

test('script: success path records status="success" with version + bytes + duration per slug', () => {
  const s = buildBundlePullScript(baseParams)
  // record_attempt now takes the slug as its first arg
  assert.match(s, /record_attempt "\$slug" "success" "\$version" "\$version" "" "\$bytes" "\$duration"/)
})

test('script: telemetry POST is best-effort (fails silently per-slug)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /telemetry record failed \(non-fatal\) for \$slug/)
})

test('script: telemetry payload includes agent_slug from loop', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /"agent_slug": "\$slug"/)
})

// ─── overall structure ───────────────────────────────────────────────

test('script: writes log to /var/log/weuseai-bundle-pull.log', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\/var\/log\/weuseai-bundle-pull\.log/)
})

test('script: ends with exit 0 after the loop (success path)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.ok(s.trimEnd().endsWith('exit 0'))
})

test('script: per-loop summary log line includes success + fail counts', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /Multi-persona pull complete: \$SUCCESS_COUNT success, \$FAIL_COUNT fail/)
})
