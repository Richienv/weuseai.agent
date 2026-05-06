import type {
  ISshProvisioner,
  SshSetupOpts,
  SshSetupResult,
} from '../ssh-provisioner.js'

/** In-memory ISshProvisioner. Records every call; lets tests inject results. */
export class MockSshProvisioner implements ISshProvisioner {
  calls: SshSetupOpts[] = []
  private nextResult: SshSetupResult

  constructor(opts: { nextResult?: SshSetupResult } = {}) {
    this.nextResult =
      opts.nextResult ?? { ok: true, stdout: '', stderr: '', exitCode: 0 }
  }

  async runSetup(opts: SshSetupOpts): Promise<SshSetupResult> {
    this.calls.push(opts)
    return this.nextResult
  }

  /** Test helper — change what the next call returns. */
  setNextResult(r: SshSetupResult): void {
    this.nextResult = r
  }
}
