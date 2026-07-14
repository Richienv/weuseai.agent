// Per-customer LLM cost monitoring (Item 3, 2026-05-18 consult).
//
// Two halves, mirroring the fetch.ts / derive.ts split used by the
// customer-onboarding observability surface:
//
//   • deriveLlmCostReport — PURE. Takes raw per-customer cost rows and
//     computes pct-of-cap, the 70%-of-cap alert flag, sort order, and
//     summary counts. No I/O — fully unit-tested in
//     tests/llm-cost-derive.spec.ts.
//
//   • fetchLlmCostRows — I/O. Reads the `customer_llm_cost` Postgres
//     view (customers ⋈ customer_openrouter_keys ⋈ latest snapshot) via
//     PostgREST, then live-refreshes each customer's spend from the
//     OpenRouter management API (GET /keys/{hash}). A per-customer fetch
//     failure degrades that row to cost_source:"unavailable" rather than
//     failing the whole report.
//
// The hard per-customer rate-limit floated in the original consult was
// explicitly dropped by the founder (2026-05-18) — we are not in the
// OpenRouter request path, so the sub-key spend cap IS the hard ceiling.
// This module is monitoring + alerting only.

const DEFAULT_ALERT_THRESHOLD_PCT = 70
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/keys'

/** Where a customer's current spend figure came from. */
export type CostSource = 'openrouter_live' | 'snapshot' | 'unavailable'

/** One customer's raw cost inputs, before pct/alert derivation. */
export interface LlmCostInputRow {
  customer_id: string
  email: string
  /** OpenRouter sub-key spend cap, in USD cents. 0 = unknown/uncapped. */
  credit_limit_usd_cents: number
  /** Current spend, in USD cents. Ignored when cost_source is "unavailable". */
  cost_usd_cents: number
  cost_source: CostSource
}

/** A customer row with pct-of-cap + alert flag computed. */
export interface LlmCostCustomer extends LlmCostInputRow {
  /** Spend as a percentage of cap, 1dp. null when cap is 0/unknown or cost unavailable. */
  pct_used: number | null
  /** True when pct_used is at or above the active alert threshold. */
  alert_70: boolean
}

export interface LlmCostReport {
  generated_at: string
  alert_threshold_pct: number
  customer_count: number
  alert_count: number
  /** Customers sorted by pct_used descending; null pct sorts last. */
  customers: LlmCostCustomer[]
}

export interface DeriveLlmCostOptions {
  /** Injectable clock for deterministic tests. Defaults to new Date(). */
  now?: Date
  /** Alert threshold as a percentage of cap. Defaults to 70. */
  alertThresholdPct?: number
}

/**
 * Compute the per-customer cost report from raw cost rows. Pure — no I/O.
 */
export function deriveLlmCostReport(
  rows: LlmCostInputRow[],
  opts: DeriveLlmCostOptions = {},
): LlmCostReport {
  const now = opts.now ?? new Date()
  const threshold = opts.alertThresholdPct ?? DEFAULT_ALERT_THRESHOLD_PCT

  const customers: LlmCostCustomer[] = rows.map((row) => {
    const known =
      row.cost_source !== 'unavailable' && row.credit_limit_usd_cents > 0
    const pct_used = known
      ? Math.round((1000 * row.cost_usd_cents) / row.credit_limit_usd_cents) / 10
      : null
    const alert_70 = pct_used !== null && pct_used >= threshold
    return { ...row, pct_used, alert_70 }
  })

  // Highest utilization first; unknown (null) utilization sorts last.
  customers.sort((a, b) => {
    if (a.pct_used === null && b.pct_used === null) return 0
    if (a.pct_used === null) return 1
    if (b.pct_used === null) return -1
    return b.pct_used - a.pct_used
  })

  return {
    generated_at: now.toISOString(),
    alert_threshold_pct: threshold,
    customer_count: customers.length,
    alert_count: customers.filter((c) => c.alert_70).length,
    customers,
  }
}

// ─── I/O half ────────────────────────────────────────────────────────────

export interface FetchLlmCostEnv {
  supabaseUrl: string
  supabaseServiceKey: string
  /** OpenRouter management key (env OPENROUTER_PROVISIONING_KEY). */
  openRouterProvisioningKey: string
  /** Optional — defaults to globalThis.fetch. Tests inject a stub. */
  fetchImpl?: typeof fetch
}

