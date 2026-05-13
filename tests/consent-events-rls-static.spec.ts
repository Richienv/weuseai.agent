/**
 * Static drift gate on the consent_events migration.
 *
 * We can't spin up a real Supabase locally in CI, so this spec source-
 * greps the migration SQL to make sure the RLS posture promised in the
 * audit doc actually lands:
 *
 *   - Anon: deny all (no policy exists for the anon role)
 *   - Authenticated: read OWN rows scoped by auth.uid() = customer_id
 *   - Service-role: full access (implicit; explicit GRANT ALL anyway)
 *   - REVOKE ALL on anon belt-and-suspenders against future "USING (true)" regression
 *   - INSERT permission for service_role only
 *
 * The pass-2 Sesi D drift gate at tests/rls-anti-pattern-drift.spec.ts
 * catches `USING (true)` on customer-scoped tables; this spec
 * specifically pins the consent_events RLS shape so a careless
 * future migration can't loosen it without a test failure.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260513000000_sesi_d_pass3_p0_consent_events.sql',
)

test('consent_events migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION), `${MIGRATION} must exist`)
})

test('consent_events table created with required columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // CREATE TABLE statement present
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.consent_events/i)
  // Required columns (audit doc spec)
  for (const col of [
    'id uuid PRIMARY KEY',
    'customer_id uuid NOT NULL REFERENCES public.customers(id)',
    'consent_type text NOT NULL',
    'accepted_at timestamptz NOT NULL',
    'ip_address inet',
    'user_agent text',
    'version text NOT NULL',
  ]) {
    assert.match(sql, new RegExp(col.replace(/\(/g, '\\(').replace(/\)/g, '\\)'), 'i'), `column line missing: ${col}`)
  }
})

test('consent_type CHECK constrains values to tos / marketing', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Constraint should whitelist exactly the two pass-3 values; new types
  // require an explicit migration so future code can't silently insert
  // junk values.
  assert.match(sql, /CHECK\s*\(\s*consent_type\s+IN\s*\(\s*'tos'\s*,\s*'marketing'\s*\)\s*\)/i)
})

test('RLS enabled on consent_events', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /ALTER TABLE public\.consent_events ENABLE ROW LEVEL SECURITY/i)
})

test('authenticated policy: scoped by auth.uid() = customer_id (no USING (true) regression)', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // The audit doc requires authenticated users to read ONLY their own
  // rows. The policy USING clause must compare customer_id to auth.uid().
  assert.match(
    sql,
    /CREATE POLICY[^;]+ON public\.consent_events[^;]+FOR SELECT[^;]+TO authenticated[^;]+USING\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)/is,
    'authenticated SELECT policy must scope by customer_id = auth.uid()',
  )
  // Belt: no USING (true) in EXECUTABLE SQL. Strip line comments
  // (`-- …`) first so a comment that mentions the anti-pattern in
  // human prose doesn't trip the gate.
  const stripped = sql
    .split('\n')
    .map((ln) => ln.replace(/--.*$/, ''))
    .join('\n')
  assert.equal(
    /USING\s*\(\s*true\s*\)/i.test(stripped),
    false,
    'no USING (true) is allowed on consent_events',
  )
})

test('no anon policy exists on consent_events (deny-by-default)', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // The audit doc requires anon to have NO access. With RLS on and no
  // policy, anon SELECT returns zero rows. INSERT/UPDATE/DELETE
  // similarly blocked.
  assert.equal(
    /CREATE POLICY[^;]+ON public\.consent_events[^;]+TO anon/is.test(sql),
    false,
    'no anon-targeted policy may exist on consent_events',
  )
})

test('REVOKE ALL from anon (belt-and-suspenders against future USING (true))', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /REVOKE ALL ON public\.consent_events FROM anon/i)
})

test('GRANT SELECT to authenticated, GRANT ALL to service_role', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /GRANT SELECT ON public\.consent_events TO authenticated/i)
  assert.match(sql, /GRANT ALL ON public\.consent_events TO service_role/i)
})

test('index on (customer_id, created_at DESC) for admin / audit-export queries', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(
    sql,
    /CREATE INDEX[^;]+ON public\.consent_events\s*\(\s*customer_id\s*,\s*created_at\s+DESC\s*\)/i,
  )
})
