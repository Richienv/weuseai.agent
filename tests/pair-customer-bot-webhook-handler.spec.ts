/**
 * pair-customer-bot-webhook-handler tests.
 *
 * Step 3 of Pair-flow Option A: customer sends /pair <code> to their
 * own bot. Webhook fires here with cid in query string + secret_token
 * header. Handler matches code, writes telegram_chat_id, replies via
 * customer's own bot.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PAIR_CUSTOMER_BOT_REPLIES,
  handlePairCustomerBotWebhook,
} from '../supabase/functions/_shared/pair-customer-bot-webhook-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type { ITelegramClient } from '../supabase/functions/_shared/types.ts'

class FakeTelegram implements ITelegramClient {
  replies: { botToken: string; chatId: number | string; text: string }[] = []

  async replyText() {}
  async getMe() {
    return null
  }
  async setWebhook() {}
  async deleteWebhook() {}
  async sendMessageAs(
    botToken: string,
    chatId: number | string,
    text: string,
  ): Promise<void> {
    this.replies.push({ botToken, chatId, text })
  }
}

const SECRET = 'super-secret-pair-webhook-token-12345678'
const VALID_TOKEN = '8734001154:AAGGTR0PRNCy03aaVPb5qi9hWzxCe5yr_Ek'

function setupValidPairing() {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
    pairing_code: '977841',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
    telegram_bot_username: 'welcomeuseaibot',
  })
  // Seed encrypted token via the store's setBotTokenAndUsername (round-trips
  // via fake-store's enc: prefix).
  return (async () => {
    await db.setBotTokenAndUsername('cust-1', VALID_TOKEN, 'welcomeuseaibot')
    return { db, telegram }
  })()
}

function buildReq(
  body: unknown,
  opts?: { method?: string; secret?: string | null; cid?: string | null },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (opts?.secret !== null) {
    headers['x-telegram-bot-api-secret-token'] = opts?.secret ?? SECRET
  }
  const cidPart =
    opts?.cid === null
      ? ''
      : `?cid=${encodeURIComponent(opts?.cid ?? 'cust-1')}`
  const init: RequestInit = {
    method: opts?.method ?? 'POST',
    headers,
  }
  if ((opts?.method ?? 'POST') !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request(
    `https://x/functions/v1/pair-customer-bot-webhook${cidPart}`,
    init,
  )
}

const validUpdate = {
  update_id: 1,
  message: {
    message_id: 100,
    text: '/pair 977841',
    chat: { id: 6805409051, type: 'private' },
    from: { id: 6805409051, username: 'andy', is_bot: false },
  },
}

// ─── happy path ───────────────────────────────────────────────────

test('valid /pair: links chat_id, clears pairing fields, replies success via customer bot', async () => {
  const { db, telegram } = await setupValidPairing()

  const res = await handlePairCustomerBotWebhook(buildReq(validUpdate), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)

  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, '6805409051')
  assert.equal(c?.pairing_code, null)
  assert.equal(c?.pairing_code_expires_at, null)

  // Reply was sent via the CUSTOMER'S OWN bot (token + chat id match).
  assert.equal(telegram.replies.length, 1)
  assert.equal(telegram.replies[0].botToken, VALID_TOKEN)
  assert.equal(telegram.replies[0].chatId, 6805409051)
  assert.equal(telegram.replies[0].text, PAIR_CUSTOMER_BOT_REPLIES.success)
})

// ─── auth ─────────────────────────────────────────────────────────

test('missing secret token: 401, no DB write', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq(validUpdate, { secret: null }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 401)
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
})

test('wrong secret token: 401', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq(validUpdate, { secret: 'nope' }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 401)
})

test('GET method: 405', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq({}, { method: 'GET' }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 405)
})

// ─── cid in query ─────────────────────────────────────────────────

test('missing cid: 200 with ignored:missing_cid (no Telegram retry storm)', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq(validUpdate, { cid: null }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ignored?: string }
  assert.equal(body.ignored, 'missing_cid')
  // No state mutation
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
})

test('unknown cid: 200 with ignored:unknown_customer, no reply', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq(validUpdate, { cid: 'does-not-exist' }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ignored?: string }
  assert.equal(body.ignored, 'unknown_customer')
  assert.equal(telegram.replies.length, 0)
})

// ─── /pair parsing ────────────────────────────────────────────────

test('non-/pair message: 200, ignored:not_pair_command, no reply', async () => {
  const { db, telegram } = await setupValidPairing()
  const update = {
    update_id: 2,
    message: {
      message_id: 100,
      text: 'hello bot',
      chat: { id: 6805409051 },
    },
  }
  const res = await handlePairCustomerBotWebhook(buildReq(update), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)
  assert.equal(telegram.replies.length, 0)
})

test('/pair with no arg: replies usage hint via customer bot', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq({ message: { text: '/pair', chat: { id: 100 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, PAIR_CUSTOMER_BOT_REPLIES.usage)
  assert.equal(telegram.replies[0].botToken, VALID_TOKEN)
})

test('/pair with 5-digit code: replies usage hint', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq({ message: { text: '/pair 12345', chat: { id: 100 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, PAIR_CUSTOMER_BOT_REPLIES.usage)
})

test('/pair with bot username suffix: matches', async () => {
  const { db, telegram } = await setupValidPairing()
  const update = {
    message: {
      text: '/pair@welcomeuseaibot 977841',
      chat: { id: 6805409051 },
    },
  }
  const res = await handlePairCustomerBotWebhook(buildReq(update), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, '6805409051')
})

// ─── code matching + expiry ───────────────────────────────────────

test('/pair with wrong code: replies invalid, no DB write', async () => {
  const { db, telegram } = await setupValidPairing()
  const res = await handlePairCustomerBotWebhook(
    buildReq({ message: { text: '/pair 999999', chat: { id: 100 } } }),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, PAIR_CUSTOMER_BOT_REPLIES.invalid)
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
  assert.equal(c?.pairing_code, '977841')   // unchanged
})

test('/pair with expired code: replies invalid, no DB write', async () => {
  const { db, telegram } = await setupValidPairing()
  await db.updateCustomer('cust-1', {
    pairing_code_expires_at: '2020-01-01T00:00:00.000Z',
  })
  const res = await handlePairCustomerBotWebhook(buildReq(validUpdate), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)
  assert.equal(telegram.replies[0].text, PAIR_CUSTOMER_BOT_REPLIES.invalid)
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_chat_id, null)
})

// ─── re-pair guard ────────────────────────────────────────────────

test('already-paired customer sends /pair again: replies "already paired", no DB write', async () => {
  const { db, telegram } = await setupValidPairing()
  await db.updateCustomer('cust-1', {
    telegram_chat_id: '6805409051',
    pairing_code: null,
    pairing_code_expires_at: null,
  })
  const res = await handlePairCustomerBotWebhook(buildReq(validUpdate), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)
  assert.equal(
    telegram.replies[0].text,
    PAIR_CUSTOMER_BOT_REPLIES.alreadyPaired,
  )
})

// ─── decryption fault ─────────────────────────────────────────────

test('decrypt failure: 200 ignored:token_decrypt_failed (no Telegram retry storm)', async () => {
  const { db, telegram } = await setupValidPairing()
  db.throwOnDecryptBotToken = true
  const res = await handlePairCustomerBotWebhook(buildReq(validUpdate), {
    db,
    telegram,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ignored?: string }
  assert.equal(body.ignored, 'token_decrypt_failed')
})

test('customer has no bot token: 200 ignored:no_bot_token', async () => {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({
    id: 'cust-9',
    email: 'a@example.com',
    pairing_code: '111111',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })
  // No setBotTokenAndUsername called — token absent.
  const res = await handlePairCustomerBotWebhook(
    buildReq(
      { message: { text: '/pair 111111', chat: { id: 100 } } },
      { cid: 'cust-9' },
    ),
    { db, telegram, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ignored?: string }
  assert.equal(body.ignored, 'no_bot_token')
})

// ─── reply copy guard ─────────────────────────────────────────────

test('reply copy uses kamu, no Anda, no exclamation', () => {
  for (const text of Object.values(PAIR_CUSTOMER_BOT_REPLIES)) {
    assert.match(text, /\bkamu\b/i, `"${text}" should use kamu`)
    assert.doesNotMatch(text, /\bAnda\b/, `"${text}" must not use Anda`)
    assert.doesNotMatch(
      text,
      /!/,
      `"${text}" must not contain exclamation marks (CLAUDE.md voice rule)`,
    )
  }
})
