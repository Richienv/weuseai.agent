// Deno-native OpenRouterKeyMinter for Edge Functions.
//
// Mirrors the contract of the Phase 2A Node class at:
//   .worktrees/phase1-provisioning/services/provisioning/src/llm/openrouter-minter.ts
//
// Two separate runtime targets (Node for the provisioning service,
// Deno for the Edge Function) keep the same `ILlmKeyMinter` interface
// so handler logic is portable. When you swap LLM_MINTER_MODE from
// 'mock' to 'live' on the Edge Function side, this class takes over.
//
// Per OpenRouter docs (https://openrouter.ai/docs):
//   POST /api/v1/keys → 201 { key, data: { hash, name, limit, ... } }
//   DELETE /api/v1/keys/{hash} → 200 { deleted: true }
//
// The provisioning key (env OPENROUTER_PROVISIONING_KEY) is generated at
// https://openrouter.ai/settings/management-keys — it can mint/revoke
// scoped keys but cannot make completion calls.

import type {
  ILlmKeyMinter,
  MintKeyOpts,
  MintKeyResult,
  RevokeResult,
} from './types.ts'

const BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterKeyMinter implements ILlmKeyMinter {
  private provisioningKey: string

  constructor(opts: { provisioningKey: string }) {
    this.provisioningKey = opts.provisioningKey
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
        authorization: `Bearer ${this.provisioningKey}`,
        'content-type': 'application/json',
      },
      // OpenRouter expects `limit` in USD (float); our internal value is cents.
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
        authorization: `Bearer ${this.provisioningKey}`,
        'content-type': 'application/json',
      },
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`OpenRouter revoke -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    return { ok: true }
  }
}
