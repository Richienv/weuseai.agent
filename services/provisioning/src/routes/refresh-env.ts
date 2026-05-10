/**
 * /refresh-env endpoint handler — Track 3a of the agent-activation-gap
 * cascade (2026-05-10).
 *
 * Spec: docs/design/2026-05-10-vps-config-refresh.md
 *
 * What it does:
 *   1. Look up customer's existing VPS via vps_instances.
 *   2. Decrypt the customer's current bot token (service-role RPC).
 *   3. SSH into the VPS using the FLEET_SSH_PRIVATE_KEY, atomically
 *      rewrite /home/weuseai/.hermes/.env for the requested env keys,
 *      restart hermes-gateway, verify it came back up.
 *   4. Record the request_id in refresh_env_requests for idempotency
 *      dedup (10 min TTL).
 *
 * Why this exists: the prior provisioning.spinUp() returns the existing
 * VPS without touching .env. Customers paid before the per-customer-bot
 * architecture (Pair-flow Option A, 2026-05-09) shipped have stale .env
 * — Hermes polls Telegram with the wrong / no bot token. This route is
 * the "self-healing for cloud-init env drift" mechanism: complete-
 * onboarding always calls it (Track 3b), admin can trigger it manually
 * (Track 3c).
 *
 * Auth: bearer token at the Express middleware layer (existing
 * PROVISIONING_AUTH_TOKEN gate). This file is pure request → SSH
 * translation.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─── allowed env keys ──────────────────────────────────────────────

/**
 * Whitelist of env keys this route knows how to source + write. Adding
 * a new key here requires adding the source path in fetchEnvValues
 * below. Intentionally narrow — refresh-env is NOT a generic "exec
 * arbitrary script on customer VPS" endpoint.
 */
export const ALLOWED_ENV_KEYS = ['TELEGRAM_BOT_TOKEN', 'OPENROUTER_API_KEY'] as const
export type AllowedEnvKey = (typeof ALLOWED_ENV_KEYS)[number]

// ─── request / response types ──────────────────────────────────────

export type RefreshEnvRequest = {
  customer_id: string
  /** Optional explicit set of keys to update. Defaults to
   *  ['TELEGRAM_BOT_TOKEN'] (the only one with a stable source today). */
  env_keys?: ReadonlyArray<AllowedEnvKey>
  /** Caller-supplied UUID for idempotency. If the same id is replayed
   *  within 10 min, server returns the cached outcome. */
  request_id: string
}

export type RefreshEnvSuccess = {
  ok: true
  vps_id: string
  ip_address: string
  applied: { [K in AllowedEnvKey]?: 'updated' | 'unchanged' }
  hermes_restart_at: string
  hermes_active_after_restart: boolean
  request_id: string
}

export type RefreshEnvFailureError =
  | 'no_active_vps'
  | 'no_bot_token'
  | 'ssh_unreachable'
  | 'ssh_auth_failed'
  | 'env_write_failed'
  | 'systemd_restart_failed'
  | 'hermes_inactive_after_restart'
  | 'invalid_field'
  | 'internal'

export type RefreshEnvFailure = {
  ok: false
  error: RefreshEnvFailureError
  detail?: string
  partial?: {
    env_written?: boolean
    systemd_restarted?: boolean
  }
  request_id?: string
}

export type RefreshEnvResult = RefreshEnvSuccess | RefreshEnvFailure

// ─── injected deps ─────────────────────────────────────────────────

export interface IRefreshEnvStore {
  /** Returns null when no VPS row exists for the customer. */
  findActiveVPSByCustomer(customerId: string): Promise<{
    vps_id: string
    ip_address: string | null
    status: string
  } | null>

  /** Idempotency dedup. Returns the cached row if request_id was
   *  recorded within the last 10 minutes AND completed_at is set.
   *  Returns null otherwise (or for stale rows). */
  findRefreshRequest(requestId: string): Promise<{
    customerId: string
    outcome: unknown
    completedAt?: Date
  } | null>

  /** Insert a started_at row before the SSH dispatch. Tracks in-flight
   *  requests so a fast double-fire can also dedup (we check both
   *  completedAt presence + age). */
  recordRefreshRequestStart(requestId: string, customerId: string): Promise<void>

  /** Update the row with the response body once SSH completes. */
  recordRefreshRequestComplete(requestId: string, outcome: unknown): Promise<void>

  /** Decrypts the customer's bot token via Supabase RPC
   *  (decrypt_bot_token). Returns null when no token persisted. */
  getDecryptedBotToken(customerId: string): Promise<string | null>
}

export type RefreshEnvDeps = {
  fleetPrivateKey: string
  runSsh?: (args: {
    host: string
    user: string
    privateKeyPath: string
    command: string
  }) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
  store: IRefreshEnvStore
}

// ─── pure: build remote bash command ───────────────────────────────

