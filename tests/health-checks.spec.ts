// Health-check pure runner tests.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CUSTOMER_ROUTES,
  EDGE_FUNCTION_PROBES,
  EXPECTED_TABLES,
  checkCustomerRoutes,
  checkEdgeFunctions,
  checkSchemaTables,
  renderSuite,
  rollUp,
  runHealthChecks,
  suiteExitCode,
  type CheckResult,
  type Deps,
  type HttpProbe,
  type SqlQuery,
} from '../scripts/lib/health-checks.ts'

const NOW = '2026-05-10 18:30:00 UTC'
const SUPABASE_FN_BASE = 'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1'
const SITE_BASE = 'https://weuseai-agent.vercel.app'

function makeDeps(overrides?: Partial<Deps>): Deps {
  return {
    http: async () => ({ status: 200, ok: true }),
    sql: async () => [],
    supabaseFunctionsBaseUrl: SUPABASE_FN_BASE,
    customerSiteBaseUrl: SITE_BASE,
    now: () => NOW,
    ...overrides,
  }
}

// ─── Static catalog drift ─────────────────────────────────────────

test('EDGE_FUNCTION_PROBES covers core paid + onboarding flow functions', () => {
  const names = new Set(EDGE_FUNCTION_PROBES.map((p) => p.name))
  // Phase 1-5 base
  for (const expected of [
    'validate-bot-token',
    'pair-customer-bot-webhook',
    'complete-onboarding',
    'telegram-bot-webhook',
    'xendit-webhook',
    'hyperframes-render',
    'hermes-kanban-proxy',
    'approval-queue',
    'roadmap-state',
    // Sesi B P0 #E (2026-05-12): paid + onboarding-critical functions
    // that previously had no probe — silent failures invisible to
    // health-check.
    'create-invoice',
    'save-onboarding-profile',
    'reset-bot-pairing',
    'rotate-pairing-code',
    'customer-readiness',
  ]) {
    assert.ok(names.has(expected), `EDGE_FUNCTION_PROBES missing ${expected}`)
  }
})

test('EXPECTED_TABLES includes all 17 post-Phase 6-1.a tables', () => {
  // 17 because Phase 1+ base (4) + 2E-2 (1) + 4-5b (2) + 5-1.a (3) +
  // 5-3.a (1) + admin scaffolding (1) + 6-1.a (5) = 17.
  assert.equal(EXPECTED_TABLES.length, 17)
  // Spot check key tables per phase
  for (const t of [
    'customers',
    'business_roadmap_state',
    'bd_decisions_log',
    'support_tickets',
    'department_workspaces',
    'persona_memories',
  ]) {
    assert.ok(
      (EXPECTED_TABLES as readonly string[]).includes(t),
      `EXPECTED_TABLES missing ${t}`,
    )
  }
})

test('CUSTOMER_ROUTES includes landing + checkout + legal pages', () => {
  assert.deepEqual([...CUSTOMER_ROUTES].sort(), [
    '/',
    '/checkout',
    '/contact',
    '/onboarding',
    '/privacy',
    '/refund-policy',
    '/robots.txt',
    '/sitemap.xml',
    '/terms',
    '/use-cases',
    '/welcome',
  ])
})

// ─── Edge Function checks ─────────────────────────────────────────

test('checkEdgeFunctions: all expected statuses returned → all green', async () => {
  let calls = 0
  const http: HttpProbe = async (input) => {
    calls++
    // Map probe name to its first expected status
    const name = input.url.split('/').pop()!
    const probe = EDGE_FUNCTION_PROBES.find((p) => p.name === name)
    return { status: probe!.expectedStatuses[0], ok: false }
  }
  const results = await checkEdgeFunctions(makeDeps({ http }))
  assert.equal(calls, EDGE_FUNCTION_PROBES.length)
  for (const r of results) {
    assert.equal(r.status, 'green', `${r.name} should be green`)
    assert.equal(r.category, 'Edge Functions')
  }
})

test('checkEdgeFunctions: 404 → red (function not deployed)', async () => {
  const http: HttpProbe = async () => ({ status: 404, ok: false })
  const results = await checkEdgeFunctions(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'red', `${r.name} should flag 404 as red`)
    assert.match(r.detail, /not deployed/)
  }
})

