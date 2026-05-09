// Phase 5-5b: telegram-bot-webhook callback_query branch tests.
//
// Covers the new approval-button dispatch: customer presses Approve/Reject
// in their per-customer Telegram bot, webhook routes to the
// onApprovalCallback dep, ack is rendered back via answerCallbackQuery +
// sendMessageAs.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleTelegramBotWebhook,
  type ApprovalCallbackHandler,
  type TelegramBotWebhookDeps,
  type TelegramUpdate,
} from '../supabase/functions/_shared/telegram-bot-webhook-handler.ts'
import { buildCallbackData } from '../supabase/functions/_shared/approval-telegram-formatter.ts'
import type { IOnboardingStore, ITelegramClient } from '../supabase/functions/_shared/types.ts'

const SECRET = 'test-secret'
const APPR_ID = '11111111-1111-1111-1111-111111111111'
const CHAT_ID = 555_111_222
const BOT_TOKEN = '12345:fake'
const CALLER_TG_USER = 999_888_777

// ─── Test helpers ─────────────────────────────────────────────────

type AnswerCallbackCall = {
  botToken: string
  callbackQueryId: string
  text?: string
}

type SendMessageAsCall = {
  botToken: string
  chatId: number | string
  text: string
}

function makeStubTelegram(): {
  telegram: ITelegramClient
  answers: AnswerCallbackCall[]
  sends: SendMessageAsCall[]
} {
  const answers: AnswerCallbackCall[] = []
  const sends: SendMessageAsCall[] = []
  const telegram: ITelegramClient = {
    async replyText() {
      /* unused */
    },
    async getMe() {
      return null
    },
    async setWebhook() {
      /* unused */
    },
    async deleteWebhook() {
      /* unused */
    },
    async sendMessageAs(botToken, chatId, text) {
      sends.push({ botToken, chatId, text })
    },
    async sendMessageWithButtonsAs() {
      /* unused — outbound only */
    },
    async answerCallbackQuery(input) {
      answers.push(input)
    },
  }
  return { telegram, answers, sends }
}

const stubDb: IOnboardingStore = {
  // None of the callback_query branch should hit DB methods directly;
  // db lookup is delegated to resolveCustomerBotTokenByChat.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as unknown as IOnboardingStore

function makeRequest(
  update: TelegramUpdate,
  secret = SECRET,
): Request {
  return new Request('https://example.com/webhook', {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': secret,
      'content-type': 'application/json',
    },
    body: JSON.stringify(update),
  })
}

function makeCallbackUpdate(
  data: string,
  chatId: number | string = CHAT_ID,
): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: 'cbq-1',
      data,
      from: { id: CALLER_TG_USER, username: 'cust' },
      message: { chat: { id: chatId } },
    },
  }
}

// ─── No-config bail-out ──────────────────────────────────────────

test('callback_query without onApprovalCallback dep → 200 ignored (no retry)', async () => {
  const { telegram, answers, sends } = makeStubTelegram()
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    // intentionally omit onApprovalCallback + resolveCustomerBotTokenByChat
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('approve', APPR_ID))),
    deps,
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ignored?: string }
  assert.equal(body.ignored, 'callback_handler_not_configured')
  assert.equal(answers.length, 0)
  assert.equal(sends.length, 0)
})

// ─── Bad payload bail-outs ───────────────────────────────────────

test('callback_query missing data → 200 ignored', async () => {
  const { telegram, answers } = makeStubTelegram()
  const onApprovalCallback: ApprovalCallbackHandler = async () => ({
    ok: true,
    ackText: 'should not be called',
  })
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback,
    resolveCustomerBotTokenByChat: async () => BOT_TOKEN,
  }
  const update: TelegramUpdate = {
    update_id: 1,
    callback_query: {
      id: 'cbq-1',
      from: { id: CALLER_TG_USER },
      message: { chat: { id: CHAT_ID } },
      // no `data` field
    },
  }
  const res = await handleTelegramBotWebhook(makeRequest(update), deps)
  assert.equal(res.status, 200)
  assert.equal((await res.json() as { ignored?: string }).ignored, 'callback_no_data')
  assert.equal(answers.length, 0)
})

test('callback_query unrecognized payload → 200 ignored', async () => {
  const { telegram } = makeStubTelegram()
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback: async () => ({ ok: true, ackText: 'x' }),
    resolveCustomerBotTokenByChat: async () => BOT_TOKEN,
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate('not-our-prefix:foo:bar')),
    deps,
  )
  assert.equal(res.status, 200)
  assert.equal(
    (await res.json() as { ignored?: string }).ignored,
    'callback_unrecognized_payload',
  )
})

test('callback_query with unknown customer chat → 200 ignored', async () => {
  const { telegram, answers } = makeStubTelegram()
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback: async () => ({ ok: true, ackText: 'x' }),
    resolveCustomerBotTokenByChat: async () => null, // unrecognized chat
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('approve', APPR_ID))),
    deps,
  )
  assert.equal(res.status, 200)
  assert.equal(
    (await res.json() as { ignored?: string }).ignored,
    'callback_unknown_customer',
  )
  assert.equal(answers.length, 0)
})

