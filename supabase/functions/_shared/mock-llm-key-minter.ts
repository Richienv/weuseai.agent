// Mock LLM key minter — used in dev (LLM_MINTER_MODE=mock) and tests.
//
// Returns deterministic-looking but unique keys; revoke is a no-op
// (no real provider to call). The hash format mirrors what the real
// OpenRouter minter returns so storage code paths exercise the same
// shape.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "ILlmKeyMinter (decoupled from Phase 2A merge)"

import type {
  ILlmKeyMinter,
  MintKeyOpts,
  MintKeyResult,
  RevokeResult,
} from './types.ts'

export class MockLlmKeyMinter implements ILlmKeyMinter {
  private revoked = new Set<string>()

  /** Track every mint for assertion in tests. */
  public minted: MintKeyResult[] = []

  async mint(opts: MintKeyOpts): Promise<MintKeyResult> {
    // Crypto-random suffix so two mints for the same name don't collide.
    const buf = new Uint8Array(8)
    crypto.getRandomValues(buf)
    let suffix = ''
    for (let i = 0; i < buf.length; i++) {
      suffix += buf[i].toString(16).padStart(2, '0')
    }
    const result: MintKeyResult = {
      key: `sk-mock-${opts.name}-${suffix}`,
      hash: `hash-${opts.name}-${suffix}`,
      limitUsdCents: opts.limitUsdCents,
    }
    this.minted.push(result)
    return result
  }

  async revoke(hash: string): Promise<RevokeResult> {
    this.revoked.add(hash)
    return { ok: true }
  }

  /** Test helper — true if `hash` was revoked. */
  wasRevoked(hash: string): boolean {
    return this.revoked.has(hash)
  }
}
