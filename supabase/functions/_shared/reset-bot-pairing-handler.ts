// Pure handler for reset-bot-pairing. Web Platform APIs only — runs in
// Deno (Edge Function) and Node ≥18 (test runner via tsx).
//
// Wired by onboarding.html step 3 "Bukan bot kamu — Ganti bot" recovery
// link (2026-05-10 P0 fix). Clears the customer's bot fields so they
// can re-paste a different token via step 2 + validate-bot-token.
//
// Why this exists: validate-bot-token persists whatever username
// Telegram getMe() returns. If a customer pastes a wrong-bot token
// (typo, typosquat handle, leftover legacy bot they don't control),
// the wrong username gets stored and the step-3 "Buka Telegram" link
// opens the wrong bot. Without this reset, the customer is stuck
// because anon UPDATE on customers is locked down (Sesi D P0-2 + the
// 2026-05-06 pairing-anon-update lock).
//
// Contract:
//   POST /functions/v1/reset-bot-pairing
//   Body: { customer_id: string }
//   200:  { ok: true }
//          — telegram_bot_token, telegram_bot_username, telegram_chat_id
//            all set to null on the customers row
//   400:  { error: 'invalid_json' | 'missing_field' }
//   404:  { error: 'unknown_customer' }
//   405:  { error: 'method_not_allowed' }
//   500:  { error: 'internal' }
//
// Auth model: anyone with the cid UUID can reset their own bot
// pairing. Same risk profile as rotate-pairing-code. Phase 2B JWT
// swap will scope by bearer.

import type { IOnboardingStore } from './types.ts'

export type ResetBotPairingDeps = {
  db: IOnboardingStore
}

export type ResetBotPairingBody = {
  customer_id: string
}

export async function handleResetBotPairing(
  req: Request,
  deps: ResetBotPairingDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: ResetBotPairingBody
  try {
    body = (await req.json()) as ResetBotPairingBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body.customer_id !== 'string' || !body.customer_id) {
    return json({ error: 'missing_field', field: 'customer_id' }, 400)
  }

  const existing = await deps.db.findCustomerById(body.customer_id)
  if (!existing) {
    return json({ error: 'unknown_customer' }, 404)
  }

  try {
    await deps.db.clearBotPairing(body.customer_id)
  } catch (err) {
    return json({ error: 'internal', detail: errMsg(err) }, 500)
  }

  return json({ ok: true })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
