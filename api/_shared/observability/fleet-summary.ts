/**
 * Vercel Function: /api/admin/observability/fleet-summary
 *
 * Founder-daily fleet overview — high-density single-call view of every
 * thing worth glancing at: customer counts by subscription state, VPS
 * health, recent revenue, cost-alert count, parked flow-state runs at
 * risk of TTL expiry. P4I admin dashboard enhancement (2026-05-22
 * consult).
 *
 * Auth model: Bearer ${OBSERVABILITY_ADMIN_SECRET} required. Fail-closed
 * same as cost.ts / customer.ts / template-no-match.ts.
 *
 * Request:
 *   GET /api/admin/observability/fleet-summary[?days=30]
 *     days — revenue + signup window in days (default 30, max 365)
 *
 * Response (200):
 *   {
 *     generated_at,
 *     window_days,
 *     customers: { total, active, paused, canceled, failed, signups_in_window },
 *     vps: { total, running, provisioning, failed, stopped },
 *     revenue: {
 *       window_days, paid_invoices_count, paid_idr_total,
 *       paid_idr_setup, paid_idr_hosting, by_day: [{day, idr_total}]
 *     },
 *     flow_state_parked: {
 *       total_parked, awaiting_customer, escalated,
 *       expiring_within_3_days: [{ id, customer_id, playbook_id, expires_at }]
 *     },
 *     template_no_match: { events_in_window_count }
 *   }
 *
 * Required Vercel env: OBSERVABILITY_ADMIN_SECRET, SUPABASE_URL,
 * SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { isValidBearer } from '../../_shared/timing-safe-bearer.js'
import { isValidAdminCookie } from '../../_shared/admin-cookie-auth.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 365
const EXPIRING_SOON_DAYS = 3

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
  url?: string
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

type CustomerRow = { id: string; created_at: string }
type SubscriptionRow = { status: string }
type VpsRow = { status: string }
type InvoiceRow = {
  status: string
  amount_idr: number
  paid_at: string | null
  kind: string
}
type FlowRow = {
  id: string
  customer_id: string
  playbook_id: string
  status: string
  expires_at: string | null
}
type NoMatchRow = { id: string }

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const auth = (req.headers.authorization ?? '') as string
  if (!ADMIN_SECRET) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  // Bearer (legacy) OR weuseai_admin_session cookie (admin browser pages).
  if (!isValidBearer(auth, ADMIN_SECRET) && !isValidAdminCookie(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // ── Args ───────────────────────────────────────────────────────
  const daysRaw = readQuery(req, 'days')
  let days = DEFAULT_WINDOW_DAYS
  if (daysRaw) {
    const parsed = Number(daysRaw)
    if (!Number.isFinite(parsed) || parsed < 1) {
      res.status(400).json({ error: 'bad_days', detail: 'days must be integer >= 1' })
      return
    }
    days = Math.min(Math.floor(parsed), MAX_WINDOW_DAYS)
  }

  // ── Fetch ──────────────────────────────────────────────────────
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const expiringBefore = new Date(
    Date.now() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const base = SUPABASE_URL.replace(/\/$/, '')
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    Accept: 'application/json',
  }

  let customers: CustomerRow[]
  let subscriptions: SubscriptionRow[]
  let vps: VpsRow[]
  let invoices: InvoiceRow[]
  let flowRows: FlowRow[]
  let expiringFlow: FlowRow[]
  let noMatch: NoMatchRow[]
  try {
    const [c, s, v, i, f, ef, nm] = await Promise.all([
      fetchJson<CustomerRow[]>(`${base}/rest/v1/customers?select=id,created_at`, headers),
      fetchJson<SubscriptionRow[]>(`${base}/rest/v1/subscriptions?select=status`, headers),
      fetchJson<VpsRow[]>(`${base}/rest/v1/vps_instances?select=status`, headers),
      fetchJson<InvoiceRow[]>(
        `${base}/rest/v1/subscription_invoices?select=status,amount_idr,paid_at,kind&paid_at=gte.${encodeURIComponent(since)}&status=eq.paid`,
        headers,
      ),
      fetchJson<FlowRow[]>(
        `${base}/rest/v1/customer_flow_state?select=id,customer_id,playbook_id,status,expires_at&status=in.(awaiting_customer,escalated)`,
        headers,
      ),
      fetchJson<FlowRow[]>(
        `${base}/rest/v1/customer_flow_state?select=id,customer_id,playbook_id,status,expires_at&status=in.(awaiting_customer,escalated)&expires_at=not.is.null&expires_at=lt.${encodeURIComponent(expiringBefore)}&order=expires_at.asc`,
        headers,
      ),
      fetchJson<NoMatchRow[]>(
        `${base}/rest/v1/template_no_match_log?select=id&created_at=gte.${encodeURIComponent(since)}`,
        headers,
      ),
    ])
    customers = c
    subscriptions = s
    vps = v
    invoices = i
    flowRows = f
    expiringFlow = ef
    noMatch = nm
  } catch (e) {
    res.status(502).json({
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  // ── Derive ─────────────────────────────────────────────────────
  const sinceMs = new Date(since).getTime()
  const signupsInWindow = customers.filter((c) => new Date(c.created_at).getTime() >= sinceMs).length

  const subCounts = countBy(subscriptions, (r) => r.status)
  const vpsCounts = countBy(vps, (r) => r.status)
  const flowCounts = countBy(flowRows, (r) => r.status)

  const paidIdrTotal = invoices.reduce((sum, r) => sum + (r.amount_idr || 0), 0)
  const paidIdrSetup = invoices
    .filter((r) => /setup/i.test(r.kind))
    .reduce((sum, r) => sum + (r.amount_idr || 0), 0)
  const paidIdrHosting = invoices
    .filter((r) => /hosting|recurring|month/i.test(r.kind))
    .reduce((sum, r) => sum + (r.amount_idr || 0), 0)

  // Daily revenue: group paid invoices by YYYY-MM-DD
  const byDayMap = new Map<string, number>()
  for (const inv of invoices) {
    if (!inv.paid_at) continue
    const day = inv.paid_at.slice(0, 10)
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + (inv.amount_idr || 0))
  }
  const by_day = [...byDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, idr_total]) => ({ day, idr_total }))

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    generated_at: new Date().toISOString(),
    window_days: days,
    customers: {
      total: customers.length,
      active: subCounts.active ?? 0,
      paused: subCounts.paused ?? 0,
      canceled: subCounts.canceled ?? 0,
      pending: (subCounts.pending ?? 0) + (subCounts.pending_provision ?? 0),
      failed: subCounts.failed ?? 0,
      signups_in_window: signupsInWindow,
    },
    vps: {
      total: vps.length,
      running: vpsCounts.running ?? 0,
      provisioning: vpsCounts.provisioning ?? 0,
      failed: vpsCounts.failed ?? 0,
      stopped: vpsCounts.stopped ?? 0,
    },
    revenue: {
      window_days: days,
      paid_invoices_count: invoices.length,
      paid_idr_total: paidIdrTotal,
      paid_idr_setup: paidIdrSetup,
      paid_idr_hosting: paidIdrHosting,
      by_day,
    },
    flow_state_parked: {
      total_parked: flowRows.length,
      awaiting_customer: flowCounts.awaiting_customer ?? 0,
      escalated: flowCounts.escalated ?? 0,
      expiring_within_3_days: expiringFlow.map((r) => ({
        id: r.id,
        customer_id: r.customer_id,
        playbook_id: r.playbook_id,
        expires_at: r.expires_at,
      })),
    },
    template_no_match: { events_in_window_count: noMatch.length },
  })
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`PostgREST HTTP ${r.status} (${url.slice(url.indexOf('/rest/v1/'))}): ${body.slice(0, 200)}`)
  }
  return (await r.json()) as T
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = key(r)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function readQuery(req: VercelRequest, key: string): string | null {
  const v = req.query?.[key]
  if (Array.isArray(v)) return v[0] ?? null
  if (typeof v === 'string') return v
  const url = req.url
  if (typeof url === 'string') {
    try {
      const u = new URL(url, 'http://x')
      const q = u.searchParams.get(key)
      if (q !== null) return q
    } catch {
      // ignore
    }
  }
  return null
}
