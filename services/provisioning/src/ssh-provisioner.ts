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
  /** Password auth (IDCloudHost legacy path — provisioner sets a
   *  customer-specific password via the IDCH API). Required when
   *  privateKeyPath is not provided. */
  password?: string
  /** Path to a PEM-formatted SSH private key file (Vultr / DO path —
   *  fleet key uploaded once to the provider via SSH-key API, then
   *  passed in `sshkey_id` array on instance create). Required when
   *  password is not provided. Mutually-exclusive with password in
   *  practice; if both are set, key auth wins.
   *
   *  Added 2026-05-11 (Vultr migration cascade). IDCloudHost continues
   *  to use the password path; Vultr/DO use the key path. */
  privateKeyPath?: string
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
