/**
 * Reap guard (2026-07-15) — the failed-VM reap must NEVER delete a healthy VM.
 *
 * The reap exists to stop a real money leak: a provision that dies mid-flight
 * used to leave the Vultr VM running and billing ~$5/mo forever (one such orphan
 * billed from 2026-06-03 until it was found on 2026-07-14).
 *
 * But as first written the reap lived in the background promise's catch — and
 * that promise ALSO rejects for failures that happen AFTER the setup script has
 * already succeeded (the notifyVpsReady second-finisher, and the trailing
 * `updateVPSInstance(status:'running')` DB write). So a transient DB blip on a
 * fully-provisioned box would have deleted a PAYING CUSTOMER'S WORKING AGENT.
 *
 * Contract pinned here:
 *   1. setup script FAILS            → VM is reaped (the leak fix works)
 *   2. setup OK, second-finisher throws → VM SURVIVES
 *   3. setup OK, status='running' write throws → VM SURVIVES (the killer case)
 *   4. a surviving VM is never marked 'failed'
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { spinUpCustomer, type SpinUpDeps } from '../services/provisioning/src/customer-flow.ts'
import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.ts'
import { MockDataStore } from '../services/provisioning/src/stores/mock-store.ts'
import { MockMessageBroker } from '../services/hermes/src/adapters/mock-broker.ts'
import { MockSshProvisioner } from '../services/provisioning/src/ssh/mock-ssh-provisioner.ts'
import { MockLlmKeyMinter } from '../services/provisioning/src/llm/mock-minter.ts'

type Mocks = SpinUpDeps & { vps: MockVPSProvider; store: MockDataStore }

/** Records every vps.delete() so we can assert the VM was (or was NOT) reaped. */
function makeDeps(overrides: Partial<SpinUpDeps> = {}): Mocks & { deleted: string[] } {
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const deleted: string[] = []
  const origDelete = vps.delete.bind(vps)
  ;(vps as unknown as { delete: (u: string) => Promise<void> }).delete = async (uuid: string) => {
    deleted.push(uuid)
    return origDelete(uuid)
  }
  const merged = {
    vps,
    store,
    broker: new MockMessageBroker(),
    ssh: new MockSshProvisioner(),
    llmMinter: new MockLlmKeyMinter(),
    providerName: 'mock' as const,
    billingAccountId: 'bil-1',
    region: 'jkt01',
    sshPollIntervalMs: 1,
    sshReadyTimeoutMs: 1000,
    ipPollIntervalMs: 1,
    ipPollTimeoutMs: 1000,
    waitForSshOpen: async () => {},
    log: () => {},
    ...overrides,
  }
  return Object.assign(merged as unknown as Mocks, { deleted })
}

const INPUT = {
  customerId: 'cust-reap',
  tier: 'done-for-you' as const,
  customerTelegramBotToken: 'tok',
  customerTelegramAllowedUserIds: '6805409051',
}

async function settle(done: Promise<unknown>) {
  await done.catch(() => {/* the failure paths reject by design */})
  await new Promise((r) => setTimeout(r, 20)) // let the detached done.catch run
}

test('setup script FAILS → the VM is reaped (no orphan bill)', async () => {
  const deps = makeDeps()
  ;(deps.ssh as unknown as { runSetup: () => Promise<unknown> }).runSetup = async () => ({
    ok: false, exitCode: 7, stdout: '', stderr: 'apt exploded',
  })

  const r = await spinUpCustomer(INPUT, deps)
  await settle(r.done)

  assert.equal(deps.deleted.length >= 1, true, 'a genuinely failed provision MUST reap its VM')
})

test('setup OK but the second-finisher throws → VM SURVIVES (never reaped)', async () => {
  const deps = makeDeps({
    notifyVpsReady: async () => { throw new Error('gateway hook 500') },
  })

  const r = await spinUpCustomer(INPUT, deps)
  await settle(r.done)

  assert.deepEqual(deps.deleted, [], 'a provisioned VM must NOT be deleted because a hook failed')
})

test('setup OK but the status=running DB write throws → VM SURVIVES (the killer case)', async () => {
  const deps = makeDeps()
  // Fail ONLY the post-success bookkeeping write — exactly a transient DB blip
  // on a fully-provisioned, paid-for customer box.
  const origUpdate = deps.store.updateVPSInstance.bind(deps.store)
  ;(deps.store as unknown as { updateVPSInstance: (u: string, p: Record<string, unknown>) => Promise<unknown> })
    .updateVPSInstance = async (uuid: string, patch: Record<string, unknown>) => {
      if (patch.status === 'running') throw new Error('ECONNRESET: db blip')
      return origUpdate(uuid, patch as never)
    }

  const r = await spinUpCustomer(INPUT, deps)
  await settle(r.done)

  assert.deepEqual(
    deps.deleted,
    [],
    'a DB hiccup AFTER a successful setup must never destroy the customer agent',
  )
})

test('a surviving (post-success) VM is never marked failed', async () => {
  const statuses: unknown[] = []
  const deps = makeDeps({ notifyVpsReady: async () => { throw new Error('hook down') } })
  const origUpdate = deps.store.updateVPSInstance.bind(deps.store)
  ;(deps.store as unknown as { updateVPSInstance: (u: string, p: Record<string, unknown>) => Promise<unknown> })
    .updateVPSInstance = async (uuid: string, patch: Record<string, unknown>) => {
      if (patch.status) statuses.push(patch.status)
      return origUpdate(uuid, patch as never)
    }

  const r = await spinUpCustomer(INPUT, deps)
  await settle(r.done)

  assert.equal(statuses.includes('failed'), false, 'a healthy provisioned box must not be marked failed')
  assert.deepEqual(deps.deleted, [])
})
