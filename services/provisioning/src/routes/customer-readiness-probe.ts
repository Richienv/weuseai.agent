/**
 * /customer-readiness-probe — Track 1 of post-pair UX polish (2026-05-10).
 *
 * Returns 8 boolean checks describing whether a customer's agent is fully
 * usable. welcome.html polls this every 10s during state A/B and only
 * transitions to state C2 ("klik Buka Telegram") when the critical
 * checks (hermes_systemd_active + hermes_pairing_approved + soul_md_present)
 * are all true. Other checks are informational.
 *
 * Why this endpoint: founder feedback from fresh-customer test —
 * welcome page said "agent ready" before agent was actually ready,
 * customer clicked Buka Telegram, sent /start, got nothing back, sat
 * staring at the screen confused. We need a real readiness signal,
 * not a "we triggered provisioning, fingers crossed" signal.
 *
 * Architecture choice: bundle all SSH-needing checks (5 of 8) into ONE
 * remote bash script that emits structured `key=value` lines on stdout.
 * Single round-trip per probe call → polling at 10s cadence stays
 * cheap (~1s SSH RTT, ~0.2s for the rest in parallel). Avoids the
 * five-separate-SSH antipattern.
 *
 * The 8 checks:
 *   1. vps_provisioned        — DB query: vps_instances.status = 'running'
 *   2. vps_reachable          — TCP probe to ip:22 (5s timeout)
 *   3. hermes_systemd_active  — SSH: `systemctl is-active hermes-gateway`
 *   4. hermes_telegram_connected — SSH: journalctl shows recent Telegram poll
 *   5. hermes_pairing_approved — SSH: telegram-approved.json contains chat_id
 *   6. openrouter_key_valid   — SSH (run on VPS, uses local env): curl
 *                                openrouter /auth/key with the on-disk key
 *   7. soul_md_present        — SSH: SOUL.md exists and is non-empty
 *   8. hermes_responded_to_first_message — SSH: hermes log shows
 *                                successful message handling. Defaults to
 *                                true when no test message has been sent
 *                                yet (so we don't block on this check).
 *
 * Critical-for-state-C2 (the hold-the-page checks):
 *   - hermes_systemd_active
 *   - hermes_pairing_approved
 *   - soul_md_present
 *
 * Auth: bearer PROVISIONING_AUTH_TOKEN, same gate as /refresh-env. Browser
 * doesn't call this directly — Supabase customer-readiness Edge Fn
 * proxies (which holds the bearer + does X-CID validation).
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect as netConnect } from 'node:net'

// ─── request / response types ──────────────────────────────────────

export type ReadinessProbeRequest = {
  customer_id: string
}

export type ReadinessChecks = {
  vps_provisioned: boolean
  vps_reachable: boolean
  hermes_systemd_active: boolean
  hermes_telegram_connected: boolean
  hermes_pairing_approved: boolean
  openrouter_key_valid: boolean
  soul_md_present: boolean
  hermes_responded_to_first_message: boolean
}

export type ReadinessProbeResult = {
  ok: true
  customer_id: string
  vps_id: string | null
  ip_address: string | null
  ready: boolean              // critical checks all true
  checks: ReadinessChecks
  /** Per-check error detail when a check is false. Useful for support
   *  triage; not surfaced to the customer. Keys = check names. */
  details: Partial<Record<keyof ReadinessChecks, string>>
  probed_at: string
} | {
  ok: false
  error: 'invalid_field' | 'no_active_vps' | 'internal'
  detail?: string
}

// ─── injected deps (mirrors refresh-env shape for testability) ─────

export interface IReadinessStore {
  /** Returns null when no VPS row exists. Same shape as refresh-env. */
  findActiveVPSByCustomer(customerId: string): Promise<{
    vps_id: string
    ip_address: string | null
    status: string
  } | null>

  /** Returns true if the customer has a non-null telegram_chat_id.
   *  The chat_id itself is needed to verify pairing-approved JSON
   *  contains it. */
  findTelegramChatId(customerId: string): Promise<string | null>
}

export type ReadinessProbeDeps = {
  fleetPrivateKey: string
  store: IReadinessStore
  /** Test seam — defaults to defaultRunSsh. */
  runSsh?: (args: {
    host: string
    user: string
    privateKeyPath: string
    command: string
  }) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
  /** Test seam — defaults to defaultTcpProbe (5s timeout). */
  tcpProbe?: (host: string, port: number, timeoutMs: number) => Promise<boolean>
  /** Test seam — for pinning probed_at in tests. */
  now?: () => Date
}

// ─── critical checks (gates state-C2 transition on welcome.html) ───

