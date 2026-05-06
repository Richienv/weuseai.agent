/**
 * Real ISshProvisioner — shells to `sshpass + ssh` and pipes the script
 * over stdin. No external npm deps; sshpass + openssh-client must be
 * installed on the host running this code (Mac dev: `brew install
 * hudochenkov/sshpass/sshpass`; Fly Docker: `apk add sshpass openssh-client`).
 *
 * Why shell-out vs an npm SSH library: ssh2 / node-ssh add ~5MB to the image
 * and another protocol implementation to trust. Shelling to system openssh
 * means the same tool ops engineers already debug with works in production.
 */

import { spawn } from 'node:child_process'
import type {
  ISshProvisioner,
  SshSetupOpts,
  SshSetupResult,
} from '../ssh-provisioner.js'

export class ExecSshProvisioner implements ISshProvisioner {
  async runSetup(opts: SshSetupOpts): Promise<SshSetupResult> {
    const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000
    return new Promise((resolve) => {
      // Pass password via env var (sshpass -e). Avoids it landing in argv
      // / process listings. SSH itself reads the script from stdin —
      // we feed the full bash via `bash -s` on the remote.
      const proc = spawn(
        'sshpass',
        [
          '-e',
          'ssh',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'UserKnownHostsFile=/dev/null',
          '-o', `ConnectTimeout=15`,
          '-o', 'ServerAliveInterval=30',
          '-o', 'ServerAliveCountMax=10',
          '-T', // disable pseudo-tty (we're piping a script)
          `${opts.user}@${opts.host}`,
          'sudo bash -s',
        ],
        {
          env: { ...process.env, SSHPASS: opts.password },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
      }, timeoutMs)

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

      proc.on('close', (code, signal) => {
        clearTimeout(timer)
        const exitCode = code ?? (signal ? -2 : -1)
        const ok = exitCode === 0
        resolve({ ok, stdout, stderr, exitCode })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          ok: false,
          stdout,
          stderr: stderr + `\n[spawn error] ${err.message}`,
          exitCode: -1,
        })
      })

      // Feed the script via stdin
      proc.stdin.write(opts.script)
      proc.stdin.end()
    })
  }
}
