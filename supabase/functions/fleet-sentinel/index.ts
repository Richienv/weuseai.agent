// Deno Edge Function entry — fleet-sentinel.
//
// Fable 5 10x build (2026-06-07).
// Spec:      docs/specs/2026-06-07-fable5-10x-build-spec.md
// Handler:   ../_shared/fleet-sentinel-handler.ts  (pure, fully unit-tested)
// Migration: ../../migrations/20260607000000_fleet_sentinel.sql
//
// Deploy:
//   supabase functions deploy fleet-sentinel --project-ref gtjgsligllbjcisiyrah
//
// Invocation: pg_cron every 15 min via net.http_post (see migration).
// The founder + customers never call this directly.
//
// This is the I/O shell. All decisions live in the pure handler; here we
// (1) read fleet state, (2) read recent alerts for dedup, (3) call the
// handler, (4) execute its actions (Fly /suspend|/resume + lifecycle
// stamp), (5) insert deduped alert rows, (6) DM the founder.
//
// Required env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required env (manual): PROVISIONING_URL, PROVISIONING_AUTH_TOKEN
// Optional env: SUPPORT_TELEGRAM_BOT_TOKEN + RICHIE_CHAT_ID (founder DM;
//   no-op when unset), and the sentinel knobs below.
//
// FLEET_SENTINEL_DRY_RUN=true (recommended first run) → the handler emits
// alerts but NO suspend/resume actions, so thresholds can be tuned against
// the real fleet before the loop is given teeth.

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  fleetSentinelHandler,
  fleetWideChecksHandler,
  DEFAULT_SENTINEL_CONFIG,
  type SentinelVps,
  type ExistingAlert,
  type SentinelConfig,
  type SentinelAlert,
  type SentinelAction,
  type StuckPendingCustomer,
  type BundlePullFailure,
} from '../_shared/fleet-sentinel-handler.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
const FOUNDER_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN') ?? ''
const FOUNDER_CHAT_ID = Deno.env.get('RICHIE_CHAT_ID') ?? ''
// Parent OpenRouter key (same env the key-minter reads). Optional — when
// unset the credit-low probe is skipped, never throws.
const OPENROUTER_PROVISIONING_KEY = Deno.env.get('OPENROUTER_PROVISIONING_KEY') ?? ''