/**
 * Build a remote bash payload that:
 *   1. Atomically rewrites /home/weuseai/.hermes/.env for the given
 *      env keys (via awk + tmpfile + mv).
 *   2. Restarts hermes-gateway via sudo systemctl.
 *   3. Asserts is-active after restart, exits non-zero with a known
 *      marker if not (so the caller can surface
 *      hermes_inactive_after_restart).
 *
 * Pure — no SSH side-effect. Tested directly via string assertions
 * (escapes, restart-once-only, etc.).
 */
export function buildRefreshEnvCommand(
  envValues: Partial<Record<AllowedEnvKey, string>>,
): string {
  const entries = Object.entries(envValues) as Array<[AllowedEnvKey, string]>
  if (entries.length === 0) {
    throw new Error('buildRefreshEnvCommand: at least one env key required')
  }
  for (const [k, v] of entries) {
    if (!ALLOWED_ENV_KEYS.includes(k)) {
      throw new Error(`buildRefreshEnvCommand: unknown env key ${k}`)
    }
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`buildRefreshEnvCommand: empty value for ${k}`)
    }
  }

  // Each rewrite is a self-contained awk + atomic mv. Doing them
  // sequentially (not as a single multi-key awk) keeps the pure helper
  // simple at the cost of N syscalls per refresh. Worth it for clarity.
  const rewrites = entries
    .map(([key, value]) => {
      const escaped = shellSingleQuote(value)
      return [
        `KEY='${key}'`,
        `VAL=${escaped}`,
        `awk -v key="$KEY" -v val="$VAL" '`,
        `  BEGIN { found=0 }`,
        `  $0 ~ "^"key"=" { print key"="val; found=1; next }`,
        `  { print }`,
        `  END { if (!found) print key"="val }`,
        `' "$ENV_FILE" > /tmp/.env.refresh && \\`,
        `  sudo mv /tmp/.env.refresh "$ENV_FILE" && \\`,
        `  sudo chown weuseai:weuseai "$ENV_FILE" && \\`,
        `  sudo chmod 600 "$ENV_FILE"`,
      ].join('\n')
    })
    .join('\n\n')

  return `set -euo pipefail
ENV_FILE=/home/weuseai/.hermes/.env

${rewrites}

sudo systemctl restart hermes-gateway

# Assert hermes-gateway is back up after restart. Exit with a known
# marker so the caller can detect this specific failure mode and
# surface hermes_inactive_after_restart instead of a generic 5xx.
sleep 2
ACTIVE=$(systemctl is-active hermes-gateway || true)
if [ "$ACTIVE" != "active" ]; then
  echo "hermes-gateway-is-active=$ACTIVE" >&2
  exit 3
fi

echo "ok restarted=$(date -u +%FT%TZ)"
`
}

/**
 * POSIX-safe shell single-quote. Wraps the value in single quotes and
 * escapes embedded single quotes as `'\''`. Defends buildRefreshEnvCommand
 * against shell-injection if a future env key value contains
 * `'`, `$(...)`, etc.
 */
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// ─── default SSH runner (mirrors tier-bump for consistency) ────────

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
        '-o', 'BatchMode=yes',
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

// ─── private key tmpfile (same shape as tier-bump) ─────────────────

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