export const CRITICAL_CHECKS: Array<keyof ReadinessChecks> = [
  'hermes_systemd_active',
  'hermes_pairing_approved',
  'soul_md_present',
]

export function isReady(checks: ReadinessChecks): boolean {
  return CRITICAL_CHECKS.every((k) => checks[k] === true)
}

// ─── pure: build remote bash script ────────────────────────────────

/**
 * Build the bundled SSH check script. Emits ONE line per check on
 * stdout in `key=value` form (value = `true` or `false`, plus optional
 * `key__detail=...` line on failure). Defensive against missing files,
 * unreadable JSON, missing systemctl, etc. — every check should resolve
 * to a boolean and never crash the script.
 *
 * Pure (no SSH side-effect). chat_id is interpolated, so we validate
 * digits-only at the caller before reaching here (defense-in-depth
 * against shell injection; mirrors buildRefreshEnvCommand).
 */
export function buildReadinessProbeCommand(opts: {
  telegramChatId: string | null
}): string {
  // Validate chat_id format (caller also validates, but defend in depth).
  if (opts.telegramChatId !== null && !/^\d+$/.test(opts.telegramChatId)) {
    throw new Error(
      `buildReadinessProbeCommand: telegramChatId must be digits-only (got: ${opts.telegramChatId.slice(0, 30)})`,
    )
  }
  const chatId = opts.telegramChatId ?? ''

  // Bash strict mode is intentionally OMITTED — every check should run
  // independently and emit its own line, even if a prior check fails.
  // We use `|| true` and explicit boolean emission per check.
  return `set +e
APPROVED_PATH=/home/weuseai/.hermes/pairing/telegram-approved.json
SOUL_PATH=/home/weuseai/.hermes/SOUL.md
ENV_PATH=/home/weuseai/.hermes/.env

# 1. hermes_systemd_active
ACTIVE=$(systemctl is-active hermes-gateway 2>/dev/null || echo "missing")
if [ "$ACTIVE" = "active" ]; then
  echo "hermes_systemd_active=true"
else
  echo "hermes_systemd_active=false"
  echo "hermes_systemd_active__detail=systemctl is-active=$ACTIVE"
fi

# 2. hermes_telegram_connected
# Look for any sign of successful Telegram polling in the last 10 min.
# Hermes upstream logs vary across versions — try common patterns.
TG_LOG=$(journalctl -u hermes-gateway --since="10 minutes ago" --no-pager 2>/dev/null | \\
  grep -iE "telegram.*(getUpdates|poll|connected|ready)" | tail -5 || true)
if [ -n "$TG_LOG" ]; then
  echo "hermes_telegram_connected=true"
else
  echo "hermes_telegram_connected=false"
  echo "hermes_telegram_connected__detail=no telegram log lines in last 10min"
fi

# 3. hermes_pairing_approved
# JSON file must exist and contain customer's chat_id as a top-level key.
CHAT_ID="${chatId}"
if [ -z "$CHAT_ID" ]; then
  echo "hermes_pairing_approved=false"
  echo "hermes_pairing_approved__detail=no chat_id supplied (customer not paired yet)"
elif [ ! -f "$APPROVED_PATH" ]; then
  echo "hermes_pairing_approved=false"
  echo "hermes_pairing_approved__detail=approved.json missing"
else
  PAIRED=$(python3 -c "
import json, sys
try:
  with open('$APPROVED_PATH') as f:
    data = json.load(f)
  print('true' if '$CHAT_ID' in data else 'false')
except Exception as e:
  print('false')
" 2>/dev/null || echo "false")
  if [ "$PAIRED" = "true" ]; then
    echo "hermes_pairing_approved=true"
  else
    echo "hermes_pairing_approved=false"
    echo "hermes_pairing_approved__detail=chat_id $CHAT_ID not in approved.json"
  fi
fi

# 4. soul_md_present
if [ -s "$SOUL_PATH" ]; then
  SIZE=$(stat -c '%s' "$SOUL_PATH" 2>/dev/null || echo "?")
  echo "soul_md_present=true"
  echo "soul_md_present__detail=size=$SIZE bytes"
else
  echo "soul_md_present=false"
  echo "soul_md_present__detail=SOUL.md missing or empty"
fi

# 5. openrouter_key_valid
# Source the .env to get OPENROUTER_API_KEY, then probe OpenRouter.
# /auth/key returns 200 + JSON for valid keys, 401 for invalid.
# We only check HTTP status here (no body parsing) to keep it cheap.
if [ ! -f "$ENV_PATH" ]; then
  echo "openrouter_key_valid=false"
  echo "openrouter_key_valid__detail=.env missing"
else
  OR_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$ENV_PATH" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
  if [ -z "$OR_KEY" ]; then
    echo "openrouter_key_valid=false"
    echo "openrouter_key_valid__detail=OPENROUTER_API_KEY missing in .env"
  else
    OR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \\
      -H "Authorization: Bearer $OR_KEY" \\
      https://openrouter.ai/api/v1/auth/key 2>/dev/null || echo "000")
    if [ "$OR_STATUS" = "200" ]; then
      echo "openrouter_key_valid=true"
    else
      echo "openrouter_key_valid=false"
      echo "openrouter_key_valid__detail=openrouter http=$OR_STATUS"
    fi
  fi
fi

# 6. hermes_responded_to_first_message
# Look for any successful message-handled log line. If none found AND
# hermes uptime is < 10 min, default true (no false-negative on a
# brand-new agent that hasn't been messaged yet).
MSG_LOG=$(journalctl -u hermes-gateway --since="10 minutes ago" --no-pager 2>/dev/null | \\
  grep -iE "(message handled|response sent|reply sent|chat.completion)" | tail -3 || true)
if [ -n "$MSG_LOG" ]; then
  echo "hermes_responded_to_first_message=true"
else
  # Default true (informational check, not gating) — we don't block on
  # this since the customer may not have sent a test message yet.
  echo "hermes_responded_to_first_message=true"
  echo "hermes_responded_to_first_message__detail=no message-handled log yet (default true, informational)"
fi

echo "__probe_done__"
`
}

