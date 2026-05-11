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
// OPENAI_API_KEY added 2026-05-12: it's the canonical name Hermes's
// primary chat-completion path reads (Phase 2A architecture), where
// the value is the OpenRouter sub-key. OPENROUTER_API_KEY (already
// here from a prior latent-bug-noted pass) is what Hermes auxiliary
// tasks read. Both names point at the same key. Allowing both lets
// admin tooling rotate or set them together.
export const ALLOWED_ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
] as const
export type AllowedEnvKey = (typeof ALLOWED_ENV_KEYS)[number]

// ─── request / response types ──────────────────────────────────────

export type RefreshEnvRequest = {
  customer_id: string
  /**
   * Caller-supplied env values. The provisioning service is a "dumb pipe"
   * — it does NOT decrypt or source values from the customers row.
   * Keeping the encryption key in one place (Supabase Edge Function
   * secrets, never on Fly) closes a credential-leak surface and means
   * provisioning has no read path on customers.telegram_bot_token.
   *
   * Callers (complete-onboarding-handler step 8a, admin-customer-vps-
   * refresh) are responsible for decrypting + sourcing values before
   * invoking this route. Pivot from initial design (2026-05-10):
   * the route used to call decrypt_bot_token RPC itself + needed
   * BOT_TOKEN_ENC_KEY as a Fly secret. Caller-supplies-values keeps
   * the encryption key entirely within Supabase.
   */
  env_values: Partial<Record<AllowedEnvKey, string>>
  /** Optional SOUL.md content. When provided, written to
   *  /home/weuseai/.hermes/SOUL.md before hermes-gateway restart.
   *  Closes the dry-run Stage 7 gap where xendit-webhook's first
   *  spinUp doesn't have soulMdContent yet, so the file is empty
   *  on disk until complete-onboarding step 8a sends it via this
   *  field. Per docs/investigation/2026-05-10-fresh-provision-dry-run.md. */
  soul_md_content?: string
  /** Optional pre-approve. Customer's Telegram chat_id. When provided,
   *  written to /home/weuseai/.hermes/pairing/telegram-approved.json
   *  before hermes-gateway restart. Skips Hermes upstream's pairing-
   *  code flow ("Hi~ I don't recognize you yet, ask owner to approve
   *  code XYZ") so the customer's first /start lands directly on the
   *  in-character agent. Idempotent — same chat_id → same disk state. */
  telegram_chat_id?: string
  /** Optional cosmetic display name for the pre-approve entry.
   *  Defaults to 'Customer' when omitted. Only affects what shows
   *  in `hermes pairing list`. */
  telegram_user_name?: string
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
  opts: {
    soulMdContent?: string
    telegramChatId?: string
    telegramUserName?: string
  } = {},
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

  // Optional SOUL.md write. Heredoc with random delimiter to avoid
  // collisions if customer's persona contains common shell tokens.
  // Per dry-run Stage 7: closes the gap where SOUL.md never reaches
  // the VPS through the canonical xendit-webhook path.
  const soulBlock = opts.soulMdContent
    ? `
# Write SOUL.md (caller-supplied persona content).
SOUL_PATH=/home/weuseai/.hermes/SOUL.md
sudo mkdir -p /home/weuseai/.hermes
sudo tee "$SOUL_PATH" > /dev/null <<'WEUSEAI_SOUL_REFRESH_EOF'
${opts.soulMdContent}
WEUSEAI_SOUL_REFRESH_EOF
sudo chown weuseai:weuseai "$SOUL_PATH"
sudo chmod 0644 "$SOUL_PATH"
`
    : ''

  // Optional pre-approve. Writes customer's chat_id directly into
  // /home/weuseai/.hermes/pairing/telegram-approved.json so Hermes
  // recognises them on first /start (skips the
  // "Hi~ I don't recognize you yet, here's a pairing code" prompt).
  // Atomic via python tempfile + os.rename. Idempotent — same chat_id
  // → same disk content (preserves existing approved_at). Validates
  // chat_id is digits-only to defend against shell/JSON injection.
  const preApproveBlock = opts.telegramChatId
    ? (() => {
        if (!/^\d+$/.test(opts.telegramChatId)) {
          throw new Error(
            `buildRefreshEnvCommand: telegramChatId must be digits-only (got: ${opts.telegramChatId.slice(0, 30)})`,
          )
        }
        const userName = (opts.telegramUserName ?? 'Customer').replace(
          /[^A-Za-z0-9 ._-]/g,
          '',
        ).slice(0, 80) || 'Customer'
        return `
# Pre-approve customer's Telegram chat_id so Hermes skips the
# pairing-code flow on first /start. Atomic JSON merge via python.
PAIRING_DIR=/home/weuseai/.hermes/pairing
APPROVED_PATH="$PAIRING_DIR/telegram-approved.json"
sudo -u weuseai mkdir -p "$PAIRING_DIR"
sudo -u weuseai python3 - <<'WEUSEAI_PREAPPROVE_EOF'
import json, os, time, tempfile
path = "/home/weuseai/.hermes/pairing/telegram-approved.json"
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        data = {}  # corrupt or unreadable → start fresh; safer than abort
chat_id = "${opts.telegramChatId}"
if chat_id not in data:
    data[chat_id] = {"user_name": "${userName}", "approved_at": time.time()}
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".approved.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
        os.replace(tmp, path)
        print(f"pre-approved chat_id={chat_id}")
    except Exception:
        try: os.unlink(tmp)
        except OSError: pass
        raise
else:
    print(f"chat_id={chat_id} already approved — no-op")
WEUSEAI_PREAPPROVE_EOF
`
      })()
    : ''

  // Auto-install hermes-gateway if absent. Closes the dry-run Stage 5
  // gap: when xendit-webhook's first spinUp ran with hasTelegram=false
  // (Fix #1), setup-script SKIPPED the gateway install + start. This
  // refresh call is the first time we have a real bot token, so install
  // the gateway here if it's not already present.
  // Idempotent: 'gateway install' is safe to re-run; we use systemctl
  // list-unit-files to detect presence cheaply.
  const installIfMissingBlock = `
# Detect + install hermes-gateway if missing (post-Fix-#1 self-heal).
HERMES_BIN=/home/weuseai/.local/bin/hermes
GATEWAY_UNIT=/etc/systemd/system/hermes-gateway.service
if [ ! -f "$GATEWAY_UNIT" ]; then
  echo "hermes-gateway unit missing — installing now..." >&2
  if [ ! -x "$HERMES_BIN" ]; then
    echo "ERROR: hermes binary not found at $HERMES_BIN — cannot install gateway" >&2
    exit 4
  fi
  sudo "$HERMES_BIN" gateway install --system --run-as-user weuseai >&2 || {
    echo "ERROR: gateway install failed" >&2
    exit 5
  }
  sudo "$HERMES_BIN" gateway start --system >&2 || {
    echo "ERROR: gateway start failed" >&2
    exit 6
  }
  echo "hermes-gateway installed + started" >&2
fi
`

  return `set -euo pipefail
ENV_FILE=/home/weuseai/.hermes/.env

${rewrites}
${soulBlock}${preApproveBlock}${installIfMissingBlock}
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
  // env_values must be a non-empty object whose keys are all allowed.
  if (!req.env_values || typeof req.env_values !== 'object') {
    return {
      ok: false,
      error: 'invalid_field',
      detail: 'env_values must be an object mapping allowed env keys → string values',
      request_id: req.request_id,
    }
  }
  const submittedKeys = Object.keys(req.env_values) as AllowedEnvKey[]
  if (submittedKeys.length === 0) {
    return {
      ok: false,
      error: 'invalid_field',
      detail: 'env_values must include at least one key',
      request_id: req.request_id,
    }
  }
  for (const k of submittedKeys) {
    if (!ALLOWED_ENV_KEYS.includes(k)) {
      return {
        ok: false,
        error: 'invalid_field',
        detail: `unknown env key: ${k}`,
        request_id: req.request_id,
      }
    }
    const v = req.env_values[k]
    if (typeof v !== 'string' || v.length === 0) {
      return {
        ok: false,
        error: 'invalid_field',
        detail: `env_values.${k} must be a non-empty string`,
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

  // ── Caller-supplied env values (no decryption here) ──
  const envValues: Partial<Record<AllowedEnvKey, string>> = {}
  for (const k of submittedKeys) {
    envValues[k] = req.env_values[k]
  }

  // ── Record start ──
  await deps.store.recordRefreshRequestStart(req.request_id, req.customer_id)

  // ── SSH ──
  let command: string
  try {
    command = buildRefreshEnvCommand(envValues, {
      soulMdContent: req.soul_md_content,
      telegramChatId: req.telegram_chat_id,
      telegramUserName: req.telegram_user_name,
    })
  } catch (e) {
    // buildRefreshEnvCommand throws on bad telegram_chat_id (non-digits)
    // so an attacker can't inject shell/JSON via that field.
    return {
      ok: false,
      error: 'invalid_field',
      detail: e instanceof Error ? e.message : String(e),
      request_id: req.request_id,
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
