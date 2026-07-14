/**
 * Sesi R Phase 0 (2026-05-13): integration audit-log contract.
 *
 * Thin wrapper around the existing audit_log table for third-party API
 * call telemetry. Customer_id + integration + operation + outcome.
 * NO PII in meta — sanitizer strips known PII keys before write.
 *
 * Tested behaviors:
 *   1. Happy path inserts row with right shape.
 *   2. PII sanitizer strips banned keys (api_key, phone, email, name,
 *      address, nik, npwp, access_token, secret).
 *   3. action column composed as `${integration}.${operation}`.
 *   4. Outcome enum (ok | error) enforced — anything else throws.
 *   5. DB error doesn't propagate — caller never crashes from audit-log
 *      failures (audit is best-effort, not blocking).
 *   6. Sanitizer is recursive (strips PII from nested objects).
 *   7. Meta with no PII passes through unchanged.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  logIntegrationCall,
  sanitizeAuditMeta,
  type IntegrationAuditDeps,
} from '../supabase/functions/_shared/integration-audit-log.ts'

const VALID_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'

interface CapturedRow {
  customer_id: string
  action: string
  target: string | null
  result: 'ok' | 'error'
  meta: Record<string, unknown> | null
}

function makeFakeDeps(): IntegrationAuditDeps & { captured: CapturedRow[] } {
  const captured: CapturedRow[] = []
  return {
    captured,
    insertAuditRow: async (row) => {
      captured.push(row)
    },
  }
}

function makeFailingDeps(): IntegrationAuditDeps {
  return {
    insertAuditRow: async () => {
      throw new Error('DB unavailable')
    },
  }
}

// ─── Sanitizer-only tests (pure function) ──────────────────────────────

test('sanitizer: strips api_key', () => {
  const out = sanitizeAuditMeta({ api_key: 'secret', amount: 100 })
  assert.equal(out.api_key, '[REDACTED]')
  assert.equal(out.amount, 100)
})

test('sanitizer: strips phone, email, name, address, nik, npwp, access_token, secret', () => {
  const out = sanitizeAuditMeta({
    phone: '+628123456789',
    email: 'foo@example.com',
    name: 'Budi',
    address: 'Jl. Sudirman 1',
    nik: '3201234567890123',
    npwp: '12.345.678.9-012.000',
    access_token: 'EAA...',
    secret: 'shhh',
    invoice_id: 'inv-123',  // not PII — survives
  })
  for (const key of ['phone', 'email', 'name', 'address', 'nik', 'npwp', 'access_token', 'secret']) {
    assert.equal(out[key], '[REDACTED]', `${key} should be redacted`)
  }
  assert.equal(out.invoice_id, 'inv-123', 'non-PII survives')
})

test('sanitizer: recursive on nested objects', () => {
  const out = sanitizeAuditMeta({
    request: { api_key: 'xnd_FAKE', payload: { amount: 99000 } },
    response: { ok: true },
  }) as Record<string, Record<string, unknown>>
  assert.equal(out.request.api_key, '[REDACTED]')
  assert.deepEqual(out.request.payload, { amount: 99000 })
  assert.deepEqual(out.response, { ok: true })
})

test('sanitizer: pure (no mutation)', () => {
  const input: Record<string, unknown> = { api_key: 'leak', other: 1 }
  sanitizeAuditMeta(input)
  assert.equal(input.api_key, 'leak', 'input not mutated')
})

test('sanitizer: handles non-object meta gracefully', () => {
  assert.deepEqual(sanitizeAuditMeta(null as unknown as Record<string, unknown>), {})
  assert.deepEqual(sanitizeAuditMeta(undefined as unknown as Record<string, unknown>), {})
})

// ─── logIntegrationCall tests ──────────────────────────────────────────

test('audit: happy-path insert has right shape', async () => {
  const deps = makeFakeDeps()
  await logIntegrationCall(deps, {
    customer_id: VALID_CID,
    integration: 'xendit',
    operation: 'invoice.create',
    outcome: 'ok',
    meta: { invoice_id: 'inv-123', amount: 99000 },
  })
  assert.equal(deps.captured.length, 1)
  const row = deps.captured[0]
  assert.equal(row.customer_id, VALID_CID)
  assert.equal(row.action, 'xendit.invoice.create')
  assert.equal(row.target, VALID_CID)
  assert.equal(row.result, 'ok')
  assert.equal(row.meta?.invoice_id, 'inv-123')
})

test('audit: meta is sanitized before write', async () => {
  const deps = makeFakeDeps()
  await logIntegrationCall(deps, {
    customer_id: VALID_CID,
    integration: 'xendit',
    operation: 'invoice.create',
    outcome: 'ok',
    meta: { api_key: 'should-not-leak', invoice_id: 'inv-1' },
  })
  assert.equal(deps.captured[0].meta?.api_key, '[REDACTED]')
  assert.equal(deps.captured[0].meta?.invoice_id, 'inv-1')
})

test('audit: outcome enum — only "ok" or "error" accepted', async () => {
  const deps = makeFakeDeps()
  await assert.rejects(
    () => logIntegrationCall(deps, {
      customer_id: VALID_CID,
      integration: 'xendit',
      operation: 'invoice.create',
      // @ts-expect-error: testing runtime guard
      outcome: 'success',
    }),
    /invalid_outcome/,
  )
})

test('audit: integration enum — only known integrations accepted', async () => {
  const deps = makeFakeDeps()
  await assert.rejects(
    () => logIntegrationCall(deps, {
      customer_id: VALID_CID,
      // @ts-expect-error: testing runtime guard
      integration: 'unknown_provider',
      operation: 'foo',
      outcome: 'ok',
    }),
    /invalid_integration/,
  )
})

test('audit: DB failure does NOT propagate — best-effort logging', async () => {
  const deps = makeFailingDeps()
  // No throw expected.
  await logIntegrationCall(deps, {
    customer_id: VALID_CID,
    integration: 'xendit',
    operation: 'invoice.create',
    outcome: 'ok',
  })
  // If we got here, the function swallowed the DB error. Good.
})

test('audit: meta omitted → empty object stored', async () => {
  const deps = makeFakeDeps()
  await logIntegrationCall(deps, {
    customer_id: VALID_CID,
    integration: 'xendit',
    operation: 'balance.get',
    outcome: 'ok',
  })
  assert.deepEqual(deps.captured[0].meta, {})
})

test('audit: error outcome with error_code in meta', async () => {
  const deps = makeFakeDeps()
  await logIntegrationCall(deps, {
    customer_id: VALID_CID,
    integration: 'xendit',
    operation: 'invoice.create',
    outcome: 'error',
    meta: { error_code: 'invalid_api_key', upstream_status: 401 },
  })
  assert.equal(deps.captured[0].result, 'error')
  assert.equal(deps.captured[0].meta?.error_code, 'invalid_api_key')
  assert.equal(deps.captured[0].meta?.upstream_status, 401)
})
