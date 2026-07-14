// Drift test — block USING (true) on customer-scoped tables.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md
//   Recommendation: "drift test or migration template preventing
//    USING (true) on any table with customer_id"
//
// Pass-1 P0-1 fixed the anti-pattern on Phase 5 tables. Phase 6-1.a
// migration repeated it (caught by pass-2 P0-1, fixed in #53). Without
// a guardrail, the next phase migration is likely to repeat again.
//
// Two test layers:
//   1. Scanner unit tests — synthesized fixtures (one fail, one pass,
//      escape-comment honored, supersede-by-DROP-then-CREATE honored).
//   2. Live drift gate — walk supabase/migrations/*.sql and assert no
//      effective USING (true) policy on any customer-scoped table.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { scanMigrations, type Migration } from './_helpers/rls-drift-scanner.ts'

// ─── Layer 1: scanner unit tests with synthesized fixtures ─────────

test('scanner: flags CREATE POLICY USING (true) on customer_id-bound table', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_create_invoices.sql',
      contents: `
        CREATE TABLE public.invoices (
          id uuid primary key,
          customer_id uuid not null
        );
        ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "anon read invoices"
          ON public.invoices FOR SELECT
          TO anon
          USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.equal(findings.length, 1, 'expected 1 finding')
  assert.equal(findings[0].table, 'invoices')
  assert.equal(findings[0].policy, 'anon read invoices')
  assert.match(
    findings[0].reason,
    /customer_id|customer-scoped/i,
    'reason must mention customer-scoping',
  )
})

test('scanner: flags policy on `customers` table itself (treats id as customer scope)', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_customers.sql',
      contents: `
        CREATE TABLE public.customers (
          id uuid primary key,
          email text
        );
        CREATE POLICY "anon read all customers"
          ON public.customers FOR SELECT
          TO anon
          USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].table, 'customers')
})

test('scanner: ignores USING (true) on non-customer-scoped reference catalog', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_workflows.sql',
      contents: `
        CREATE TABLE public.workflows (
          id uuid primary key,
          name text not null
        );
        CREATE POLICY "anon read workflow catalog"
          ON public.workflows FOR SELECT
          TO anon
          USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.deepEqual(
    findings,
    [],
    'workflows is a public reference catalog, no customer_id — should not flag',
  )
})

test('scanner: ignores customer_id-bound table when later migration DROPs the offending policy', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_create.sql',
      contents: `
        CREATE TABLE public.t (id uuid primary key, customer_id uuid);
        CREATE POLICY "leaky" ON public.t FOR SELECT TO anon USING (true);
      `,
    },
    {
      filename: '20260201000000_fix.sql',
      contents: `
        DROP POLICY IF EXISTS "leaky" ON public.t;
        CREATE POLICY "deny" ON public.t FOR SELECT TO anon USING (false);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.deepEqual(
    findings,
    [],
    'effective state is USING (false) — superseded — should not flag',
  )
})

test('scanner: respects -- ALLOW-USING-TRUE: <reason> escape comment immediately above', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_intentional.sql',
      contents: `
        CREATE TABLE public.t (id uuid primary key, customer_id uuid);
        -- ALLOW-USING-TRUE: legacy migration superseded by 20260202 fix; kept for historical record
        CREATE POLICY "legacy"
          ON public.t FOR SELECT
          TO anon
          USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.deepEqual(findings, [], 'escape comment must suppress the finding')
})

test('scanner: rejects escape comment without a reason', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_no_reason.sql',
      contents: `
        CREATE TABLE public.t (id uuid primary key, customer_id uuid);
        -- ALLOW-USING-TRUE:
        CREATE POLICY "leaky" ON public.t FOR SELECT TO anon USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.equal(
    findings.length,
    1,
    'empty reason should not satisfy the escape — written acknowledgment required',
  )
})

test('scanner: tracks customer_id added later via ALTER TABLE', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_create.sql',
      contents: `
        CREATE TABLE public.t (id uuid primary key);
      `,
    },
    {
      filename: '20260201000000_alter.sql',
      contents: `
        ALTER TABLE public.t ADD COLUMN customer_id uuid;
      `,
    },
    {
      filename: '20260301000000_policy.sql',
      contents: `
        CREATE POLICY "leaky" ON public.t FOR SELECT TO anon USING (true);
      `,
    },
  ]
  const findings = scanMigrations(migrations)
  assert.equal(
    findings.length,
    1,
    'table became customer-scoped via ALTER — policy added later must still flag',
  )
})

test('scanner: includes file + line + policy name in finding for greppable error', () => {
  const migrations: Migration[] = [
    {
      filename: '20260101000000_x.sql',
      contents: [
        'CREATE TABLE public.t (id uuid, customer_id uuid);',
        '',
        'CREATE POLICY "bad"',
        '  ON public.t FOR SELECT',
        '  TO anon',
        '  USING (true);',
      ].join('\n'),
    },
  ]
  const findings = scanMigrations(migrations)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].file, '20260101000000_x.sql')
  assert.equal(findings[0].policy, 'bad')
  assert.equal(findings[0].line, 3, 'line should point at CREATE POLICY')
})

// ─── Layer 2: live drift gate against supabase/migrations/ ─────────

test('LIVE DRIFT: no unmarked USING (true) on customer-scoped tables in supabase/migrations/', () => {
  const dir = path.resolve(process.cwd(), 'supabase/migrations')
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('._'))
    .sort()
  const migrations: Migration[] = files.map((filename) => ({
    filename,
    contents: fs.readFileSync(path.join(dir, filename), 'utf8'),
  }))

  const findings = scanMigrations(migrations)
  if (findings.length > 0) {
    const detail = findings
      .map(
        (f) =>
          `  ${f.file}:${f.line}  policy="${f.policy}" on ${f.table}\n    ${f.reason}`,
      )
      .join('\n')
    assert.fail(
      [
        '',
        'RLS DRIFT GUARD — found CREATE POLICY ... USING (true) on customer-scoped table(s):',
        detail,
        '',
        'If this is intentional (rare), add directly above the policy:',
        '  -- ALLOW-USING-TRUE: <one-line reason>',
        '',
        'Otherwise: replace with USING (false) + service-role Edge Function read.',
        'See pass-1 P0-1 + pass-2 P0-1 fix migrations for the canonical pattern.',
        '',
      ].join('\n'),
    )
  }
})
