/**
 * D1 multi-persona webhook push (2026-05-12): broadcast handler tests.
 * Pure handler — provisioning HTTP + telemetry insert are mocked.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleBundleVersionBumpBroadcast,
  type AffectedCustomer,
  type BroadcastDeps,
} from '../supabase/functions/_shared/bundle-version-bump-broadcast-handler'

function makeDeps(opts: {
  customers: AffectedCustomer[]
  triggerOk?: boolean | ((customerId: string) => boolean)
}): BroadcastDeps & {
  state: {
    triggerCalls: { customerId: string; reason: string }[]
    broadcastRows: Array<{ agent_slug: string; customer_id: string; status: string; detail: string | null }>
  }
} {
  const triggerCalls: { customerId: string; reason: string }[] = []
  const broadcastRows: Array<{ agent_slug: string; customer_id: string; status: string; detail: string | null }> = []
  return {
    state: { triggerCalls, broadcastRows },
    async findCustomersOnLatestPolicy() {
      return opts.customers
    },
    async triggerRestart(customerId, reason) {
      triggerCalls.push({ customerId, reason })
      const ok = typeof opts.triggerOk === 'function' ? opts.triggerOk(customerId) : opts.triggerOk ?? true
      return ok
        ? { ok: true, status: 200 }
        : { ok: false, status: 502, error: 'ssh_restart_failed' }
    },
    async recordBroadcast(row) {
      broadcastRows.push({
        agent_slug: row.agent_slug,
        customer_id: row.customer_id,
        status: row.status,
        detail: row.detail,
      })
    },
  }
}

// ─── validation ─────────────────────────────────────────────────────────

test('rejects missing agent_slug (400 invalid_agent_slug)', async () => {
  const deps = makeDeps({ customers: [] })
  const r = await handleBundleVersionBumpBroadcast({ agent_slug: '' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 400)
  assert.equal(r.error, 'invalid_agent_slug')
})

test('rejects unknown agent_slug (400 unknown_agent_slug)', async () => {
  const deps = makeDeps({ customers: [] })
  const r = await handleBundleVersionBumpBroadcast({ agent_slug: 'unicorn-persona' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 400)
  assert.equal(r.error, 'unknown_agent_slug')
})

// ─── tier eligibility filter ────────────────────────────────────────────

test('only restarts customers whose tier includes the bumped slug', async () => {
  // web-app-builder is Studio-only. Starter + Pro customers must be skipped.
  const deps = makeDeps({
    customers: [
      { id: 'c-starter', tier: 'starter' },
      { id: 'c-pro', tier: 'pro' },
      { id: 'c-studio', tier: 'studio' },
    ],
  })
  const r = await handleBundleVersionBumpBroadcast(
    { agent_slug: 'web-app-builder', new_version: '2.1.0' },
    deps,
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.matched, 3, 'all 3 customers seen')
  assert.equal(r.restarted, 1, 'only studio customer restarted')
  assert.equal(r.skipped_tier, 2)
  assert.equal(deps.state.triggerCalls.length, 1)
  assert.equal(deps.state.triggerCalls[0].customerId, 'c-studio')
})

test('the-pro is in every tier — all customers get restarted', async () => {
  const deps = makeDeps({
    customers: [
      { id: 'c-starter', tier: 'starter' },
      { id: 'c-pro', tier: 'pro' },
      { id: 'c-studio', tier: 'studio' },
    ],
  })
  const r = await handleBundleVersionBumpBroadcast({ agent_slug: 'the-pro' }, deps)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.matched, 3)
  assert.equal(r.restarted, 3)
  assert.equal(r.skipped_tier, 0)
})

// ─── per-customer failure isolation ─────────────────────────────────────

test('one customer SSH failure does not block the rest', async () => {
  const deps = makeDeps({
    customers: [
      { id: 'c-good-1', tier: 'pro' },
      { id: 'c-bad', tier: 'pro' },
      { id: 'c-good-2', tier: 'pro' },
    ],
    triggerOk: (cid) => cid !== 'c-bad',
  })
  const r = await handleBundleVersionBumpBroadcast(
    { agent_slug: 'doc-expert', new_version: '2.0.1' },
    deps,
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.matched, 3)
  assert.equal(r.restarted, 2)
  assert.equal(r.failed, 1)
  // Per-customer rows present for all 3
  assert.equal(r.per_customer.length, 3)
  const bad = r.per_customer.find((p) => p.customer_id === 'c-bad')
  assert.ok(bad && bad.status === 'failed')
  assert.match(bad.detail ?? '', /provisioning HTTP 502/)
})

// ─── telemetry contract ─────────────────────────────────────────────────

test('telemetry: every customer has a recordBroadcast row (success or failure)', async () => {
  const deps = makeDeps({
    customers: [
      { id: 'c1', tier: 'pro' },
      { id: 'c2', tier: 'starter' }, // skipped tier (deep-researcher is Pro+)
    ],
  })
  await handleBundleVersionBumpBroadcast({ agent_slug: 'deep-researcher' }, deps)
  assert.equal(deps.state.broadcastRows.length, 2)
  const c1Row = deps.state.broadcastRows.find((r) => r.customer_id === 'c1')
  const c2Row = deps.state.broadcastRows.find((r) => r.customer_id === 'c2')
  assert.equal(c1Row?.status, 'restarted')
  assert.equal(c2Row?.status, 'skipped_tier')
})

test('telemetry: agent_slug + new_version preserved across rows', async () => {
  const deps = makeDeps({ customers: [{ id: 'c1', tier: 'pro' }] })
  await handleBundleVersionBumpBroadcast(
    { agent_slug: 'doc-expert', new_version: '2.5.0' },
    deps,
  )
  assert.equal(deps.state.broadcastRows[0].agent_slug, 'doc-expert')
})

// ─── reason composition ────────────────────────────────────────────────

test('reason passed to triggerRestart includes slug+version+caller-reason', async () => {
  const deps = makeDeps({ customers: [{ id: 'c1', tier: 'pro' }] })
  await handleBundleVersionBumpBroadcast(
    { agent_slug: 'doc-expert', new_version: '2.5.0', reason: 'admin-cli' },
    deps,
  )
  assert.equal(deps.state.triggerCalls[0].reason, 'bundle-version-bump:doc-expert@2.5.0:admin-cli')
})

test('reason without new_version + reason still well-formed', async () => {
  const deps = makeDeps({ customers: [{ id: 'c1', tier: 'pro' }] })
  await handleBundleVersionBumpBroadcast({ agent_slug: 'the-pro' }, deps)
  assert.equal(deps.state.triggerCalls[0].reason, 'bundle-version-bump:the-pro')
})

// ─── empty customer list ───────────────────────────────────────────────

test('no customers on latest-policy → ok with zeros, no triggers', async () => {
  const deps = makeDeps({ customers: [] })
  const r = await handleBundleVersionBumpBroadcast({ agent_slug: 'the-pro' }, deps)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.matched, 0)
  assert.equal(r.restarted, 0)
  assert.equal(deps.state.triggerCalls.length, 0)
})
