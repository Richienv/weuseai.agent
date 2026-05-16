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

test('ALLOWED_ENV_KEYS list (Bug-2 2026-05-16): 5 keys including TELEGRAM_HOME_CHANNEL', async () => {
  const { ALLOWED_ENV_KEYS } = await import(
    '../services/provisioning/src/routes/refresh-env.ts'
  )
  assert.deepEqual(
    [...ALLOWED_ENV_KEYS].sort(),
    [
      'OPENAI_API_KEY',
      'OPENROUTER_API_KEY',
      'TELEGRAM_ALLOWED_USERS',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_HOME_CHANNEL',
    ].sort(),
    'TELEGRAM_ALLOWED_USERS must be in the allowlist so admin-customer-vps-refresh ' +
      'can push it alongside TELEGRAM_BOT_TOKEN in a single SSH session — without it, ' +
      'Hermes restarts with a bot token but denies the customer (Renita Stage 5 bug class). ' +
      'TELEGRAM_HOME_CHANNEL added 2026-05-16 (Bug-2): Hermes reads it as the home ' +
      'channel so the "No home channel is set… /sethome" prompt never leaks to the customer.',
  )
})

// ─── Phase E (2026-05-14) drift gates ───────────────────────────────
//
// Atomicity invariant: when both keys are passed in envValues, the
// generated command must include both AND must have exactly one
// `systemctl restart hermes-gateway`. The `set -euo pipefail` line
// + restart-after-all-writes ensures partial writes never reach a
// restarted gateway. This pins the contract so a refactor can't drop
// it silently.

test('Phase E atomicity: TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_USERS write before single restart', async () => {
  const { buildRefreshEnvCommand } = await import(
    '../services/provisioning/src/routes/refresh-env.ts'
  )
  const cmd = buildRefreshEnvCommand({
    TELEGRAM_BOT_TOKEN: '1234567890:ABCdef',
    TELEGRAM_ALLOWED_USERS: '6805409051',
  })
  // Both keys must appear in the rewrites region (above the restart line).
  const restartIdx = cmd.indexOf('systemctl restart hermes-gateway')
  assert.ok(restartIdx > 0, 'restart line must exist')
  const rewritesRegion = cmd.slice(0, restartIdx)
  assert.match(rewritesRegion, /KEY='TELEGRAM_BOT_TOKEN'/, 'token rewrite must precede restart')
  assert.match(rewritesRegion, /KEY='TELEGRAM_ALLOWED_USERS'/, 'allowlist rewrite must precede restart')
  // Exactly one restart — partial-write scenarios can never trigger an extra restart.
  const restarts = cmd.match(/systemctl restart hermes-gateway/g) ?? []
  assert.equal(restarts.length, 1, 'one restart regardless of key count')
  // `set -euo pipefail` MUST be the script gate — without it, sed-2 failure
  // could leave .env partial AND still trigger restart. Pin it explicitly.
  assert.match(cmd, /^set -euo pipefail/, 'script must start with `set -euo pipefail` (atomicity gate)')
})

