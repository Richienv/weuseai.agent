// Fleet Sentinel — pure decision handler.
//
// Spec: docs/specs/2026-06-07-fable5-10x-build-spec.md
//
// The fleet runs N per-customer Vultr VPSes. Today nothing watches them
// after provision: a dead agent is found only by a customer complaint, an
// abandoned VPS bills $5/mo forever, and the 30-day auto-suspend the unit
// economics assume does not exist. Fleet Sentinel is the control loop that
// fixes that. The decision logic lives here as a PURE function — given a
// snapshot of fleet state it returns the set of actions (suspend/resume)
// and founder alerts to raise, with built-in dedup so a frequent cron never
// spams. The Edge Function (functions/fleet-sentinel) is a dumb executor.
//
// Web-platform only — runs in Deno (production) and Node ≥18 (tests).

import { slog } from './structured-log.ts'

// ─── inputs ──────────────────────────────────────────────────────────────

export type SentinelVps = {
  customer_id: string
  vps_id: string
  provider: string
  /** vps_instances.status */
  status: 'provisioning' | 'running' | 'stopped' | 'failed'
  /** lifecycle_state column (default 'active'). */
  lifecycle_state: 'active' | 'idle_warned' | 'suspended'
  /** ISO8601 — when the VPS row was created (provision start). */
  created_at: string
  /** ISO8601 — last customer activity (usage/onboarding/tier-bump). Null =
   *  never active since provision. */
  last_activity_at: string | null
  /** Always-On add-on — these are NEVER auto-suspended. */
  always_on_enabled: boolean
  /** Subscription status — only 'active' subs are suspend candidates. */
  subscription_status: string
  /** Spend (USD cents) over the sentinel's look-back window. Optional —
   *  omit when the cost join isn't available. */
  spend_usd_cents_window?: number
  /** Most recent bundle-pull outcome for this VPS. false = the agent likely
   *  booted skill-less. Optional. */
  last_bundle_pull_ok?: boolean
}

export type ExistingAlert = {
  customer_id: string
  kind: SentinelAlertKind
  dedup_bucket: string
}

export type SentinelConfig = {
  /** Inactivity (days) before a running VPS is suspended. */
  idleSuspendDays: number
  /** A provisioning row older than this (minutes) is an orphan. */
  orphanProvisionMinutes: number
  /** A once-active VPS silent longer than this (hours) is flagged dead. */
  deadAgentHours: number
  /** Per-customer spend (USD cents) over the window that trips an alert. */
  runawayUsdCents: number
  /** When true, suspend/resume ACTIONS are withheld — alerts still fire
   *  (prefixed DRY-RUN) so thresholds can be tuned against the real fleet
   *  before the loop is given teeth. */
  dryRun: boolean
  /** A subscription stuck in pending/pending_provision older than this
   *  (minutes) means the customer paid but has no VPS yet. */
  stuckPendingMinutes: number
  /** Parent OpenRouter balance (USD cents) at or below which we alert — a
   *  drained parent key 402s every customer at once. */
  openrouterLowUsdCents: number
}

export type FleetSnapshot = {
  vpses: SentinelVps[]
  existingAlerts: ExistingAlert[]
  /** Evaluation clock (ms since epoch). Injected for deterministic tests. */
  nowMs: number
}

// ─── outputs ─────────────────────────────────────────────────────────────

export type SentinelActionType = 'suspend' | 'resume'

export type SentinelAction = {
  type: SentinelActionType
  customer_id: string
  vps_id: string
  reason: string
}

export type SentinelAlertKind =
  | 'idle_suspend'
  | 'resume'
  | 'orphan_provision'
  | 'stale_bundle'
  | 'dead_agent'
  | 'runaway_spend'
  // ── silent-failure monitors (fleet-wide, 2026-06-14) ─────────────────────
  | 'stuck_pending'
  | 'bundle_pull_failures'
  | 'openrouter_credit_low'

export type SentinelAlert = {
  customer_id: string
  kind: SentinelAlertKind
  /** Stable key for `(customer_id, kind)` so the same situation alerts once
   *  per bucket. vps_id for one-shot conditions; a date bucket for
   *  recurring ones (runaway spend). */
  dedup_bucket: string
  detail: Record<string, unknown>
  /** Founder-facing Telegram line. */
  message: string
}

