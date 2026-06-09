/**
 * Pure helpers for /spin-up — body parsing + response formatting.
 *
 * Lives separate from index.ts so it's testable without booting Express.
 * No I/O, no env reads — all inputs explicit.
 */

import type { ProvisionTier, SpinUpOpts, SpinUpResult } from './customer-flow.js'

// All provisionable tier slugs: v1.4 canonical (bare/solo/voice-starter/
// library-full/done-for-you) + the deprecated legacy slugs. `enterprise`
// is intentionally absent — it is contact-sales, not self-provisionable.
// Persona/voice come from the canonical slug; VPS spec/budget collapse to a
// spec-class via resolveTierToSpecClass (customer-flow.ts).
const VALID_TIERS: ReadonlyArray<ProvisionTier> = [
  'bare', 'solo', 'voice-starter', 'library-full', 'done-for-you',
  'starter', 'pro', 'studio',
]

export type EnvLike = {
  TELEGRAM_BOT_TOKEN?: string
  DEFAULT_TELEGRAM_CHAT_ID?: string
}

export type ParseResult =
  | { ok: true; opts: SpinUpOpts }
  | { ok: false; error: string }

/**
 * Parse + validate the /spin-up request body, applying env fallbacks for
 * Telegram fields. Body wins when present (even empty string — caller's
 * deliberate "no value"). Only undefined/missing keys trigger fallback.
 */
export function parseSpinUpRequest(
  body: Record<string, unknown>,
  env: EnvLike,
): ParseResult {
  const customerId = body.customerId as string | undefined
  const tier = body.tier as string | undefined

  if (!customerId) return { ok: false, error: 'missing customerId' }
  if (!tier) return { ok: false, error: 'missing tier' }
  if (!VALID_TIERS.includes(tier as ProvisionTier)) {
    return { ok: false, error: `invalid tier: ${tier}` }
  }

  // Distinguish "key absent" (→ fallback) from "key present but empty" (→ keep empty).
  const hasBotTokenKey = Object.prototype.hasOwnProperty.call(body, 'customerTelegramBotToken')
  const hasUsersKey = Object.prototype.hasOwnProperty.call(body, 'customerTelegramAllowedUserIds')

  const customerTelegramBotToken = hasBotTokenKey
    ? (body.customerTelegramBotToken as string | undefined)
    : env.TELEGRAM_BOT_TOKEN

  const customerTelegramAllowedUserIds = hasUsersKey
    ? (body.customerTelegramAllowedUserIds as string | undefined)
    : env.DEFAULT_TELEGRAM_CHAT_ID

  return {
    ok: true,
    opts: {
      customerId,
      tier: tier as ProvisionTier,
      telegramChatId: body.telegramChatId as string | undefined,
      customerTelegramBotToken,
      customerTelegramAllowedUserIds,
      customerLlmApiKey: body.customerLlmApiKey as string | undefined,
      customerLlmProvider: body.customerLlmProvider as
        | 'deepseek'
        | 'openrouter'
        | 'openai'
        | 'glm'
        | undefined,
      alwaysOnEnabled: body.alwaysOnEnabled as boolean | undefined,
      useStarterCredits: body.useStarterCredits as boolean | undefined,
      // Persona selection (2026-05-17): the customer's chosen persona
      // slug. complete-onboarding validated it against the tier already;
      // spinUpCustomer's buildScriptFor uses it as the primary persona
      // (WEUSEAI_AGENT_SLUG). Undefined when absent → buildScriptFor
      // falls back to DEFAULT_PERSONA. Coerced to a non-empty string so
      // a blank body value behaves like absent.
      agentSlug:
        typeof body.agentSlug === 'string' && body.agentSlug.length > 0
          ? (body.agentSlug as string)
          : undefined,
    },
  }
}

/**
 * Phase 1 spec response shape:
 *   { ok: true, vps_instance_id, vps_ip }
 *
 * The webhook (current consumer) only checks HTTP status, so this shape
 * is forward-looking — for the dashboard / retry worker / debug logs.
 */
export type SpinUpResponseBody = {
  ok: true
  vps_instance_id: string
  vps_ip: string | null
}

export function formatSpinUpResponse(result: SpinUpResult): SpinUpResponseBody {
  return {
    ok: true,
    vps_instance_id: result.vpsId,
    vps_ip: result.ip,
  }
}
