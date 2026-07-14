// Health-check pure logic.
//
// `npm run health-check` (CLI dispatcher → scripts/cli/health.ts) wires
// real fetch + Mgmt-API query and pipes into runHealthChecks(). Tests
// inject mocks.
//
// Output model
// ────────────
//   - Each check returns { name, status: green|yellow|red, detail }.
//   - Suite rolls up to the WORST check's color (any red → red; any
//     yellow + no red → yellow; otherwise green).
//
// Exit codes
// ──────────
//   0  green
//   1  yellow (degraded; non-critical issue)
//   2  red (critical; founder must investigate)

// ─── Types ─────────────────────────────────────────────────────────

export type CheckStatus = 'green' | 'yellow' | 'red'

export type CheckResult = {
  /** Short human-readable label (e.g. "approval-queue") */
  name: string
  status: CheckStatus
  /** One-line detail explaining the verdict */
  detail: string
  /** Subcategory for dashboard grouping (e.g. "Edge Functions") */
  category: string
}

export type SuiteResult = {
  overall: CheckStatus
  by_category: Record<string, CheckResult[]>
  total_checks: number
  green_count: number
  yellow_count: number
  red_count: number
  ran_at: string
}

// ─── Injected dependencies (real impls in scripts/cli/health.ts) ──

export type HttpProbe = (input: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{ status: number; ok: boolean }>

export type SqlQuery = (sql: string) => Promise<unknown[]>

export type Deps = {
  http: HttpProbe
  sql: SqlQuery
  /** Base URL for Supabase Edge Functions (e.g. https://<project>.supabase.co/functions/v1) */
  supabaseFunctionsBaseUrl: string
  /** Vercel-deployed customer-facing site (e.g. https://weuseai-agent-...vercel.app) */
  customerSiteBaseUrl: string
  now: () => string
}

// ─── Expected probes ──────────────────────────────────────────────

/** Edge Function probes — each function is hit with a no-auth request
 *  and the EXPECTED status code asserts the function is alive + correctly
 *  rejecting unauth. Live status:
 *    400 = method-correct but body-missing/invalid → handler reachable
 *    401 = auth gate fired → handler reachable
 *    405 = method gate fired → handler reachable
 *    404 = function not deployed → RED
 *    5xx = function crashed → RED
 *    timeout / network err → YELLOW (transient) */
export const EDGE_FUNCTION_PROBES: {
  name: string
  method: string
  expectedStatuses: number[]
}[] = [
  // Phase 1+ originals
  // validate-bot-token has verify-jwt ENABLED (Supabase default) — calls
  // without a Supabase JWT get 401 from the gateway before reaching the
  // handler. Expected 401 reflects "function deployed + auth gate firing."
  { name: 'validate-bot-token', method: 'POST', expectedStatuses: [401] },
  { name: 'pair-customer-bot-webhook', method: 'POST', expectedStatuses: [401, 400] },
  { name: 'complete-onboarding', method: 'POST', expectedStatuses: [400, 401] },
  { name: 'telegram-bot-webhook', method: 'POST', expectedStatuses: [401] },
  { name: 'xendit-webhook', method: 'POST', expectedStatuses: [400, 401] },
  // Phase 4-2
  { name: 'hyperframes-render', method: 'POST', expectedStatuses: [400] },
  // Phase 4-5b
  { name: 'hermes-kanban-proxy', method: 'GET', expectedStatuses: [405] },
  // Phase 5-3.b
  { name: 'approval-queue', method: 'GET', expectedStatuses: [400] },
  { name: 'roadmap-state', method: 'GET', expectedStatuses: [400] },
  // Sesi B P0 #E (2026-05-12): paid + onboarding critical flows previously
  // unmonitored. Expected statuses verified by hitting deployed prod
  // functions with empty bodies / wrong methods so the auth/method/param
  // gate fires before the handler does real work.
  //  - create-invoice: anon JWT required (verify-jwt ON) → 401 on empty POST
  //  - save-onboarding-profile: 400 on missing customer_id field
  //  - reset-bot-pairing: 400 on missing customer_id
  //  - rotate-pairing-code: 400 on missing customer_id
  //  - customer-readiness: 400 on missing customer_id
  { name: 'create-invoice', method: 'POST', expectedStatuses: [400, 401] },
  { name: 'save-onboarding-profile', method: 'POST', expectedStatuses: [400, 401] },
  { name: 'reset-bot-pairing', method: 'POST', expectedStatuses: [400, 401] },
  { name: 'rotate-pairing-code', method: 'POST', expectedStatuses: [400, 401] },
  { name: 'customer-readiness', method: 'GET', expectedStatuses: [400, 401] },
]

/** Schema tables expected to exist on prod (post-Phase 6-1.a). */
export const EXPECTED_TABLES: readonly string[] = [
  // Phase 1+ base
  'customers',
  'subscriptions',
  'vps_instances',
  'usage_log',
  // Phase 2E-2
  'bundle_pull_attempts',
  // Phase 4-5b
  'hermes_kanban_boards',
  'hermes_kanban_tasks',
  // Phase 5-1.a
  'business_roadmap_state',
  'approval_requests',
  'department_threads',
  // Phase 5-3.a
  'bd_decisions_log',
  // Admin scaffolding (PR #35)
  'support_tickets',
  // Phase 6-1.a
  'department_workspaces',
  'approval_patterns',
  'daily_digests',
  'codebase_integrations',
  'persona_memories',
] as const

/** Customer-facing routes — each must return 200.
 *
 * Sesi B P0 #E (2026-05-12): expanded to include the new legal-pack
 * pages (privacy / terms / refund-policy / contact) + sitemap.xml +
 * robots.txt — these are launch-blockers if they 404. */
export const CUSTOMER_ROUTES: readonly string[] = [
  '/',
  '/checkout',
  '/onboarding',
  '/welcome',
  '/use-cases',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/contact',
  '/sitemap.xml',
  '/robots.txt',
] as const

// ─── Per-check runners ─────────────────────────────────────────────

export async function checkEdgeFunctions(deps: Deps): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const probe of EDGE_FUNCTION_PROBES) {
    const url = `${deps.supabaseFunctionsBaseUrl}/${probe.name}`
    try {
      const r = await deps.http({
        url,
        method: probe.method,
        headers: { 'content-type': 'application/json' },
        body: probe.method === 'POST' ? '{}' : undefined,
      })
      if (probe.expectedStatuses.includes(r.status)) {
        results.push({
          name: probe.name,
          status: 'green',
          detail: `${r.status} (expected one of ${probe.expectedStatuses.join('/')})`,
          category: 'Edge Functions',
        })
      } else if (r.status === 404) {
        results.push({
          name: probe.name,
          status: 'red',
          detail: `404 — function not deployed`,
          category: 'Edge Functions',
        })
      } else if (r.status >= 500) {
        results.push({
          name: probe.name,
          status: 'red',
          detail: `${r.status} — function crashed`,
          category: 'Edge Functions',
        })
      } else {
        results.push({
          name: probe.name,
          status: 'yellow',
          detail: `${r.status} — unexpected (expected ${probe.expectedStatuses.join('/')})`,
          category: 'Edge Functions',
        })
      }
    } catch (e) {
      results.push({
        name: probe.name,
        status: 'yellow',
        detail: `network error — ${e instanceof Error ? e.message : String(e)}`,
        category: 'Edge Functions',
      })
    }
  }
  return results
}

