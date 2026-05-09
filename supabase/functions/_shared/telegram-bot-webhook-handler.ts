// Pure handler for telegram-bot-webhook. Web Platform APIs only.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "Edge Function: telegram-bot-webhook"
//
// Validates Telegram's secret-token header, parses the Update payload,
// and handles:
//   - the `/pair <6-digit-code>` command (Phase 1 pairing flow)
//   - `callback_query` updates from Phase 5-5 approval inline buttons
//     (Phase 5-5b — formatter shipped in #29; wiring lands here).
// All other messages are silently acknowledged with 200 OK so Telegram
// doesn't retry.

import { parseCallbackData, APPROVAL_ACK } from './approval-telegram-formatter.ts'
import { isPairingCodeExpired } from './pairing-code.ts'
import type {
  IOnboardingStore,
  ITelegramClient,
} from './types.ts'

/** Phase 5-5b: outcome the webhook hands off to when a customer presses
 *  Approve/Reject. Returns the ack text to render back in Telegram. */
export type ApprovalCallbackHandler = (input: {
  decision: 'approve' | 'reject'
  approvalId: string
  /** Telegram user id of the presser — useful for audit / approved_by. */
  callerTelegramUserId: number
}) => Promise<{ ok: boolean; ackText: string }>

export type TelegramBotWebhookDeps = {
  db: IOnboardingStore
  telegram: ITelegramClient
  /** Must match the value passed to setWebhook(secret_token=...). */
  webhookSecret: string
  now?: () => number
  /** Phase 5-5b: optional. When present, callback_query updates from
   *  approval buttons get routed here. Omit to disable approval handling
   *  (e.g. for the platform @weuseaibot which only handles /pair). */
  onApprovalCallback?: ApprovalCallbackHandler
  /** Phase 5-5b: when handling callback_query, we need the customer's bot
   *  token (to call answerCallbackQuery on their bot). The webhook entry
   *  can derive it from the customer row using the chat_id; this is the
   *  lookup hook. Returns null if the chat is unrecognized. */
  resolveCustomerBotTokenByChat?: (chatId: number | string) => Promise<string | null>
}

// Subset of Telegram's Update type — we consume `message` and `callback_query`.
export type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat: { id: number | string; type?: string }
    from?: { id: number; username?: string; is_bot?: boolean }
  }
  callback_query?: {
    id: string
    data?: string
    from: { id: number; username?: string; is_bot?: boolean }
    message?: { chat: { id: number | string } }
  }
}

const PAIR_BOT_REPLY_SUCCESS =
  'Pairing berhasil. Agent kamu sedang dibangun — pesan halo akan masuk dalam 5-7 menit.'

const PAIR_BOT_REPLY_INVALID =
  'Kode tidak valid atau kadaluarsa. Cek halaman onboarding kamu.'

const PAIR_BOT_REPLY_USAGE =
  'Kirim "/pair 123456" dengan 6 digit kode pasangan dari halaman onboarding.'

