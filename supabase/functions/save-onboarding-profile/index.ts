// Deno Edge Function entry — save-onboarding-profile.
//
// Wired by onboarding.html step 1 submit. Captures Name + Email +
// WhatsApp for customers who completed checkout without filling those
// fields. Service-role only (anon UPDATE on customers is locked per
// Sesi D P0-2 + the prior pairing-anon-update lock-out).
//
// Pure handler: ../_shared/save-onboarding-profile-handler.ts
//
// Deploy:
//   supabase functions deploy save-onboarding-profile --project-ref gtjgsligllbjcisiyrah --use-api
//
// Env (auto-provided by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { handleSaveOnboardingProfile } from '../_shared/save-onboarding-profile-handler.ts'
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

  const res = await handleSaveOnboardingProfile(req, { db })
  return withCors(res, req)
})
