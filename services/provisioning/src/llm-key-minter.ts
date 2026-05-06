/**
 * ILlmKeyMinter — abstract over "mint a scoped LLM API key for one
 * customer with a spend cap". Phase 2A backend is OpenRouter; future
 * Phase 3 may swap to direct provider keys (DeepSeek, GLM, etc.).
 *
 * Implementations:
 *   - llm/mock-minter.ts        — in-memory recorder, for tests
 *   - llm/openrouter-minter.ts  — calls OpenRouter /api/v1/keys
 */

export type MintKeyOpts = {
  /**
   * Human-readable name shown in the OpenRouter dashboard. Convention:
   * `weuseai-customer-${customerId}` so we can find the key later.
   */
  name: string
  /** Spend cap in USD cents (e.g. 300 = $3). */
  limitUsdCents: number
}

export type MintKeyResult = {
  /** The actual API key string (e.g. `sk-or-v1-…`). NEVER log or persist
   *  beyond shipping to the customer's VM. */
  key: string
  /** OpenRouter's hash — used for delete/update calls. Safe to persist. */
  hash: string
  /** Echoed from the request so callers don't have to track separately. */
  limitUsdCents: number
}

export type RevokeResult = { ok: boolean }

export interface ILlmKeyMinter {
  mint(opts: MintKeyOpts): Promise<MintKeyResult>
  revoke(hash: string): Promise<RevokeResult>
}