export async function handleTelegramBotWebhook(
  req: Request,
  deps: TelegramBotWebhookDeps,
): Promise<Response> {
  // ─── 1. Method gate ───────────────────────────────────────────────
  if (req.method !== 'POST') {
    return ok({ method_not_allowed: true }, 405)
  }

  // ─── 2. Secret-token check (Telegram setWebhook config) ───────────
  const sentToken = req.headers.get('x-telegram-bot-api-secret-token')
  if (!sentToken || sentToken !== deps.webhookSecret) {
    // 401 with empty body — Telegram doesn't read the body.
    return new Response(null, { status: 401 })
  }

  // ─── 3. Parse Update ──────────────────────────────────────────────
  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    // Malformed JSON — return 200 so Telegram won't retry-storm us;
    // logging happens via Edge Function logs.
    return ok({ ignored: 'invalid_json' })
  }

  // ─── 4a. Phase 5-5b: callback_query (Approve/Reject button press) ─
  if (update.callback_query) {
    return await handleCallbackQuery(update.callback_query, deps)
  }

  const message = update.message
  if (!message || typeof message.text !== 'string') {
    return ok({ ignored: 'no_text_message' })
  }

  // ─── 4. Command parsing — only /pair <code> matters in Phase 1 ───
  const text = message.text.trim()
  if (!text.startsWith('/pair')) {
    // Polite no-op for any other input.
    return ok({ ignored: 'not_pair_command' })
  }

  const m = text.match(/^\/pair(?:@\w+)?\s+(\d{6})\b/)
  if (!m) {
    await safeReply(deps.telegram, message.chat.id, PAIR_BOT_REPLY_USAGE)
    return ok({ replied: 'usage_hint' })
  }
  const code = m[1]

  // ─── 5. Look up + validate ────────────────────────────────────────
  const customer = await deps.db.findCustomerByPairingCode(code)
  if (!customer) {
    await safeReply(deps.telegram, message.chat.id, PAIR_BOT_REPLY_INVALID)
    return ok({ replied: 'invalid_code' })
  }
  const now = deps.now ?? (() => Date.now())
  if (isPairingCodeExpired(customer.pairing_code_expires_at, now)) {
    await safeReply(deps.telegram, message.chat.id, PAIR_BOT_REPLY_INVALID)
    return ok({ replied: 'expired_code' })
  }

  // ─── 6. Update DB: link chat_id, clear pairing fields ─────────────
  await deps.db.updateCustomer(customer.id, {
    telegram_chat_id: String(message.chat.id),
    pairing_code: null,
    pairing_code_expires_at: null,
  })

  // ─── 7. Reply success ─────────────────────────────────────────────
  await safeReply(deps.telegram, message.chat.id, PAIR_BOT_REPLY_SUCCESS)
  return ok({ replied: 'paired' })
}

async function handleCallbackQuery(
  cb: NonNullable<TelegramUpdate['callback_query']>,
  deps: TelegramBotWebhookDeps,
): Promise<Response> {
  // Bail-outs return 200 so Telegram doesn't retry-storm; details in body.
  if (!deps.onApprovalCallback || !deps.resolveCustomerBotTokenByChat) {
    return ok({ ignored: 'callback_handler_not_configured' })
  }
  const data = cb.data
  if (!data) {
    return ok({ ignored: 'callback_no_data' })
  }
  const parsed = parseCallbackData(data)
  if (!parsed) {
    return ok({ ignored: 'callback_unrecognized_payload' })
  }
  const chatId = cb.message?.chat.id
  if (!chatId) {
    return ok({ ignored: 'callback_no_chat' })
  }

  // Resolve the customer's bot token from chat (we need it for both
  // answerCallbackQuery + sendMessageAs ack).
  const botToken = await deps.resolveCustomerBotTokenByChat(chatId)
  if (!botToken) {
    // Customer chat unrecognized — best-effort no-op + 200 to Telegram.
    return ok({ ignored: 'callback_unknown_customer' })
  }

  // Hand off to the approval-decision dep.
  let outcome: { ok: boolean; ackText: string }
  try {
    outcome = await deps.onApprovalCallback({
      decision: parsed.decision,
      approvalId: parsed.approval_id,
      callerTelegramUserId: cb.from.id,
    })
  } catch {
    outcome = { ok: false, ackText: APPROVAL_ACK.error }
  }

  // Always answer the callback so the customer's UI dismisses the spinner.
  try {
    await deps.telegram.answerCallbackQuery({
      botToken,
      callbackQueryId: cb.id,
      text: outcome.ackText.slice(0, 200), // Telegram caps callback toast at 200 chars
    })
  } catch {
    /* swallow — the chat ack below is the real signal */
  }

  // Best-effort follow-up message in the chat with the full ack text.
  try {
    await deps.telegram.sendMessageAs(botToken, chatId, outcome.ackText)
  } catch {
    /* swallow */
  }

  return ok({ replied: outcome.ok ? 'approval_handled' : 'approval_failed' })
}

async function safeReply(
  telegram: ITelegramClient,
  chatId: number | string,
  text: string,
): Promise<void> {
  try {
    await telegram.replyText(chatId, text)
  } catch {
    /* swallow — replies are best-effort; the DB update is the real outcome */
  }
}

function ok(body: unknown = { ok: true }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Exposed for tests so they can assert exact bot replies match.
export const TELEGRAM_REPLIES = {
  success: PAIR_BOT_REPLY_SUCCESS,
  invalid: PAIR_BOT_REPLY_INVALID,
  usage: PAIR_BOT_REPLY_USAGE,
} as const
