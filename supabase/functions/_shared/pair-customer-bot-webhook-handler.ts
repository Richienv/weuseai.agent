// Pure handler for pair-customer-bot-webhook. Web Platform APIs only.
//
// Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (Option A
// architecture diagram, Step 3: customer sends /pair <code> to their
// own bot; webhook fires here).
//
// What this handler does:
//   1. Validate X-Telegram-Bot-Api-Secret-Token header (set during
//      validate-bot-token-handler's setWebhook call).
//   2. Read ?cid=<customer_id> query param. The cid lives in the URL
//      so we don't have to look up the customer by their bot's chat
//      id — much simpler than the legacy @weuseaibot pairing handler
//      which had to scan customers by pairing_code.
//   3. Verify the message text matches /pair <pairing_code> regex AND
//      the code matches customers.pairing_code AND the code is not
//      expired.
//   4. UPDATE customers SET telegram_chat_id = message.chat.id,
//      pairing_code = NULL, pairing_code_expires_at = NULL.
//   5. Reply via the customer's own bot with a Bahasa-Indonesia success
//      message.
//
// Note: webhook stays registered until complete-onboarding-handler
// runs deleteWebhook in Step 4. Until then, additional /pair messages
// to a paired customer's bot get a "kamu sudah pair" no-op reply.

import { constantTimeEqual } from './constant-time-equal.ts'
import { isPairingCodeExpired } from './pairing-code.ts'
import type { IOnboardingStore, ITelegramClient } from './types.ts'

export type PairCustomerBotWebhookDeps = {
  db: IOnboardingStore
  telegram: ITelegramClient
  /** Same secret used in validate-bot-token-handler.setWebhook. */
  webhookSecret: string
  now?: () => number
}

// Subset of Telegram's Update — we only consume `message`.
export type PairCustomerBotUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat: { id: number | string; type?: string }
    from?: { id: number; username?: string; is_bot?: boolean }
  }
}

// Track 3 of post-pair UX polish (2026-05-10): no longer sent. Pair
// success is silent now — the proactive greeting (Track 2) carries the
// "agent ready" signal in-character. Kept exported for tests that
// assert REPLIES.success exists; if you remove the export, update
// tests/pair-customer-bot-webhook-handler.spec.ts too.
const REPLY_SUCCESS =
  'Pairing berhasil. Agent kamu sedang dibangun — tunggu pesan halo dalam 5–7 menit.'

const REPLY_INVALID =
  'Kode tidak valid atau kadaluarsa. Cek halaman onboarding kamu untuk kode terbaru.'

const REPLY_USAGE =
  'Kirim "/pair 123456" dengan 6 digit kode pasangan dari halaman onboarding kamu.'

const REPLY_ALREADY_PAIRED =
  'Bot kamu sudah dipasangkan. Tutup tab onboarding dan tunggu pesan halo dari agent.'

