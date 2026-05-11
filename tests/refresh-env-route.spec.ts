// services/provisioning POST /refresh-env — pure handler tests.
//
// Track 3a of the agent-activation-gap cascade. Lets the platform
// SSH-update a customer's existing VPS .env (TELEGRAM_BOT_TOKEN at
// minimum), restart Hermes, verify the restart took. The route is
// the rescue mechanism for the architectural gap documented in
// docs/investigation/2026-05-10-agent-activation-gap.md (Bug #3).
//
// Design: docs/design/2026-05-10-vps-config-refresh.md
//
// Two layers tested here:
//   1. Pure remote-command builder (escapes bot tokens with `:` `/`
//      `$` correctly + atomic awk-rewrite + restart + verify).
//   2. Pure handler (validate body, idempotency dedup, SSH dispatch,
//      success / failure / partial-failure shaping).

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRefreshEnvCommand,
  refreshEnvHandler,
  type RefreshEnvDeps,
  type RefreshEnvRequest,
  type RefreshEnvResult,
} from '../services/provisioning/src/routes/refresh-env.js'

// ─── Layer 1: buildRefreshEnvCommand string builder ───────────────

test('builds command for single key (TELEGRAM_BOT_TOKEN)', () => {
  const cmd = buildRefreshEnvCommand({
    TELEGRAM_BOT_TOKEN: '123456789:ABCDEF_xyz-token',
  })
  // Must atomic-write via tmpfile + mv.
  assert.match(cmd, /\/tmp\/\.env\.refresh/)
  assert.match(cmd, /\bmv\b/)
  // Must restart hermes-gateway.
  assert.match(cmd, /systemctl restart hermes-gateway/)
  // Must verify is-active after restart.
  assert.match(cmd, /systemctl is-active hermes-gateway/)
  // Must reference the env key + value.
  assert.match(cmd, /TELEGRAM_BOT_TOKEN/)
  assert.match(cmd, /123456789:ABCDEF_xyz-token/)
})

test('escapes single quotes in env values to prevent shell injection', async () => {
  // Hypothetical token containing dangerous chars. Telegram tokens
  // wouldn't legitimately contain these, but defending against the
  // general case keeps the helper safe for future env keys.
  const evil = "evil'$(rm -rf /)token"
  const cmd = buildRefreshEnvCommand({ TELEGRAM_BOT_TOKEN: evil })
  // Round-trip via bash: extract just the `VAL=...` line and have bash
  // evaluate it; the resulting $VAL must equal the literal input. If
  // any part of the value escaped the quotes, bash would either error
  // or interpret $(rm -rf /) as a subshell — neither matches the
  // input string exactly.
  const valLine = cmd
    .split('\n')
    .find((l) => l.trimStart().startsWith('VAL='))
  assert.ok(valLine, 'must emit a VAL=... line')
  // Use sh subshell to eval the assignment, then echo. We use
  // `printf` (no trailing newline) for clean comparison.
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync('bash', [
    '-c',
    `${valLine}\nprintf %s "$VAL"`,
  ], { encoding: 'utf8' })
  assert.equal(r.status, 0, `bash exited ${r.status}: ${r.stderr}`)
  assert.equal(
    r.stdout,
    evil,
    'bash-evaluated VAL must equal the literal input — any divergence means injection',
  )
})

test('rejects empty value (would zero-length the env var)', () => {
  assert.throws(() => buildRefreshEnvCommand({ TELEGRAM_BOT_TOKEN: '' }))
})

test('builds command for multiple keys atomically', () => {
  const cmd = buildRefreshEnvCommand({
    TELEGRAM_BOT_TOKEN: 'aaa:bbb',
    OPENROUTER_API_KEY: 'sk-or-v1-xxx',
  })
  // Must reference both keys in the resulting awk pipeline.
  assert.match(cmd, /TELEGRAM_BOT_TOKEN/)
  assert.match(cmd, /OPENROUTER_API_KEY/)
  // Single restart at the end (not per-key).
  const restarts = cmd.match(/systemctl restart hermes-gateway/g) ?? []
  assert.equal(restarts.length, 1, 'restart hermes only once even with multiple keys')
})