export async function checkSchemaTables(deps: Deps): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  let rows: unknown[]
  try {
    rows = await deps.sql(
      `select table_name from information_schema.tables where table_schema='public' and table_name in (${EXPECTED_TABLES.map(
        (t) => `'${t}'`,
      ).join(',')}) order by table_name`,
    )
  } catch (e) {
    // SQL access failed entirely → all tables show as red
    return EXPECTED_TABLES.map((t) => ({
      name: t,
      status: 'red' as const,
      detail: `schema query failed: ${e instanceof Error ? e.message : String(e)}`,
      category: 'Schema Tables',
    }))
  }
  const present = new Set(
    rows.map((r) => (r as { table_name?: string }).table_name).filter(Boolean) as string[],
  )
  for (const t of EXPECTED_TABLES) {
    if (present.has(t)) {
      results.push({
        name: t,
        status: 'green',
        detail: 'present',
        category: 'Schema Tables',
      })
    } else {
      results.push({
        name: t,
        status: 'red',
        detail: 'MISSING',
        category: 'Schema Tables',
      })
    }
  }
  return results
}

export async function checkCustomerRoutes(deps: Deps): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const route of CUSTOMER_ROUTES) {
    const url = `${deps.customerSiteBaseUrl}${route}`
    try {
      const r = await deps.http({ url, method: 'GET' })
      if (r.status === 200) {
        results.push({
          name: route,
          status: 'green',
          detail: '200',
          category: 'Customer Routes',
        })
      } else if (r.status === 308 || r.status === 301 || r.status === 302) {
        // Redirect — Vercel cleanUrls strips .html. Treat as green.
        results.push({
          name: route,
          status: 'green',
          detail: `${r.status} (redirect)`,
          category: 'Customer Routes',
        })
      } else if (r.status === 404) {
        results.push({
          name: route,
          status: 'yellow',
          detail: '404 — route missing (may be intentional)',
          category: 'Customer Routes',
        })
      } else if (r.status >= 500) {
        results.push({
          name: route,
          status: 'red',
          detail: `${r.status} — server error`,
          category: 'Customer Routes',
        })
      } else {
        results.push({
          name: route,
          status: 'yellow',
          detail: `${r.status} — unexpected`,
          category: 'Customer Routes',
        })
      }
    } catch (e) {
      results.push({
        name: route,
        status: 'yellow',
        detail: `network error — ${e instanceof Error ? e.message : String(e)}`,
        category: 'Customer Routes',
      })
    }
  }
  return results
}

