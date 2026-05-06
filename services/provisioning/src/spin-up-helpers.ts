/**
 * Pure helpers for /spin-up — body parsing + response formatting.
 *
 * Lives separate from index.ts so it's testable without booting Express.
 * No I/O, no env reads — all inputs explicit.
 */

import type { Tier, SpinUpOpts, SpinUpResult } from './customer-flow.js'

const VALID_TIERS: ReadonlyArray<Tier> = ['starter', 'pro', 'studio']

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
  if (!VALID_TIERS.includes(tier as Tier)) {
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
      tier: tier as Tier,
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
