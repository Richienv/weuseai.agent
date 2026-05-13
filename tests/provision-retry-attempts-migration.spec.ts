/**
 * Sesi A D1 (2026-05-13): provision_retry_attempts migration drift gate.
 *
 * Same pattern as tests/consent-events-rls-static.spec.ts — we can't
 * spin Supabase locally in CI, so this spec source-greps the migration
 * SQL to confirm the audit-promised shape lands:
 *   - Table exists with required columns + types
 *   - CHECK constraint on outcome whitelist
 *   - RLS enabled + service-role-only (anon + authenticated REVOKED)
 *   - Two indexes (subscription lookup + exhausted-digest)
 *   - pg_cron schedule firing every 3 min
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260513020000_sesi_a_d1_provision_retry_attempts.sql',
)

test('D1 migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION), MIGRATION + ' must exist')
})

test('D1: provision_retry_attempts table created with required columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.provision_retry_attempts/i)
  for (const col of [
    'id              uuid PRIMARY KEY',
    'subscription_id uuid NOT NULL REFERENCES public.subscriptions(id)',
    'customer_id     uuid NOT NULL REFERENCES public.customers(id)',
    'attempt_number  integer NOT NULL',
    'attempted_at    timestamptz NOT NULL',
    'outcome         text NOT NULL',
  ]) {
    const esc = col
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\./g, '\\.')
      .replace(/\s+/g, '\\s+')
    assert.match(sql, new RegExp(esc, 'i'), 'missing column: ' + col)
  }
})

test('D1: outcome CHECK constraint whitelists 5 values', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  for (const v of ['in_flight', 'spin_up_ok', 'capacity_exhausted', 'other_error', 'exhausted']) {
    assert.match(sql, new RegExp("'" + v + "'"), 'outcome CHECK missing value: ' + v)
  }
})

test('D1: attempt_number CHECK constraint bounds 1..10', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(
    sql,
    /attempt_number\s*>=\s*1\s+AND\s+attempt_number\s*<=\s*10/i,
    'attempt_number CHECK must constrain 1..10',
  )
})

test('D1: RLS enabled + service-role-only (anon + authenticated REVOKED)', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /ALTER TABLE public\.provision_retry_attempts ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON public\.provision_retry_attempts FROM anon/i)
  assert.match(sql, /REVOKE ALL ON public\.provision_retry_attempts FROM authenticated/i)
  assert.match(sql, /GRANT ALL ON public\.provision_retry_attempts TO service_role/i)
  // No anon policy — keeps the table fully off-limits.
  assert.equal(
    /CREATE POLICY[^;]+ON public\.provision_retry_attempts[^;]+TO anon/is.test(sql),
    false,
    'no anon-targeted policy may exist on provision_retry_attempts',
  )
})

test('D1: indexes present for subscription lookup + exhausted digest', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Worker pattern: "latest attempt for this subscription"
  assert.match(
    sql,
    /CREATE INDEX[^;]+ON public\.provision_retry_attempts\s*\(\s*subscription_id\s*,\s*attempted_at\s+DESC\s*\)/i,
    'subscription-lookup index must exist',
  )
  // Phase 4 daily-digest pattern: "all exhausted attempts in last 24h"
  assert.match(
    sql,
    /CREATE INDEX[^;]+ON public\.provision_retry_attempts\s*\(\s*outcome\s*,\s*attempted_at\s+DESC\s*\)\s*WHERE outcome\s*=\s*'exhausted'/i,
    'partial index on outcome=exhausted must exist',
  )
})

test('D1: pg_cron schedule fires every 3 minutes', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Schedule named retry_pending_provisions_every_3min
  assert.match(
    sql,
    /cron\.schedule\(\s*'retry_pending_provisions_every_3min'\s*,\s*'\*\/3\s+\*\s+\*\s+\*\s+\*'/i,
    'cron schedule must fire every 3 minutes',
  )
  // Idempotency: previous job with same name dropped first.
  assert.match(
    sql,
    /cron\.unschedule[^;]+jobname\s*=\s*'retry_pending_provisions_every_3min'/i,
    'idempotent: previous schedule must be unscheduled first',
  )
})

test('D1: cron uses net.http_post with service-role bearer', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /net\.http_post/i, 'must invoke Edge Function via pg_net')
  // Service-role token comes from a current_setting() lookup so the
  // value isn't baked into the migration file.
  assert.match(
    sql,
    /current_setting\(\s*'app\.retry_pending_provisions_token'/i,
    'service-role token must come from current_setting',
  )
  // Bearer prefix is concatenated to the token value.
  assert.match(
    sql,
    /'Bearer\s*'\s*\|\|\s*current_setting\(\s*'app\.retry_pending_provisions_token'/i,
    'Authorization header must be `Bearer ` || token',
  )
  assert.match(
    sql,
    /url\s*:=\s*current_setting\(\s*'app\.retry_pending_provisions_url'/i,
    'Edge Function URL must come from current_setting',
  )
})