test('builds command for OpenAI + OpenRouter dual-name key (2026-05-12 Fix 2)', () => {
  // Phase 2A architecture: same OpenRouter sub-key, two env var names.
  // OPENAI_API_KEY = Hermes primary chat path (OpenAI-compatible).
  // OPENROUTER_API_KEY = Hermes auxiliary path (compression + titles).
  // refreshEnv must accept both via ALLOWED_ENV_KEYS so admin tooling
  // can rewrite both at once.
  const cmd = buildRefreshEnvCommand({
    OPENAI_API_KEY: 'sk-or-v1-same-value',
    OPENROUTER_API_KEY: 'sk-or-v1-same-value',
  })
  assert.match(cmd, /OPENAI_API_KEY/)
  assert.match(cmd, /OPENROUTER_API_KEY/)
  // Both rewrites must complete before the single hermes restart.
  const restarts = cmd.match(/systemctl restart hermes-gateway/g) ?? []
  assert.equal(restarts.length, 1, 'one restart regardless of key count')
})

test('ALLOWED_ENV_KEYS list (2026-05-12 Fix 2): TELEGRAM_BOT_TOKEN + OPENAI_API_KEY + OPENROUTER_API_KEY', async () => {
  const { ALLOWED_ENV_KEYS } = await import(
    '../services/provisioning/src/routes/refresh-env.ts'
  )
  assert.deepEqual(
    [...ALLOWED_ENV_KEYS].sort(),
    ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'TELEGRAM_BOT_TOKEN'].sort(),
    'OPENAI_API_KEY must be in the allowlist (Phase 2A canonical name for OpenRouter sub-key)',
  )
})

test('rejects unknown env key not in ALLOWED_ENV_KEYS (defense)', () => {
  // Guard against accidental shell injection via key name.
  assert.throws(
    () =>
      buildRefreshEnvCommand({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ['SOME_RANDOM_KEY' as any]: 'evil',
      }),
    /unknown env key/i,
  )
})

// ─── Layer 2: refreshEnvHandler ────────────────────────────────────

const VALID_TOKEN = '8734001154:AAGGTR0PRNCy03aaVPb5qi9hWzxCe5yr_Ek'

class FakeStore {
  refreshRequests = new Map<string, { customerId: string; outcome: unknown; completedAt?: Date }>()
  vps = new Map<string, { ip: string; status: string }>()

  async findActiveVPSByCustomer(cid: string) {
    const v = this.vps.get(cid)
    if (!v) return null
    return { vps_id: 'vps-' + cid, ip_address: v.ip, status: v.status, customer_id: cid, provider: 'idcloudhost', region: 'jkt01', created_at: new Date().toISOString() }
  }
  async findRefreshRequest(requestId: string) {
    return this.refreshRequests.get(requestId) ?? null
  }
  async recordRefreshRequestStart(requestId: string, customerId: string) {
    this.refreshRequests.set(requestId, { customerId, outcome: null })
  }
  async recordRefreshRequestComplete(requestId: string, outcome: unknown) {
    const existing = this.refreshRequests.get(requestId)
    if (existing) {
      this.refreshRequests.set(requestId, { ...existing, outcome, completedAt: new Date() })
    }
  }
  // Pivot 2026-05-10: store no longer decrypts. Caller supplies values.
}

function makeDeps(opts: {
  ssh?: RefreshEnvDeps['runSsh']
  store?: FakeStore
}): RefreshEnvDeps {
  const store = opts.store ?? new FakeStore()
  store.vps.set('cust-1', { ip: '27.112.79.139', status: 'running' })
  return {
    fleetPrivateKey: 'PEM_PLACEHOLDER_'.repeat(8),
    runSsh: opts.ssh ?? (async () => ({ ok: true, stdout: 'ok restarted=2026-05-10T08:00:00Z' })),
    store,
  }
}

const HAPPY_REQ: RefreshEnvRequest = {
  customer_id: 'cust-1',
  env_values: { TELEGRAM_BOT_TOKEN: VALID_TOKEN },
  request_id: 'req-aaa',
}

test('happy path: VPS found, ssh ok, returns ok with vps_id + ip', async () => {
  const sshCalls: string[] = []
  const deps = makeDeps({
    ssh: async (args) => {
      sshCalls.push(args.command)
      return { ok: true, stdout: 'ok restarted=2026-05-10T08:00:00Z' }
    },
  })
  const res = await refreshEnvHandler(HAPPY_REQ, deps)
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.vps_id, 'vps-cust-1')
  assert.equal(res.ip_address, '27.112.79.139')
  assert.deepEqual(res.applied, { TELEGRAM_BOT_TOKEN: 'updated' })
  assert.equal(res.hermes_active_after_restart, true)
  // SSH command must reference the bot token + restart.
  assert.match(sshCalls[0]!, /TELEGRAM_BOT_TOKEN/)
  assert.match(sshCalls[0]!, /systemctl restart hermes-gateway/)
})

