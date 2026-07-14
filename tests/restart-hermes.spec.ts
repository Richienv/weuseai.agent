/**
 * D1 multi-persona webhook push (2026-05-12): /restart-hermes route
 * tests. Pure handler — SSH execution is mocked.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  restartHermesHandler,
  type RestartHermesStore,
} from '../services/provisioning/src/routes/restart-hermes'

function makeStore(opts: { vpsId?: string; ipAddress?: string | null } = {}): RestartHermesStore {
  return {
    async findVpsByCustomerId(customerId) {
      if (customerId === 'cust-no-vps') return null
      if (customerId === 'cust-mid-provision') return { vps_id: 'vps-x', ip_address: null }
      return {
        vps_id: opts.vpsId ?? 'vps-test-1',
        ip_address: opts.ipAddress ?? '45.76.163.93',
      }
    },
  }
}

const fakePrivKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n'

test('happy path: ssh systemctl restart fires, returns ok+vpsId+ip+restartedAt', async () => {
  const sshCalls: { cmd: string; args: string[] }[] = []
  const result = await restartHermesHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakePrivKey,
      exec: async (cmd, args) => {
        sshCalls.push({ cmd, args })
        return { ok: true, stdout: '', stderr: '', exitCode: 0 }
      },
      now: () => new Date('2026-05-12T08:00:00Z'),
    },
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.vpsId, 'vps-test-1')
  assert.equal(result.ipAddress, '45.76.163.93')
  assert.equal(result.restartedAt, '2026-05-12T08:00:00.000Z')
  assert.equal(sshCalls.length, 1)
  assert.equal(sshCalls[0].cmd, 'ssh')
  assert.ok(sshCalls[0].args.includes('root@45.76.163.93'))
  assert.ok(sshCalls[0].args.includes('sudo systemctl restart hermes-gateway'))
})

test('uses fleet SSH private key with key-auth flags', async () => {
  const sshCalls: { cmd: string; args: string[] }[] = []
  await restartHermesHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakePrivKey,
      exec: async (cmd, args) => {
        sshCalls.push({ cmd, args })
        return { ok: true, stdout: '', stderr: '', exitCode: 0 }
      },
    },
  )
  const args = sshCalls[0].args
  // Key-auth flags
  assert.ok(args.includes('-i'), '-i flag passes key path')
  assert.ok(args.includes('-o') && args.includes('BatchMode=yes'), 'BatchMode=yes prevents prompts')
  assert.ok(args.includes('IdentitiesOnly=yes'))
})

test('missing customer_id → 400 invalid_customer_id', async () => {
  const result = await restartHermesHandler(
    { customer_id: '' },
    { store: makeStore(), fleetSshPrivateKey: fakePrivKey },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 400)
  assert.equal(result.error, 'invalid_customer_id')
})

test('missing fleet SSH private key → 500 fleet_ssh_private_key_missing', async () => {
  const result = await restartHermesHandler(
    { customer_id: 'cust-1' },
    { store: makeStore(), fleetSshPrivateKey: '' },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 500)
  assert.equal(result.error, 'fleet_ssh_private_key_missing')
})

test('customer not found → 404 customer_vps_not_found', async () => {
  const result = await restartHermesHandler(
    { customer_id: 'cust-no-vps' },
    { store: makeStore(), fleetSshPrivateKey: fakePrivKey },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 404)
  assert.equal(result.error, 'customer_vps_not_found')
})

test('VPS row exists but ip null → 409 vps_ip_unknown', async () => {
  const result = await restartHermesHandler(
    { customer_id: 'cust-mid-provision' },
    { store: makeStore(), fleetSshPrivateKey: fakePrivKey },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.equal(result.error, 'vps_ip_unknown')
})

test('SSH command fails → 502 ssh_restart_failed with stderr snippet', async () => {
  const result = await restartHermesHandler(
    { customer_id: 'cust-1' },
    {
      store: makeStore(),
      fleetSshPrivateKey: fakePrivKey,
      exec: async () => ({
        ok: false,
        stdout: '',
        stderr: 'Permission denied (publickey).',
        exitCode: 255,
      }),
    },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 502)
  assert.equal(result.error, 'ssh_restart_failed')
  assert.match(result.detail ?? '', /Permission denied/)
})
