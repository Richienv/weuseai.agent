/**
 * Phase 3 (2026-05-13): Tier 1 setup-script harness — bash syntax check.
 *
 * Calls `bash -n` on the rendered setup-script + bundle-pull-script
 * output. Catches a broad class of quoting / heredoc / control-flow
 * bugs WITHOUT requiring Docker or network. Runs on every npm test.
 *
 * Specifically catches:
 *  - The HF-2 `timeout VAR=val command` bug would have passed `bash -n`
 *    but the actual runtime failed. So this tier doesn't catch
 *    semantic bugs — only syntax. Tier 2 (Docker) is needed for
 *    semantic verification. But this still catches:
 *  - Heredoc-delimiter collisions
 *  - Unbalanced quotes / parens / braces
 *  - Premature EOF
 *  - `set -e` plus unmatched control-flow tokens
 *
 * Phase 3 architectural note: rendering the bash, piping to bash -n,
 * and asserting "exit 0" is the cheapest possible regression guard.
 * Adds <100 ms to npm test. Always runs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildSetupScript } from '../services/provisioning/src/setup-script'
import { buildBundlePullScript } from '../services/provisioning/src/bundle-pull-script'

const BASE_PARAMS = {
  customerId: 'cust-harness-tier1',
  tier: 'pro' as const,
  telegramBotToken: '12345:abc',
  telegramAllowedUserIds: '987654',
  openRouterKey: 'sk-or-v1-harness',
  bundleTarBase64: 'fake-bootstrap-bundle-b64',
  fleetSshPubkey: 'ssh-ed25519 AAAAdummy',
  hermesVersion: 'v0.13.0',
}

function bashSyntaxCheck(script: string): { ok: boolean; stderr: string } {
  // bash on macOS is /bin/bash (3.2.57) — old, but the syntax check
  // mode handles bash-4+ syntax correctly enough. CI Ubuntu image has
  // a modern bash.
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-bash-syntax-'))
  const path = join(dir, 'script.sh')
  try {
    writeFileSync(path, script, { encoding: 'utf8' })
    const r = spawnSync('bash', ['-n', path], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      ok: r.status === 0,
      stderr: (r.stderr ?? '').toString(),
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }
}

// ─── setup-script.ts ───────────────────────────────────────────────────

test('setup-script with full happy-path params parses cleanly via bash -n', () => {
  const script = buildSetupScript(BASE_PARAMS)
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('setup-script with no Telegram token (first xendit-webhook spinUp) parses cleanly', () => {
  const script = buildSetupScript({
    ...BASE_PARAMS,
    telegramBotToken: '',
    telegramAllowedUserIds: '',
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('setup-script with no bundle (Phase 1/2A back-compat) parses cleanly', () => {
  const script = buildSetupScript({
    ...BASE_PARAMS,
    bundleTarBase64: undefined,
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('setup-script with no openRouterKey (paste-later flow) parses cleanly', () => {
  const script = buildSetupScript({
    ...BASE_PARAMS,
    openRouterKey: undefined,
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('setup-script with HMAC token + multi-persona agentSlugs parses cleanly', () => {
  const script = buildSetupScript({
    ...BASE_PARAMS,
    hermesInstanceToken: 'hmac-token-test',
    agentSlugs: ['the-pro', 'doc-expert', 'slide-master', 'deep-researcher'],
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('setup-script with Studio tier + all 10 persona slugs parses cleanly', () => {
  const script = buildSetupScript({
    ...BASE_PARAMS,
    tier: 'studio' as const,
    agentSlugs: [
      'the-pro', 'doc-expert', 'slide-master', 'deep-researcher',
      'trade-pro', 'project-conductor', 'video-producer',
      'social-conductor', 'web-app-builder', 'business-agent',
    ],
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

// ─── bundle-pull-script.ts ─────────────────────────────────────────────

test('bundle-pull-script parses cleanly via bash -n', () => {
  const script = buildBundlePullScript({ customerId: 'cust-1' })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})

test('bundle-pull-script with custom URLs parses cleanly', () => {
  const script = buildBundlePullScript({
    customerId: 'cust-1',
    bundleFetchUrl: 'http://localhost:54321/functions/v1/bundle-fetch',
    bundlePullRecordUrl: 'http://localhost:54321/functions/v1/bundle-pull-record',
  })
  const r = bashSyntaxCheck(script)
  assert.equal(r.ok, true, `bash -n stderr:\n${r.stderr}`)
})
