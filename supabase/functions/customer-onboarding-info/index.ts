// Deno Edge Function entry — customer-onboarding-info.
//
// Email-mismatch fix (2026-05-17): returns the customer's
// payment-record email (+ name / whatsapp) so onboarding.html shows the
// email the customer actually paid with — not a stale browser
// localStorage value. Pure handler:
// ../_shared/customer-onboarding-info-handler.ts
//
// Deploy:
//   supabase functions deploy customer-onboarding-info \
//     --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto-provided):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Auth: anon-callable (verify_jwt=false). Authz: X-CID header MUST
// equal the body customer_id (enforced in the handler) — same gate as
// customer-readiness / customer-progress-proxy.

import { handleCustomerOnboardingInfo } from '../_shared/customer-onboarding-info-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// This handler never decrypts a bot token — empty enc-key fallback is
// safe (createOnboardingStore only throws if a decrypt path is used).
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY') ?? ''

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleCustomerOnboardingInfo(req, { db })
  return withCors(res, req)
})
