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
//   BOT_TOKEN_ENC_KEY                  — base64 32+ char key, passed as
//                                        enc_key param to decrypt_bot_token
//                                        when fetching the customer's bot
//                                        token to pass to provisioning +
//                                        call deleteWebhook on it.
//                                        Founder-applied Option A signature
//                                        (2026-05-09 post-deploy).

import { handleCompleteOnboarding } from '../_shared/complete-onboarding-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createOnboardingStore } from '../_shared/onboarding-store-supabase.ts'
import { MockLlmKeyMinter } from '../_shared/mock-llm-key-minter.ts'
import { OpenRouterKeyMinter } from '../_shared/openrouter-key-minter.ts'
import { OnboardingProvisioningClient } from '../_shared/onboarding-provisioning-client.ts'
import { TelegramBotClient } from '../_shared/telegram-client.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
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

// Pair-flow Option A (2026-05-09): we call deleteWebhook on the
// customer's own bot AFTER provisioning ACKs, so Hermes can long-poll
// cleanly when the VPS boots. The TelegramBotClient platform token
// (legacy @weuseaibot) is unused for that path — only sendMessageAs /
// deleteWebhook with the customer's per-row token are exercised here.
const PLATFORM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const telegram = new TelegramBotClient({ token: PLATFORM_BOT_TOKEN })

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
    telegram,
    publicBase: PUBLIC_BASE,
    // Sesi B P0 #7 (2026-05-12): welcome email after Hermes activation.
    // Stub-tolerant — no-ops cleanly when RESEND_API_KEY is unset.
    sendWelcomeEmail: async (args) => sendEmail(args),
  })
  return withCors(res, req)
})