function numEnv(key: string, fallback: number): number {
  const raw = Deno.env.get(key)
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

const config: SentinelConfig = {
  idleSuspendDays: numEnv('IDLE_SUSPEND_DAYS', DEFAULT_SENTINEL_CONFIG.idleSuspendDays),
  orphanProvisionMinutes: numEnv('ORPHAN_PROVISION_MINUTES', DEFAULT_SENTINEL_CONFIG.orphanProvisionMinutes),
  deadAgentHours: numEnv('DEAD_AGENT_HOURS', DEFAULT_SENTINEL_CONFIG.deadAgentHours),
  runawayUsdCents: numEnv('RUNAWAY_USD_CENTS', DEFAULT_SENTINEL_CONFIG.runawayUsdCents),
  dryRun: (Deno.env.get('FLEET_SENTINEL_DRY_RUN') ?? 'false') === 'true',
  stuckPendingMinutes: numEnv('STUCK_PENDING_MINUTES', DEFAULT_SENTINEL_CONFIG.stuckPendingMinutes),
  openrouterLowUsdCents: numEnv('OPENROUTER_LOW_USD_CENTS', DEFAULT_SENTINEL_CONFIG.openrouterLowUsdCents),
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── snapshot builders ───────────────────────────────────────────────────

async function buildSnapshotVpses(): Promise<SentinelVps[]> {
  // vps_instances is the fleet. Join subscription status + always_on in
  // memory (fleet is small enough; the partial indexes keep both cheap).
  const { data: vpsRows, error } = await supabase
    .from('vps_instances')
    .select('customer_id, vps_id, provider, status, lifecycle_state, created_at, last_activity_at')
  if (error || !vpsRows) {
    console.error('[fleet-sentinel] vps_instances query failed:', error?.message)
    return []
  }

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('customer_id, status, always_on_enabled')
  const subByCustomer = new Map<string, { status: string; always_on_enabled: boolean }>()
  for (const s of (subRows ?? []) as Array<{ customer_id: string; status: string; always_on_enabled: boolean }>) {
    // Most-recent wins (last write); good enough — a customer has one live sub.
    subByCustomer.set(s.customer_id, { status: s.status, always_on_enabled: s.always_on_enabled })
  }

  return (vpsRows as Array<{
    customer_id: string
    vps_id: string
    provider: string
    status: SentinelVps['status']
    lifecycle_state: SentinelVps['lifecycle_state']
    created_at: string
    last_activity_at: string | null
  }>).map((v) => {
    const sub = subByCustomer.get(v.customer_id)
    return {
      customer_id: v.customer_id,
      vps_id: v.vps_id,
      provider: v.provider,
      status: v.status,
      lifecycle_state: v.lifecycle_state ?? 'active',
      created_at: v.created_at,
      last_activity_at: v.last_activity_at,
      always_on_enabled: sub?.always_on_enabled ?? false,
      subscription_status: sub?.status ?? 'unknown',
    }
  })
}

async function readRecentAlerts(): Promise<ExistingAlert[]> {
  // Look back 35 days so one-shot buckets (vps_id) for idle/resume/orphan
  // stay deduped across the idle window, and day-bucket alerts dedupe within
  // the day. Append-only table stays small.
  const cutoff = new Date(Date.now() - 35 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('fleet_alerts')
    .select('customer_id, kind, dedup_bucket')
    .gte('created_at', cutoff)
  if (error || !data) return []
  return data as ExistingAlert[]
}

// ─── fleet-wide silent-failure probes (each defensive in isolation) ────────

// 1. STUCK PENDING — subscriptions still pending/pending_provision past the
//    staleness threshold = customer paid, no VPS yet. The handler applies the
//    age cut; here we just narrow to the candidate statuses + index column.
async function probeStuckPending(): Promise<StuckPendingCustomer[]> {
  try {
    const cutoff = new Date(Date.now() - config.stuckPendingMinutes * 60_000).toISOString()
    const { data, error } = await supabase
      .from('subscriptions')
      .select('customer_id, status, started_at')
      .in('status', ['pending', 'pending_provision'])
      .lte('started_at', cutoff)
    if (error || !data) {
      if (error) console.error('[fleet-sentinel] stuck-pending probe failed:', error.message)
      return []
    }
    return (data as Array<{ customer_id: string; status: string; started_at: string | null }>).map((r) => ({
      customer_id: r.customer_id,
      status: r.status,
      started_at: r.started_at,
    }))
  } catch (e) {
    console.error('[fleet-sentinel] stuck-pending probe threw:', e instanceof Error ? e.message : String(e))
    return []
  }
}

// 2. BUNDLE-PULL FAILURES — bundle_pull_attempts rows with a non-success
//    status in the last hour. Fleet-wide failure burst the per-VPS loop
//    can't see.
async function probeBundlePullFailures(): Promise<BundlePullFailure[]> {
  try {
    const cutoff = new Date(Date.now() - 60 * 60_000).toISOString()
    const { data, error } = await supabase
      .from('bundle_pull_attempts')
      .select('customer_id, agent_slug, status')
      .neq('status', 'success')
      .gte('attempted_at', cutoff)
    if (error || !data) {
      if (error) console.error('[fleet-sentinel] bundle-pull probe failed:', error.message)
      return []
    }
    return (data as Array<{ customer_id: string; agent_slug: string; status: string }>).map((r) => ({
      customer_id: r.customer_id,
      agent_slug: r.agent_slug,
      status: r.status,
    }))
  } catch (e) {
    console.error('[fleet-sentinel] bundle-pull probe threw:', e instanceof Error ? e.message : String(e))
    return []
  }
}

// 3. OPENROUTER PARENT CREDIT — the shared provisioning key's remaining
//    balance. Returns null when the key is unset or the call fails (the
//    handler never alerts on a null reading — only on a real low balance).
async function probeOpenrouterBalanceUsdCents(): Promise<number | null> {
  if (!OPENROUTER_PROVISIONING_KEY) return null
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: { authorization: `Bearer ${OPENROUTER_PROVISIONING_KEY}` },
    })
    if (!r.ok) {
      console.error(`[fleet-sentinel] openrouter credits → HTTP ${r.status}`)
      return null
    }
    // GET /credits → { data: { total_credits, total_usage } } (USD floats).
    const body = (await r.json()) as { data?: { total_credits?: number; total_usage?: number } }
    const total = body?.data?.total_credits
    const used = body?.data?.total_usage
    if (typeof total !== 'number' || typeof used !== 'number') {
      console.error('[fleet-sentinel] openrouter credits: unexpected body shape')
      return null
    }
    const remainingUsd = total - used
    return Math.round(remainingUsd * 100)
  } catch (e) {
    console.error('[fleet-sentinel] openrouter credits probe threw:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// ─── executors ─────────────────────────────────────────────────────────────

async function callProvisioning(
  path: '/suspend' | '/resume',
  body: { customerId: string; vpsId: string; provider: string },
): Promise<boolean> {
  const url = PROVISIONING_URL.replace(/\/$/, '') + path
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + PROVISIONING_AUTH_TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      console.error(`[fleet-sentinel] ${path} ${body.vpsId} → HTTP ${r.status}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[fleet-sentinel] ${path} ${body.vpsId} threw:`, e instanceof Error ? e.message : String(e))
    return false
  }
}

async function executeAction(
  action: SentinelAction,
  vpsByCustomer: Map<string, SentinelVps>,
): Promise<void> {
  const vps = vpsByCustomer.get(action.customer_id)
  if (!vps) return
  const ok = await callProvisioning(
    action.type === 'suspend' ? '/suspend' : '/resume',
    { customerId: action.customer_id, vpsId: action.vps_id, provider: vps.provider },
  )
  if (!ok) return
  // Stamp lifecycle_state on the row (the provisioning route only patches
  // status; the sentinel owns lifecycle).
  const patch =
    action.type === 'suspend'
      ? { lifecycle_state: 'suspended', suspended_at: new Date().toISOString() }
      : { lifecycle_state: 'active', suspended_at: null }
  const { error } = await supabase.from('vps_instances').update(patch).eq('vps_id', action.vps_id)
  if (error) console.error(`[fleet-sentinel] lifecycle stamp failed for ${action.vps_id}:`, error.message)
}

async function recordAndAlert(alert: SentinelAlert): Promise<void> {
  // Insert the dedup row first. The UNIQUE (customer_id, kind, dedup_bucket)
  // index makes this race-proof: a duplicate insert errors and we skip the
  // DM, so the founder is never double-pinged even if two ticks overlap.
  const { error } = await supabase.from('fleet_alerts').insert({
    customer_id: alert.customer_id,
    kind: alert.kind,
    dedup_bucket: alert.dedup_bucket,
    detail: alert.detail,
  })
  if (error) {
    // 23505 = unique_violation = the dedup index already recorded this bucket
    // → benign, skip the DM so the founder isn't double-pinged.
    if ((error as { code?: string }).code === '23505') {
      return
    }
    // ANY OTHER insert error (transient DB, RLS/schema drift, the kind CHECK
    // rejecting a new alert kind) must NOT be silently swallowed as if it were
    // a dedup hit — the sentinel's entire job is to make failures loud (runaway
    // spend, dead agents, drained credit). Log it and STILL attempt the DM so a
    // real alert is never masked. Security audit L4 (2026-06-14).
    console.error(
      `[fleet-sentinel] fleet_alerts insert failed ` +
        `(code=${(error as { code?: string }).code ?? '?'}, kind=${alert.kind}, ` +
        `cid=${alert.customer_id}): ${error.message} — sending DM anyway`,
    )
  }
  if (FOUNDER_BOT_TOKEN && FOUNDER_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${FOUNDER_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text: alert.message }),
      })
    } catch (e) {
      console.error('[fleet-sentinel] founder DM failed:', e instanceof Error ? e.message : String(e))
    }
  }
}

