// services/provisioning POST /customer-readiness-probe — pure handler tests.
//
// Track 1 of post-pair UX polish (2026-05-10). Welcome.html polls this
// every 10s during state A/B and only transitions to state C2 when the
// critical checks (hermes_systemd_active + hermes_pairing_approved +
// soul_md_present) all pass.
//
// Layers tested:
//   1. parseProbeOutput: parses bundled-SSH stdout into ReadinessChecks
//   2. buildReadinessProbeCommand: emits idempotent + injection-safe bash
//   3. isReady: only critical checks gate state-C2 transition
//   4. readinessProbeHandler: full orchestration with mocked SSH + store

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReadinessProbeCommand,
  parseProbeOutput,
  isReady,
  readinessProbeHandler,
  CRITICAL_CHECKS,
  type IReadinessStore,
  type ReadinessProbeDeps,
} from '../services/provisioning/src/routes/customer-readiness-probe.js'

// Long enough to satisfy `fleetPrivateKey.length < 64` guard.
const FAKE_FLEET_KEY =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// ─── Layer 1: parseProbeOutput ─────────────────────────────────────

test('parses all-true probe output', () => {
  const stdout = `hermes_systemd_active=true
hermes_telegram_connected=true
hermes_pairing_approved=true
openrouter_key_valid=true
soul_md_present=true
soul_md_present__detail=size=812 bytes
hermes_responded_to_first_message=true
__probe_done__
`
  const { checks, details } = parseProbeOutput(stdout)
  assert.equal(checks.hermes_systemd_active, true)
  assert.equal(checks.hermes_telegram_connected, true)
  assert.equal(checks.hermes_pairing_approved, true)
  assert.equal(checks.openrouter_key_valid, true)
  assert.equal(checks.soul_md_present, true)
  assert.equal(checks.hermes_responded_to_first_message, true)
  assert.equal(details.soul_md_present, 'size=812 bytes')
})

test('missing keys default to false (script crashed mid-run)', () => {
  const stdout = `hermes_systemd_active=true
__probe_done__
`
  const { checks } = parseProbeOutput(stdout)
  assert.equal(checks.hermes_systemd_active, true)
  assert.equal(checks.hermes_pairing_approved, false)
  assert.equal(checks.soul_md_present, false)
})

test('captures __detail values for failed checks', () => {
  const stdout = `hermes_systemd_active=false
hermes_systemd_active__detail=systemctl is-active=inactive
hermes_pairing_approved=false
hermes_pairing_approved__detail=approved.json missing
__probe_done__
`
  const { details } = parseProbeOutput(stdout)
  assert.equal(details.hermes_systemd_active, 'systemctl is-active=inactive')
  assert.equal(details.hermes_pairing_approved, 'approved.json missing')
})

// ─── Layer 2: buildReadinessProbeCommand ───────────────────────────

test('build command interpolates digit-only chat_id safely', () => {
  const cmd = buildReadinessProbeCommand({ telegramChatId: '6805409051' })
  assert.match(cmd, /CHAT_ID="6805409051"/)
  // Must end with the done marker so SSH wrapper can detect script ran.
  assert.match(cmd, /__probe_done__/)
  // Must check all 8 markers (5 SSH-side ones).
  for (const k of [
    'hermes_systemd_active',
    'hermes_telegram_connected',
    'hermes_pairing_approved',
    'soul_md_present',
    'openrouter_key_valid',
    'hermes_responded_to_first_message',
  ]) {
    assert.match(cmd, new RegExp(`${k}=`), `command must emit ${k}=`)
  }
})

test('build command rejects non-digit chat_id (defense-in-depth injection guard)', () => {
  // Anything containing shell metachars must throw before reaching the
  // remote VPS. Mirrors the buildRefreshEnvCommand guard.
  const evilInputs = [
    "6805'; rm -rf /",
    '6805$(whoami)',
    '6805\nrm -rf /',
    '6805" && curl evil.com',
  ]
  for (const evil of evilInputs) {
    assert.throws(
      () => buildReadinessProbeCommand({ telegramChatId: evil }),
      `must reject: ${evil}`,
    )
  }
})

test('build command tolerates null chat_id (pre-pairing state)', () => {
  const cmd = buildReadinessProbeCommand({ telegramChatId: null })
  // Should still build, but pairing check will short-circuit to false.
  assert.match(cmd, /no chat_id supplied/)
})

// ─── Layer 3: isReady ──────────────────────────────────────────────

test('isReady=true requires all critical checks even if non-critical fail', () => {
  // Critical: hermes_systemd_active + hermes_pairing_approved + soul_md_present.
  const checks = {
    vps_provisioned: true,
    vps_reachable: true,
    hermes_systemd_active: true,
    hermes_pairing_approved: true,
    soul_md_present: true,
    // Non-critical:
    hermes_telegram_connected: false,  // log-format may vary
    openrouter_key_valid: false,        // can be transient (network blip)
    hermes_responded_to_first_message: true,
  }
  assert.equal(isReady(checks), true)
})

