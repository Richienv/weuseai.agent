// Deno Edge Function entry — telegram-bot-webhook.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
// Pure handler: ../_shared/telegram-bot-webhook-handler.ts
//
// Deploy:
//   supabase functions deploy telegram-bot-webhook --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// `--no-verify-jwt` because Telegram doesn't carry a JWT — auth is via the
// `X-Telegram-Bot-Api-Secret-Token` header set during setWebhook.
//
// Required env (set via `supabase secrets set ...`):
//   SUPABASE_URL                       — set automatically
//   SUPABASE_SERVICE_ROLE_KEY          — set automatically
//   TELEGRAM_BOT_TOKEN                 — bot token for @weuseaibot
//   TELEGRAM_WEBHOOK_SECRET            — random secret matching setWebhook value
//
// Webhook config (one-time, founder runs):
//   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
//     -d "url=https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/telegram-bot-webhook" \
//     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
//     -d 'allowed_updates=["message"]'

import { handleTelegramBotWebhook } from '../_shared/telegram-bot-webhook-handler.ts'
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
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
})

const telegram = new TelegramBotClient({ token: TELEGRAM_BOT_TOKEN })

Deno.serve(async (req) => {
  // Telegram doesn't preflight, but a healthcheck OPTIONS request from
  // Supabase status pings might. Use the wildcard webhookCorsHeaders.
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight

  const res = await handleTelegramBotWebhook(req, {
    db,
    telegram,
    webhookSecret: TELEGRAM_WEBHOOK_SECRET,
  })
  return withCors(res, webhookCorsHeaders)
})
