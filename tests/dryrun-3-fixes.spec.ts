// Dry-run cascade — minimum-viable happy-path coverage for the 3 fixes.
//
// Per scope brief: "minimum needed to verify each fix — don't over-cover.
// Skip detailed test coverage beyond happy paths, drift tests, edge
// cases. Ship the fix, verify in real provision, expand tests later."
//
// Background:
// docs/investigation/2026-05-10-fresh-provision-dry-run.md

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRefreshEnvCommand,
} from '../services/provisioning/src/routes/refresh-env.js'

// ─── Fix 1: xendit-webhook spinUp ──────────────────────────────────

test('Fix 1 (updated for Phase E 2026-05-14): xendit-webhook passes the pre-wipe snapshot, NEVER env fallback', async () => {
  // Original Fix 1 (2026-05-10) intent: don't let spin-up-helpers.ts
  // fall back to env.TELEGRAM_BOT_TOKEN (the shared @weuseaibot
  // platform token) — that would cause Telegram 409 conflict storms.
  //
  // Phase E (2026-05-14) refines this: instead of hardcoding `''`, the
  // handler now passes a `existingBotToken` snapshot variable. The
  // snapshot path produces `''` for new customers (preserving the
  // original Fix 1 guarantee) and the decrypted plaintext for
  // existing-customer re-subscribes (eliminates the refresh-env race
  // that bit Renita 2026-05-14 — PR #118 forensic).
  //
  // This test now pins BOTH invariants:
  //   1. The handler passes `existingBotToken` variable to spinUp.
  //   2. The variable is snapshotted BEFORE clearStalePairState.
  //   3. The handler NEVER falls back to env.TELEGRAM_BOT_TOKEN.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const src = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'supabase/functions/_shared/xendit-webhook-handler.ts',
    ),
    'utf8',
  )
  // spinUp call must pass the snapshot variable (not a literal '' and
  // not a Deno.env.get / process.env fallback).
  assert.ok(
    /customerTelegramBotToken:\s*existingBotToken/.test(src),
    'xendit-webhook spinUp must pass `existingBotToken` (Phase E snapshot variable). ' +
      'Without this variable, either (a) the handler reverted to the pre-Phase-E ' +
      'hardcoded \'\' — regenerating the Renita race — or (b) it now pulls env ' +
      'fallback — regenerating the Fix 1 (2026-05-10) Telegram 409 storm.',
  )
  // Snapshot must be initialized BEFORE clearStalePairState — the
  // ordering invariant. After the wipe, the encrypted token is null
  // and a post-wipe snapshot would always read null.
  const snapshotIdx = src.indexOf('getDecryptedBotToken(subscription.customer_id)')
  const wipeIdx = src.indexOf('clearStalePairState(subscription.customer_id)')
  assert.ok(snapshotIdx > 0, 'handler must call getDecryptedBotToken')
  assert.ok(wipeIdx > 0, 'handler must call clearStalePairState (HF-1 invariant)')
  assert.ok(
    snapshotIdx < wipeIdx,
    'snapshot MUST happen before wipe. tests/xendit-webhook-bot-token-snapshot.spec.ts ' +
      'covers the runtime semantics; this is the source-grep drift gate.',
  )
  // Explicit ban: must NOT pull from Deno.env or process.env as a
  // fallback for the bot token (would resurrect the 409 storm).
  assert.equal(
    /customerTelegramBotToken:\s*Deno\.env\.get\(/i.test(src),
    false,
    'must NEVER fall back to Deno.env.get for customerTelegramBotToken',
  )
})

// ─── Fix 2: refreshEnv installs hermes-gateway when missing ────────

test('Fix 2: buildRefreshEnvCommand installs hermes-gateway when unit absent', () => {
  const cmd = buildRefreshEnvCommand({
    TELEGRAM_BOT_TOKEN: '12345:fake_token',
  })
  // Must check for unit file existence + run install if absent.
  assert.match(cmd, /\[ ! -f "\$GATEWAY_UNIT" \]/)
  assert.match(cmd, /gateway install --system --run-as-user weuseai/)
  assert.match(cmd, /gateway start --system/)
  // Must restart only ONCE at the end (not duplicated by the install
  // path AND the regular restart path).
  const restarts = cmd.match(/systemctl restart hermes-gateway/g) ?? []
  assert.equal(
    restarts.length,
    1,
    'restart must fire once at end (install path uses gateway start, not restart)',
  )
})

// ─── Fix 3: refreshEnv writes SOUL.md when content provided ────────

test('Fix 3: buildRefreshEnvCommand writes SOUL.md when content provided', () => {
  const personaText = '# About me\nI am The Pro.\n'
  const cmd = buildRefreshEnvCommand(
    { TELEGRAM_BOT_TOKEN: '12345:fake' },
    { soulMdContent: personaText },
  )
  // Must write to the canonical path.
  assert.match(cmd, /\/home\/weuseai\/\.hermes\/SOUL\.md/)
  // Must include the heredoc body.
  assert.match(cmd, /I am The Pro\./)
  // Must chown to weuseai.
  assert.match(cmd, /chown weuseai:weuseai "\$SOUL_PATH"/)
})

test('Fix 3: buildRefreshEnvCommand omits SOUL.md block when content not provided', () => {
  const cmd = buildRefreshEnvCommand({ TELEGRAM_BOT_TOKEN: '12345:fake' })
  // No SOUL.md write path when soulMdContent is undefined.
  assert.ok(
    !/SOUL_PATH=/.test(cmd),
    'SOUL.md block must NOT appear when soul_md_content is omitted',
  )
})
