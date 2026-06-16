// SSH local-forward to a VPS's loopback Hermes API server (dashboard Phase 3).
//
// Opens `ssh -N -L 127.0.0.1:<ephemeral>:127.0.0.1:8642 <user>@<ip>` with the
// fleet key, then POSTs the (already force-pinned) body to the forwarded port.
// Phase 3 = BUFFERED, tunnel-per-request (NO pool). The vps_id-keyed pool +
// SSE streaming + ControlMaster reuse are Phase 5 (tunnel-pool.ts).
//
// This is the one place the VPS IP + api_server_key are in scope — it never
// logs them, and errors are opaque. It cannot be unit-tested without a live
// VPS (the SSH spawn), so the route handler is DI-tested with a mock; this is
// exercised by the Phase 6 live spike.

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import type { ApiServerTarget, ApiServerResult } from '../routes/agent-chat.js'
import type { UpstreamBody } from '../routes/agent-chat-model-guard.js'

const VPS_API_PORT = 8642
const FORWARD_READY_TIMEOUT_MS = 12_000
const UPSTREAM_TIMEOUT_MS = 60_000

// RAM-backed scratch on the 256MB Fly box; falls back to tmpdir off-Linux.
function scratchRoot(): string {
  return existsSync('/dev/shm') ? '/dev/shm' : tmpdir()
}

export type SshCallerDeps = {
  fleetSshPrivateKey: string
  /** 'weuseai' pending live G2 verification; 'root' fallback. */
  user?: string
}

export function createSshApiServerCaller(deps: SshCallerDeps) {
  const user = deps.user ?? 'weuseai'

  return async function callApiServer(
    target: ApiServerTarget,
    body: UpstreamBody,
    signal: AbortSignal | null,
  ): Promise<ApiServerResult> {
    if (!deps.fleetSshPrivateKey) return { ok: false, status: 502 }
    const localPort = randomInt(20000, 60000)
    const keyDir = mkdtempSync(join(scratchRoot(), 'weuseai-chat-'))
    const keyPath = join(keyDir, 'fleet-key')
    let ssh: ReturnType<typeof spawn> | null = null
    try {
      const normalised = deps.fleetSshPrivateKey.endsWith('\n')
        ? deps.fleetSshPrivateKey
        : deps.fleetSshPrivateKey + '\n'
      writeFileSync(keyPath, normalised, { encoding: 'utf8' })
      chmodSync(keyPath, 0o600)

      ssh = spawn('ssh', [
        '-N',
        '-L', `127.0.0.1:${localPort}:127.0.0.1:${VPS_API_PORT}`,
        '-i', keyPath,
        '-o', 'BatchMode=yes',
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=accept-new', // Phase 5: per-VPS known_hosts pin
        '-o', 'ConnectTimeout=10',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=3',
        '-o', 'ExitOnForwardFailure=yes', // :8642-bind canary → fast fail, not a hang
        `${user}@${target.ip}`,
      ], { stdio: ['ignore', 'ignore', 'pipe'] })

      // Wait for the forward to accept connections (poll the local port).
      const ready = await waitForForward(localPort, FORWARD_READY_TIMEOUT_MS, ssh, signal)
      if (!ready) return { ok: false, status: 503 }

      const ctrl = new AbortController()
      const onAbort = () => ctrl.abort()
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      const to = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
      try {
        const res = await fetch(`http://127.0.0.1:${localPort}/v1/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${target.key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        if (!res.ok) return { ok: false, status: res.status }
        const json = (await res.json()) as Record<string, unknown>
        return { ok: true, status: 200, json }
      } finally {
        clearTimeout(to)
        if (signal) signal.removeEventListener('abort', onAbort)
      }
    } catch {
      return { ok: false, status: 502 }
    } finally {
      try { ssh?.kill('SIGTERM') } catch { /* noop */ }
      try { rmSync(keyDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }
}

// Poll the forwarded port until a TCP connect succeeds (or the ssh proc dies /
// signal aborts / timeout). A connect-refused means the forward isn't up yet.
async function waitForForward(
  port: number,
  timeoutMs: number,
  proc: ReturnType<typeof spawn>,
  signal: AbortSignal | null,
): Promise<boolean> {
  const { connect } = await import('node:net')
  const deadline = Date.now() + timeoutMs
  let dead = false
  proc.once('exit', () => { dead = true })
  while (Date.now() < deadline) {
    if (dead || (signal && signal.aborted)) return false
    const ok = await new Promise<boolean>((resolve) => {
      const sock = connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true) })
      sock.on('error', () => { sock.destroy(); resolve(false) })
      sock.setTimeout(800, () => { sock.destroy(); resolve(false) })
    })
    if (ok) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
