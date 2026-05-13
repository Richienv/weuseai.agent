/**
 * /restart-hermes endpoint — D1 multi-persona webhook push (2026-05-12).
 *
 * Triggered by the Supabase `bundle-version-bump-broadcast` Edge
 * Function when a persona bundle ships a new version. Performs the
 * smallest possible operation on the customer's VPS:
 *
 *   ssh root@<ip> "sudo systemctl restart hermes-gateway"
 *
 * Hermes's `ExecStartPre=+/usr/local/bin/weuseai-bundle-pull` (installed
 * by setup-script.ts:457 systemd drop-in) fires on every restart, so
 * the restart triggers a fresh bundle-pull cycle for every persona in
 * WEUSEAI_AGENT_SLUGS. The pull is idempotent — if the new version
 * matches the .installed-version, nothing happens; if it differs (i.e.
 * the broadcast just pushed a bump), the new bundle gets installed.
 *
 * Why a separate route from /refresh-env: refresh-env requires at least
 * one env value to write (validation at line 446). The broadcast use
 * case doesn't change env — it just wants to trigger Hermes restart.
 * Adding an "empty env_values is OK" path to refresh-env would weaken
 * its validation. A separate minimal route is the cleaner split.
 *
 * Auth: bearer token at the Express middleware layer (existing
 * PROVISIONING_AUTH_TOKEN gate). This file is pure request → SSH
 * translation.
 *
 * Idempotency: not enforced server-side. Caller (broadcast Edge
 * Function) deduplicates via bundle_version_broadcasts telemetry rows.
 * A duplicate /restart-hermes call is safe — it just does an
 * unnecessary systemctl restart, which itself is idempotent.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type RestartHermesRequest = {
  customer_id: string
  /**
   * Free-form context label for telemetry. Set by callers like
   * "bundle-version-bump:web-app-builder@2.1.0" or
   * "manual-admin-restart". Logged into refresh_env_requests with
   * kind='restart-hermes' for audit trail.
   */
  reason?: string
}

export type RestartHermesResult =
  | { ok: true; vpsId: string; ipAddress: string; restartedAt: string }
  | { ok: false; status: number; error: string; detail?: string }

export type RestartHermesStore = {
  findVpsByCustomerId(customerId: string): Promise<
    { vps_id: string; ip_address: string | null } | null
  >
}

export type RestartHermesDeps = {
  store: RestartHermesStore
  fleetSshPrivateKey: string
  /** Test seam — defaults to running real ssh via child_process spawn. */
  exec?: (cmd: string, args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>
  now?: () => Date
}

export async function restartHermesHandler(
  req: RestartHermesRequest,
  deps: RestartHermesDeps,
): Promise<RestartHermesResult> {
  if (!req.customer_id || typeof req.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (!deps.fleetSshPrivateKey) {
    return {
      ok: false,
      status: 500,
      error: 'fleet_ssh_private_key_missing',
      detail: 'FLEET_SSH_PRIVATE_KEY env var not set on provisioning service',
    }
  }

  const vps = await deps.store.findVpsByCustomerId(req.customer_id)
  if (!vps) {
    return {
      ok: false,
      status: 404,
      error: 'customer_vps_not_found',
      detail: `no vps_instances row for customer_id=${req.customer_id}`,
    }
  }
  if (!vps.ip_address) {
    return {
      ok: false,
      status: 409,
      error: 'vps_ip_unknown',
      detail: 'VPS row exists but ip_address is null — customer may be mid-provisioning',
    }
  }

  // Write the fleet SSH private key to a tmpfile for the duration of
  // the SSH call. Same pattern as customer-flow.ts:setupSshKeyAuth() —
  // HF-2e (2026-05-13): explicit utf-8 encoding + trailing-newline
  // normalisation. Pre-2e the default Node encoding (utf-8) was used
  // without normalising the trailing newline, and OpenSSH rejected the
  // resulting file with "Load key: error in libcrypto". Verified on
  // customer e282ce25 2026-05-13 — POST /restart-hermes returned 502
  // ssh_restart_failed with that exact stderr.
  const tmpDir = mkdtempSync(join(tmpdir(), 'weuseai-restart-hermes-'))
  const keyPath = join(tmpDir, 'fleet-key')
  try {
    const normalised = deps.fleetSshPrivateKey.endsWith('\n')
      ? deps.fleetSshPrivateKey
      : deps.fleetSshPrivateKey + '\n'
    writeFileSync(keyPath, normalised, { encoding: 'utf8' })
    chmodSync(keyPath, 0o600)

    const exec = deps.exec ?? defaultExec
    const sshArgs = [
      '-i', keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      `root@${vps.ip_address}`,
      'sudo systemctl restart hermes-gateway',
    ]
    const result = await exec('ssh', sshArgs)
    if (!result.ok) {
      return {
        ok: false,
        status: 502,
        error: 'ssh_restart_failed',
        detail: `exit=${result.exitCode} stderr=${result.stderr.slice(0, 300)}`,
      }
    }
    const now = deps.now?.() ?? new Date()
    return {
      ok: true,
      vpsId: vps.vps_id,
      ipAddress: vps.ip_address,
      restartedAt: now.toISOString(),
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

async function defaultExec(
  cmd: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }> {
  return await new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b) => (stdout += b.toString()))
    proc.stderr.on('data', (b) => (stderr += b.toString()))
    proc.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, exitCode: code ?? -1 })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: `spawn error: ${err.message}`, exitCode: -1 })
    })
  })
}