test('checkEdgeFunctions: 500 → red (function crashed)', async () => {
  const http: HttpProbe = async () => ({ status: 500, ok: false })
  const results = await checkEdgeFunctions(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'red')
    assert.match(r.detail, /crashed/)
  }
})

test('checkEdgeFunctions: unexpected status (e.g. 200) → yellow', async () => {
  const http: HttpProbe = async () => ({ status: 200, ok: true })
  const results = await checkEdgeFunctions(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'yellow', `${r.name} should flag unexpected 200 as yellow`)
  }
})

test('checkEdgeFunctions: network error → yellow (transient)', async () => {
  const http: HttpProbe = async () => {
    throw new Error('ECONNREFUSED')
  }
  const results = await checkEdgeFunctions(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'yellow')
    assert.match(r.detail, /network error/)
  }
})

// ─── Schema table checks ──────────────────────────────────────────

test('checkSchemaTables: all tables present → all green', async () => {
  const sql: SqlQuery = async () =>
    EXPECTED_TABLES.map((t) => ({ table_name: t }))
  const results = await checkSchemaTables(makeDeps({ sql }))
  for (const r of results) {
    assert.equal(r.status, 'green')
    assert.equal(r.detail, 'present')
  }
})

test('checkSchemaTables: missing tables → red', async () => {
  // Only return half of expected tables
  const sql: SqlQuery = async () =>
    EXPECTED_TABLES.slice(0, EXPECTED_TABLES.length / 2).map((t) => ({
      table_name: t,
    }))
  const results = await checkSchemaTables(makeDeps({ sql }))
  const reds = results.filter((r) => r.status === 'red')
  assert.ok(reds.length > 0, 'should have at least 1 red')
  for (const r of reds) {
    assert.equal(r.detail, 'MISSING')
  }
})

test('checkSchemaTables: SQL query fails → all tables red', async () => {
  const sql: SqlQuery = async () => {
    throw new Error('Mgmt API 401')
  }
  const results = await checkSchemaTables(makeDeps({ sql }))
  assert.equal(results.length, EXPECTED_TABLES.length)
  for (const r of results) {
    assert.equal(r.status, 'red')
    assert.match(r.detail, /schema query failed/)
  }
})

// ─── Customer route checks ────────────────────────────────────────

test('checkCustomerRoutes: 200 → green', async () => {
  const http: HttpProbe = async () => ({ status: 200, ok: true })
  const results = await checkCustomerRoutes(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'green')
    assert.equal(r.detail, '200')
  }
})

test('checkCustomerRoutes: 308 redirect (Vercel cleanUrls) → green', async () => {
  const http: HttpProbe = async () => ({ status: 308, ok: false })
  const results = await checkCustomerRoutes(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'green', '308 should map green (Vercel cleanUrls)')
    assert.match(r.detail, /redirect/)
  }
})

test('checkCustomerRoutes: 404 → yellow (may be intentional)', async () => {
  const http: HttpProbe = async () => ({ status: 404, ok: false })
  const results = await checkCustomerRoutes(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'yellow')
  }
})

test('checkCustomerRoutes: 500 → red (server error)', async () => {
  const http: HttpProbe = async () => ({ status: 500, ok: false })
  const results = await checkCustomerRoutes(makeDeps({ http }))
  for (const r of results) {
    assert.equal(r.status, 'red')
  }
})

// ─── Roll-up ──────────────────────────────────────────────────────

test('rollUp: any red → overall red', () => {
  const checks: CheckResult[] = [
    { name: 'a', status: 'green', detail: 'ok', category: 'X' },
    { name: 'b', status: 'red', detail: 'down', category: 'X' },
    { name: 'c', status: 'yellow', detail: 'meh', category: 'X' },
  ]
  const suite = rollUp(checks, NOW)
  assert.equal(suite.overall, 'red')
  assert.equal(suite.green_count, 1)
  assert.equal(suite.yellow_count, 1)
  assert.equal(suite.red_count, 1)
})

test('rollUp: any yellow + no red → overall yellow', () => {
  const checks: CheckResult[] = [
    { name: 'a', status: 'green', detail: 'ok', category: 'X' },
    { name: 'b', status: 'yellow', detail: 'meh', category: 'X' },
  ]
  assert.equal(rollUp(checks, NOW).overall, 'yellow')
})

