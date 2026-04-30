/**
 * LLM pricing per 1M tokens (USD).
 * Update angka kalau provider ubah harga; redeploy worker.
 */

export type ModelPricing = {
  provider: 'zhipu' | 'deepseek' | 'anthropic'
  inputPerM: number   // USD per 1M input tokens
  outputPerM: number  // USD per 1M output tokens
}

export const PRICING: Record<string, ModelPricing> = {
  // Zhipu / Z.AI — GLM family
  'glm-4-flash': { provider: 'zhipu', inputPerM: 0, outputPerM: 0 },     // free tier
  'glm-4.5-flash': { provider: 'zhipu', inputPerM: 0, outputPerM: 0 },   // free tier
  'glm-4.5': { provider: 'zhipu', inputPerM: 0.6, outputPerM: 2.2 },

  // DeepSeek
  'deepseek-chat': { provider: 'deepseek', inputPerM: 0.27, outputPerM: 1.1 },

  // Anthropic (premium upsell only)
  'claude-haiku-4-5': { provider: 'anthropic', inputPerM: 0.25, outputPerM: 1.25 },
  'claude-sonnet-4-6': { provider: 'anthropic', inputPerM: 3.0, outputPerM: 15.0 },
}

export function calculateCostUsdCents(
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number },
): number {
  const p = PRICING[model]
  if (!p) {
    // Unknown model: charge as if Sonnet (safe fallback)
    return calculateCostUsdCents('claude-sonnet-4-6', usage)
  }
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
  const usd = (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000
  return Math.ceil(usd * 100) // round up to cent
}