export type SentinelResult = {
  actions: SentinelAction[]
  alerts: SentinelAlert[]
}

// ─── helpers ───────────────────────────────────────────────────────────────

const MS_PER_MIN = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

function ageMs(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return nowMs - t
}

/** UTC date bucket (YYYY-MM-DD) for recurring-alert dedup. */
function dayBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

// ─── handler ───────────────────────────────────────────────────────────────

export function fleetSentinelHandler(
  snapshot: FleetSnapshot,
  config: SentinelConfig,
): SentinelResult {
  const { nowMs } = snapshot
  const actions: SentinelAction[] = []
  const alerts: SentinelAlert[] = []

  // O(1) dedup lookup.
  const seen = new Set(
    snapshot.existingAlerts.map((a) => `${a.customer_id} ${a.kind} ${a.dedup_bucket}`),
  )
  const alreadyAlerted = (customer_id: string, kind: SentinelAlertKind, bucket: string) =>
    seen.has(`${customer_id} ${kind} ${bucket}`)

  const dryTag = config.dryRun ? '[DRY-RUN] ' : ''

  for (const vps of snapshot.vpses) {
    // Idle is measured ONLY from real recorded activity (last_activity_at).
    // NEVER fall back to created_at — provisioning age is not activity: a box
    // created 60d ago but messaged every day is NOT idle. When no activity has
    // been recorded yet (null), idle is UNKNOWN, so the destructive suspend
    // path below must not fire. created_at still drives orphan detection via
    // provisioningAgeMs (a separate, non-destructive, alert-only signal).
    const idleMs = ageMs(vps.last_activity_at, nowMs)
    const provisioningAgeMs = ageMs(vps.created_at, nowMs)

    // ── 1. Orphaned provision (alert-only; never auto-reaped) ────────────
    if (
      vps.status === 'provisioning' &&
      provisioningAgeMs !== null &&
      provisioningAgeMs >= config.orphanProvisionMinutes * MS_PER_MIN
    ) {
      const bucket = vps.vps_id
      if (!alreadyAlerted(vps.customer_id, 'orphan_provision', bucket)) {
        const mins = Math.round(provisioningAgeMs / MS_PER_MIN)
        alerts.push({
          customer_id: vps.customer_id,
          kind: 'orphan_provision',
          dedup_bucket: bucket,
          detail: { vps_id: vps.vps_id, provider: vps.provider, stuck_minutes: mins },
          message:
            `🛠️ Provision stuck: customer ${vps.customer_id} VPS ${vps.vps_id} ` +
            `has been 'provisioning' for ${mins} min (provider ${vps.provider}). ` +
            `It is likely orphaned and billing — check / reap.`,
        })
        slog('error', 'sentinel.orphan_provision', {
          customerId: vps.customer_id,
          vpsId: vps.vps_id,
          provider: vps.provider,
          stuckMinutes: mins,
        })
      }
      // A stuck-provisioning VPS is not a suspend/resume/health candidate.
      continue
    }

    // ── 2. Resume — a suspended VPS that shows fresh activity ────────────
    if (vps.lifecycle_state === 'suspended') {
      const recentlyActive =
        idleMs !== null && idleMs < config.idleSuspendDays * MS_PER_DAY
      if (recentlyActive && vps.subscription_status === 'active') {
        if (!config.dryRun) {
          actions.push({
            type: 'resume',
            customer_id: vps.customer_id,
            vps_id: vps.vps_id,
            reason: 'activity-after-suspend',
          })
        }
        const bucket = vps.vps_id
        if (!alreadyAlerted(vps.customer_id, 'resume', bucket)) {
          alerts.push({
            customer_id: vps.customer_id,
            kind: 'resume',
            dedup_bucket: bucket,
            detail: { vps_id: vps.vps_id },
            message:
              `${dryTag}▶️ Resuming customer ${vps.customer_id}: activity detected on a ` +
              `suspended VPS (${vps.vps_id}).`,
          })
          slog('info', 'sentinel.resume', {
            customerId: vps.customer_id,
            vpsId: vps.vps_id,
            dryRun: config.dryRun,
          })
        }
      }
      // Suspended VPSes are not suspend/health candidates.
      continue
    }

    // ── 3. Idle → suspend (the missing 30-day survival mechanism) ────────
    const suspendable =
      vps.status === 'running' &&
      vps.subscription_status === 'active' &&
      !vps.always_on_enabled
    if (
      suspendable &&
      idleMs !== null &&
      idleMs >= config.idleSuspendDays * MS_PER_DAY
    ) {
      if (!config.dryRun) {
        actions.push({
          type: 'suspend',
          customer_id: vps.customer_id,
          vps_id: vps.vps_id,
          reason: `idle-${config.idleSuspendDays}d`,
        })
      }
      const bucket = vps.vps_id
      if (!alreadyAlerted(vps.customer_id, 'idle_suspend', bucket)) {
        const days = Math.floor(idleMs / MS_PER_DAY)
        alerts.push({
          customer_id: vps.customer_id,
          kind: 'idle_suspend',
          dedup_bucket: bucket,
          detail: { vps_id: vps.vps_id, idle_days: days },
          message:
            `${dryTag}💤 Suspending customer ${vps.customer_id}: VPS ${vps.vps_id} idle ` +
            `${days}d (≥ ${config.idleSuspendDays}d). Compute halted, storage retained.`,
        })
        slog('info', 'sentinel.idle_suspend', {
          customerId: vps.customer_id,
          vpsId: vps.vps_id,
          idleDays: days,
          dryRun: config.dryRun,
        })
      }
      // Suspended this tick — don't also health-check it.
      continue
    }

    // ── 4. Stale bundle-pull (agent likely booted skill-less) ────────────
    if (vps.status === 'running' && vps.last_bundle_pull_ok === false) {
      const bucket = `${vps.vps_id} ${dayBucket(nowMs)}`
      if (!alreadyAlerted(vps.customer_id, 'stale_bundle', bucket)) {
        alerts.push({
          customer_id: vps.customer_id,
          kind: 'stale_bundle',
          dedup_bucket: bucket,
          detail: { vps_id: vps.vps_id },
          message:
            `⚠️ Bundle-pull failing for customer ${vps.customer_id} (VPS ${vps.vps_id}) — ` +
            `the agent may be running without its skills. Check Storage / logs.`,
        })
        slog('warn', 'sentinel.stale_bundle', {
          customerId: vps.customer_id,
          vpsId: vps.vps_id,
        })
      }
    }

    // ── 5. Dead agent — was active, now silent past the health window ────
    // Requires prior activity (last_activity_at set) so a brand-new customer
    // who hasn't messaged yet is never falsely flagged.
    const silentMs = ageMs(vps.last_activity_at, nowMs)
    if (
      vps.status === 'running' &&
      vps.subscription_status === 'active' &&
      vps.last_activity_at !== null &&
      silentMs !== null &&
      silentMs >= config.deadAgentHours * MS_PER_HOUR &&
      silentMs < config.idleSuspendDays * MS_PER_DAY // beyond this it's the idle path
    ) {
      const bucket = `${vps.vps_id} ${dayBucket(nowMs)}`
      if (!alreadyAlerted(vps.customer_id, 'dead_agent', bucket)) {
        const hours = Math.floor(silentMs / MS_PER_HOUR)
        alerts.push({
          customer_id: vps.customer_id,
          kind: 'dead_agent',
          dedup_bucket: bucket,
          detail: { vps_id: vps.vps_id, silent_hours: hours },
          message:
            `🔕 Customer ${vps.customer_id} (VPS ${vps.vps_id}) was active but has gone ` +
            `silent for ${hours}h. Agent may be down — worth a health check.`,
        })
        slog('error', 'sentinel.dead_agent', {
          customerId: vps.customer_id,
          vpsId: vps.vps_id,
          silentHours: hours,
        })
      }
    }

    // ── 6. Runaway spend (delivery on the existing admin cost view) ──────
    if (
      typeof vps.spend_usd_cents_window === 'number' &&
      vps.spend_usd_cents_window >= config.runawayUsdCents
    ) {
      const bucket = dayBucket(nowMs)
      if (!alreadyAlerted(vps.customer_id, 'runaway_spend', bucket)) {
        const usd = (vps.spend_usd_cents_window / 100).toFixed(2)
        alerts.push({
          customer_id: vps.customer_id,
          kind: 'runaway_spend',
          dedup_bucket: bucket,
          detail: {
            vps_id: vps.vps_id,
            spend_usd_cents: vps.spend_usd_cents_window,
          },
          message:
            `💸 Runaway spend: customer ${vps.customer_id} burned $${usd} in the window ` +
            `(≥ $${(config.runawayUsdCents / 100).toFixed(2)}). Check for a stuck retry loop.`,
        })
        slog('error', 'sentinel.runaway_spend', {
          customerId: vps.customer_id,
          vpsId: vps.vps_id,
          spendUsdCents: vps.spend_usd_cents_window,
        })
      }
    }
  }

  return { actions, alerts }
}

