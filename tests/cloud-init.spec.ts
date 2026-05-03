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
  assert.match(
    out,
    /hermes cron add[^\n]*--schedule ['"]?0 0 \* \* \*['"]?/,
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
