/**
 * Tests for bundle-pull-script.ts (Phase 2E-2 Day 3).
 *
 * Generator-level tests: assert the produced bash script contains the
 * structural elements we depend on (env reads, idempotency gate, tier
 * filter, telemetry call, graceful-failure paths). Doesn't run the
 * script — that happens in the live VPS smoke test.
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

test('script: pulls customer_id, agent_slug, tier from env (with defaults)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /CID="\$\{WEUSEAI_CUSTOMER_ID:-/)
  assert.match(s, /SLUG="\$\{WEUSEAI_AGENT_SLUG:-the-pro\}"/)
  assert.match(s, /TIER="\$\{WEUSEAI_TIER:-starter\}"/)
})

test('script: customerId from params injected as fallback', () => {
  const s = buildBundlePullScript({ customerId: 'cust_specific_id' })
  assert.match(s, /CID="\$\{WEUSEAI_CUSTOMER_ID:-cust_specific_id\}"/)
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

test('script: checks /var/lib/weuseai/bundle/<slug>/.installed-version', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\/var\/lib\/weuseai\/bundle\/\$SLUG\/\.installed-version/)
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
  // The translation table inside the Python block
  assert.match(s, /'starter': 1/)
  assert.match(s, /'pro': 2/)
  assert.match(s, /'studio': 3/)
})

test('script: tier filter installs SKILL.md to ~/.hermes/skills/<id>/', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/skills\/\$skill_id\/SKILL\.md/)
})

test('script: tier filter removes SKILL.md on tier downgrade (SKIP path)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /rm -f.*\.hermes\/skills\/\$skill_id\/SKILL\.md/)
})

// ─── graceful failure paths ──────────────────────────────────────────

test('script: bundle-fetch failure → record storage_unavailable + exit 0', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /record_attempt "storage_unavailable"/)
  assert.match(s, /customer keeps minimal bootstrap/)
})

test('script: malformed bundle-fetch response → record failed + exit 0', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /malformed response/)
})

test('script: download failure → record failed + exit 0', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /Download failed/)
  // The download branch records "failed" and exits 0
  const downloadFailLine = s.split('\n').findIndex((l) => l.includes('Download failed'))
  assert.ok(downloadFailLine > 0)
  // Within the next 5 lines: record_attempt "failed" + exit 0
  const after = s.split('\n').slice(downloadFailLine, downloadFailLine + 6).join('\n')
  assert.match(after, /record_attempt "failed"/)
  assert.match(after, /exit 0/)
})

test('script: extract failure → record failed + exit 0', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /Extract failed/)
})

test('script: missing .env → log + exit 0 (don\'t fail Hermes boot)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\.env missing/)
})

// ─── telemetry contract ──────────────────────────────────────────────

test('script: success path records status="success" with version + bytes + duration', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /record_attempt "success" "\$VERSION" "\$VERSION".*"\$BYTES" "\$DURATION"/)
})

test('script: telemetry POST is best-effort (fails silently)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /telemetry record failed \(non-fatal\)/)
})

// ─── overall structure ───────────────────────────────────────────────

test('script: writes log to /var/log/weuseai-bundle-pull.log', () => {
  const s = buildBundlePullScript(baseParams)
  assert.match(s, /\/var\/log\/weuseai-bundle-pull\.log/)
})

test('script: ends with exit 0 (success path)', () => {
  const s = buildBundlePullScript(baseParams)
  assert.ok(s.trimEnd().endsWith('exit 0'))
})