// ─── fleet-wide silent-failure monitors (2026-06-14) ──────────────────────
//
// The per-VPS loop above watches the fleet AFTER provision. These three
// checks catch failures that the per-VPS loop structurally can't see:
//   1. STUCK PENDING  — a customer PAID but no VPS row exists yet (the
//      subscription is still 'pending'/'pending_provision'). The per-VPS
//      loop never runs because there is no vps_instances row to iterate.
//   2. BUNDLE-PULL FAILURES — fleet-wide bundle-pull failure rate in the
//      last hour. (The per-VPS `stale_bundle` check only sees the LAST pull
//      flag joined onto a running VPS; this catches a burst across the fleet.)
//   3. OPENROUTER PARENT CREDIT LOW — the shared provisioning key's balance.
//      When it drains, EVERY customer 402s at once — a single fleet-wide
//      signal, not a per-customer one.
//
// All three are pure: the Edge Function gathers the raw signals (each in its
// own try/catch so one failing probe never breaks the others or the per-VPS
// loop) and passes them here. Dedup reuses the same `existingAlerts` ledger
// and day-bucket pattern so the 15-min cron re-pings at most once per day per
// condition while keeping the count in the message informative.

export type StuckPendingCustomer = {
  customer_id: string
  /** ISO8601 — subscriptions.started_at. */
  started_at: string | null
  status: string
}

