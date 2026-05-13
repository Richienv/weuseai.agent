/**
 * GET /customer-progress — Phase 2 prevention infrastructure (2026-05-13).
 *
 * Surfaces real-time setup-script progress so the welcome page can show
 * "Tahap: apt install (15s lalu)" instead of "stuck at stage Y for 8 min".
 *
 * SSH'es into the customer's VPS in ONE round-trip, reads:
 *   1. Last 10 non-empty lines of /var/log/weuseai-setup.log
 *   2. The single timestamp line in /var/log/hermes-install.heartbeat
 *      (written by setup-script's background heartbeat() every 30 sec)
 *
 * Both reads happen in the same SSH session via a `cat … && echo
 * ---HEARTBEAT--- && cat …` pipeline so we don't pay for two
 * connections per poll.
 *
 * The handler is intentionally a `GET`-shaped read-only endpoint (no
 * side effects on the VPS) so welcome.html can poll it every 3 sec
 * during the setup window without worrying about idempotency.
 *
 * Auth: bearer token at Express middleware (PROVISIONING_AUTH_TOKEN).
 *
 * Return shape mirrors the welcome.html stage-label model:
 *   - progress_lines: last 10 log lines
 *   - heartbeat_age_sec: seconds since heartbeat last refreshed (null
 *     when missing or unparseable)
 *   - heartbeat_stale: heartbeat_age_sec > 120 sec → no activity warning
 *   - inferred_stage: best-effort label for the front-end ("apt_install",
 *     "hermes_install", "gateway_install", "setup_complete", "unknown")
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HEARTBEAT_STALE_THRESHOLD_SEC = 120
const PROGRESS_TAIL_LINES = 10
const SSH_CONNECT_TIMEOUT_SEC = 10

export type CustomerProgressRequest = {
  customer_id: string
}

export type CustomerProgressResult =
  | {
      ok: true
      vps_id: string
      ip_address: string
      progress_lines: string[]
      heartbeat_age_sec: number | null
      heartbeat_stale: boolean
      inferred_stage:
        | 'apt_install'
        | 'hermes_install'
        | 'hermes_verifying'
        | 'gateway_install'
        | 'gateway_starting'
        | 'bundle_install'
        | 'setup_complete'
        | 'unknown'
      vps_ip_pending?: false
    }
  | {
      // Special case: VPS row exists but ip_address not yet allocated.
      // Welcome page renders "menunggu alokasi IP…" while waiting.
      ok: true
      vps_id: string | null
      ip_address: null
      progress_lines: []
      heartbeat_age_sec: null
      heartbeat_stale: false
      inferred_stage: 'unknown'
      vps_ip_pending: true
    }
  | { ok: false; status: number; error: string; detail?: string }

export type CustomerProgressStore = {
  findVpsByCustomerId(customerId: string): Promise<
    { vps_id: string; ip_address: string | null; status: string } | null
  >
}

export type CustomerProgressDeps = {
  store: CustomerProgressStore
  fleetSshPrivateKey: string
  exec?: (
    cmd: string,
    args: string[],
  ) => Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>
  now?: () => Date
}

export async function customerProgressHandler(
  req: CustomerProgressRequest,
  deps: CustomerProgressDeps,
): Promise<CustomerProgressResult> {
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
      ok: true,
      vps_id: vps.vps_id,
      ip_address: null,
      progress_lines: [],
      heartbeat_age_sec: null,
      heartbeat_stale: false,
      inferred_stage: 'unknown',
      vps_ip_pending: true,
    }
  }

  // One-shot SSH: tail log + emit a sentinel + cat heartbeat. The
  // `|| true` keeps the pipeline alive when either file is missing
  // (e.g., setup-script hasn't created /var/log yet on a freshly
  // booted VPS).
  const tmpDir = mkdtempSync(join(tmpdir(), 'weuseai-customer-progress-'))
  const keyPath = join(tmpDir, 'fleet-key')
  try {
    const normalised = deps.fleetSshPrivateKey.endsWith('\n')
      ? deps.fleetSshPrivateKey
      : deps.fleetSshPrivateKey + '\n'
    writeFileSync(keyPath, normalised, { encoding: 'utf8' })
    chmodSync(keyPath, 0o600)

    const exec = deps.exec ?? defaultExec
    const remoteCmd =
      `tail -n ${PROGRESS_TAIL_LINES} /var/log/weuseai-setup.log 2>/dev/null || true; ` +
      `echo ---HEARTBEAT---; ` +
      `cat /var/log/hermes-install.heartbeat 2>/dev/null || true`
    const sshArgs = [
      '-i', keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`,
      `root@${vps.ip_address}`,
      remoteCmd,
    ]
    const result = await exec('ssh', sshArgs)
    if (!result.ok) {
      return {
        ok: false,
        status: 502,
        error: 'ssh_unreachable',
        detail: `exit=${result.exitCode} stderr=${result.stderr.slice(0, 300)}`,
      }
    }

    const { progressLines, heartbeatTs } = parseProgressOutput(result.stdout)
    const now = deps.now?.() ?? new Date()
    const heartbeatAgeSec = heartbeatTs
      ? Math.max(0, Math.round((now.getTime() - heartbeatTs.getTime()) / 1000))
      : null
    const heartbeatStale =
      heartbeatAgeSec !== null && heartbeatAgeSec > HEARTBEAT_STALE_THRESHOLD_SEC

    return {
      ok: true,
      vps_id: vps.vps_id,
      ip_address: vps.ip_address,
      progress_lines: progressLines,
      heartbeat_age_sec: heartbeatAgeSec,
      heartbeat_stale: heartbeatStale,
      inferred_stage: inferStage(progressLines),
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

// ─── helpers ───────────────────────────────────────────────────────────

function parseProgressOutput(stdout: string): {
  progressLines: string[]
  heartbeatTs: Date | null
} {
  const parts = stdout.split('---HEARTBEAT---')
  const logPart = parts[0] ?? ''
  const heartbeatPart = (parts[1] ?? '').trim()

  const progressLines = logPart
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(-PROGRESS_TAIL_LINES)

  let heartbeatTs: Date | null = null
  if (heartbeatPart) {
    const parsed = new Date(heartbeatPart)
    if (!Number.isNaN(parsed.getTime())) {
      heartbeatTs = parsed
    }
  }

  return { progressLines, heartbeatTs }
}

type InferredStage =
  | 'apt_install'
  | 'hermes_install'
  | 'hermes_verifying'
  | 'gateway_install'
  | 'gateway_starting'
  | 'bundle_install'
  | 'setup_complete'
  | 'unknown'

function inferStage(progressLines: string[]): InferredStage {
  // Walk from the most recent line backward; first match wins.
  for (let i = progressLines.length - 1; i >= 0; i--) {
    const line = progressLines[i]
    if (/setup COMPLETE/i.test(line)) return 'setup_complete'
    if (/Hermes binary verified/i.test(line)) return 'hermes_verifying'
    if (/Installing Hermes gateway/i.test(line)) return 'gateway_install'
    if (/Starting Hermes gateway service/i.test(line)) return 'gateway_starting'
    if (/Installing Hermes \(pinned/i.test(line)) return 'hermes_install'
    if (/Installing agent-pack bundle/i.test(line)) return 'bundle_install'
    if (/(?:Updating apt|Installing base packages)/i.test(line)) return 'apt_install'
  }
  return 'unknown'
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
