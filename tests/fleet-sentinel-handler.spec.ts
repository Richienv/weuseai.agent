/**
 * Fleet Sentinel — pure decision-handler tests.
 *
 * Covers: idle→suspend, Always-On exemption, suspend gating, resume on
 * activity, orphan-provision alert, stale-bundle, dead-agent, runaway-spend,
 * dedup suppression, and dry-run (alerts but no actions). The handler is the
 * brain of the control loop; if these pass the Edge Function is just I/O.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  fleetSentinelHandler,
  DEFAULT_SENTINEL_CONFIG,
  type FleetSnapshot,
  type SentinelVps,
  type SentinelConfig,
  type ExistingAlert,
} from '../supabase/functions/_shared/fleet-sentinel-handler.ts'

const NOW = Date.parse('2026-06-10T12:00:00.000Z')
const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}
function hoursAgo(n: number): string {
  return new Date(NOW - n * HOUR).toISOString()
}
function minsAgo(n: number): string {
  return new Date(NOW - n * MIN).toISOString()
}

function vps(over: Partial<SentinelVps> = {}): SentinelVps {
  return {
    customer_id: 'cust-1',
    vps_id: 'vps-1',
    provider: 'vultr',
    status: 'running',
    lifecycle_state: 'active',
    created_at: daysAgo(60),
    last_activity_at: daysAgo(1),
    always_on_enabled: false,
    subscription_status: 'active',
    ...over,
  }
}

function snapshot(vpses: SentinelVps[], existingAlerts: ExistingAlert[] = []): FleetSnapshot {
  return { vpses, existingAlerts, nowMs: NOW }
}

const CFG: SentinelConfig = { ...DEFAULT_SENTINEL_CONFIG }

// ─── idle → suspend ─────────────────────────────────────────────────────

test('idle 31d running VPS → suspend action + idle_suspend alert', () => {
  const r = fleetSentinelHandler(snapshot([vps({ last_activity_at: daysAgo(31) })]), CFG)
  assert.equal(r.actions.length, 1)
  assert.equal(r.actions[0].type, 'suspend')
  assert.equal(r.actions[0].vps_id, 'vps-1')
  assert.equal(r.alerts.length, 1)
  assert.equal(r.alerts[0].kind, 'idle_suspend')
  assert.equal(r.alerts[0].detail.idle_days, 31)
})

test('active-yesterday VPS is NOT suspended', () => {
  const r = fleetSentinelHandler(snapshot([vps({ last_activity_at: daysAgo(1) })]), CFG)
  assert.equal(r.actions.length, 0)
  assert.equal(r.alerts.filter((a) => a.kind === 'idle_suspend').length, 0)
})

test('Always-On idle VPS is exempt from suspend', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: daysAgo(90), always_on_enabled: true })]),
    CFG,
  )
  assert.equal(r.actions.length, 0)
})

test('never-active VPS uses created_at; suspended only once past the window', () => {
  // created 60d ago, never any activity → idle by created_at.
  const r = fleetSentinelHandler(snapshot([vps({ last_activity_at: null })]), CFG)
  assert.equal(r.actions.length, 1)
  assert.equal(r.actions[0].type, 'suspend')
})

test('idle VPS on a non-active subscription is not suspended', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: daysAgo(40), subscription_status: 'paused' })]),
    CFG,
  )
  assert.equal(r.actions.length, 0)
})

test('idle VPS that is not running (stopped) is not suspended again', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ status: 'stopped', last_activity_at: daysAgo(40) })]),
    CFG,
  )
  assert.equal(r.actions.length, 0)
})

// ─── resume ──────────────────────────────────────────────────────────────

test('suspended VPS with fresh activity → resume action + resume alert', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ lifecycle_state: 'suspended', status: 'stopped', last_activity_at: hoursAgo(2) })]),
    CFG,
  )
  assert.equal(r.actions.length, 1)
  assert.equal(r.actions[0].type, 'resume')
  assert.equal(r.alerts[0].kind, 'resume')
})

test('suspended VPS still idle → no resume', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ lifecycle_state: 'suspended', status: 'stopped', last_activity_at: daysAgo(40) })]),
    CFG,
  )
  assert.equal(r.actions.length, 0)
})

// ─── orphan provision ─────────────────────────────────────────────────────

test('provisioning > 30 min → orphan_provision alert, no action', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ status: 'provisioning', created_at: minsAgo(45), last_activity_at: null })]),
    CFG,
  )
  assert.equal(r.actions.length, 0, 'orphans are alert-only, never auto-reaped')
  assert.equal(r.alerts.length, 1)
  assert.equal(r.alerts[0].kind, 'orphan_provision')
  assert.equal(r.alerts[0].detail.stuck_minutes, 45)
})

test('provisioning < 30 min is healthy (no alert)', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ status: 'provisioning', created_at: minsAgo(5), last_activity_at: null })]),
    CFG,
  )
  assert.equal(r.alerts.length, 0)
})

// ─── stale bundle / dead agent ─────────────────────────────────────────────

test('running VPS with failing bundle-pull → stale_bundle alert', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: hoursAgo(1), last_bundle_pull_ok: false })]),
    CFG,
  )
  assert.equal(r.alerts.filter((a) => a.kind === 'stale_bundle').length, 1)
})

test('once-active VPS silent 50h → dead_agent alert', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: hoursAgo(50) })]),
    CFG,
  )
  assert.equal(r.alerts.filter((a) => a.kind === 'dead_agent').length, 1)
})

test('brand-new VPS that never had activity is NOT flagged dead', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ created_at: hoursAgo(50), last_activity_at: null })]),
    CFG,
  )
  assert.equal(r.alerts.filter((a) => a.kind === 'dead_agent').length, 0)
})

// ─── runaway spend ─────────────────────────────────────────────────────────

test('spend over threshold → runaway_spend alert', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: hoursAgo(1), spend_usd_cents_window: 750 })]),
    CFG,
  )
  const a = r.alerts.find((x) => x.kind === 'runaway_spend')
  assert.ok(a)
  assert.equal(a!.detail.spend_usd_cents, 750)
})

test('spend under threshold → no runaway alert', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: hoursAgo(1), spend_usd_cents_window: 120 })]),
    CFG,
  )
  assert.equal(r.alerts.filter((a) => a.kind === 'runaway_spend').length, 0)
})

// ─── dedup ───────────────────────────────────────────────────────────────

test('dedup: an already-recorded alert is suppressed', () => {
  const existing: ExistingAlert[] = [
    { customer_id: 'cust-1', kind: 'idle_suspend', dedup_bucket: 'vps-1' },
  ]
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: daysAgo(40) })], existing),
    CFG,
  )
  // Action still fires (the suspend is idempotent at the executor), but the
  // alert is suppressed so a frequent cron won't re-spam the founder.
  assert.equal(r.alerts.filter((a) => a.kind === 'idle_suspend').length, 0)
})

test('idempotent: re-running over already-suspended state takes no action', () => {
  // After a suspend, lifecycle_state flips to 'suspended' and the VPS is
  // stopped + still idle → the next tick neither re-suspends nor resumes.
  const r = fleetSentinelHandler(
    snapshot([vps({ lifecycle_state: 'suspended', status: 'stopped', last_activity_at: daysAgo(40) })]),
    CFG,
  )
  assert.equal(r.actions.length, 0)
  assert.equal(r.alerts.length, 0)
})

// ─── dry run ───────────────────────────────────────────────────────────────

test('dry-run: idle VPS produces an alert but NO suspend action', () => {
  const r = fleetSentinelHandler(
    snapshot([vps({ last_activity_at: daysAgo(40) })]),
    { ...CFG, dryRun: true },
  )
  assert.equal(r.actions.length, 0, 'dry-run withholds actions')
  assert.equal(r.alerts.length, 1)
  assert.match(r.alerts[0].message, /\[DRY-RUN\]/)
})

// ─── fleet-level ───────────────────────────────────────────────────────────

test('mixed fleet: independent per-VPS decisions', () => {
  const r = fleetSentinelHandler(
    snapshot([
      vps({ customer_id: 'a', vps_id: 'va', last_activity_at: daysAgo(40) }),       // suspend
      vps({ customer_id: 'b', vps_id: 'vb', last_activity_at: daysAgo(1) }),         // healthy
      vps({ customer_id: 'c', vps_id: 'vc', status: 'provisioning', created_at: minsAgo(60), last_activity_at: null }), // orphan
      vps({ customer_id: 'd', vps_id: 'vd', always_on_enabled: true, last_activity_at: daysAgo(99) }), // exempt
    ]),
    CFG,
  )
  assert.equal(r.actions.length, 1)
  assert.equal(r.actions[0].customer_id, 'a')
  assert.deepEqual(
    r.alerts.map((a) => `${a.customer_id}:${a.kind}`).sort(),
    ['a:idle_suspend', 'c:orphan_provision'],
  )
})