export type BundlePullFailure = {
  customer_id: string
  agent_slug: string
  status: string
}

export type FleetWideSnapshot = {
  /** Subscriptions still pending/pending_provision (any age — the handler
   *  applies the staleness threshold). Empty/omitted = probe skipped or no
   *  rows. */
  stuckPending?: StuckPendingCustomer[]
  /** Bundle-pull rows with status != 'success' in the look-back window.
   *  Empty/omitted = probe skipped or no failures. */
  bundlePullFailures?: BundlePullFailure[]
  /** Remaining parent OpenRouter balance in USD cents. null/undefined =
   *  probe failed or skipped (no alert — never alerts on a failed probe). */
  openrouterBalanceUsdCents?: number | null
  existingAlerts: ExistingAlert[]
  nowMs: number
}

/** Sentinel customer_id for fleet-wide (not per-customer) alerts. The
 *  fleet_alerts.customer_id column is nullable; the dedup key for these
 *  alerts is therefore (null, kind, bucket). */
export const FLEET_WIDE_CUSTOMER_ID = null as unknown as string

export function fleetWideChecksHandler(
  snapshot: FleetWideSnapshot,
  config: SentinelConfig,
): SentinelAlert[] {
  const { nowMs } = snapshot
  const alerts: SentinelAlert[] = []

  const seen = new Set(
    snapshot.existingAlerts.map((a) => `${a.customer_id} ${a.kind} ${a.dedup_bucket}`),
  )
  const alreadyAlerted = (customer_id: string | null, kind: SentinelAlertKind, bucket: string) =>
    seen.has(`${customer_id} ${kind} ${bucket}`)

  const today = dayBucket(nowMs)

  // ── 1. STUCK PENDING — paid, no VPS ────────────────────────────────────
  const stuck = (snapshot.stuckPending ?? []).filter((s) => {
    const age = ageMs(s.started_at, nowMs)
    return age !== null && age >= config.stuckPendingMinutes * MS_PER_MIN
  })
  if (stuck.length > 0) {
    // Day-bucket so it re-pings at most once/day while the condition holds.
    const bucket = today
    if (!alreadyAlerted(FLEET_WIDE_CUSTOMER_ID, 'stuck_pending', bucket)) {
      const ids = stuck.map((s) => s.customer_id)
      const idList = ids.slice(0, 20).join(', ') + (ids.length > 20 ? ', …' : '')
      const mins = config.stuckPendingMinutes
      alerts.push({
        customer_id: FLEET_WIDE_CUSTOMER_ID,
        kind: 'stuck_pending',
        dedup_bucket: bucket,
        detail: { count: ids.length, customer_ids: ids },
        message:
          `🧾 Stuck provisioning: ${ids.length} customer(s) paid but still have ` +
          `no VPS after ${mins}+ min (status pending/pending_provision). ` +
          `Customer ids: ${idList}. Check the provisioning chain.`,
      })
      slog('error', 'sentinel.stuck_pending', {
        count: ids.length,
        thresholdMinutes: mins,
        customerIds: ids,
      })
    }
  }

  // ── 2. BUNDLE-PULL FAILURES — fleet-wide failure burst ─────────────────
  const failures = snapshot.bundlePullFailures ?? []
  if (failures.length > 0) {
    const bucket = today
    if (!alreadyAlerted(FLEET_WIDE_CUSTOMER_ID, 'bundle_pull_failures', bucket)) {
      const customers = [...new Set(failures.map((f) => f.customer_id))]
      const personas = [...new Set(failures.map((f) => f.agent_slug))]
      const custList = customers.slice(0, 20).join(', ') + (customers.length > 20 ? ', …' : '')
      const personaList =
        personas.slice(0, 20).join(', ') + (personas.length > 20 ? ', …' : '')
      alerts.push({
        customer_id: FLEET_WIDE_CUSTOMER_ID,
        kind: 'bundle_pull_failures',
        dedup_bucket: bucket,
        detail: {
          attempts: failures.length,
          customer_ids: customers,
          personas,
        },
        message:
          `⚠️ Bundle-pull failures: ${failures.length} failed attempt(s) in the last ` +
          `hour across ${customers.length} customer(s). Personas: ${personaList}. ` +
          `Customers: ${custList}. Agents may be booting without skills.`,
      })
      slog('error', 'sentinel.bundle_pull_failures', {
        attempts: failures.length,
        customerIds: customers,
        personas,
      })
    }
  }

  // ── 3. OPENROUTER PARENT CREDIT LOW — never 402 the whole fleet ────────
  // Only alert on a real reading; a failed probe (null/undefined) is silent
  // here (the Edge Function logs the probe failure separately).
  const balance = snapshot.openrouterBalanceUsdCents
  if (typeof balance === 'number' && Number.isFinite(balance) && balance <= config.openrouterLowUsdCents) {
    const bucket = today
    if (!alreadyAlerted(FLEET_WIDE_CUSTOMER_ID, 'openrouter_credit_low', bucket)) {
      const usd = (balance / 100).toFixed(2)
      const threshold = (config.openrouterLowUsdCents / 100).toFixed(2)
      alerts.push({
        customer_id: FLEET_WIDE_CUSTOMER_ID,
        kind: 'openrouter_credit_low',
        dedup_bucket: bucket,
        detail: { balance_usd_cents: balance, threshold_usd_cents: config.openrouterLowUsdCents },
        message:
          `💳 OpenRouter parent credit low: $${usd} left (≤ $${threshold}). ` +
          `Top up the provisioning key before every customer starts 402-ing.`,
      })
      slog('error', 'sentinel.openrouter_credit_low', {
        balanceUsdCents: balance,
        thresholdUsdCents: config.openrouterLowUsdCents,
      })
    }
  }

  return alerts
}

// ─── default config (env-overridable in the Edge Function) ────────────────

export const DEFAULT_SENTINEL_CONFIG: SentinelConfig = {
  idleSuspendDays: 30,
  orphanProvisionMinutes: 30,
  deadAgentHours: 48,
  runawayUsdCents: 500,
  dryRun: false,
  stuckPendingMinutes: 120, // ~2h — paid, but still no VPS
  openrouterLowUsdCents: 2000, // < $20 parent credit
}