test('isReady=false when any critical check fails', () => {
  for (const failKey of CRITICAL_CHECKS) {
    const checks = {
      vps_provisioned: true,
      vps_reachable: true,
      hermes_systemd_active: true,
      hermes_pairing_approved: true,
      soul_md_present: true,
      hermes_telegram_connected: true,
      openrouter_key_valid: true,
      hermes_responded_to_first_message: true,
    }
    checks[failKey] = false
    assert.equal(isReady(checks), false, `must be not-ready when ${failKey}=false`)
  }
})

// ─── Layer 4: readinessProbeHandler ────────────────────────────────

function fakeStore(opts: {
  vps?: { vps_id: string; ip_address: string | null; status: string } | null
  chatId?: string | null
}): IReadinessStore {
  return {
    async findActiveVPSByCustomer() {
      return opts.vps === undefined
        ? { vps_id: 'v-1', ip_address: '10.0.0.1', status: 'running' }
        : opts.vps
    },
    async findTelegramChatId() {
      return opts.chatId === undefined ? '6805409051' : opts.chatId
    },
  }
}

function fakeSshOk(stdout: string): ReadinessProbeDeps['runSsh'] {
  return async () => ({ ok: true, stdout })
}

test('rejects missing customer_id', async () => {
  const r = await readinessProbeHandler(
    { customer_id: '' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({}),
      runSsh: fakeSshOk(''),
      tcpProbe: async () => true,
    },
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'invalid_field')
})

test('vps_provisioned=false when status != running', async () => {
  const r = await readinessProbeHandler(
    { customer_id: 'cust-1' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({
        vps: { vps_id: 'v-1', ip_address: null, status: 'provisioning' },
      }),
      runSsh: fakeSshOk(''),
      tcpProbe: async () => true,
    },
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.checks.vps_provisioned, false)
    assert.equal(r.ready, false)
    // Should NOT have attempted SSH (no IP yet).
  }
})

test('vps_reachable=false when TCP probe fails', async () => {
  let sshCalled = false
  const r = await readinessProbeHandler(
    { customer_id: 'cust-1' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({}),
      tcpProbe: async () => false,
      runSsh: async () => {
        sshCalled = true
        return { ok: true, stdout: '__probe_done__\n' }
      },
    },
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.checks.vps_reachable, false)
    assert.equal(r.ready, false)
  }
  assert.equal(sshCalled, false, 'must NOT SSH when TCP probe fails')
})

test('happy path — all checks pass, ready=true', async () => {
  const r = await readinessProbeHandler(
    { customer_id: 'cust-1' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({}),
      tcpProbe: async () => true,
      runSsh: fakeSshOk(`hermes_systemd_active=true
hermes_telegram_connected=true
hermes_pairing_approved=true
openrouter_key_valid=true
soul_md_present=true
hermes_responded_to_first_message=true
__probe_done__
`),
    },
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.ready, true)
    assert.equal(r.checks.vps_provisioned, true)
    assert.equal(r.checks.vps_reachable, true)
    assert.equal(r.checks.hermes_systemd_active, true)
    assert.equal(r.checks.hermes_pairing_approved, true)
    assert.equal(r.checks.soul_md_present, true)
  }
})

test('partial — critical fails => ready=false but probe succeeds', async () => {
  const r = await readinessProbeHandler(
    { customer_id: 'cust-1' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({}),
      tcpProbe: async () => true,
      runSsh: fakeSshOk(`hermes_systemd_active=true
hermes_telegram_connected=true
hermes_pairing_approved=false
hermes_pairing_approved__detail=chat_id 6805409051 not in approved.json
openrouter_key_valid=true
soul_md_present=true
hermes_responded_to_first_message=true
__probe_done__
`),
    },
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.ready, false)
    assert.equal(r.checks.hermes_pairing_approved, false)
    assert.equal(r.details.hermes_pairing_approved, 'chat_id 6805409051 not in approved.json')
  }
})

test('SSH failure — checks fall back to false but probe response is still ok=true', async () => {
  const r = await readinessProbeHandler(
    { customer_id: 'cust-1' },
    {
      fleetPrivateKey: FAKE_FLEET_KEY,
      store: fakeStore({}),
      tcpProbe: async () => true,
      runSsh: async () => ({ ok: false, error: 'ssh exit=255: Permission denied' }),
    },
  )
  // Probe wrapper still returns ok=true so welcome.html holds in state-B
  // (not state-G error). Just all SSH-needing checks are false.
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.ready, false)
    assert.equal(r.checks.vps_reachable, true)  // TCP was OK
    assert.equal(r.checks.hermes_systemd_active, false)
    assert.match(r.details.hermes_systemd_active ?? '', /ssh failed/)
  }
})
