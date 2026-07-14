// Deno Edge Function entry — admin-customer-vps-refresh.
//
// Track 3c (2026-05-10): manual VPS .env rescue path. Service-role
// bearer required (admin-only). Pure handler:
// ../_shared/admin-customer-vps-refresh-handler.ts
//
// Deploy:
//   supabase functions deploy admin-customer-vps-refresh \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto-provided + secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto
//   PROVISIONING_URL                         — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN                  — bearer for provisioning service
//   BOT_TOKEN_ENC_KEY                        — for decrypting bot tokens

import { handleAdminCustomerVpsRefresh } from '../_shared/admin-customer-vps-refresh-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'
import { OnboardingProvisioningClient } from '../_shared/onboarding-provisioning-client.ts'
import { TelegramBotClient } from '../_shared/telegram-client.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY')!

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

const provisioning = new OnboardingProvisioningClient({
  baseUrl: PROVISIONING_URL,
  authToken: PROVISIONING_AUTH_TOKEN,
})

// Bug-1 fix (2026-05-16): the second-finisher path now delivers the
// proactive greeting. sendProactiveGreeting only uses sendMessageAs with
// the customer's OWN bot token (per-call), so the platform token here is
// just a constructor placeholder — passed from the secret when present.
const telegram = new TelegramBotClient({
  token: Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '',
})

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  // Admin-only: service-role JWT required (per docs/security/jwt-role-pattern.md).
  if (!isServiceRoleCaller(req)) {
    return withCors(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }

  const res = await handleAdminCustomerVpsRefresh(req, { db, provisioning, telegram })
  return withCors(res, req)
})