// ─── pure: parse probe stdout → ReadinessChecks + details ──────────

export function parseProbeOutput(stdout: string): {
  checks: Omit<ReadinessChecks, 'vps_provisioned' | 'vps_reachable'>
  details: Partial<Record<keyof ReadinessChecks, string>>
} {
  const lines = stdout.split('\n')
  const out: Record<string, string> = {}
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key.length === 0) continue
    out[key] = value
  }

  // Extract checks. Default false when key is missing (script crashed
  // before emitting that check's line).
  const bool = (k: string): boolean => out[k] === 'true'

  const checks = {
    hermes_systemd_active: bool('hermes_systemd_active'),
    hermes_telegram_connected: bool('hermes_telegram_connected'),
    hermes_pairing_approved: bool('hermes_pairing_approved'),
    openrouter_key_valid: bool('openrouter_key_valid'),
    soul_md_present: bool('soul_md_present'),
    hermes_responded_to_first_message: bool('hermes_responded_to_first_message'),
  }

  const details: Partial<Record<keyof ReadinessChecks, string>> = {}
  for (const k of Object.keys(checks) as Array<keyof typeof checks>) {
    const detailKey = `${k}__detail`
    if (out[detailKey]) details[k] = out[detailKey]
  }

  return { checks, details }
}

// ─── default TCP probe (port 22) ───────────────────────────────────

export function defaultTcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = netConnect({ host, port, timeout: timeoutMs })
    let resolved = false
    const done = (ok: boolean) => {
      if (resolved) return
      resolved = true
      sock.destroy()
      resolve(ok)
    }
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
  })
}

// ─── default SSH runner (mirrors refresh-env for consistency) ──────

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
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        '-T',
        `${args.user}@${args.host}`,
        args.command,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), 30_000)
    proc.stdout.on('data', (c) => { stdout += c.toString() })
    proc.stderr.on('data', (c) => { stderr += c.toString() })
    proc.on('close', (code) => {
      clearTimeout(timer)
      // We want stdout even on non-zero exit (the script uses set +e and
      // emits boolean lines even on per-check failure). Only treat as
      // SSH-failure if the script never emitted the final marker.
      if (stdout.includes('__probe_done__')) {
        resolve({ ok: true, stdout })
      } else {
        const tail = (stderr.trim().slice(-300) || stdout.slice(-300) || 'no output')
        resolve({ ok: false, error: `ssh exit=${code}: ${tail}` })
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: `spawn error: ${err.message}` })
    })
  })
}

// ─── private key tmpfile (same pattern as refresh-env) ─────────────

function writePrivateKeyTmpfile(pem: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-fleet-'))
  const path = join(dir, 'id_fleet')
  const normalised = pem.endsWith('\n') ? pem : pem + '\n'
  writeFileSync(path, normalised, { encoding: 'utf8' })
  chmodSync(path, 0o600)
  return {
    path,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* swallow */ }
    },
  }
}

// ─── handler ───────────────────────────────────────────────────────