interface ViewRow {
  customer_id: string
  email: string
  openrouter_key_hash: string
  credit_limit_usd_cents: number | string
  latest_cost_usd_cents: number | string | null
}

/**
 * Read the customer_llm_cost view and live-refresh each customer's spend
 * from the OpenRouter management API. Returns rows ready for
 * deriveLlmCostReport.
 */
export async function fetchLlmCostRows(
  env: FetchLlmCostEnv,
): Promise<LlmCostInputRow[]> {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error(
      'fetchLlmCostRows: supabaseUrl and supabaseServiceKey must be set',
    )
  }
  const f = env.fetchImpl ?? globalThis.fetch
  const base = env.supabaseUrl.replace(/\/$/, '')
  const viewUrl =
    `${base}/rest/v1/customer_llm_cost` +
    `?select=customer_id,email,openrouter_key_hash,credit_limit_usd_cents,latest_cost_usd_cents`

  const r = await f(viewUrl, {
    headers: {
      apikey: env.supabaseServiceKey,
      Authorization: `Bearer ${env.supabaseServiceKey}`,
      Accept: 'application/json',
    },
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(
      `fetchLlmCostRows[customer_llm_cost] HTTP ${r.status}: ${body.slice(0, 200)}`,
    )
  }
  const viewRows = (await r.json()) as ViewRow[]

  // Live-refresh each customer's spend. Per-customer failures degrade
  // that single row rather than failing the whole report.
  return Promise.all(
    viewRows.map((vr) => refreshOneRow(vr, env, f)),
  )
}

async function refreshOneRow(
  vr: ViewRow,
  env: FetchLlmCostEnv,
  f: typeof fetch,
): Promise<LlmCostInputRow> {
  const cap = toCents(vr.credit_limit_usd_cents)
  const snapshotCost = vr.latest_cost_usd_cents == null
    ? 0
    : toCents(vr.latest_cost_usd_cents)

  const base: Omit<LlmCostInputRow, 'cost_usd_cents' | 'cost_source'> = {
    customer_id: vr.customer_id,
    email: vr.email,
    credit_limit_usd_cents: cap,
  }

  if (!env.openRouterProvisioningKey || !vr.openrouter_key_hash) {
    // No way to live-refresh — fall back to the last stored snapshot.
    return {
      ...base,
      cost_usd_cents: snapshotCost,
      cost_source: vr.latest_cost_usd_cents == null ? 'unavailable' : 'snapshot',
    }
  }

  try {
    const live = await fetchOpenRouterUsageCents(
      vr.openrouter_key_hash,
      env.openRouterProvisioningKey,
      f,
    )
    return { ...base, cost_usd_cents: live, cost_source: 'openrouter_live' }
  } catch {
    // OpenRouter unreachable / key gone — degrade to snapshot if we have
    // one, else mark unavailable so derive won't alert on a stale figure.
    return {
      ...base,
      cost_usd_cents: snapshotCost,
      cost_source: vr.latest_cost_usd_cents == null ? 'unavailable' : 'snapshot',
    }
  }
}

/**
 * GET /api/v1/keys/{hash} on the OpenRouter management API and return the
 * key's cumulative spend in USD cents.
 */
export async function fetchOpenRouterUsageCents(
  hash: string,
  provisioningKey: string,
  f: typeof fetch = globalThis.fetch,
): Promise<number> {
  const r = await f(`${OPENROUTER_KEY_URL}/${encodeURIComponent(hash)}`, {
    headers: {
      authorization: `Bearer ${provisioningKey}`,
      'content-type': 'application/json',
    },
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(
      `OpenRouter GET /keys/${hash} -> ${r.status}: ${body.slice(0, 200)}`,
    )
  }
  const json = (await r.json()) as { data?: { usage?: number } }
  const usageUsd = json.data?.usage
  if (typeof usageUsd !== 'number' || !Number.isFinite(usageUsd)) {
    throw new Error(
      `OpenRouter GET /keys/${hash}: missing or invalid data.usage`,
    )
  }
  // OpenRouter reports usage in USD (float). Our internal unit is cents.
  return Math.round(usageUsd * 100)
}

function toCents(v: number | string): number {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}
