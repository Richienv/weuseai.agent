// Pure handler for telegram-bot-webhook. Web Platform APIs only.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "Edge Function: telegram-bot-webhook"
//
// Validates Telegram's secret-token header, parses the Update payload,
// and handles the /pair <6-digit-code> command. All other messages are
// silently acknowledged with 200 OK so Telegram doesn't retry.

import { isPairingCodeExpired } from './pairing-code.ts'
import type {
  IOnboardingStore,
  ITelegramClient,
} from './types.ts'

export type TelegramBotWebhookDeps = {
  db: IOnboardingStore
  telegram: ITelegramClient
  /** Must match the value passed to setWebhook(secret_token=...). */
  webhookSecret: string
  now?: () => number
}

// Subset of Telegram's Update type — we only consume `message`.
export type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat: { id: number | string; type?: string }
    from?: { id: number; username?: string; is_bot?: boolean }
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
