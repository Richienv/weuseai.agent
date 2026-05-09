/**
 * telegram-bot-webhook-handler tests.
 *
 * Walks the /pair flow: valid code, expired code, bad format, non-pair
 * messages, secret-token check.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TELEGRAM_REPLIES,
  handleTelegramBotWebhook,
} from '../supabase/functions/_shared/telegram-bot-webhook-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type { ITelegramClient } from '../supabase/functions/_shared/types.ts'

class FakeTelegram implements ITelegramClient {
  replies: { chatId: number | string; text: string }[] = []

  async replyText(chatId: number | string, text: string): Promise<void> {
    this.replies.push({ chatId, text })
  }

  // Pair-flow Option A (2026-05-09): unused by the legacy /pair handler
  // (which only calls replyText), but ITelegramClient now requires
  // these. Tests for the new pair-customer-bot-webhook handler use
  // their own dedicated FakeTelegram with full instrumentation.
  async getMe(_botToken: string) {
    return null
  }
  async setWebhook(_input: {
    botToken: string
    url: string
    secretToken: string
    allowedUpdates?: string[]
  }) {}
  async deleteWebhook(_botToken: string) {}
  async sendMessageAs(
    _botToken: string,
    chatId: number | string,
    text: string,
  ): Promise<void> {
    this.replies.push({ chatId, text })
  }
  // Phase 5-5b: no-op stubs (this legacy /pair handler test doesn't
  // exercise the new approval surfaces).
  async sendMessageWithButtonsAs() {}
  async answerCallbackQuery() {}
}

const SECRET = 'super-secret-token'

function buildReq(body: unknown, opts?: { method?: string; secret?: string | null }): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (opts?.secret !== null) {
    headers['x-telegram-bot-api-secret-token'] = opts?.secret ?? SECRET
  }
  const method = opts?.method ?? 'POST'
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/telegram-bot-webhook', init)
}

function setupValidPairing() {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
    pairing_code: '123456',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })
  return { db, telegram }
}

// ─── happy path ───────────────────────────────────────────────────

test('/pair valid code: links chat_id, clears pairing fields, replies success', async () => {
  const { db, telegram } = setupValidPairing()

  const res = await handleTelegramBotWebhook(
    buildReq({
      update_id: 1,
      message: {
        text: '/pair 123456',
        chat: { id: 7777777, type: 'private' },
      },
    }),
    { db, telegram, webhookSecret: SECRET },
  )

  assert.equal(res.status, 200)

  // Customer updated
  const c = await db.findCustomerById('cust-1')
  assert.ok(c)
  if (!c) return
  assert.equal(c.telegram_chat_id, '7777777')
  assert.equal(c.pairing_code, null)
  assert.equal(c.pairing_code_expires_at, null)

  // Bot replied with the locked success copy
  assert.equal(telegram.replies.length, 1)
  assert.equal(telegram.replies[0].chatId, 7777777)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.success)
  // No exclamation in success copy (per founder edit A)
  assert.equal(telegram.replies[0].text.includes('!'), false)
})

test('/pair with bot username suffix (group chat usage): also matches', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({
      message: {
        text: '/pair@weuseaibot 123456',
        chat: { id: 1, type: 'private' },
      },
    }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.success)
})

// ─── invalid / expired code ──────────────────────────────────────

test('/pair unknown code: replies invalid, no DB write', async () => {
  const { db, telegram } = setupValidPairing()
  const before = JSON.stringify(await db.findCustomerById('cust-1'))

  const res = await handleTelegramBotWebhook(
    buildReq({
      message: { text: '/pair 999999', chat: { id: 8 } },
    }),
    { db, telegram, webhookSecret: SECRET },
  )

  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.invalid)
  // Customer unchanged
  assert.equal(JSON.stringify(await db.findCustomerById('cust-1')), before)
})

test('/pair expired code: replies invalid, no DB write', async () => {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    pairing_code: '123456',
    pairing_code_expires_at: '2020-01-01T00:00:00.000Z',  // long past
  })

  const res = await handleTelegramBotWebhook(
    buildReq({
      message: { text: '/pair 123456', chat: { id: 9 } },
    }),
    { db, telegram, webhookSecret: SECRET },
  )

  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.invalid)
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
  assert.equal(c?.pairing_code, '123456', 'expired code preserved (UI clears on rotate)')
})

test('/pair missing arg: replies usage hint', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({ message: { text: '/pair', chat: { id: 1 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.usage)
})

test('/pair non-numeric arg: replies usage hint', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({ message: { text: '/pair abc123', chat: { id: 1 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.usage)
})

test('/pair with 5-digit code: replies usage hint (must be exactly 6)', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({ message: { text: '/pair 12345', chat: { id: 1 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, TELEGRAM_REPLIES.usage)
})

// ─── irrelevant updates silently 200 ─────────────────────────────

test('non-/pair text message: 200 with no reply, no DB write', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({ message: { text: 'halo', chat: { id: 1 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies.length, 0)
})

test('update with no message field: 200', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({ update_id: 999 }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies.length, 0)
})

test('malformed JSON body: 200 (don\'t make Telegram retry-storm us)', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq('not json {{{', { method: 'POST' }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
})

// ─── auth ─────────────────────────────────────────────────────────

test('missing secret token: 401, no DB write', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq(
      { message: { text: '/pair 123456', chat: { id: 1 } } },
      { secret: null },
    ),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 401)
  assert.equal(telegram.replies.length, 0)
  // Customer not touched
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
})

test('wrong secret token: 401', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq(
      { message: { text: '/pair 123456', chat: { id: 1 } } },
      { secret: 'wrong-token' },
    ),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 401)
})

test('GET method: 405', async () => {
  const { db, telegram } = setupValidPairing()
  const res = await handleTelegramBotWebhook(
    buildReq({}, { method: 'GET' }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 405)
})

// ─── voice/brand ──────────────────────────────────────────────────

test('reply copy uses kamu, no Anda, no exclamation', () => {
  // The success/usage/invalid replies are exposed for assertion.
  for (const text of Object.values(TELEGRAM_REPLIES)) {
    assert.equal(text.includes('!'), false, `'${text}' has '!'`)
    assert.equal(text.includes('Anda'), false, `'${text}' uses 'Anda'`)
    // success has 'kamu'; usage has 'kode pasangan'; invalid has 'kamu' too
  }
  assert.match(TELEGRAM_REPLIES.success, /kamu/)
})
