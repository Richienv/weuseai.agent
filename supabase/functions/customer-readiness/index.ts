// Deno Edge Function entry — customer-readiness.
//
// Track 1 of post-pair UX polish (2026-05-10). Browser-callable wrapper
// around Fly /customer-readiness-probe. Welcome.html polls this every
// 10s during state A/B and only transitions to "klik Buka Telegram"
// when the critical checks pass.
//
// Pure handler: ../_shared/customer-readiness-handler.ts
//
// Deploy:
//   supabase functions deploy customer-readiness \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto + secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto
//   PROVISIONING_URL                         — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN                  — bearer for provisioning service
//
// Auth: anon-callable (verify_jwt=false). Authz: customer_id must map
// to an existing customer with a non-failed subscription (validated
// inline before proxying to Fly).

import { handleCustomerReadiness } from '../_shared/customer-readiness-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
// BOT_TOKEN_ENC_KEY only needed by other handlers via this store; we
// don't decrypt here so empty fallback is safe (this fn never calls
// getDecryptedBotToken).
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY') ?? ''

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleCustomerReadiness(req, {
    provisioningUrl: PROVISIONING_URL,
    provisioningAuthToken: PROVISIONING_AUTH_TOKEN,
    async validateCustomerExists(customerId: string) {
      const customer = await db.findCustomerById(customerId)
      if (!customer) return false
      const sub = await db.findActiveOrPendingSubscriptionByCustomer(customerId)
      // Allow 'pending' / 'active' / 'pending_provision' — anything where
      // the customer is mid-flow. Reject if no subscription row at all.
      return sub !== null
    },
  })
  return withCors(res, req)
})
