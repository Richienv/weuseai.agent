/**
 * buildSetupScript() — pure function, takes customer config, returns the
 * bash script to run on the VPS over SSH. Same content as the old cloud-init
 * runcmd block, but now self-contained shell with explicit error handling
 * and a logfile per step.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'

const baseParams = {
  customerId: '4d644821-f6a5-46ba-a410-e1d31184e7eb',
  tier: 'pro' as const,
  telegramBotToken: '8630424948:AAGmM1ND-test',
  telegramAllowedUserIds: '6805409051',
  customerLlmApiKey: 'sk-deepseek-EXAMPLE',
  customerLlmProvider: 'deepseek' as const,
}

test('script: starts with set -e and logs to /var/log/weuseai-setup.log', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /^#!\/bin\/bash/m, 'shebang')
  assert.match(s, /set -[a-z]*e/, 'errexit set')
  assert.match(s, /\/var\/log\/weuseai-setup\.log/, 'logfile path present')
})

test('script: sends halo curl FIRST (proof of life before Hermes install)', () => {
  // Per founder direction 2026-05-04: halo lands within seconds of SSH
  // connect, BEFORE the slow Hermes install. Customer sees life immediately.
  const s = buildSetupScript(baseParams)
  const haloIdx = s.indexOf('api.telegram.org')
  const installIdx = s.indexOf('install.sh')
  assert.ok(haloIdx > 0, 'halo curl present')
  assert.ok(installIdx > 0, 'hermes install present')
  assert.ok(haloIdx < installIdx, `halo (idx=${haloIdx}) must come before install (idx=${installIdx})`)
})

test('script: halo text matches Phase 1 spec', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /Halo, gue agen lo/, 'liveness greeting')
  assert.match(s, /Setup beres/, 'completion phrasing')
  assert.match(s, /jam 7 pagi tiap hari WIB/, 'briefing schedule')
})

test('script: halo curl substitutes bot token + chat id', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /bot8630424948:AAGmM1ND-test\/sendMessage/, 'bot token in URL')
  assert.match(s, /"chat_id":"6805409051"/, 'chat id in JSON body')
})

test('script: apt installs curl + ca-certificates + python3', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /apt-get update/, 'apt update')
  assert.match(s, /apt-get install -y[^\n]*\bcurl\b/, 'curl installed')
  assert.match(s, /apt-get install -y[^\n]*\bca-certificates\b/, 'CA certs')
  assert.match(s, /apt-get install -y[^\n]*\bpython3\b/, 'python3')
})

test('script: creates weuseai user with sudo + home dir', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /useradd -m -s \/bin\/bash weuseai/, 'create user with home + bash')
  assert.match(s, /usermod -aG sudo weuseai|sudo group/, 'sudo group access')
})

test('script: writes /home/weuseai/.hermes/.env (chmod 0600) with creds', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/\.env/, '.env path')
  assert.match(s, /TELEGRAM_BOT_TOKEN=8630424948:AAGmM1ND-test/, 'bot token written')
  assert.match(s, /TELEGRAM_ALLOWED_USERS=6805409051/, 'allowed users')
  assert.match(s, /chmod (?:0)?600 \/home\/weuseai\/\.hermes\/\.env/, '.env locked down')
})

test('script: writes SOUL.md with Bahasa lo/gue persona', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/SOUL\.md/, 'SOUL.md path')
  assert.match(s, /asisten AI berbahasa Indonesia/, 'persona')
  assert.match(s, /casual lo\/gue/, 'tone')
})

test('script: writes daily-news skill SKILL.md', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/skills\/daily-news-briefing-bahasa\/SKILL\.md/, 'skill path')
  assert.match(s, /detik\.com/, 'detik source')
  assert.match(s, /kompas\.com/, 'kompas source')
  assert.match(s, /cnbcindonesia\.com/, 'cnbc source')
  assert.match(s, /Selamat pagi/, 'greeting')
})

test('script: runs Hermes install.sh as weuseai (pinned to upstream main)', () => {
  const s = buildSetupScript(baseParams)
  assert.match(
    s,
    /su - weuseai -c ['"][^'"]*curl -fsSL https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.sh \| bash/,
    'install.sh as weuseai',
  )
})

test('script: gateway setup + install + cron — best-effort (failure tolerated)', () => {
  const s = buildSetupScript(baseParams)
  // Each hermes management command: tolerated failure so a CLI flag rename
  // upstream doesn't kill the whole script. The crucial halo already fired.
  // Tolerance via `|| true` OR `|| log "..."` (logs the failure but exits 0).
  const lines = s.split('\n').filter(l => l.match(/hermes (gateway|cron)/))
  assert.ok(lines.length >= 3, `at least 3 hermes mgmt commands, got ${lines.length}`)
  for (const l of lines) {
    assert.match(l, /\|\|\s*(true|log\s)/, `tolerant: ${l.trim()}`)
  }
})

test('script: writes /opt/weuseai/ready as final step (success marker)', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/opt\/weuseai\/ready/, 'ready marker')
  // Must be at/near the end — find its position vs install
  const readyIdx = s.lastIndexOf('/opt/weuseai/ready')
  const installIdx = s.indexOf('install.sh')
  assert.ok(readyIdx > installIdx, 'ready marker comes after Hermes install')
})

test('script: uses OpenRouter env for ALL tiers (Phase 2A — single key per customer)', () => {
  const s = buildSetupScript({
    ...baseParams,
    openRouterKey: 'sk-or-v1-customer-key',
  })
  assert.match(s, /OPENAI_API_KEY=sk-or-v1-customer-key/, 'OpenRouter key as OPENAI_API_KEY (Hermes is OpenAI-compatible)')
  assert.match(s, /OPENAI_BASE_URL=https:\/\/openrouter\.ai\/api\/v1/, 'OpenRouter base URL')
  assert.match(s, /OPENAI_MODEL=deepseek\/deepseek-chat/, 'default model')
})

test('script: NO DeepSeek-direct or proxy-token env (Phase 2A removes both)', () => {
  const s = buildSetupScript({ ...baseParams, openRouterKey: 'sk-or-v1-x' })
  assert.doesNotMatch(s, /DEEPSEEK_API_KEY=/, 'no DeepSeek-direct key')
  assert.doesNotMatch(s, /OPENAI_API_BASE=https:\/\/proxy/, 'no proxy URL')
  assert.doesNotMatch(s, /HERMES_DEFAULT_MODEL=/, 'no Hermes-specific model env (use OPENAI_MODEL)')
})

test('script: omits LLM env block entirely when openRouterKey absent', () => {
  // Edge case — Phase 1 customers without Phase 2A applied yet, OR a
  // re-run on a VM that already has its key written. The setup script
  // should still be runnable; downstream config writes wouldn't include
  // LLM env, customer pastes via dashboard later.
  const s = buildSetupScript({ ...baseParams, openRouterKey: undefined })
  assert.doesNotMatch(s, /OPENAI_API_KEY=/, 'no OPENAI_API_KEY when no key provided')
})

test('script: omits Telegram block when bot token absent', () => {
  const s = buildSetupScript({ ...baseParams, telegramBotToken: undefined })
  assert.doesNotMatch(s, /TELEGRAM_BOT_TOKEN=/, 'no bot token line')
  assert.doesNotMatch(s, /api\.telegram\.org/, 'no halo curl')
  // But persona + install still run:
  assert.match(s, /SOUL\.md/, 'persona still written')
  assert.match(s, /install\.sh/, 'install still runs')
})