// ─── Happy-path approval ─────────────────────────────────────────

test('callback_query approve → invokes onApprovalCallback + answers + sends ack', async () => {
  const { telegram, answers, sends } = makeStubTelegram()
  const calls: Parameters<ApprovalCallbackHandler>[0][] = []
  const onApprovalCallback: ApprovalCallbackHandler = async (input) => {
    calls.push(input)
    return { ok: true, ackText: 'Approved. BD v3 lanjut execute action ini.' }
  }
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback,
    resolveCustomerBotTokenByChat: async (chat) => {
      assert.equal(chat, CHAT_ID)
      return BOT_TOKEN
    },
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('approve', APPR_ID))),
    deps,
  )
  assert.equal(res.status, 200)
  assert.equal(
    (await res.json() as { replied?: string }).replied,
    'approval_handled',
  )

  // Dep was called with the correct parsed payload
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    decision: 'approve',
    approvalId: APPR_ID,
    callerTelegramUserId: CALLER_TG_USER,
  })

  // answerCallbackQuery was called once with the right token + id
  assert.equal(answers.length, 1)
  assert.equal(answers[0].botToken, BOT_TOKEN)
  assert.equal(answers[0].callbackQueryId, 'cbq-1')
  assert.match(answers[0].text!, /Approved/)

  // sendMessageAs follow-up with the full ack text
  assert.equal(sends.length, 1)
  assert.equal(sends[0].botToken, BOT_TOKEN)
  assert.equal(sends[0].chatId, CHAT_ID)
  assert.match(sends[0].text, /Approved/)
})

test('callback_query reject → invokes onApprovalCallback with reject decision', async () => {
  const { telegram, answers } = makeStubTelegram()
  const calls: Parameters<ApprovalCallbackHandler>[0][] = []
  const onApprovalCallback: ApprovalCallbackHandler = async (input) => {
    calls.push(input)
    return { ok: true, ackText: 'Rejected. Action ngga diexecute. Kasih tahu kalau mau revisi.' }
  }
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback,
    resolveCustomerBotTokenByChat: async () => BOT_TOKEN,
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('reject', APPR_ID))),
    deps,
  )
  assert.equal(res.status, 200)
  assert.equal(calls[0].decision, 'reject')
  assert.match(answers[0].text!, /Rejected/)
})

test('callback_query: answerCallbackQuery toast text capped at 200 chars', async () => {
  const { telegram, answers } = makeStubTelegram()
  const longAck = 'x'.repeat(500)
  const onApprovalCallback: ApprovalCallbackHandler = async () => ({
    ok: true,
    ackText: longAck,
  })
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback,
    resolveCustomerBotTokenByChat: async () => BOT_TOKEN,
  }
  await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('approve', APPR_ID))),
    deps,
  )
  assert.equal(answers[0].text!.length, 200, 'toast text should be capped at 200 chars')
})

// ─── Failure of dep → still 200, ackText surfaces error ──────────

test('callback_query when onApprovalCallback throws → still 200, error ack rendered', async () => {
  const { telegram, answers } = makeStubTelegram()
  const onApprovalCallback: ApprovalCallbackHandler = async () => {
    throw new Error('db unreachable')
  }
  const deps: TelegramBotWebhookDeps = {
    db: stubDb,
    telegram,
    webhookSecret: SECRET,
    onApprovalCallback,
    resolveCustomerBotTokenByChat: async () => BOT_TOKEN,
  }
  const res = await handleTelegramBotWebhook(
    makeRequest(makeCallbackUpdate(buildCallbackData('approve', APPR_ID))),
    deps,
  )
  assert.equal(res.status, 200)
  assert.equal(
    (await res.json() as { replied?: string }).replied,
    'approval_failed',
  )
  // Ack toast still attempted with the locked error string
  assert.match(answers[0].text!, /error/)
})

// ─── Existing /pair flow still works (no regression) ─────────────

test('text message /pair still works after callback_query branch added', async () => {
  // Sanity check that the callback_query addition didn't break the
  // existing /pair handling.
  const { telegram } = makeStubTelegram()
  let pairLookups = 0
  const db: IOnboardingStore = {
    async findCustomerByPairingCode() {
      pairLookups++
      return null // expired/missing → invalid reply path
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as IOnboardingStore
  const deps: TelegramBotWebhookDeps = {
    db,
    telegram,
    webhookSecret: SECRET,
    // No callback dep — but the message branch should still fire
  }
  const update: TelegramUpdate = {
    update_id: 1,
    message: {
      message_id: 1,
      text: '/pair 123456',
      chat: { id: CHAT_ID },
      from: { id: CALLER_TG_USER },
    },
  }
  const res = await handleTelegramBotWebhook(makeRequest(update), deps)
  assert.equal(res.status, 200)
  assert.equal(pairLookups, 1, 'existing /pair lookup still fires')
})
