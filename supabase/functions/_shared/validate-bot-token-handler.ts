// Pure handler for validate-bot-token. Web Platform APIs only.
//
// Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (Option A
// architecture diagram, Step 2: "Buat bot Telegram kamu").
//
// Contract:
//   POST /functions/v1/validate-bot-token
//   Body: { customer_id: string, bot_token: string }
//   200:  { bot_username: string }
//          — token validated via Telegram getMe
//          — encrypted token + plaintext username persisted on customers row
//          — webhook set on customer's bot pointing to
//            /functions/v1/pair-customer-bot-webhook?cid=<customer_id>
//   400:  { error: 'invalid_json' | 'missing_field' | 'invalid_token' }
//   404:  { error: 'no_paid_subscription' }
//   405:  { error: 'method_not_allowed' }
//   500:  { error: 'internal' | 'webhook_setup_failed' }
//
// Auth model: anon-with-cid for Phase 1 (matches rotate-pairing-code).
// Phase 2B JWT swap will scope by bearer.

import type { IOnboardingStore, ITelegramClient } from './types.ts'

export type ValidateBotTokenDeps = {
  db: IOnboardingStore
  telegram: ITelegramClient
  /** Base URL for Edge Functions, e.g.
   *  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1'.
   *  Used to construct the webhook URL we register on the customer's bot. */
  edgeFnBaseUrl: string
  /** Random secret matched in pair-customer-bot-webhook's
   *  X-Telegram-Bot-Api-Secret-Token header check. Same value across
   *  all customers — they don't see this; Telegram does. */
  webhookSecret: string
}

export type ValidateBotTokenBody = {
  customer_id: string
  bot_token: string
}

const BOT_TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]{20,}$/

export async function handleValidateBotToken(
  req: Request,
  deps: ValidateBotTokenDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: ValidateBotTokenBody
  try {
    body = (await req.json()) as ValidateBotTokenBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!body || typeof body.customer_id !== 'string' || !body.customer_id) {
    return json({ error: 'missing_field', field: 'customer_id' }, 400)
  }
  if (typeof body.bot_token !== 'string' || !body.bot_token) {
    return json({ error: 'missing_field', field: 'bot_token' }, 400)
  }

  const botToken = body.bot_token.trim()
  if (!BOT_TOKEN_FORMAT.test(botToken)) {
    // Format check is cheap; saves a Telegram round-trip on obvious
    // typos like missing the ':' separator.
    return json({ error: 'invalid_token', reason: 'format' }, 400)
  }

  // Verify the customer exists + has a paid subscription before doing
  // any work. Mirrors rotate-pairing-code's auth posture.
  const subscription = await deps.db
    .findActiveOrPendingSubscriptionByCustomer(body.customer_id)
  if (!subscription) {
    return json({ error: 'no_paid_subscription' }, 404)
  }
  const customer = await deps.db.findCustomerById(body.customer_id)
  if (!customer) {
    return json({ error: 'no_paid_subscription' }, 404)
  }

  // Validate via Telegram. Returns null on 401 / 404 / malformed payload.
  let botInfo: { id: number; username: string } | null
  try {
    botInfo = await deps.telegram.getMe(botToken)
  } catch (err) {
    // Network / 5xx — surface so customer can retry.
    return json(
      { error: 'internal', detail: errMsg(err) },
      500,
    )
  }
  if (!botInfo) {
    return json({ error: 'invalid_token', reason: 'rejected_by_telegram' }, 400)
  }

  // Set the webhook BEFORE persisting the token, so we don't end up with
  // a stored token that has no webhook attached (which would silently
  // strand pairing). If setWebhook fails, the customer can retry Step 2
  // and we don't leave junk state.
  const webhookUrl =
    `${deps.edgeFnBaseUrl.replace(/\/+$/, '')}/pair-customer-bot-webhook` +
    `?cid=${encodeURIComponent(body.customer_id)}`
  try {
    await deps.telegram.setWebhook({
      botToken,
      url: webhookUrl,
      secretToken: deps.webhookSecret,
      // Only message updates are needed; ignore other types (callbacks,
      // inline queries, etc.) so we don't get extra POSTs to handle.
      allowedUpdates: ['message'],
    })
  } catch (err) {
    return json(
      { error: 'webhook_setup_failed', detail: errMsg(err) },
      500,
    )
  }

  // Persist encrypted token + plaintext username. The store's
  // setBotTokenAndUsername implementation calls SQL encrypt_bot_token()
  // server-side so the plaintext never lands in the customers table.
  try {
    await deps.db.setBotTokenAndUsername(
      body.customer_id,
      botToken,
      botInfo.username,
    )
  } catch (err) {
    // Token is valid + webhook is set, but we couldn't persist. Best
    // effort: tear down the webhook so we don't leave the customer's
    // bot pointing at a row that doesn't have the matching state.
    try {
      await deps.telegram.deleteWebhook(botToken)
    } catch {
      /* best effort */
    }
    return json(
      { error: 'internal', detail: errMsg(err) },
      500,
    )
  }

  return json({ bot_username: botInfo.username })
}

function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}
