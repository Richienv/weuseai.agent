// Deno Edge Function entry — complete-onboarding.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
// Pure handler: ../_shared/complete-onboarding-handler.ts
//
// Deploy:
//   supabase functions deploy complete-onboarding --project-ref gtjgsligllbjcisiyrah
//
// Required env (set via `supabase secrets set ...`):
//   SUPABASE_URL                       — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY          — set automatically
//   PROVISIONING_URL                   — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN            — bearer for the provisioning service
//   PUBLIC_BASE_URL                    — https://weuseai-agent.vercel.app (default applied)
//   LLM_MINTER_MODE                    — 'mock' | 'live' (default: 'mock')
//   OPENROUTER_PROVISIONING_KEY        — required only when LLM_MINTER_MODE=live

import { handleCompleteOnboarding } from '../_shared/complete-onboarding-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'
import { MockLlmKeyMinter } from '../_shared/mock-llm-key-minter.ts'
import { OpenRouterKeyMinter } from '../_shared/openrouter-key-minter.ts'
import { OnboardingProvisioningClient } from '../_shared/onboarding-provisioning-client.ts'
import type { ILlmKeyMinter } from '../_shared/types.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

// ─── Env wiring (constructed once per cold start) ─────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://weuseai-agent.vercel.app'
const MINTER_MODE = Deno.env.get('LLM_MINTER_MODE') ?? 'mock'

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
})

const provisioning = new OnboardingProvisioningClient({
  baseUrl: PROVISIONING_URL,
  authToken: PROVISIONING_AUTH_TOKEN,
})

let minter: ILlmKeyMinter
if (MINTER_MODE === 'live') {
  const provisioningKey = Deno.env.get('OPENROUTER_PROVISIONING_KEY')
  if (!provisioningKey) {
    throw new Error(
      'complete-onboarding: LLM_MINTER_MODE=live but OPENROUTER_PROVISIONING_KEY is not set. ' +
        'Either set it via `supabase secrets set ...` or revert LLM_MINTER_MODE to "mock".',
    )
  }
  minter = new OpenRouterKeyMinter({ provisioningKey })
} else {
  // Default — Phase 1 dev path. Returns sk-mock-* keys; revoke is a no-op.
  minter = new MockLlmKeyMinter()
}

// ─── Server ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleCompleteOnboarding(req, {
    db,
    minter,
    provisioning,
    publicBase: PUBLIC_BASE,
  })
  return withCors(res, req)
})
