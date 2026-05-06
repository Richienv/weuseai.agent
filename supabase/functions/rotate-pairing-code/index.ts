// Deno Edge Function entry — rotate-pairing-code.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
// Pure handler: ../_shared/rotate-pairing-code-handler.ts
//
// Why this exists: anon column-grant approach (migration
// 20260506140000) was insufficient — Supabase's default role grants
// allowed anon to PATCH any column under the permissive RLS policy.
// We revoked the anon UPDATE and now route rotation through this
// service-role function instead.
//
// Deploy:
//   supabase functions deploy rotate-pairing-code --project-ref gtjgsligllbjcisiyrah
//
// Env (auto-provided by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { handleRotatePairingCode } from '../_shared/rotate-pairing-code-handler.ts'
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

  const res = await handleRotatePairingCode(req, { db })
  return withCors(res)
})
