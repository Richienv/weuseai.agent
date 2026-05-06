import type {
  ILlmKeyMinter,
  MintKeyOpts,
  MintKeyResult,
  RevokeResult,
} from '../llm-key-minter.js'

/** In-memory minter for tests. Records every mint + revoke. */
export class MockLlmKeyMinter implements ILlmKeyMinter {
  calls: MintKeyOpts[] = []
  revokes: string[] = []
  private counter = 0
  private shouldFailMint: boolean

  constructor(opts: { shouldFailMint?: boolean } = {}) {
    this.shouldFailMint = opts.shouldFailMint ?? false
  }

  async mint(opts: MintKeyOpts): Promise<MintKeyResult> {
    if (this.shouldFailMint) throw new Error('mock mint failure')
    this.calls.push(opts)
    const i = ++this.counter
    return {
      key: `sk-or-v1-mock-${i}-${Math.random().toString(36).slice(2, 10)}`,
      hash: `mock-hash-${i}-${Math.random().toString(36).slice(2, 10)}`,
      limitUsdCents: opts.limitUsdCents,
    }
  }

  async revoke(hash: string): Promise<RevokeResult> {
    this.revokes.push(hash)
    return { ok: true }
  }
}
