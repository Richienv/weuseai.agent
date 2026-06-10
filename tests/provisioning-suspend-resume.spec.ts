/**
 * Fleet Sentinel — provisioning suspend/resume route handlers.
 *
 * suspendCustomer halts the customer's VPS (Vultr stop) and patches the row
 * status; resumeCustomer powers it back on. Both reversible, never delete.
 * Exercised against MockVPSProvider + MockDataStore (the VPS_PROVIDER=mock
 * local-first path).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { suspendCustomer, resumeCustomer, tearDownCustomer } from '../services/provisioning/src/customer-flow.ts'
import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.ts'
import { MockDataStore } from '../services/provisioning/src/stores/mock-store.ts'

async function seedRunningVps(customerId: string) {
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const info = await vps.create({
    name: `vps-${customerId}`,
    spec: { vcpu: 1, ram: 1024, disk: 25 },
    password: 'x',
    billingAccountId: 'acct',
  })
  await store.createVPSInstance({
    customer_id: customerId,
    vps_id: info.uuid,
    provider: 'mock',
    ip_address: '203.0.113.5',
    region: 'sgp',
    status: 'running',
  })
  return { vps, store, vpsId: info.uuid }
}

test('suspendCustomer halts the VPS and marks the row stopped', async () => {
  const { vps, store, vpsId } = await seedRunningVps('cust-1')
  const res = await suspendCustomer({ customerId: 'cust-1', vpsId, provider: 'mock' }, { vps, store })
  assert.equal(res.ok, true)
  assert.equal(res.vpsId, vpsId)
  // Provider-side: VM halted.
  assert.equal((await vps.get(vpsId)).status, 'stopped')
  // Store-side: row patched (look up by vps_id — findActive excludes stopped).
  assert.equal(store.vpsInstances.get(vpsId)?.status, 'stopped')
})

test('resumeCustomer finds a SUSPENDED (stopped) VPS and powers it back on', async () => {
  const { vps, store, vpsId } = await seedRunningVps('cust-1')
  await suspendCustomer({ customerId: 'cust-1', vpsId, provider: 'mock' }, { vps, store })
  // Critical: a suspended VPS is status='stopped', which findActiveVPSByCustomer
  // would NOT return — resume must target it by vps_id regardless.
  const res = await resumeCustomer({ customerId: 'cust-1', vpsId, provider: 'mock' }, { vps, store })
  assert.equal(res.ok, true)
  assert.equal((await vps.get(vpsId)).status, 'running')
  assert.equal(store.vpsInstances.get(vpsId)?.status, 'running')
})

test('suspend → resume → suspend round-trip is stable', async () => {
  const { vps, store, vpsId } = await seedRunningVps('cust-1')
  const t = { customerId: 'cust-1', vpsId, provider: 'mock' }
  await suspendCustomer(t, { vps, store })
  await resumeCustomer(t, { vps, store })
  await suspendCustomer(t, { vps, store })
  assert.equal((await vps.get(vpsId)).status, 'stopped')
})

test('suspendCustomer without a vpsId returns missing_vps_id (no throw)', async () => {
  const store = new MockDataStore()
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const res = await suspendCustomer({ customerId: 'ghost', vpsId: '' }, { vps, store })
  assert.deepEqual(res, { ok: false, reason: 'missing_vps_id' })
})

test('suspend does NOT delete the VPS — it is reversible (distinct from tearDown)', async () => {
  const { vps, store, vpsId } = await seedRunningVps('cust-1')
  await suspendCustomer({ customerId: 'cust-1', vpsId, provider: 'mock' }, { vps, store })
  // The VM still exists at the provider after suspend (get does not throw).
  assert.equal((await vps.get(vpsId)).status, 'stopped')
  assert.ok(store.vpsInstances.has(vpsId), 'row retained after suspend')
})

test('tearDown deletes (contrast): a running VPS is removed at the provider', async () => {
  const { vps, store, vpsId } = await seedRunningVps('cust-2')
  await tearDownCustomer('cust-2', { vps, store })
  await assert.rejects(() => vps.get(vpsId), 'tearDown removes the VM')
})