export async function handlePairCustomerBotWebhook(
  req: Request,
  deps: PairCustomerBotWebhookDeps,
): Promise<Response> {
  // ─── 1. Method gate ───────────────────────────────────────────────
  if (req.method !== 'POST') {
    return ok({ method_not_allowed: true }, 405)
  }

  // ─── 2. Secret-token check ────────────────────────────────────────
  // Sesi D P1-1: constant-time comparison to defeat timing side-channels.
  const sentToken = req.headers.get('x-telegram-bot-api-secret-token')
  if (!sentToken || !constantTimeEqual(sentToken, deps.webhookSecret)) {
    // 401 with empty body — Telegram doesn't read the body.
    return new Response(null, { status: 401 })
  }

  // ─── 3. Read cid from query string ────────────────────────────────
  const url = new URL(req.url)
  const cid = url.searchParams.get('cid')
  if (!cid) {
    // The webhook URL is constructed by us (validate-bot-token-handler)
    // with cid in the query string. If it's missing, something is very
    // wrong — return 200 (don't make Telegram retry-storm us) but log.
    return ok({ ignored: 'missing_cid' })
  }

  // ─── 4. Parse Update ──────────────────────────────────────────────
  let update: PairCustomerBotUpdate
  try {
    update = (await req.json()) as PairCustomerBotUpdate
  } catch {
    return ok({ ignored: 'invalid_json' })
  }
  const message = update.message
  if (!message || typeof message.text !== 'string') {
    return ok({ ignored: 'no_text_message' })
  }

  // ─── 5. Look up customer ──────────────────────────────────────────
  const customer = await deps.db.findCustomerById(cid)
  if (!customer) {
    // cid in URL doesn't match any customer — possible spoof or stale
    // webhook. Don't reply.
    return ok({ ignored: 'unknown_customer' })
  }

  // We need the bot token to send replies as the customer's bot.
  let botToken: string | null = null
  try {
    botToken = await deps.db.getDecryptedBotToken(cid)
  } catch {
    // Decrypt failed (key misconfigured). Still 200 to Telegram so it
    // doesn't retry; surface in logs.
    return ok({ ignored: 'token_decrypt_failed' })
  }
  if (!botToken) {
    // Webhook fired but customer has no token? Either pre-Step-2 race
    // (impossible — webhook only set after validate succeeds) or a
    // database fault. Silent.
    return ok({ ignored: 'no_bot_token' })
  }

  // ─── 6. Check if already paired ───────────────────────────────────
  if (customer.telegram_chat_id) {
    // Customer's bot already paired with a chat. Send a polite reply
    // so they know nothing is broken.
    await safeReply(deps.telegram, botToken, message.chat.id, REPLY_ALREADY_PAIRED)
    return ok({ replied: 'already_paired' })
  }

  // ─── 7. Parse /pair <code> ────────────────────────────────────────
  const text = message.text.trim()
  if (!text.startsWith('/pair')) {
    // Other messages during the pairing window — silent no-op. Customer
    // hasn't sent /pair yet; they're probably exploring the bot.
    return ok({ ignored: 'not_pair_command' })
  }

  const m = text.match(/^\/pair(?:@\w+)?\s+(\d{6})\b/)
  if (!m) {
    await safeReply(deps.telegram, botToken, message.chat.id, REPLY_USAGE)
    return ok({ replied: 'usage_hint' })
  }
  const submittedCode = m[1]

  // ─── 8. Validate code matches + not expired ───────────────────────
  if (!customer.pairing_code || customer.pairing_code !== submittedCode) {
    await safeReply(deps.telegram, botToken, message.chat.id, REPLY_INVALID)
    return ok({ replied: 'invalid_code' })
  }
  const now = deps.now ?? (() => Date.now())
  if (isPairingCodeExpired(customer.pairing_code_expires_at, now)) {
    await safeReply(deps.telegram, botToken, message.chat.id, REPLY_INVALID)
    return ok({ replied: 'expired_code' })
  }

  // ─── 9. Update DB: link chat_id, clear pairing fields ─────────────
  await deps.db.updateCustomer(cid, {
    telegram_chat_id: String(message.chat.id),
    pairing_code: null,
    pairing_code_expires_at: null,
  })

  // ─── 10. Silent success ───────────────────────────────────────────
  // Track 3 of post-pair UX polish (2026-05-10): no canned reply on
  // pair success. Pre-fix: bot replied "Pairing berhasil. Agent kamu
  // sedang dibangun..." which is now redundant noise — welcome.html
  // tells the customer the agent is being built (state B), and the
  // proactive greeting (Track 2) sends an in-character first message
  // once Hermes is actually ready. The canned line in between added
  // a confusing third voice from a "wrong" persona (the placeholder bot
  // before the real agent boots).
  //
  // Telegram still gets 200 — webhook is acked, no retry — we just don't
  // sendMessage. The webhook is then deleted by complete-onboarding step
  // 8b so Hermes can long-poll cleanly.
  return ok({ replied: 'paired_silent' })
}

async function safeReply(
  telegram: ITelegramClient,
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<void> {
  try {
    await telegram.sendMessageAs(botToken, chatId, text)
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
export const PAIR_CUSTOMER_BOT_REPLIES = {
  success: REPLY_SUCCESS,
  invalid: REPLY_INVALID,
  usage: REPLY_USAGE,
  alreadyPaired: REPLY_ALREADY_PAIRED,
} as const