test('rollUp: all green → overall green', () => {
  const checks: CheckResult[] = [
    { name: 'a', status: 'green', detail: 'ok', category: 'X' },
    { name: 'b', status: 'green', detail: 'ok', category: 'Y' },
  ]
  assert.equal(rollUp(checks, NOW).overall, 'green')
})

test('rollUp: groups results by category', () => {
  const checks: CheckResult[] = [
    { name: 'a', status: 'green', detail: '', category: 'X' },
    { name: 'b', status: 'green', detail: '', category: 'X' },
    { name: 'c', status: 'green', detail: '', category: 'Y' },
  ]
  const suite = rollUp(checks, NOW)
  assert.equal(suite.by_category['X'].length, 2)
  assert.equal(suite.by_category['Y'].length, 1)
})

// ─── Top-level runner ─────────────────────────────────────────────

test('runHealthChecks: all-green path produces overall green', async () => {
  const http: HttpProbe = async (input) => {
    const name = input.url.split('/').pop()!
    const probe = EDGE_FUNCTION_PROBES.find((p) => p.name === name)
    if (probe) return { status: probe.expectedStatuses[0], ok: false }
    return { status: 200, ok: true } // customer route
  }
  const sql: SqlQuery = async () =>
    EXPECTED_TABLES.map((t) => ({ table_name: t }))
  const suite = await runHealthChecks(makeDeps({ http, sql }))
  assert.equal(suite.overall, 'green')
  assert.equal(suite.red_count, 0)
  assert.equal(
    suite.total_checks,
    EDGE_FUNCTION_PROBES.length + EXPECTED_TABLES.length + CUSTOMER_ROUTES.length,
  )
})

test('runHealthChecks: missing schema tables surface as red rolling up overall', async () => {
  const http: HttpProbe = async (input) => {
    const name = input.url.split('/').pop()!
    const probe = EDGE_FUNCTION_PROBES.find((p) => p.name === name)
    if (probe) return { status: probe.expectedStatuses[0], ok: false }
    return { status: 200, ok: true }
  }
  const sql: SqlQuery = async () => [] // no tables present!
  const suite = await runHealthChecks(makeDeps({ http, sql }))
  assert.equal(suite.overall, 'red')
  assert.equal(suite.red_count, EXPECTED_TABLES.length)
})

// ─── Renderer ─────────────────────────────────────────────────────

test('renderSuite: includes all categories + overall line', () => {
  const checks: CheckResult[] = [
    { name: 'fn-a', status: 'green', detail: '405', category: 'Edge Functions' },
    { name: 'tbl-x', status: 'green', detail: 'present', category: 'Schema Tables' },
    { name: '/', status: 'green', detail: '200', category: 'Customer Routes' },
  ]
  const suite = rollUp(checks, NOW)
  const out = renderSuite(suite, { noColor: true })
  assert.match(out, /Edge Functions: GREEN/)
  assert.match(out, /Schema Tables: GREEN/)
  assert.match(out, /Customer Routes: GREEN/)
  assert.match(out, /Overall: GREEN/)
})

test('renderSuite: --no-color produces no ANSI escape sequences', () => {
  const checks: CheckResult[] = [
    { name: 'fn-a', status: 'red', detail: 'down', category: 'Edge Functions' },
  ]
  const suite = rollUp(checks, NOW)
  const out = renderSuite(suite, { noColor: true })
  // ANSI escape = \x1b[...m
  assert.ok(!/\x1b\[/.test(out), 'output must not contain ANSI escape sequences')
})

test('renderSuite: shows worst-status per category in header color', () => {
  const checks: CheckResult[] = [
    { name: 'fn-a', status: 'green', detail: '', category: 'Edge Functions' },
    { name: 'fn-b', status: 'red', detail: '', category: 'Edge Functions' },
  ]
  const suite = rollUp(checks, NOW)
  const out = renderSuite(suite, { noColor: true })
  assert.match(out, /Edge Functions: RED/, 'category header should reflect worst status')
})

// ─── Exit codes ──────────────────────────────────────────────────

test('suiteExitCode: green=0, yellow=1, red=2', () => {
  for (const [overall, code] of [
    ['green', 0],
    ['yellow', 1],
    ['red', 2],
  ] as const) {
    const suite = rollUp(
      [{ name: 'x', status: overall, detail: '', category: 'X' }],
      NOW,
    )
    assert.equal(suiteExitCode(suite), code)
  }
})
