/**
 * Cloud-init template renders correctly for Phase 1 spec.
 *
 * What we assert: the rendered cloud-init contains every behaviour the
 * VPS needs on first boot — Hermes install, persona, daily-news skill,
 * Telegram gateway, cron, liveness ping. Black-box: we don't pin exact
 * formatting, just the critical substrings + variable substitution.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCloudInit } from '../services/provisioning/src/cloud-init.ts'

const baseParams = {
  customerId: '4d644821-f6a5-46ba-a410-e1d31184e7eb',
  tier: 'pro' as const,
  telegramBotToken: '8630424948:AAGmM1ND-test',
  telegramAllowedUserIds: '6805409051',
  customerLlmApiKey: 'test-deepseek-key',
  customerLlmProvider: 'deepseek' as const,
}

test('cloud-init: installs Hermes from upstream main', () => {
  const out = buildCloudInit(baseParams)
  assert.match(
    out,
    /curl -fsSL https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.sh \| bash/,
    'Hermes install one-liner present (pinned to main per Phase 1 decision)',
  )
})

test('cloud-init: writes SOUL.md with Bahasa lo/gue persona', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /SOUL\.md/, 'SOUL.md path appears')
  assert.match(out, /asisten AI berbahasa Indonesia/, 'persona tagline')
  assert.match(out, /casual lo\/gue/, 'tone directive')
  assert.match(out, /briefing harian/, 'mission')
})

test('cloud-init: drops daily-news-briefing-bahasa skill', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /daily-news-briefing-bahasa/, 'skill directory name')
  assert.match(out, /SKILL\.md/, 'SKILL.md file written')
  assert.match(out, /detik\.com/, 'detik source')
  assert.match(out, /kompas\.com/, 'kompas source')
  assert.match(out, /cnbcindonesia\.com/, 'cnbc source')
  assert.match(out, /Selamat pagi/, 'greeting prefix')
  assert.match(out, /5 berita/, 'top-5 directive')
})

test('cloud-init: registers daily cron at 7 WIB (00:00 UTC)', () => {
  const out = buildCloudInit(baseParams)
  // Cron line is nested inside `bash -c "..."` in the setup script, so
  // double quotes appear as `\"` in the rendered output. Regex allows
  // optional backslash before the schedule quote.
  assert.match(
    out,
    /hermes cron add[^\n]*--schedule\s+\\?["']?0 0 \* \* \*\\?["']?/,
    'cron schedule 0 0 * * * (= 7am WIB)',
  )
  assert.match(out, /--deliver telegram/, 'delivery channel pinned to Telegram')
})

test('cloud-init: sets up Hermes Telegram gateway + systemd', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /hermes gateway setup --telegram/, 'gateway setup')
  assert.match(out, /hermes gateway install/, 'systemd persistence (gateway install)')
})

test('cloud-init: sends liveness ping to Telegram after install', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /Halo, gue agen lo/, 'liveness greeting present')
  assert.match(out, /Setup beres/, 'completion phrasing')
  assert.match(out, /jam 7 pagi tiap hari WIB/, 'briefing schedule communicated to user')
})

test('cloud-init: substitutes Telegram bot token + chat id from params', () => {
  const out = buildCloudInit(baseParams)
  assert.match(
    out,
    /TELEGRAM_BOT_TOKEN=8630424948:AAGmM1ND-test/,
    'bot token substituted into .env',
  )
  assert.match(
    out,
    /TELEGRAM_ALLOWED_USERS=6805409051/,
    'chat id substituted into .env',
  )
})

test('cloud-init: substitutes LLM API key for Pro tier (BYOK)', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /DEEPSEEK_API_KEY=test-deepseek-key/, 'BYOK LLM key substituted')
})

test('cloud-init: omits Telegram block when bot token absent', () => {
  // Customer hasn't pasted token via dashboard yet — VPS still spawns,
  // Hermes runs without a chat channel until the token arrives.
  const out = buildCloudInit({ ...baseParams, telegramBotToken: undefined })
  assert.doesNotMatch(out, /TELEGRAM_BOT_TOKEN=/, 'no bot token line written')
  // But the install + persona still get set up:
  assert.match(out, /install\.sh/, 'Hermes install still runs')
  assert.match(out, /SOUL\.md/, 'persona still written')
})

test('cloud-init: users block has `- default` first to preserve IDCloudHost-default liren user', () => {
  // Without `- default`, cloud-init REPLACES the distro default user list,
  // wiping IDCloudHost's `liren` user. That breaks SSH access entirely
  // (verified live 2026-05-03 — Phase 1 deploy locked us out).
  const out = buildCloudInit(baseParams)
  assert.match(out, /users:\s*\n\s*-\s+default\s*\n\s*-\s+name:\s*weuseai/, 'default user preserved')
})

test('cloud-init: weuseai user gets passwd hash + lock_passwd false when hash provided', () => {
  const hash = '$6$test$pretendhash'
  const out = buildCloudInit({ ...baseParams, weuseaiPasswdHash: hash })
  assert.match(out, /lock_passwd:\s*false/, 'password login allowed')
  assert.match(out, /passwd:\s*'\$6\$test\$pretendhash'/, 'hash quoted in YAML')
})

test('cloud-init: weuseai user has NO passwd line when hash absent (default)', () => {
  const out = buildCloudInit(baseParams)
  assert.doesNotMatch(out, /lock_passwd:/, 'no lock_passwd line')
  assert.doesNotMatch(out, /^\s*passwd:/m, 'no passwd line')
})

test('cloud-init: hermes commands use absolute path /home/weuseai/.local/bin/hermes', () => {
  // Bare `hermes` relies on PATH which `su -` may not load reliably from
  // upstream install.sh. Absolute path removes the ambiguity.
  const out = buildCloudInit(baseParams)
  assert.match(out, /\/home\/weuseai\/\.local\/bin\/hermes gateway setup --telegram/, 'gateway setup absolute')
  assert.match(out, /\/home\/weuseai\/\.local\/bin\/hermes gateway install/, 'gateway install absolute')
  assert.match(out, /\/home\/weuseai\/\.local\/bin\/hermes cron add/, 'cron add absolute')
})

test('cloud-init: ships defensive setup script at /usr/local/bin/weuseai-setup.sh', () => {
  // After 2026-05-04 SSH-lockout incident: complex inline runcmd was
  // impossible to diagnose post-mortem. Defensive design ships a script
  // file we can re-run from VNC console + reads its log.
  const out = buildCloudInit(baseParams)
  assert.match(out, /path:\s*\/usr\/local\/bin\/weuseai-setup\.sh/, 'script path written')
  assert.match(out, /permissions:\s*'0755'/, 'script is executable')
})

test('cloud-init: setup script redirects all output to /var/log/setup.log', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /exec\s+>>\s*\/var\/log\/setup\.log\s+2>&1/, 'log redirect for post-mortem')
})

test('cloud-init: setup script uses step() wrapper that logs OK/FAILED per step', () => {
  // Each step continues on failure (set +e) and emits a structured
  // OK/FAILED log line so we can grep failures from /var/log/setup.log
  // without needing live SSH at the time the failure happened.
  const out = buildCloudInit(baseParams)
  assert.match(out, /set \+e/, 'continue past failures')
  assert.match(out, /step\s*\(\s*\)/, 'step function defined')
  assert.match(out, /OK:/, 'logs OK marker')
  assert.match(out, /FAILED:/, 'logs FAILED marker')
})

test('cloud-init: defends sshd FIRST so a broken Hermes install never locks us out', () => {
  // 6-hour SSH lockout incident root cause unknown but symptom was sshd
  // not listening. Belt-and-braces: explicitly enable + restart ssh as
  // the FIRST setup step so sshd is guaranteed to be running before the
  // long Hermes install starts.
  const out = buildCloudInit(baseParams)
  // Find both the sshd guard and the hermes install in the script body,
  // assert sshd-guard byte-position < hermes-install byte-position.
  const sshdIdx = out.search(/systemctl\s+(enable|restart)\s+ssh/)
  const hermesIdx = out.search(/install\.sh\s*\|\s*bash/)
  assert.ok(sshdIdx > 0, 'sshd guard present')
  assert.ok(hermesIdx > 0, 'hermes install present')
  assert.ok(sshdIdx < hermesIdx, `sshd guard (idx ${sshdIdx}) must come before Hermes install (idx ${hermesIdx})`)
})

test('cloud-init: Telegram halo curl fires BEFORE Hermes install (proof-of-life signal)', () => {
  // If Hermes install hangs, the customer needs SOME signal the spawn
  // worked. Halo before install means: even when Hermes never finishes,
  // the halo still landed → we know cloud-init reached runcmd, network +
  // Telegram creds work. Halo text drift (claims "Setup beres" before
  // install completes) is acceptable for Phase 1 diagnostic; Phase 2
  // sends a "spinning up" first then a "ready" later.
  const out = buildCloudInit(baseParams)
  const halo = out.search(/Halo, gue agen lo/)
  const hermes = out.search(/install\.sh\s*\|\s*bash/)
  assert.ok(halo > 0 && hermes > 0)
  assert.ok(halo < hermes, `halo curl (idx ${halo}) must come before Hermes install (idx ${hermes})`)
})

test('cloud-init: writes ready marker with timestamp at end of setup', () => {
  const out = buildCloudInit(baseParams)
  assert.match(out, /\/opt\/weuseai\/ready/, 'ready marker path present')
})

test('cloud-init: starter tier wires LLM proxy, not BYOK key', () => {
  const out = buildCloudInit({
    customerId: 'cust-starter',
    tier: 'starter',
    telegramBotToken: 'tok',
    telegramAllowedUserIds: '6805409051',
    llmProxyUrl: 'https://proxy.weuseai.workers.dev',
    llmProxyToken: 'mint-jwt-here',
  })
  assert.match(out, /OPENAI_API_BASE=https:\/\/proxy\.weuseai\.workers\.dev/, 'proxy URL')
  assert.match(out, /OPENAI_API_KEY=mint-jwt-here/, 'minted token')
  assert.match(out, /deepseek-chat/, 'default model pinned')
})