test('no active VPS for customer → 404 no_active_vps', async () => {
  const deps = makeDeps({ store: new FakeStore() })
  const res = await refreshEnvHandler({ ...HAPPY_REQ, customer_id: 'no-such-cust' }, deps)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'no_active_vps')
})

test('SSH unreachable → 503 ssh_unreachable', async () => {
  const deps = makeDeps({
    ssh: async () => ({ ok: false, error: 'ssh exit=255: Connection refused' }),
  })
  const res = await refreshEnvHandler(HAPPY_REQ, deps)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'ssh_unreachable')
})

test('SSH auth fail → 502 ssh_auth_failed', async () => {
  const deps = makeDeps({
    ssh: async () => ({ ok: false, error: 'ssh exit=255: Permission denied (publickey)' }),
  })
  const res = await refreshEnvHandler(HAPPY_REQ, deps)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'ssh_auth_failed')
})

test('hermes inactive after restart → partial outcome surfaced', async () => {
  const deps = makeDeps({
    ssh: async () => ({
      ok: false,
      // Our remote command shows is-active output; if it returns 'failed' the
      // command exits non-zero with a known marker we can pattern-match.
      error: 'ssh exit=3: hermes-gateway-is-active=failed',
    }),
  })
  const res = await refreshEnvHandler(HAPPY_REQ, deps)
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'hermes_inactive_after_restart')
  assert.equal(res.partial?.env_written, true)
  assert.equal(res.partial?.systemd_restarted, true)
})

test('idempotency: same request_id within 10 min returns cached outcome', async () => {
  const store = new FakeStore()
  store.vps.set('cust-1', { ip: '1.2.3.4', status: 'running' })
  let sshInvocations = 0
  const deps = makeDeps({
    store,
    ssh: async () => {
      sshInvocations++
      return { ok: true, stdout: 'ok restarted=2026-05-10T08:00:00Z' }
    },
  })
  const r1 = await refreshEnvHandler(HAPPY_REQ, deps)
  const r2 = await refreshEnvHandler(HAPPY_REQ, deps)
  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  assert.equal(sshInvocations, 1, 'second call must hit dedup cache, not SSH again')
})

test('different request_id triggers fresh SSH (no over-broad dedup)', async () => {
  const store = new FakeStore()
  store.vps.set('cust-1', { ip: '1.2.3.4', status: 'running' })
  let sshInvocations = 0
  const deps = makeDeps({
    store,
    ssh: async () => { sshInvocations++; return { ok: true, stdout: 'ok' } },
  })
  await refreshEnvHandler(HAPPY_REQ, deps)
  await refreshEnvHandler({ ...HAPPY_REQ, request_id: 'req-bbb' }, deps)
  assert.equal(sshInvocations, 2)
})

test('empty env_values → 400 invalid_field', async () => {
  // Pivot 2026-05-10: caller must supply values; no default-source.
  const deps = makeDeps({})
  const res = await refreshEnvHandler(
    { customer_id: 'cust-1', env_values: {}, request_id: 'req-empty' },
    deps,
  )
  assert.equal(res.ok, false)
})

test('invalid env_values key (not in allowlist) → 400 invalid_field', async () => {
  const deps = makeDeps({})
  const res = await refreshEnvHandler(
    {
      customer_id: 'cust-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env_values: { HACK_KEY: 'pwned' as string } as any,
      request_id: 'req-bad',
    },
    deps,
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  // Our handler rejects unknown keys at validation. The exact error
  // string can be 'invalid_field' or similar.
  assert.match(res.error, /invalid|unknown/)
})

test('missing customer_id → invalid_field', async () => {
  const deps = makeDeps({})
  const res = await refreshEnvHandler(
    { customer_id: '', env_values: { TELEGRAM_BOT_TOKEN: VALID_TOKEN }, request_id: 'req-no-cid' },
    deps,
  )
  assert.equal(res.ok, false)
})

test('empty bot token value in env_values → 400 invalid_field', async () => {
  // Pivot 2026-05-10: handler rejects empty values up-front so we
  // never write a zero-length env var to the VPS .env. Replaces the
  // old "no decryptable bot token" path (decryption now happens in
  // caller, not in this handler).
  const deps = makeDeps({})
  const res = await refreshEnvHandler(
    { customer_id: 'cust-1', env_values: { TELEGRAM_BOT_TOKEN: '' }, request_id: 'req-empty-tok' },
    deps,
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'invalid_field')
})
