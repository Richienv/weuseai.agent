/**
 * /tier-bump endpoint handler — Phase 2E-3.
 *
 * Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q2 — via provisioning service).
 *
 * Called by the Supabase customer-tier-bump Edge Function. SSH into the
 * customer's VPS using the FLEET SSH key, edit /home/weuseai/.hermes/.env
 * to update WEUSEAI_TIER, restart hermes-gateway. The drop-in's ExecStartPre
 * (`+/usr/local/bin/weuseai-bundle-pull`, Phase 2E-2) re-runs on restart,
 * applies the new tier filter, installs/removes SKILL.md files accordingly.
 *
 * Auth model: the bearer token check happens at the Express middleware
 * level (existing PROVISIONING_AUTH_TOKEN gate). This file is purely the
 * request → SSH translation.
 *
 * Fleet SSH key:
 *   - One keypair shared across all weuseai-fleet VPSes.
 *   - Public key written to /home/weuseai/.ssh/authorized_keys at provision
 *     time (Phase 2E-3 setup-script.ts addition).
 *   - Private key stored in Fly.io secrets as FLEET_SSH_PRIVATE_KEY.
 *   - This service writes the privkey to a tmpfile per-request, hands the
 *     path to `ssh -i ...`, deletes the tmpfile after.
 *
 * Pre-2E-3 customers (no fleet pubkey installed): one-time migration —
 * SSH in manually with whatever credentials we still have, append the
 * pubkey to authorized_keys. Documented in PR #5 description.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─── input shape ────────────────────────────────────────────────────────

export type TierBumpRouteRequest = {
  customer_id: string
  target_tier: 'starter' | 'pro' | 'studio'
  vps_host: string
}

export type TierBumpRouteResult =
  | { ok: true; restarted_at: string }
  | { ok: false; error: string }

// ─── injected deps (testable) ───────────────────────────────────────────

export type TierBumpDeps = {
  /** PEM-encoded private SSH key. From FLEET_SSH_PRIVATE_KEY env. */
  fleetPrivateKey: string
  /** Optional override for the SSH command runner — tests inject mocks. */
  runSsh?: (args: {
    host: string
    user: string
    privateKeyPath: string
    command: string
  }) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
}

const VALID_TIERS = ['starter', 'pro', 'studio'] as const

function validate(req: TierBumpRouteRequest): { ok: true } | { ok: false; error: string } {
  if (!req || typeof req !== 'object') {
    return { ok: false, error: 'body must be an object' }
  }
  if (typeof req.customer_id !== 'string' || req.customer_id.length < 8) {
    return { ok: false, error: 'invalid customer_id' }
  }
  if (!(VALID_TIERS as readonly string[]).includes(req.target_tier)) {
    return { ok: false, error: `target_tier must be one of ${VALID_TIERS.join(', ')}` }
  }
  if (
    typeof req.vps_host !== 'string' ||
    !/^[\w.-]+$/.test(req.vps_host) ||
    req.vps_host.length < 4
  ) {
    return { ok: false, error: 'invalid vps_host' }
  }
  return { ok: true }
}

// ─── default SSH runner ─────────────────────────────────────────────────

export function defaultRunSsh(args: {
  host: string
  user: string
  privateKeyPath: string
  command: string
}): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ssh',
      [
        '-i', args.privateKeyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ConnectTimeout=15',
        '-o', 'BatchMode=yes',  // never prompt — fail fast if key auth doesn't work
        '-T',
        `${args.user}@${args.host}`,
        args.command,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), 60_000)
    proc.stdout.on('data', (c) => { stdout += c.toString() })
    proc.stderr.on('data', (c) => { stderr += c.toString() })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ ok: true, stdout })
      } else {
        resolve({
          ok: false,
          error: `ssh exit=${code}: ${stderr.trim().slice(-300) || stdout.slice(-300) || 'no output'}`,
        })
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: `spawn error: ${err.message}` })
    })
  })
}

// ─── tmpfile-with-private-key helper ────────────────────────────────────
//
// Writes the PEM-encoded private key to a per-call tmpfile with mode 0600
// so OpenSSH accepts it. Returns the path + a cleanup function to call
// after the SSH invocation completes (success or failure). The cleanup
// is in a finally block so we never leak the privkey to disk after the
// request.

function writePrivateKeyTmpfile(pem: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-fleet-'))
  const path = join(dir, 'id_fleet')
  // OpenSSH requires PEM keys to end with a newline after `-----END ...-----`.
  // Shell capture (`PEM=$(cat keyfile)`) strips trailing newlines, so by the
  // time the key reaches us via env var it may be missing the terminator.
  // Without the trailing \n, ssh -i fails with "invalid format" and falls
  // back to password auth (which BatchMode=yes blocks → exit 255). Append
  // a newline if missing.
  const normalised = pem.endsWith('\n') ? pem : pem + '\n'
  writeFileSync(path, normalised, { encoding: 'utf8' })
  chmodSync(path, 0o600)
  return {
    path,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch { /* swallow */ }
    },
  }
}

// ─── route handler ──────────────────────────────────────────────────────

/**
 * Build the remote command that updates .env and restarts the gateway.
 * Pure for testability — separate from the SSH side-effect.
 */
export function buildRemoteCommand(target_tier: TierBumpRouteRequest['target_tier']): string {
  // sed replaces the existing line OR appends if missing. Restart is via
  // sudo systemctl (the weuseai user has NOPASSWD sudo, set in setup-script).
  // The ExecStartPre re-runs on restart and applies the new tier filter.
  return `set -e
ENV_FILE=/home/weuseai/.hermes/.env
if grep -qE '^WEUSEAI_TIER=' "$ENV_FILE"; then
  sudo sed -i "s/^WEUSEAI_TIER=.*/WEUSEAI_TIER=${target_tier}/" "$ENV_FILE"
else
  echo "WEUSEAI_TIER=${target_tier}" | sudo tee -a "$ENV_FILE" > /dev/null
fi
sudo systemctl restart hermes-gateway
echo "ok restarted=$(date -u +%FT%TZ)"
`
}

/**
 * Execute a tier-bump against the customer's VPS. SSH key auth via
 * tmpfile, runs sed + restart, returns restarted_at on success.
 */
export async function tierBump(
  req: TierBumpRouteRequest,
  deps: TierBumpDeps,
): Promise<TierBumpRouteResult> {
  const v = validate(req)
  if (!v.ok) return { ok: false, error: v.error }

  if (!deps.fleetPrivateKey || deps.fleetPrivateKey.length < 64) {
    return { ok: false, error: 'fleet private key not configured (FLEET_SSH_PRIVATE_KEY env)' }
  }

  const runSsh = deps.runSsh ?? defaultRunSsh
  const command = buildRemoteCommand(req.target_tier)

  const { path, cleanup } = writePrivateKeyTmpfile(deps.fleetPrivateKey)
  try {
    const r = await runSsh({
      host: req.vps_host,
      user: 'weuseai',
      privateKeyPath: path,
      command,
    })
    if (!r.ok) return { ok: false, error: r.error }

    // Parse restarted_at from the trailing echo. Best-effort — if the
    // output doesn't have it, we still report success with current time.
    const m = /restarted=([0-9TZ:.-]+)/.exec(r.stdout)
    const restarted_at = m?.[1] ?? new Date().toISOString()
    return { ok: true, restarted_at }
  } finally {
    cleanup()
  }
}
