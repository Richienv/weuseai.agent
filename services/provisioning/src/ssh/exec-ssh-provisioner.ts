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
    // Branch on auth method (2026-05-11 Vultr migration cascade):
    //   - privateKeyPath set → ssh -i <key> (Vultr / DO)
    //   - password set       → sshpass -e ssh (IDCloudHost legacy)
    //   - both set           → key wins (preferred)
    //   - neither            → error (no transport)
    const useKey = !!opts.privateKeyPath
    const usePassword = !useKey && !!opts.password
    if (!useKey && !usePassword) {
      return {
        ok: false,
        stdout: '',
        stderr: 'ExecSshProvisioner: neither privateKeyPath nor password supplied',
        exitCode: -1,
      }
    }
    return new Promise((resolve) => {
      // Common SSH options. Identical for key + password paths so the
      // resulting remote behavior matches.
      const sshArgs = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', `ConnectTimeout=15`,
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=10',
        '-T', // disable pseudo-tty (we're piping a script)
      ]
      if (useKey) {
        // Key auth: -i <path>. BatchMode prevents fallback to password
        // prompts when key auth fails (we want a clean exit code).
        sshArgs.push(
          '-i', opts.privateKeyPath as string,
          '-o', 'BatchMode=yes',
          '-o', 'IdentitiesOnly=yes',
        )
      }
      sshArgs.push(`${opts.user}@${opts.host}`, 'sudo bash -s')

      // For Vultr's `root` default user, `sudo bash` is a no-op (already
      // root). For IDCloudHost's `liren` user, sudo escalates as before.
      // Either way the script runs with full privileges.
      const cmd = useKey ? 'ssh' : 'sshpass'
      const args = useKey ? sshArgs : ['-e', 'ssh', ...sshArgs]
      const env = useKey
        ? { ...process.env }
        : { ...process.env, SSHPASS: opts.password as string }

      const proc = spawn(cmd, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

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
