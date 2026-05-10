// Deno Edge Function entry — reset-bot-pairing.
//
// Wired by onboarding.html step 3 "Bukan bot kamu — Ganti bot" recovery
// link (2026-05-10 P0 fix). Clears the customer's bot pairing fields so
// they can re-paste a different bot token via step 2.
//
// Pure handler: ../_shared/reset-bot-pairing-handler.ts
//
// Why service-role: anon UPDATE on customers is locked down (Sesi D
// P0-2 + the 2026-05-06 pairing-anon-update lock-out). Mirrors
// rotate-pairing-code.
//
// Deploy:
//   supabase functions deploy reset-bot-pairing --project-ref gtjgsligllbjcisiyrah --use-api
//
// Env (auto-provided by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { handleResetBotPairing } from '../_shared/reset-bot-pairing-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
})

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleResetBotPairing(req, { db })
  return withCors(res, req)
})