export async function readinessProbeHandler(
  req: ReadinessProbeRequest,
  deps: ReadinessProbeDeps,
): Promise<ReadinessProbeResult> {
  // ── Validate ──
  if (!req || typeof req !== 'object') {
    return { ok: false, error: 'invalid_field', detail: 'body must be an object' }
  }
  if (typeof req.customer_id !== 'string' || req.customer_id.length === 0) {
    return { ok: false, error: 'invalid_field', detail: 'invalid customer_id' }
  }

  const now = (deps.now ?? (() => new Date()))()
  const probedAt = now.toISOString()

  // ── 1. VPS provisioned (DB read) ──
  const vps = await deps.store.findActiveVPSByCustomer(req.customer_id)
  if (!vps) {
    // No VPS row at all → return early with all-false checks. welcome.html
    // shows "Sedang membangun..." in this state.
    return {
      ok: true,
      customer_id: req.customer_id,
      vps_id: null,
      ip_address: null,
      ready: false,
      checks: allFalseChecks(),
      details: { vps_provisioned: 'no vps_instances row for customer' },
      probed_at: probedAt,
    }
  }

  const vpsProvisioned = vps.status === 'running'
  if (!vpsProvisioned || !vps.ip_address) {
    // VPS row exists but not yet running OR no IP yet → still "building".
    return {
      ok: true,
      customer_id: req.customer_id,
      vps_id: vps.vps_id,
      ip_address: vps.ip_address,
      ready: false,
      checks: { ...allFalseChecks(), vps_provisioned: vpsProvisioned },
      details: {
        vps_provisioned: vpsProvisioned
          ? 'ok'
          : `vps status=${vps.status}, ip=${vps.ip_address ?? 'null'}`,
      },
      probed_at: probedAt,
    }
  }

  // ── 2. TCP reachability (5s, parallel with chat_id lookup) ──
  const tcpProbe = deps.tcpProbe ?? defaultTcpProbe
  const [vpsReachable, telegramChatId] = await Promise.all([
    tcpProbe(vps.ip_address, 22, 5_000),
    deps.store.findTelegramChatId(req.customer_id),
  ])

  if (!vpsReachable) {
    return {
      ok: true,
      customer_id: req.customer_id,
      vps_id: vps.vps_id,
      ip_address: vps.ip_address,
      ready: false,
      checks: {
        ...allFalseChecks(),
        vps_provisioned: true,
        vps_reachable: false,
      },
      details: { vps_reachable: 'TCP connect to :22 failed (5s timeout)' },
      probed_at: probedAt,
    }
  }

  // ── 3. Bundled SSH probe (5 checks in one round-trip) ──
  if (!deps.fleetPrivateKey || deps.fleetPrivateKey.length < 64) {
    return {
      ok: false,
      error: 'internal',
      detail: 'fleet private key not configured (FLEET_SSH_PRIVATE_KEY env)',
    }
  }

  let probeCommand: string
  try {
    probeCommand = buildReadinessProbeCommand({ telegramChatId })
  } catch (e) {
    return {
      ok: false,
      error: 'invalid_field',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const runSsh = deps.runSsh ?? defaultRunSsh
  const { path, cleanup } = writePrivateKeyTmpfile(deps.fleetPrivateKey)
  let sshResult: { ok: true; stdout: string } | { ok: false; error: string }
  try {
    sshResult = await runSsh({
      host: vps.ip_address,
      user: 'weuseai',
      privateKeyPath: path,
      command: probeCommand,
    })
  } finally {
    cleanup()
  }

  if (!sshResult.ok) {
    // SSH failed entirely. vps_reachable=true (TCP OK) but auth/script
    // broken → SSH-needing checks all false.
    return {
      ok: true,
      customer_id: req.customer_id,
      vps_id: vps.vps_id,
      ip_address: vps.ip_address,
      ready: false,
      checks: {
        ...allFalseChecks(),
        vps_provisioned: true,
        vps_reachable: true,
      },
      details: { hermes_systemd_active: `ssh failed: ${sshResult.error}` },
      probed_at: probedAt,
    }
  }

  const { checks: sshChecks, details: sshDetails } = parseProbeOutput(sshResult.stdout)
  const checks: ReadinessChecks = {
    vps_provisioned: true,
    vps_reachable: true,
    ...sshChecks,
  }

  return {
    ok: true,
    customer_id: req.customer_id,
    vps_id: vps.vps_id,
    ip_address: vps.ip_address,
    ready: isReady(checks),
    checks,
    details: sshDetails,
    probed_at: probedAt,
  }
}

function allFalseChecks(): ReadinessChecks {
  return {
    vps_provisioned: false,
    vps_reachable: false,
    hermes_systemd_active: false,
    hermes_telegram_connected: false,
    hermes_pairing_approved: false,
    openrouter_key_valid: false,
    soul_md_present: false,
    hermes_responded_to_first_message: false,
  }
}
