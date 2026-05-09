// Deno Edge Function entry — validate-bot-token.
//
// Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (Option A,
// Step 2 of onboarding).
// Pure handler: ../_shared/validate-bot-token-handler.ts
//
// What this does:
//   - Customer pastes a bot token from @BotFather.
//   - We POST getMe to validate, persist (encrypted) + capture username,
//     setWebhook on the customer's bot pointing back at the
//     pair-customer-bot-webhook function.
//
// Deploy:
//   supabase functions deploy validate-bot-token --project-ref gtjgsligllbjcisiyrah
//
// Env (Supabase secrets):
//   SUPABASE_URL                       — auto-set by Supabase
//   SUPABASE_SERVICE_ROLE_KEY          — auto-set by Supabase
//   PAIR_WEBHOOK_SECRET                — random string (≥32 chars)
//                                        shared with pair-customer-bot-webhook
//   EDGE_FN_BASE_URL                   — e.g.
//     https://gtjgsligllbjcisiyrah.supabase.co/functions/v1
//   BOT_TOKEN_ENC_KEY                  — base64 32+ char key, passed as
//                                        enc_key param to encrypt_bot_token
//                                        / decrypt_bot_token RPC helpers
//                                        (founder-applied Option A
//                                        signature, 2026-05-09 post-deploy)
//   TELEGRAM_BOT_TOKEN                 — legacy @weuseaibot token (still
//                                        loaded so TelegramBotClient
//                                        constructor doesn't throw, even
//                                        though this function only uses
//                                        the per-token methods)

import { handleValidateBotToken } from '../_shared/validate-bot-token-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
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
const EDGE_FN_BASE_URL = Deno.env.get('EDGE_FN_BASE_URL')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY')!
const PLATFORM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

const telegram = new TelegramBotClient({ token: PLATFORM_BOT_TOKEN })

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleValidateBotToken(req, {
    db,
    telegram,
    edgeFnBaseUrl: EDGE_FN_BASE_URL,
    webhookSecret: PAIR_WEBHOOK_SECRET,
  })
  return withCors(res, req)
})
