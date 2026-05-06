/**
 * OpenRouter implementation of ILlmKeyMinter.
 *
 * Calls /api/v1/keys with the provisioning (management) key in the
 * Authorization header. Per OpenRouter docs:
 *   - POST /keys → 201 { key, data: { hash, name, limit, ... } }
 *   - DELETE /keys/{hash} → 200 { deleted: true }
 *
 * The provisioning key is DIFFERENT from a regular API key — it can mint
 * keys but cannot make completion calls. Generated at:
 *   https://openrouter.ai/settings/management-keys
 */

import type {
  ILlmKeyMinter,
  MintKeyOpts,
  MintKeyResult,
  RevokeResult,
} from '../llm-key-minter.js'

const BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterKeyMinter implements ILlmKeyMinter {
  private provisioningKey: string

  constructor(opts: { provisioningKey?: string } = {}) {
    this.provisioningKey =
      opts.provisioningKey ?? process.env.OPENROUTER_PROVISIONING_KEY ?? ''
    if (!this.provisioningKey) {
      throw new Error(
        'OpenRouterKeyMinter: missing provisioningKey (env OPENROUTER_PROVISIONING_KEY)',
      )
    }
  }

  async mint(opts: MintKeyOpts): Promise<MintKeyResult> {
    const r = await fetch(`${BASE_URL}/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.provisioningKey}`,
        'Content-Type': 'application/json',
      },
      // OpenRouter expects `limit` in USD (float), our internal value is cents.
      body: JSON.stringify({
        name: opts.name,
        limit: opts.limitUsdCents / 100,
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`OpenRouter mint -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    const json = (await r.json()) as {
      key: string
      data: { hash: string; name: string; limit: number | null }
    }
    return {
      key: json.key,
      hash: json.data.hash,
      limitUsdCents: opts.limitUsdCents,
    }
  }

  async revoke(hash: string): Promise<RevokeResult> {
    const r = await fetch(`${BASE_URL}/keys/${encodeURIComponent(hash)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.provisioningKey}`,
        'Content-Type': 'application/json',
      },
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`OpenRouter revoke -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    return { ok: true }
  }
}
