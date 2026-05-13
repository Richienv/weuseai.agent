/**
 * Phase 2 (2026-05-13): GET /customer-progress route on provisioning.
 *
 * Founder cascade brief: "real-time setup progress streaming so future
 * bugs surface as 'stuck at line X' instead of 'stuck at stage Y for
 * 8 min'." Welcome.html polls this endpoint in parallel with
 * customer-readiness-probe. Surfaces the last N lines of
 * /var/log/weuseai-setup.log + heartbeat-age so the customer (and the
 * founder) can SEE what's happening on the VPS without SSH'ing.
 *
 * Pure handler — SSH execution mocked.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  customerProgressHandler,
  type CustomerProgressStore,
} from '../services/provisioning/src/routes/customer-progress'

const fakeKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n'

function makeStore(opts: { vpsId?: string; ipAddress?: string | null; status?: string } = {}): CustomerProgressStore {
  return {
    async findVpsByCustomerId(customerId) {
      if (customerId === 'cust-no-vps') return null
      if (customerId === 'cust-no-ip') return { vps_id: 'vps-x', ip_address: null, status: 'provisioning' }
      return {
        vps_id: opts.vpsId ?? 'vps-test-1',
        ip_address: opts.ipAddress ?? '45.76.163.93',
        status: opts.status ?? 'provisioning',
      }
    },
  }
}

// ─── validation ─────────────────────────────────────────────────────────

test('missing customer_id → 400 invalid_customer_id', async () => {
  const r = await customerProgressHandler(
    { customer_id: '' },
    { store: makeStore(), fleetSshPrivateKey: fakeKey },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 400)
  assert.equal(r.error, 'invalid_customer_id')
})

test('missing fleet key → 500 fleet_ssh_private_key_missing', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    { store: makeStore(), fleetSshPrivateKey: '' },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 500)
  assert.equal(r.error, 'fleet_ssh_private_key_missing')
})

test('customer not found → 404 customer_vps_not_found', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-no-vps' },
    { store: makeStore(), fleetSshPrivateKey: fakeKey },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 404)
  assert.equal(r.error, 'customer_vps_not_found')
})

test('VPS row exists but ip null → 202 vps_ip_pending (provisioning still booting)', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-no-ip' },
    { store: makeStore(), fleetSshPrivateKey: fakeKey },
  )
  // Special case: 202 + progress payload with helpful stage label.
  // Welcome page renders "waiting for IP allocation…" until SSH is reachable.
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.vps_ip_pending, true)
  assert.equal(r.progress_lines.length, 0)
  assert.equal(r.heartbeat_age_sec, null)
})

// ─── happy path ─────────────────────────────────────────────────────────

test('happy path: returns last 10 setup log lines + heartbeat age', async () => {
  const sshCalls: { cmd: string; args: string[] }[] = []
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:30Z'),
      exec: async (cmd, args) => {
        sshCalls.push({ cmd, args })
        // Mock SSH output: a stdout blob with two named regions
        // separated by literal "---HEARTBEAT---" delimiter (the
        // shell command groups both reads in one round-trip).
        return {
          ok: true,
          stdout:
            '[00:59:00] Updating apt (timeout 90 sec)...\n' +
            '[00:59:30] Installing base packages (timeout 180 sec)...\n' +
            '[00:59:40] Writing Hermes config files...\n' +
            '[00:59:42] Installing Hermes (pinned to v0.13.0; this takes 3-6 min, timeout 10 min)...\n' +
            '---HEARTBEAT---\n' +
            '2026-05-13T01:00:00Z\n',
          stderr: '',
          exitCode: 0,
        }
      },
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.vps_id, 'vps-test-1')
  assert.equal(r.ip_address, '45.76.163.93')
  // 4 setup-log lines (last 10 cap is generous; we got 4 actual lines)
  assert.equal(r.progress_lines.length, 4)
  assert.match(r.progress_lines[3], /Installing Hermes/)
  // Heartbeat age = now - heartbeat timestamp = 30 sec
  assert.equal(r.heartbeat_age_sec, 30)
  assert.equal(r.heartbeat_stale, false)
  // One SSH round-trip captures both the log tail + heartbeat in one call
  assert.equal(sshCalls.length, 1)
})

test('heartbeat older than 120s → heartbeat_stale=true', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:05:00Z'),
      exec: async () => ({
        ok: true,
        stdout: '[01:00:00] some line\n---HEARTBEAT---\n2026-05-13T01:02:00Z\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  // 180 sec > 120 sec → stale
  assert.equal(r.heartbeat_age_sec, 180)
  assert.equal(r.heartbeat_stale, true)
})

test('heartbeat file missing (empty after delimiter) → heartbeat_age_sec=null', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:00Z'),
      exec: async () => ({
        ok: true,
        stdout: '[00:59:00] starting setup\n---HEARTBEAT---\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.heartbeat_age_sec, null)
  assert.equal(r.heartbeat_stale, false)  // can't be stale if we don't know the age
  assert.equal(r.progress_lines.length, 1)
})

test('setup log absent (script never started or rolled over) → empty lines, no error', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      // First tee chunk is empty (cat returns "" when file absent under tail || true)
      exec: async () => ({
        ok: true,
        stdout: '---HEARTBEAT---\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.progress_lines.length, 0)
})

test('SSH command fails → 502 ssh_unreachable with stderr snippet', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      exec: async () => ({
        ok: false,
        stdout: '',
        stderr: 'Connection refused on port 22',
        exitCode: 255,
      }),
    },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 502)
  assert.equal(r.error, 'ssh_unreachable')
  assert.match(r.detail ?? '', /Connection refused/)
})

// ─── stage label inference (front-end uses this for the "Tahap: …" line) ──

test('progress: stage label inferred from last log line — apt install', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:30Z'),
      exec: async () => ({
        ok: true,
        stdout: '[00:59:00] Updating apt (timeout 90 sec)...\n[00:59:30] Installing base packages (timeout 180 sec)...\n---HEARTBEAT---\n2026-05-13T01:00:00Z\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.inferred_stage, 'apt_install')
})

test('progress: stage label inferred — hermes_install', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:30Z'),
      exec: async () => ({
        ok: true,
        stdout: '[00:59:42] Installing Hermes (pinned to v0.13.0; this takes 3-6 min, timeout 10 min)...\n---HEARTBEAT---\n2026-05-13T01:00:00Z\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.inferred_stage, 'hermes_install')
})

test('progress: stage label inferred — gateway_install', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:30Z'),
      exec: async () => ({
        ok: true,
        stdout: '[00:59:42] Installing Hermes gateway as system service...\n---HEARTBEAT---\n2026-05-13T01:00:00Z\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.inferred_stage, 'gateway_install')
})

test('progress: stage label inferred — setup_complete', async () => {
  const r = await customerProgressHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakeKey,
      now: () => new Date('2026-05-13T01:00:30Z'),
      exec: async () => ({
        ok: true,
        stdout: '[01:00:00] === weuseai setup COMPLETE ===\n---HEARTBEAT---\n2026-05-13T01:00:00Z\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.inferred_stage, 'setup_complete')
})
