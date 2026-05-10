// proactive-greeting — Track 2 of post-pair UX polish (2026-05-10).
//
// Tests the helper that sends an in-character "agent ready" message AS
// the customer's bot AFTER refreshEnv + webhook delete both succeed.
// Best-effort, never throws — failures fall back through layers.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sendProactiveGreeting,
  renderGreetingTemplate,
} from '../supabase/functions/_shared/proactive-greeting.ts'
import type { ITelegramClient } from '../supabase/functions/_shared/types.ts'

function fakeTelegram(opts: {
  sendShouldThrow?: boolean
} = {}): ITelegramClient & {
  replies: Array<{ botToken: string; chatId: number | string; text: string }>
} {
  const replies: Array<{ botToken: string; chatId: number | string; text: string }> = []
  return {
    replies,
    async replyText() { /* unused */ },
    async getMe() { return null },
    async setWebhook() { /* unused */ },
    async deleteWebhook() { /* unused */ },
    async getWebhookInfo() { return { url: '' } },
    async sendMessageAs(botToken, chatId, text) {
      if (opts.sendShouldThrow) throw new Error('Telegram 400 chat not found')
      replies.push({ botToken, chatId, text })
    },
    async sendMessageWithButtonsAs() { /* unused */ },
    async answerCallbackQuery() { /* unused */ },
  }
}

// ─── renderGreetingTemplate (pure) ─────────────────────────────────

test('template uses customer name when present', () => {
  const t = renderGreetingTemplate('Sarah')
  assert.match(t, /Halo Sarah/)
})

test('template falls back to "kamu" when name is empty', () => {
  const t = renderGreetingTemplate('')
  assert.match(t, /Halo kamu/)
})

test('template contains no exclamation marks (brand voice)', () => {
  const t = renderGreetingTemplate('Sarah')
  assert.equal(t.includes('!'), false)
})

// ─── sendProactiveGreeting — happy path with template fallback ─────

test('falls back to template when openrouter key is null', async () => {
  const telegram = fakeTelegram()
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: 'You are a calm assistant.',
      customerName: 'Sarah',
      openrouterApiKey: null,
    },
    { telegram },
  )
  assert.equal(result.ok, true)
  assert.equal(result.source, 'template')
  assert.equal(telegram.replies.length, 1)
  assert.equal(telegram.replies[0].chatId, '6805409051')
  assert.match(telegram.replies[0].text, /Sarah/)
})

test('falls back to template when soul_md_text is null', async () => {
  const telegram = fakeTelegram()
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: null,
      customerName: 'Sarah',
      openrouterApiKey: 'sk-mock-key',
    },
    { telegram },
  )
  assert.equal(result.ok, true)
  assert.equal(result.source, 'template')
})

test('falls back to template when openrouter call fails', async () => {
  const telegram = fakeTelegram()
  const failFetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: 'You are a calm assistant.',
      customerName: 'Sarah',
      // Non-mock prefix so the helper actually tries the LLM call (and
      // hits failFetch). sk-mock-* keys short-circuit by design.
      openrouterApiKey: 'sk-or-v1-real-shape',
    },
    { telegram, fetchImpl: failFetch },
  )
  assert.equal(result.ok, true)
  assert.equal(result.source, 'template')
  assert.equal(telegram.replies.length, 1)
})

test('uses LLM-generated text when openrouter responds OK', async () => {
  const telegram = fakeTelegram()
  const fakeFetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Halo Sarah, aku siap. Lagi sibuk apa hari ini?' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )) as typeof fetch
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: 'You are Sarah, a calm assistant.',
      customerName: 'Sarah',
      // Real-shape key (non sk-mock prefix) so the helper exercises the
      // LLM path against the injected fakeFetch.
      openrouterApiKey: 'sk-or-v1-real-shape',
    },
    { telegram, fetchImpl: fakeFetch },
  )
  assert.equal(result.ok, true)
  assert.equal(result.source, 'llm')
  assert.match(telegram.replies[0].text, /Lagi sibuk apa/)
})

test('mock-prefixed openrouter key short-circuits LLM call (test isolation)', async () => {
  const telegram = fakeTelegram()
  let fetchCalled = false
  const sentinelFetch = (() => {
    fetchCalled = true
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as typeof fetch
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: 'You are a calm assistant.',
      customerName: 'Sarah',
      openrouterApiKey: 'sk-mock-12345',
    },
    { telegram, fetchImpl: sentinelFetch },
  )
  assert.equal(result.ok, true)
  assert.equal(result.source, 'template')
  assert.equal(fetchCalled, false, 'sk-mock-* keys must not trigger any fetch')
})

test('rejects non-digit chat_id (defense-in-depth)', async () => {
  const telegram = fakeTelegram()
  const result = await sendProactiveGreeting(
    {
      chatId: '6805; rm -rf /',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: null,
      customerName: 'Sarah',
      openrouterApiKey: null,
    },
    { telegram },
  )
  assert.equal(result.ok, false)
  assert.equal(result.source, 'send_failed')
  assert.equal(telegram.replies.length, 0)
})

test('returns ok=false on Telegram send failure but does not throw', async () => {
  const telegram = fakeTelegram({ sendShouldThrow: true })
  const result = await sendProactiveGreeting(
    {
      chatId: '6805409051',
      botToken: '123456:ABC-token-long-enough',
      soulMdText: null,
      customerName: 'Sarah',
      openrouterApiKey: null,
    },
    { telegram },
  )
  assert.equal(result.ok, false)
  assert.equal(result.source, 'send_failed')
  assert.match(result.error ?? '', /chat not found/)
})
