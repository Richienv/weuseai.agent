/**
 * validate-bot-token-handler tests.
 *
 * Step 2 of Pair-flow Option A: customer pastes a bot token from
 * @BotFather. Handler validates via Telegram getMe, persists encrypted
 * token + username, sets webhook on customer's bot pointing to
 * pair-customer-bot-webhook?cid=<id>.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleValidateBotToken } from '../supabase/functions/_shared/validate-bot-token-handler.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type { ITelegramClient } from '../supabase/functions/_shared/types.ts'

class FakeTelegram implements ITelegramClient {
  // getMe behavior is configurable per test
  getMeImpl: (token: string) => Promise<
    { id: number; username: string } | null
  > = async () => ({ id: 8734001154, username: 'weuseai_e2e_fixture_bot' })
  setWebhookCalls: Array<{
    botToken: string
    url: string
    secretToken: string
    allowedUpdates?: string[]
  }> = []
  deleteWebhookCalls: string[] = []
  /** Throws on next setWebhook if set. */
  failNextSetWebhook = false

  async replyText() {}
  async getMe(token: string) {
    return this.getMeImpl(token)
  }
  async setWebhook(input: {
    botToken: string
    url: string
    secretToken: string
    allowedUpdates?: string[]
  }) {
    if (this.failNextSetWebhook) {
      this.failNextSetWebhook = false
      throw new Error('Telegram setWebhook -> 502: Bad Gateway')
    }
    this.setWebhookCalls.push(input)
  }
  async deleteWebhook(token: string) {
    this.deleteWebhookCalls.push(token)
  }
  async sendMessageAs() {}
  // Phase 5-5b: no-op stubs (this test doesn't exercise approval surfaces).
  async sendMessageWithButtonsAs() {}
  async answerCallbackQuery() {}
}

const SECRET = 'super-secret-pair-webhook-token-12345678'
const EDGE = 'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1'
const VALID_TOKEN = '8734001154:AAGGTR0PRNCy03aaVPb5qi9hWzxCe5yr_Ek'

function setupReady() {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({ id: 'cust-1', email: 'sarah@example.com' })
  db.seedSubscription({
    id: 'sub-1',
    customer_id: 'cust-1',
    tier: 'pro',
    status: 'active',
  })
  return { db, telegram }
}

function buildReq(body: unknown, opts?: { method?: string }): Request {
  const init: RequestInit = {
    method: opts?.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
  }
  if ((opts?.method ?? 'POST') !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/validate-bot-token', init)
}

// ─── happy path ───────────────────────────────────────────────────

test('valid token: persists encrypted token + username, sets webhook, returns username', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { bot_username: string }
  assert.equal(body.bot_username, 'weuseai_e2e_fixture_bot')

  // Username stored as plaintext on customer row
  const c = await db.findCustomerById('cust-1')
  assert.equal(c?.telegram_bot_username, 'weuseai_e2e_fixture_bot')

  // Token stored as ciphertext (round-trips via fake-store's enc: prefix)
  assert.equal(await db.getDecryptedBotToken('cust-1'), VALID_TOKEN)

  // Webhook registered with cid in query string + secret_token + allowed_updates
  assert.equal(telegram.setWebhookCalls.length, 1)
  const call = telegram.setWebhookCalls[0]
  assert.equal(call.botToken, VALID_TOKEN)
  assert.equal(
    call.url,
    `${EDGE}/pair-customer-bot-webhook?cid=cust-1`,
  )
  assert.equal(call.secretToken, SECRET)
  assert.deepEqual(call.allowedUpdates, ['message'])
})

// ─── input validation ─────────────────────────────────────────────

test('GET method: 405', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(buildReq({}, { method: 'GET' }), {
    db,
    telegram,
    edgeFnBaseUrl: EDGE,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 405)
})

test('malformed JSON: 400 invalid_json', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(buildReq('{not json'), {
    db,
    telegram,
    edgeFnBaseUrl: EDGE,
    webhookSecret: SECRET,
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string }
  assert.equal(body.error, 'invalid_json')
})

test('missing customer_id: 400 missing_field', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(
    buildReq({ bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 400)
})

test('missing bot_token: 400 missing_field', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1' }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 400)
})

test('malformed bot token (no colon): 400 invalid_token format', async () => {
  const { db, telegram } = setupReady()
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: 'notatoken' }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; reason?: string }
  assert.equal(body.error, 'invalid_token')
  assert.equal(body.reason, 'format')
  // No telegram side effects on format reject
  assert.equal(telegram.setWebhookCalls.length, 0)
})

test('no paid subscription: 404', async () => {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  // Customer exists but no subscription
  db.seedCustomer({ id: 'cust-2', email: 'no-sub@example.com' })
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-2', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 404)
})

test('telegram rejects token (getMe returns null): 400 invalid_token rejected_by_telegram', async () => {
  const { db, telegram } = setupReady()
  telegram.getMeImpl = async () => null
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; reason?: string }
  assert.equal(body.error, 'invalid_token')
  assert.equal(body.reason, 'rejected_by_telegram')
  assert.equal(telegram.setWebhookCalls.length, 0)
  // Token NOT persisted
  assert.equal(await db.getDecryptedBotToken('cust-1'), null)
})

test('getMe network error: 500 internal', async () => {
  const { db, telegram } = setupReady()
  telegram.getMeImpl = async () => {
    throw new Error('Telegram getMe -> 503: Service Unavailable')
  }
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 500)
})

test('setWebhook fails: 500 webhook_setup_failed, token not persisted', async () => {
  const { db, telegram } = setupReady()
  telegram.failNextSetWebhook = true
  const res = await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  assert.equal(res.status, 500)
  const body = (await res.json()) as { error: string }
  assert.equal(body.error, 'webhook_setup_failed')
  // Token NOT persisted (we set webhook BEFORE persisting; if setWebhook
  // fails we don't have stored token + missing webhook drift.)
  assert.equal(await db.getDecryptedBotToken('cust-1'), null)
})

test('edge fn base url with trailing slash: handler trims it', async () => {
  const { db, telegram } = setupReady()
  await handleValidateBotToken(
    buildReq({ customer_id: 'cust-1', bot_token: VALID_TOKEN }),
    {
      db,
      telegram,
      edgeFnBaseUrl: `${EDGE}///`,
      webhookSecret: SECRET,
    },
  )
  // Webhook URL has only single slash before /pair-customer-bot-webhook
  const call = telegram.setWebhookCalls[0]
  assert.equal(
    call.url,
    `${EDGE}/pair-customer-bot-webhook?cid=cust-1`,
  )
})

test('cid with special chars: URL-encoded in webhook URL', async () => {
  const db = new FakeOnboardingStore()
  const telegram = new FakeTelegram()
  db.seedCustomer({
    id: 'a&b cust',
    email: 'a@example.com',
  })
  db.seedSubscription({
    id: 'sub-2',
    customer_id: 'a&b cust',
    tier: 'pro',
    status: 'pending_provision',
  })
  await handleValidateBotToken(
    buildReq({ customer_id: 'a&b cust', bot_token: VALID_TOKEN }),
    { db, telegram, edgeFnBaseUrl: EDGE, webhookSecret: SECRET },
  )
  const call = telegram.setWebhookCalls[0]
  // Encoded: a%26b%20cust
  assert.match(call.url, /\?cid=a%26b%20cust$/)
})