export async function refreshEnvHandler(
  req: RefreshEnvRequest,
  deps: RefreshEnvDeps,
): Promise<RefreshEnvResult> {
  // ── Validate ──
  if (!req || typeof req !== 'object') {
    return { ok: false, error: 'invalid_field', detail: 'body must be an object' }
  }
  if (typeof req.customer_id !== 'string' || req.customer_id.length === 0) {
    return { ok: false, error: 'invalid_field', detail: 'invalid customer_id' }
  }
  if (typeof req.request_id !== 'string' || req.request_id.length === 0) {
    return { ok: false, error: 'invalid_field', detail: 'invalid request_id' }
  }
  const envKeys: ReadonlyArray<AllowedEnvKey> = req.env_keys ?? ['TELEGRAM_BOT_TOKEN']
  for (const k of envKeys) {
    if (!ALLOWED_ENV_KEYS.includes(k)) {
      return {
        ok: false,
        error: 'invalid_field',
        detail: `unknown env key: ${k}`,
        request_id: req.request_id,
      }
    }
  }

  // ── Idempotency dedup (10 min TTL) ──
  const cached = await deps.store.findRefreshRequest(req.request_id)
  if (cached && cached.completedAt) {
    const ageMs = Date.now() - cached.completedAt.getTime()
    if (ageMs < 10 * 60 * 1000) {
      return cached.outcome as RefreshEnvResult
    }
  }

  // ── Fleet key sanity ──
  if (!deps.fleetPrivateKey || deps.fleetPrivateKey.length < 64) {
    return {
      ok: false,
      error: 'internal',
      detail: 'fleet private key not configured (FLEET_SSH_PRIVATE_KEY env)',
      request_id: req.request_id,
    }
  }

  // ── VPS lookup ──
  const vps = await deps.store.findActiveVPSByCustomer(req.customer_id)
  if (!vps) {
    const out: RefreshEnvFailure = {
      ok: false,
      error: 'no_active_vps',
      request_id: req.request_id,
    }
    return out
  }
  if (!vps.ip_address) {
    return {
      ok: false,
      error: 'no_active_vps',
      detail: 'vps row exists but ip_address is null',
      request_id: req.request_id,
    }
  }

  // ── Source env values ──
  // Today the only sourced key is TELEGRAM_BOT_TOKEN (decrypted via
  // Supabase RPC). OPENROUTER_API_KEY is in the allowlist for future
  // use but not yet mapped to a source — reject if requested for now.
  const envValues: Partial<Record<AllowedEnvKey, string>> = {}
  for (const key of envKeys) {
    if (key === 'TELEGRAM_BOT_TOKEN') {
      const tok = await deps.store.getDecryptedBotToken(req.customer_id)
      if (!tok) {
        const out: RefreshEnvFailure = {
          ok: false,
          error: 'no_bot_token',
          detail: 'customer has no decryptable bot token',
          request_id: req.request_id,
        }
        await recordOutcome(deps.store, req.request_id, req.customer_id, out)
        return out
      }
      envValues.TELEGRAM_BOT_TOKEN = tok
    } else if (key === 'OPENROUTER_API_KEY') {
      // Future: source from customers.openrouter_api_key (or the
      // openrouter_keys table). For now, reject so we never write
      // garbage to the VPS.
      return {
        ok: false,
        error: 'invalid_field',
        detail: `${key} not yet wired to a source — currently TELEGRAM_BOT_TOKEN only`,
        request_id: req.request_id,
      }
    }
  }

  // ── Record start ──
  await deps.store.recordRefreshRequestStart(req.request_id, req.customer_id)

  // ── SSH ──
  const command = buildRefreshEnvCommand(envValues)
  const runSsh = deps.runSsh ?? defaultRunSsh
  const { path, cleanup } = writePrivateKeyTmpfile(deps.fleetPrivateKey)
  let sshResult: { ok: true; stdout: string } | { ok: false; error: string }
  try {
    sshResult = await runSsh({
      host: vps.ip_address,
      user: 'weuseai',
      privateKeyPath: path,
      command,
    })
  } finally {
    cleanup()
  }

  if (!sshResult.ok) {
    const out = mapSshFailure(sshResult.error, req.request_id)
    await recordOutcome(deps.store, req.request_id, req.customer_id, out)
    return out
  }

  // ── Success ──
  const restartedMatch = /restarted=([0-9TZ:.-]+)/.exec(sshResult.stdout)
  const hermesRestartAt = restartedMatch?.[1] ?? new Date().toISOString()
  const applied: { [K in AllowedEnvKey]?: 'updated' | 'unchanged' } = {}
  for (const k of Object.keys(envValues) as AllowedEnvKey[]) {
    // We don't currently diff before-vs-after — assume 'updated'. A
    // future iteration could capture pre-state via a paired SSH read
    // and report 'unchanged' when value matched. For now the contract
    // is just "post-condition: value matches what we sent".
    applied[k] = 'updated'
  }
  const out: RefreshEnvSuccess = {
    ok: true,
    vps_id: vps.vps_id,
    ip_address: vps.ip_address,
    applied,
    hermes_restart_at: hermesRestartAt,
    hermes_active_after_restart: true,
    request_id: req.request_id,
  }
  await recordOutcome(deps.store, req.request_id, req.customer_id, out)
  return out
}

// ─── helpers ───────────────────────────────────────────────────────

function mapSshFailure(error: string, requestId: string): RefreshEnvFailure {
  // Pattern-match the SSH stderr tail to choose the right error code.
  if (/Permission denied|publickey|password/i.test(error)) {
    return {
      ok: false,
      error: 'ssh_auth_failed',
      detail: error,
      request_id: requestId,
    }
  }
  if (/Connection refused|timed out|No route to host|connect to host/i.test(error)) {
    return {
      ok: false,
      error: 'ssh_unreachable',
      detail: error,
      request_id: requestId,
    }
  }
  if (/hermes-gateway-is-active=/i.test(error)) {
    return {
      ok: false,
      error: 'hermes_inactive_after_restart',
      detail: error,
      partial: { env_written: true, systemd_restarted: true },
      request_id: requestId,
    }
  }
  if (/systemctl restart/i.test(error)) {
    return {
      ok: false,
      error: 'systemd_restart_failed',
      detail: error,
      partial: { env_written: true },
      request_id: requestId,
    }
  }
  // Default: assume env-write failed (we abort early on awk/mv issues).
  return {
    ok: false,
    error: 'env_write_failed',
    detail: error,
    partial: { env_written: false },
    request_id: requestId,
  }
}

async function recordOutcome(
  store: IRefreshEnvStore,
  requestId: string,
  customerId: string,
  outcome: RefreshEnvResult,
): Promise<void> {
  try {
    // Ensure the start-row exists (in case we returned early before
    // reaching SSH dispatch).
    await store.recordRefreshRequestStart(requestId, customerId)
  } catch { /* idempotent — start may already exist */ }
  try {
    await store.recordRefreshRequestComplete(requestId, outcome)
  } catch { /* swallow — completion log failure shouldn't crash response */ }
}
