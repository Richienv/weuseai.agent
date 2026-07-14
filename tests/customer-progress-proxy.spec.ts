/**
 * Phase 2 (2026-05-13): customer-progress-proxy Edge Function tests.
 *
 * Pure handler — customerExists + fetchProgress are mocked.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  customerProgressProxyHandler,
  type CustomerProgressProxyDeps,
} from '../supabase/functions/_shared/customer-progress-proxy-handler'

function makeDeps(opts: {
  exists?: boolean
  fetchOk?: boolean
  fetchStatus?: number
  fetchBody?: unknown
  fetchThrows?: boolean
} = {}): CustomerProgressProxyDeps & { state: { fetched: string[] } } {
  const fetched: string[] = []
  return {
    state: { fetched },
    async customerExists() {
      return opts.exists ?? true
    },
    async fetchProgress(customerId) {
      fetched.push(customerId)
      if (opts.fetchThrows) {
        throw new Error('connect ECONNREFUSED')
      }
      return {
        ok: opts.fetchOk ?? true,
        status: opts.fetchStatus ?? 200,
        bodyText: JSON.stringify(opts.fetchBody ?? {
          ok: true,
          vps_id: 'vps-1',
          ip_address: '45.76.163.93',
          progress_lines: ['[00:59:00] Updating apt (timeout 90 sec)...'],
          heartbeat_age_sec: 12,
          heartbeat_stale: false,
          inferred_stage: 'apt_install',
        }),
      }
    },
  }
}

// ─── validation ────────────────────────────────────────────────────────

test('missing customer_id → 400 invalid_customer_id', async () => {
  const r = await customerProgressProxyHandler({ customer_id: '', x_cid: null }, makeDeps())
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 400)
  assert.equal(r.error, 'invalid_customer_id')
})

test('customer not found → 404 customer_not_found (no leak)', async () => {
  const deps = makeDeps({ exists: false })
  const r = await customerProgressProxyHandler({ customer_id: 'cust-fake', x_cid: 'cust-fake' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 404)
  assert.equal(r.error, 'customer_not_found')
  // No upstream fetch when row doesn't exist
  assert.equal(deps.state.fetched.length, 0)
})

// ─── happy path ────────────────────────────────────────────────────────

test('happy path: forwards upstream fields unchanged', async () => {
  const deps = makeDeps()
  const r = await customerProgressProxyHandler({ customer_id: 'cust-1', x_cid: 'cust-1' }, deps)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.vps_id, 'vps-1')
  assert.equal(r.ip_address, '45.76.163.93')
  assert.equal(r.progress_lines.length, 1)
  assert.equal(r.heartbeat_age_sec, 12)
  assert.equal(r.heartbeat_stale, false)
  assert.equal(r.inferred_stage, 'apt_install')
})

test('vps_ip_pending case (VPS row exists but IP not yet allocated) — forwarded as-is', async () => {
  const deps = makeDeps({
    fetchBody: {
      ok: true,
      vps_id: 'vps-x',
      ip_address: null,
      vps_ip_pending: true,
      progress_lines: [],
      heartbeat_age_sec: null,
      heartbeat_stale: false,
      inferred_stage: 'unknown',
    },
  })
  const r = await customerProgressProxyHandler({ customer_id: 'cust-1', x_cid: 'cust-1' }, deps)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.vps_ip_pending, true)
  assert.equal(r.ip_address, null)
})

// ─── upstream failures ────────────────────────────────────────────────

test('provisioning unreachable (throw) → 502 provisioning_unreachable', async () => {
  const deps = makeDeps({ fetchThrows: true })
  const r = await customerProgressProxyHandler({ customer_id: 'cust-1', x_cid: 'cust-1' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 502)
  assert.equal(r.error, 'provisioning_unreachable')
})

test('provisioning returns non-JSON → 502 provisioning_malformed_response', async () => {
  const deps = makeDeps({ fetchBody: undefined })
  // Override the auto-stringify by replacing with raw HTML
  deps.fetchProgress = async () => ({
    ok: true,
    status: 200,
    bodyText: '<html>404</html>',
  })
  const r = await customerProgressProxyHandler({ customer_id: 'cust-1', x_cid: 'cust-1' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 502)
  assert.equal(r.error, 'provisioning_malformed_response')
})

test('provisioning returns non-2xx → status forwarded', async () => {
  const deps = makeDeps({
    fetchOk: false,
    fetchStatus: 404,
    fetchBody: { ok: false, error: 'customer_vps_not_found' },
  })
  const r = await customerProgressProxyHandler({ customer_id: 'cust-1', x_cid: 'cust-1' }, deps)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 404)
  assert.equal(r.error, 'customer_vps_not_found')
})

// ─── Sesi D pass-3 P1-2: X-CID enforcement ─────────────────────────────
//
// Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md §P1-PASS3-2

test('X-CID missing → 403 x_cid_mismatch, no upstream call', async () => {
  const deps = makeDeps()
  const r = await customerProgressProxyHandler(
    { customer_id: 'cust-1', x_cid: null },
    deps,
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'x_cid_mismatch')
  // Don't even reach the upstream — auth fails first
  assert.equal(deps.state.fetched.length, 0)
})

test('X-CID cross-customer (≠ body customer_id) → 403 x_cid_mismatch', async () => {
  const deps = makeDeps()
  const r = await customerProgressProxyHandler(
    { customer_id: 'cust-1', x_cid: 'cust-2' },
    deps,
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'x_cid_mismatch')
  assert.equal(deps.state.fetched.length, 0)
})

test('X-CID empty string → 403 x_cid_mismatch (not treated as match-anything)', async () => {
  const deps = makeDeps()
  const r = await customerProgressProxyHandler(
    { customer_id: 'cust-1', x_cid: '' },
    deps,
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 403)
  assert.equal(r.error, 'x_cid_mismatch')
})

test('X-CID match → 200 (existing happy path preserved)', async () => {
  const deps = makeDeps()
  const r = await customerProgressProxyHandler(
    { customer_id: 'cust-1', x_cid: 'cust-1' },
    deps,
  )
  assert.equal(r.ok, true)
})
