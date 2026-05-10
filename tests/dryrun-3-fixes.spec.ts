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

test('Fix 1: xendit-webhook handler passes empty customerTelegramBotToken', async () => {
  // Pure-grep verification — the handler source must explicitly pass
  // the empty string so spin-up-helpers.ts doesn't fall back to
  // env.TELEGRAM_BOT_TOKEN (the shared @weuseaibot platform token).
  const fs = await import('node:fs')
  const path = await import('node:path')
  const src = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'supabase/functions/_shared/xendit-webhook-handler.ts',
    ),
    'utf8',
  )
  // spinUp call must include customerTelegramBotToken: ''.
  assert.ok(
    /customerTelegramBotToken:\s*''/.test(src),
    'xendit-webhook spinUp must explicitly pass customerTelegramBotToken: \'\'',
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