// ─── Suite roll-up ─────────────────────────────────────────────────

export function rollUp(results: CheckResult[], ran_at: string): SuiteResult {
  const by_category: Record<string, CheckResult[]> = {}
  let green_count = 0
  let yellow_count = 0
  let red_count = 0
  for (const r of results) {
    by_category[r.category] ??= []
    by_category[r.category].push(r)
    if (r.status === 'green') green_count++
    else if (r.status === 'yellow') yellow_count++
    else red_count++
  }
  const overall: CheckStatus =
    red_count > 0 ? 'red' : yellow_count > 0 ? 'yellow' : 'green'
  return {
    overall,
    by_category,
    total_checks: results.length,
    green_count,
    yellow_count,
    red_count,
    ran_at,
  }
}

// ─── Top-level runner ──────────────────────────────────────────────

export async function runHealthChecks(deps: Deps): Promise<SuiteResult> {
  const all: CheckResult[] = []
  all.push(...(await checkEdgeFunctions(deps)))
  all.push(...(await checkSchemaTables(deps)))
  all.push(...(await checkCustomerRoutes(deps)))
  return rollUp(all, deps.now())
}

// ─── Render ────────────────────────────────────────────────────────

const COLOR_RESET = '\x1b[0m'
const COLOR_GREEN = '\x1b[32m'
const COLOR_YELLOW = '\x1b[33m'
const COLOR_RED = '\x1b[31m'
const COLOR_BOLD = '\x1b[1m'

const STATUS_GLYPHS: Record<CheckStatus, string> = {
  green: '✓',
  yellow: '⚠',
  red: '✗',
}

const STATUS_COLORS: Record<CheckStatus, string> = {
  green: COLOR_GREEN,
  yellow: COLOR_YELLOW,
  red: COLOR_RED,
}

export type RenderOptions = {
  noColor?: boolean
}

export function renderSuite(suite: SuiteResult, opts?: RenderOptions): string {
  const useColor = !opts?.noColor
  const c = (s: string, code: string) => (useColor ? `${code}${s}${COLOR_RESET}` : s)

  const lines: string[] = []
  lines.push('')
  lines.push(c(`=== weuseai.agent — Health Check (${suite.ran_at}) ===`, COLOR_BOLD))
  lines.push('')

  for (const [category, checks] of Object.entries(suite.by_category)) {
    const worst = (checks.find((r) => r.status === 'red')?.status ??
      checks.find((r) => r.status === 'yellow')?.status ??
      'green') as CheckStatus
    const header = `${category}: ${worst.toUpperCase()}`
    lines.push(c(header, STATUS_COLORS[worst]))
    for (const check of checks) {
      const glyph = c(STATUS_GLYPHS[check.status], STATUS_COLORS[check.status])
      const padName = check.name.padEnd(36)
      lines.push(`  ${glyph} ${padName} ${check.detail}`)
    }
    lines.push('')
  }

  const overallLine = `Overall: ${suite.overall.toUpperCase()}  ` +
    `(${suite.green_count} green, ${suite.yellow_count} yellow, ${suite.red_count} red)`
  lines.push(c(overallLine, STATUS_COLORS[suite.overall]))
  lines.push('')

  return lines.join('\n')
}

/** Map suite verdict to process exit code. */
export function suiteExitCode(suite: SuiteResult): number {
  if (suite.overall === 'green') return 0
  if (suite.overall === 'yellow') return 1
  return 2
}
