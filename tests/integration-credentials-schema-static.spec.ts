/**
 * Sesi R Phase 0 (2026-05-13): static drift gate on integration_credentials.
 *
 * Same pattern as consent-events-rls-static.spec.ts — source-grep the
 * migration SQL to ensure the table shape + RLS posture promised by
 * docs/plans/2026-05-13-sesi-r-indonesian-integrations.md actually lands.
 *
 * Pins:
 *   - Table created with required columns
 *   - integration column constrained to known integrations
 *   - Unique (customer_id, integration)
 *   - RLS enabled with anon deny-all
 *   - key_version defaults to 1
 *   - revoked_at + last_validated_at are nullable
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260513010000_sesi_r_integration_credentials.sql',
)

test('integration_credentials migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION), `${MIGRATION} must exist`)
})

test('integration_credentials: table + required columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /create table if not exists integration_credentials/i)

  for (const col of [
    'customer_id     uuid not null references customers(id)',
    'integration     text not null check',
    'credential_label text',
    'ciphertext      text not null',
    'iv              text not null',
    'auth_tag        text not null',
    'key_version     int  not null default 1',
    'last_validated_at timestamptz',
    'revoked_at      timestamptz',
  ]) {
    assert.match(
      sql,
      new RegExp(col.replace(/\(/g, '\\(').replace(/\)/g, '\\)'), 'i'),
      `expected column line missing: ${col}`,
    )
  }
})

test('integration_credentials: integration enum constrained', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Must enumerate the 3 locked integrations from the research doc.
  for (const integ of ['xendit', 'whatsapp_cloud_api', 'onlinepajak']) {
    assert.match(sql, new RegExp(`'${integ}'`), `enum missing: ${integ}`)
  }
})

test('integration_credentials: unique (customer_id, integration)', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /unique\s*\(\s*customer_id\s*,\s*integration\s*\)/i)
})

test('integration_credentials: RLS enabled with anon deny-all', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /alter table integration_credentials enable row level security/i)
  // Deny-all policy for anon role.
  assert.match(
    sql,
    /create policy[\s\S]*?on integration_credentials[\s\S]*?to anon[\s\S]*?using\s*\(\s*false\s*\)/i,
    'anon deny-all policy missing',
  )
})

test('integration_credentials: partial index on non-revoked rows', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Index should be partial on revoked_at IS NULL — avoids indexing dead rows.
  assert.match(sql, /create index[\s\S]*?integration_credentials[\s\S]*?where revoked_at is null/i)
})

test('integration_credentials: no plaintext column ever named "api_key" or "secret"', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Defensive — make sure nobody slipped a plaintext credential column in.
  assert.doesNotMatch(sql, /\bapi_key\s+(text|varchar)/i, 'never store plaintext api_key')
  assert.doesNotMatch(sql, /\bsecret\s+(text|varchar)/i, 'never store plaintext secret')
  assert.doesNotMatch(sql, /\baccess_token\s+(text|varchar)/i, 'never store plaintext access_token')
})