// ─── HTTP entry ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Service-role JWT gate (same pattern as retry-pending-provisions). Even a
  // forged token only triggers reversible suspends/resumes on idle rows.
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
  let role: string | null = null
  try {
    const payload = JSON.parse(atob(auth.slice(7).split('.')[1] ?? '')) as { role?: string }
    role = typeof payload?.role === 'string' ? payload.role : null
  } catch {
    // malformed → reject below
  }
  if (role !== 'service_role') return json({ ok: false, error: 'unauthorized' }, 401)
  void SERVICE_KEY

  try {
    const nowMs = Date.now()
    // Gather everything in parallel: the per-VPS snapshot + the three
    // fleet-wide silent-failure probes. Each probe is internally defensive
    // (returns a safe default on failure) so one bad probe never aborts the
    // existing per-VPS loop.
    const [vpses, existingAlerts, stuckPending, bundlePullFailures, openrouterBalanceUsdCents] =
      await Promise.all([
        buildSnapshotVpses(),
        readRecentAlerts(),
        probeStuckPending(),
        probeBundlePullFailures(),
        probeOpenrouterBalanceUsdCents(),
      ])
    const result = fleetSentinelHandler({ vpses, existingAlerts, nowMs }, config)

    // Fleet-wide checks reuse the same alert ledger + dedup + DM path. Wrapped
    // so a throw here can never undo the per-VPS actions already executed.
    let fleetWideAlerts: SentinelAlert[] = []
    try {
      fleetWideAlerts = fleetWideChecksHandler(
        { stuckPending, bundlePullFailures, openrouterBalanceUsdCents, existingAlerts, nowMs },
        config,
      )
    } catch (e) {
      console.error('[fleet-sentinel] fleet-wide checks threw:', e instanceof Error ? e.message : String(e))
    }

    const vpsByCustomer = new Map(vpses.map((v) => [v.customer_id, v]))

    // Execute actions then alerts. Actions are independent per VPS; alerts
    // are deduped at the DB. Run sequentially to keep provider/SSH pressure
    // low (fleet is small; correctness over throughput here).
    for (const action of result.actions) await executeAction(action, vpsByCustomer)
    for (const alert of result.alerts) await recordAndAlert(alert)
    for (const alert of fleetWideAlerts) await recordAndAlert(alert)

    return json({
      ok: true,
      dry_run: config.dryRun,
      fleet_size: vpses.length,
      actions: result.actions.length,
      alerts: result.alerts.length + fleetWideAlerts.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: 'internal', detail: msg }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
