// Deno Edge Function entry — pair-customer-bot-webhook.
//
// Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (Option A,
// Step 3 of onboarding — customer sends /pair <code> to their own bot).
// Pure handler: ../_shared/pair-customer-bot-webhook-handler.ts
//
// What this does:
//   - Receives Telegram webhook POSTs forwarded from a customer's own
//     bot (the webhook URL was registered in validate-bot-token-handler).
//   - URL carries ?cid=<customer_id>; secret_token header is verified
//     against PAIR_WEBHOOK_SECRET.
//   - On /pair <code> match: writes telegram_chat_id, clears
//     pairing_code, replies success via the customer's own bot.
//
// Deploy:
//   supabase functions deploy pair-customer-bot-webhook \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// `--no-verify-jwt` because Telegram doesn't send a JWT — auth is
// via the `X-Telegram-Bot-Api-Secret-Token` header set during
// validate-bot-token-handler's setWebhook call.
//
// Env (Supabase secrets):
//   SUPABASE_URL                       — auto-set by Supabase
//   SUPABASE_SERVICE_ROLE_KEY          — auto-set by Supabase
//   PAIR_WEBHOOK_SECRET                — same value as in
//                                        validate-bot-token function
//   BOT_TOKEN_ENC_KEY                  — base64 32+ char key, passed as
//                                        enc_key param to decrypt_bot_token
//                                        when fetching the customer's bot
//                                        token to send the pairing-success
//                                        reply. Founder-applied Option A
//                                        signature (2026-05-09 post-deploy).
//   TELEGRAM_BOT_TOKEN                 — legacy @weuseaibot token
//                                        (constructor argument; this
//                                        handler only uses per-token
//                                        sendMessageAs)

import { handlePairCustomerBotWebhook } from '../_shared/pair-customer-bot-webhook-handler.ts'
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
const PAIR_WEBHOOK_SECRET = Deno.env.get('PAIR_WEBHOOK_SECRET')!
const BOT_TOKEN_ENC_KEY = Deno.env.get('BOT_TOKEN_ENC_KEY')!
const PLATFORM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const db = createOnboardingStore({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  botTokenEncKey: BOT_TOKEN_ENC_KEY,
})

const telegram = new TelegramBotClient({ token: PLATFORM_BOT_TOKEN })

// Genesis Onboarding (2026-06-13): distill samples a paired-but-not-onboarded
// customer forwards into their bot. Resolves the tier from the subscription,
// then server-to-server POSTs the genesis-distill function (X-CID-bound).
// Returns null on any failure so the webhook degrades cleanly.
async function distillSamples(
  input: { customerId: string; samples: string },
): Promise<
  | {
      expectations_paragraph: string
      recommended_persona: string | null
      persona_name: string | null
      voice_note: string | null
      summary_bahasa: string
    }
  | null
> {
  try {
    const sub = await db.findActiveOrPendingSubscriptionByCustomer(input.customerId)
    const tier = sub?.tier ?? 'starter'
    const r = await fetch(`${SUPABASE_URL}/functions/v1/genesis-distill`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cid': input.customerId,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ customer_id: input.customerId, tier, samples: input.samples }),
    })
    if (!r.ok) return null
    const data = (await r.json()) as Record<string, unknown>
    if (!data || data.ok !== true) return null
    return {
      expectations_paragraph: String(data.expectations_paragraph ?? ''),
      recommended_persona: (data.recommended_persona as string | null) ?? null,
      persona_name: (data.persona_name as string | null) ?? null,
      voice_note: (data.voice_note as string | null) ?? null,
      summary_bahasa: String(data.summary_bahasa ?? ''),
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  // Telegram doesn't preflight; tolerate Supabase status pings via
  // the wildcard webhookCorsHeaders.
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight

  const res = await handlePairCustomerBotWebhook(req, {
    db,
    telegram,
    webhookSecret: PAIR_WEBHOOK_SECRET,
    distillSamples,
  })
  return withCors(res, webhookCorsHeaders)
})
