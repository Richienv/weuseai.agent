/**
 * ISshProvisioner — abstract over "run a bash script on a remote VPS via
 * SSH and report what happened". Adapters:
 *   - ssh/mock-ssh-provisioner.ts   (in-memory recorder, for tests)
 *   - ssh/exec-ssh-provisioner.ts   (real impl: shells to ssh+sshpass)
 *
 * The contract is intentionally narrow: one shot, send full script, get
 * stdout/stderr/exitCode back. No interactive sessions, no per-command
 * round-trips. Setup scripts must be self-contained shell with their
 * own error handling.
 */

export type SshSetupOpts = {
  host: string
  user: string
  password: string
  script: string
  /** Hard cap on the SSH command (real impl). Default 10 min. */
  timeoutMs?: number
}

export type SshSetupResult = {
  ok: boolean         // exitCode === 0 AND no transport error
  stdout: string
  stderr: string
  exitCode: number    // -1 if SSH itself never ran (e.g. transport error)
}

export interface ISshProvisioner {
  runSetup(opts: SshSetupOpts): Promise<SshSetupResult>
}