test('Phase E: TELEGRAM_ALLOWED_USERS value passes through unescaped digits-only', async () => {
  const { buildRefreshEnvCommand } = await import(
    '../services/provisioning/src/routes/refresh-env.ts'
  )
  const cmd = buildRefreshEnvCommand({
    TELEGRAM_ALLOWED_USERS: '6805409051,1234567890',
  })
  // Hermes upstream accepts CSV; we don't enforce a single chat_id here.
  assert.match(cmd, /VAL='6805409051,1234567890'/, 'CSV digits-with-comma must survive shell-quote')
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
  sleep?: RefreshEnvDeps['sleep']
  maxAttempts?: RefreshEnvDeps['maxAttempts']
  inflightByCustomer?: RefreshEnvDeps['inflightByCustomer']
}): RefreshEnvDeps {
  const store = opts.store ?? new FakeStore()
  store.vps.set('cust-1', { ip: '27.112.79.139', status: 'running' })
  return {
    fleetPrivateKey: 'PEM_PLACEHOLDER_'.repeat(8),
    runSsh: opts.ssh ?? (async () => ({ ok: true, stdout: 'ok restarted=2026-05-10T08:00:00Z' })),
    store,
    // Phase E Option 1: tests never want to wait real seconds for
    // backoff sleeps. Default to a no-op sleep here; the dedicated
    // retry tests further down pass an instrumented `sleep` to verify
    // the backoff sequence.
    sleep: opts.sleep ?? (async () => {}),
    maxAttempts: opts.maxAttempts,
    inflightByCustomer: opts.inflightByCustomer,
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

// ─── Phase E Option 1 (2026-05-14): retry-aware refresh-env ─────────
//
// Spec from founder directive 2026-05-14:
//   - exp backoff 5s / 15s / 45s / 2m / 5m, 5 attempts max
//   - retry on ssh_unreachable AND ssh_auth_failed (the two
//     manifestations of the setup-script race that bit Renita)
//   - per-customer queue: concurrent calls for same customer must
//     dedup so retry chains don't race each other on the same .env
//   - non-transient errors (hermes_inactive_after_restart,
//     systemd_restart_failed) do NOT retry — fail fast
//
// Tests inject a tracked sleep so backoff math is verifiable without
// burning real seconds. Production wires real setTimeout.

test('Phase E Option 1: RETRY_BACKOFF_MS exported as [5s, 15s, 45s, 2m, 5m]', async () => {
  const { RETRY_BACKOFF_MS, MAX_REFRESH_ATTEMPTS } = await import(
    '../services/provisioning/src/routes/refresh-env.ts'
  )
  assert.deepEqual(
    [...RETRY_BACKOFF_MS],
    [5_000, 15_000, 45_000, 120_000, 300_000],
    'backoff sequence must match founder spec verbatim',
  )
  assert.equal(MAX_REFRESH_ATTEMPTS, 5, 'max attempts must be 5')
})

test('Phase E Option 1: ssh_unreachable retries until success on attempt 3', async () => {
  let sshCalls = 0
  const sleepCalls: number[] = []
  const deps = makeDeps({
    ssh: async () => {
      sshCalls++
      if (sshCalls < 3) {
        return { ok: false, error: 'ssh: connect to host 45.76.176.206 port 22: Connection refused' }
      }
      return { ok: true, stdout: 'ok restarted=2026-05-14T08:00:00Z' }
    },
    sleep: async (ms) => { sleepCalls.push(ms) },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-retry-success-3' },
    deps,
  )
  assert.equal(res.ok, true, 'eventual success after 2 retries')
  assert.equal(sshCalls, 3, 'exactly 3 SSH attempts before success')
  assert.deepEqual(sleepCalls, [5_000, 15_000], 'slept 5s then 15s between the 3 attempts')
})

test('Phase E Option 1: ssh_unreachable exhausts all 5 attempts then returns failure', async () => {
  let sshCalls = 0
  const sleepCalls: number[] = []
  const deps = makeDeps({
    ssh: async () => {
      sshCalls++
      return { ok: false, error: 'ssh: connect to host 45.76.176.206 port 22: Connection refused' }
    },
    sleep: async (ms) => { sleepCalls.push(ms) },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-retry-exhaust' },
    deps,
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'ssh_unreachable', 'final error must be ssh_unreachable (not generic exhausted)')
  assert.equal(sshCalls, 5, '5 attempts (initial + 4 retries)')
  // 4 sleeps between 5 attempts: 5s, 15s, 45s, 2m. The 5m entry is
  // the ceiling for a hypothetical 6th attempt — not used.
  assert.deepEqual(sleepCalls, [5_000, 15_000, 45_000, 120_000], 'backoff sequence between 5 attempts')
})

test('Phase E Option 1: ssh_auth_failed also retries (same policy)', async () => {
  // Vultr cutover 2026-05-12 showed ssh_auth_failed as a transient
  // manifestation of the same race class (fleet key not propagated to
  // VPS yet). Treated identically to ssh_unreachable.
  let sshCalls = 0
  const deps = makeDeps({
    ssh: async () => {
      sshCalls++
      if (sshCalls === 1) {
        return { ok: false, error: 'weuseai@45.76.176.206: Permission denied (publickey,password).' }
      }
      return { ok: true, stdout: 'ok restarted=2026-05-14T08:00:00Z' }
    },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-auth-retry' },
    deps,
  )
  assert.equal(res.ok, true)
  assert.equal(sshCalls, 2, 'ssh_auth_failed retried once before success')
})

test('Phase E Option 1: hermes_inactive_after_restart does NOT retry (fail-fast)', async () => {
  // Non-transient: the script completed (env written, systemd
  // restart issued) but the gateway didn't come up. Retrying would
  // just burn cycles writing the same env over and over.
  let sshCalls = 0
  const deps = makeDeps({
    ssh: async () => {
      sshCalls++
      return { ok: false, error: 'hermes-gateway-is-active=inactive\nexit code 3' }
    },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-no-retry-inactive' },
    deps,
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'hermes_inactive_after_restart')
  assert.equal(sshCalls, 1, 'no retry — non-transient error class')
})

test('Phase E Option 1: env_write_failed does NOT retry (fail-fast)', async () => {
  // Default error class (anything that didn't match the known
  // patterns in mapSshFailure) → also non-transient, fail fast.
  let sshCalls = 0
  const deps = makeDeps({
    ssh: async () => {
      sshCalls++
      return { ok: false, error: 'something unrecognized went wrong on the VPS' }
    },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-no-retry-other' },
    deps,
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.error, 'env_write_failed')
  assert.equal(sshCalls, 1, 'no retry on unrecognized error')
})

test('Phase E Option 1 queue: concurrent calls for same customer dedup', async () => {
  // Two callers hit /refresh-env for the same customer at the same
  // time (e.g. complete-onboarding step 8a + admin-customer-vps-refresh).
  // The handler must NOT run two parallel SSH chains — one chain
  // wins, the other waits for and returns the same result.
  let sshCalls = 0
  let inflightStarts = 0
  const inflightByCustomer: NonNullable<RefreshEnvDeps['inflightByCustomer']> = new Map()
  const deps = makeDeps({
    inflightByCustomer,
    ssh: async () => {
      inflightStarts++
      sshCalls++
      // Simulate slow SSH so the second caller arrives while first is in-flight.
      await new Promise((r) => setTimeout(r, 50))
      return { ok: true, stdout: 'ok restarted=2026-05-14T08:00:00Z' }
    },
  })
  const [resA, resB] = await Promise.all([
    refreshEnvHandler({ ...HAPPY_REQ, request_id: 'req-concurrent-A' }, deps),
    refreshEnvHandler({ ...HAPPY_REQ, request_id: 'req-concurrent-B' }, deps),
  ])
  assert.equal(resA.ok, true)
  assert.equal(resB.ok, true)
  assert.equal(
    sshCalls,
    1,
    'concurrent calls for same customer must share a single SSH chain (queue dedup)',
  )
  assert.equal(inflightStarts, 1, 'only one in-flight chain per customer')
})

test('Phase E Option 1 queue: different customers run in parallel', async () => {
  // The queue is per-customer. Customers A and B should NOT block
  // each other. We use a long sleep + Promise.all timing to assert
  // parallelism.
  let aDone = 0
  let bDone = 0
  const inflightByCustomer: NonNullable<RefreshEnvDeps['inflightByCustomer']> = new Map()
  const store = new FakeStore()
  store.vps.set('cust-a', { ip: '1.1.1.1', status: 'running' })
  store.vps.set('cust-b', { ip: '2.2.2.2', status: 'running' })
  const deps = makeDeps({
    store,
    inflightByCustomer,
    ssh: async (args) => {
      // Both callers should be running concurrently.
      await new Promise((r) => setTimeout(r, 50))
      if (args.host === '1.1.1.1') aDone++
      if (args.host === '2.2.2.2') bDone++
      return { ok: true, stdout: 'ok restarted=2026-05-14T08:00:00Z' }
    },
  })
  const start = Date.now()
  await Promise.all([
    refreshEnvHandler(
      { customer_id: 'cust-a', env_values: { TELEGRAM_BOT_TOKEN: VALID_TOKEN }, request_id: 'req-a' },
      deps,
    ),
    refreshEnvHandler(
      { customer_id: 'cust-b', env_values: { TELEGRAM_BOT_TOKEN: VALID_TOKEN }, request_id: 'req-b' },
      deps,
    ),
  ])
  const elapsed = Date.now() - start
  assert.equal(aDone, 1)
  assert.equal(bDone, 1)
  // Two 50ms SSHes in parallel should take ~50ms, NOT ~100ms (serial).
  // Generous 150ms ceiling for CI flake; serial would be ≥100ms.
  assert.ok(
    elapsed < 150,
    `customers A + B ran in ${elapsed}ms — expected parallel (<150ms), serial would be ≥100ms. ` +
      'Queue must be per-customer, not global.',
  )
})

test('Phase E Option 1: maxAttempts: 1 disables retry (back-compat for existing tests + admin "try once" mode)', async () => {
  let sshCalls = 0
  const deps = makeDeps({
    maxAttempts: 1,
    ssh: async () => {
      sshCalls++
      return { ok: false, error: 'ssh: connect to host port 22: Connection refused' }
    },
  })
  const res = await refreshEnvHandler(
    { ...HAPPY_REQ, request_id: 'req-no-retry-mode' },
    deps,
  )
  assert.equal(res.ok, false)
  assert.equal(sshCalls, 1, 'maxAttempts: 1 means no retries')
})
