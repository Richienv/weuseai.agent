// Deno Edge Function entry — pair-customer-bot-webhook.
//
// Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (Option A,
// Step 3 of onboarding — customer sends /pair <code> to their own bot).
// Pure handler: ../_shared/pair-customer-bot-webhook-handler.ts
//
// What this does:
//   - Receives Telegram webhook POSTs forwarded from a customer's own
//     bot (the webhook URL was registered in validate-bot-token-handler).
//   - URL carries ?cid=<customer_id>; secret_token header is verified
//     against PAIR_WEBHOOK_SECRET.
//   - On /pair <code> match: writes telegram_chat_id, clears
//     pairing_code, replies success via the customer's own bot.
//
// Deploy:
//   supabase functions deploy pair-customer-bot-webhook \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// `--no-verify-jwt` because Telegram doesn't send a JWT — auth is
// via the `X-Telegram-Bot-Api-Secret-Token` header set during
// validate-bot-token-handler's setWebhook call.
//
// Env (Supabase secrets):
//   SUPABASE_URL                       — auto-set by Supabase
//   SUPABASE_SERVICE_ROLE_KEY          — auto-set by Supabase
//   PAIR_WEBHOOK_SECRET                — same value as in
//                                        validate-bot-token function
//   BOT_TOKEN_ENC_KEY                  — base64 32+ char key, passed as
//                                        enc_key param to decrypt_bot_token
//                                        when fetching the customer's bot
//                                        token to send the pairing-success
//                                        reply. Founder-applied Option A
//                                        signature (2026-05-09 post-deploy).
//   TELEGRAM_BOT_TOKEN                 — legacy @weuseaibot token
//                                        (constructor argument; this
//                                        handler only uses per-token
//                                        sendMessageAs)

import { handlePairCustomerBotWebhook } from '../_shared/pair-customer-bot-webhook-handler.ts'
import { handleCors, withCors, webhookCorsHeaders } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'
import { TelegramBotClient } from '../_shared/telegram-client.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAIR_WEBHOOK_SECRET = Deno.env.get('PAIR_WEBHOOK_SECRET')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY')!
const PLATFORM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

const telegram = new TelegramBotClient({ token: PLATFORM_BOT_TOKEN })

Deno.serve(async (req) => {
  // Telegram doesn't preflight; tolerate Supabase status pings via
  // the wildcard webhookCorsHeaders.
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight

  const res = await handlePairCustomerBotWebhook(req, {
    db,
    telegram,
    webhookSecret: PAIR_WEBHOOK_SECRET,
  })
  return withCors(res, webhookCorsHeaders)
})
