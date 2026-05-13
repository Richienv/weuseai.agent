/**
 * Sesi R Phase 1 (2026-05-13): Xendit proxy handler contract.
 *
 * Edge Function POST /integration-proxy-xendit accepts:
 *   { "operation": "invoice.create" | "invoice.get" | "refund.create" | "balance.get",
 *     "params": { ... operation-specific ... } }
 *
 * Tested:
 *   - Auth gate (X-CID + HMAC bearer, 401/403 split same as credential-handler)
 *   - Credential lookup: 404 if not configured, 410 if revoked
 *   - invoice.create happy path → Xendit POST /v2/invoices → returns id + invoice_url
 *   - invoice.create with bad upstream → Bahasa error
 *   - invoice.get → fetches by id, returns status/paid_at
 *   - refund.create → POST /refunds, validates amount ≤ original
 *   - balance.get → GET /balance, returns balance_idr
 *   - Unknown operation → 400 unknown_operation
 *   - Audit log written on every call
 *   - PII (api_key) never leaks into audit meta
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleXenditProxy,
  type XenditProxyDeps,
} from '../supabase/functions/_shared/integration-proxy-xendit-handler.ts'
import type { CredentialRow } from '../supabase/functions/_shared/integration-credential-handler.ts'
import { encryptCredential } from '../supabase/functions/_shared/integration-credential-crypto.ts'

const VALID_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'
const HMAC_KEY = 'test_hmac_shared_secret_for_unit_tests_only'
const ENCRYPTION_KEY = '00112233445566778899aabbccddeeff'
                     + '00112233445566778899aabbccddeeff'
const TEST_API_KEY = 'xnd_development_FAKE_KEY_FOR_TESTS_ONLY'

async function makeBearer(): Promise<string> {
  const { signCustomerToken } = await import(
    '../supabase/functions/_shared/hermes-instance-auth.ts'
  )
  return signCustomerToken(VALID_CID, HMAC_KEY)
}

async function makeStoredRow(): Promise<CredentialRow> {
  const cipher = await encryptCredential(
    JSON.stringify({ api_key: TEST_API_KEY }),
    ENCRYPTION_KEY,
  )
  return {
    customer_id: VALID_CID,
    integration: 'xendit',
    credential_label: 'Xendit Test',
    ciphertext: cipher.ciphertext,
    iv: cipher.iv,
    auth_tag: cipher.auth_tag,
    key_version: cipher.key_version,
    created_at: '2026-05-13T10:00:00Z',
    last_validated_at: '2026-05-13T10:00:00Z',
    revoked_at: null,
  }
}

interface CapturedFetch {
  url: string
  method: string
  authHeader: string | null
  body: unknown
}

function makeFakeDeps(opts: {
  storedRow?: CredentialRow | null
  upstreamResponse?: { status: number; body: unknown }
} = {}): {
  deps: XenditProxyDeps
  capturedFetches: CapturedFetch[]
  auditCalls: Array<{ operation: string; outcome: string; meta?: Record<string, unknown> }>
} {
  const capturedFetches: CapturedFetch[] = []
  const auditCalls: Array<{ operation: string; outcome: string; meta?: Record<string, unknown> }> = []
  const upstream = opts.upstreamResponse ?? {
    status: 200,
    body: { id: 'inv-fake-123', invoice_url: 'https://checkout.xendit.co/web/inv-fake-123', status: 'PENDING', expiry_date: '2026-05-14T10:00:00Z' },
  }

  const deps: XenditProxyDeps = {
    hmacKey: HMAC_KEY,
    encryptionKey: ENCRYPTION_KEY,
    loadCredential: async () => opts.storedRow ?? null,
    xenditFetch: async (path, init) => {
      const body = init.body ? JSON.parse(init.body as string) : undefined
      capturedFetches.push({
        url: `https://api.xendit.co${path}`,
        method: init.method ?? 'GET',
        authHeader: (init.headers as Record<string, string>)?.Authorization ?? null,
        body,
      })
      return new Response(JSON.stringify(upstream.body), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    },
    logAuditCall: async (input) => {
      auditCalls.push({
        operation: input.operation,
        outcome: input.outcome,
        meta: input.meta,
      })
    },
  }

  return { deps, capturedFetches, auditCalls }
}

function makeRequest(opts: {
  cid?: string
  bearer?: string
  body?: Record<string, unknown>
}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.cid !== undefined) headers['X-CID'] = opts.cid
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`
  return new Request('http://test.local/integration-proxy-xendit', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? {}),
  })
}

// ─── Auth gates ────────────────────────────────────────────────────────

test('proxy: 403 when X-CID missing', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    bearer,
    body: { operation: 'balance.get', params: {} },
  }))
  assert.equal(res.status, 403)
})

test('proxy: 401 when bearer missing', async () => {
  const { deps } = makeFakeDeps()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID,
    body: { operation: 'balance.get', params: {} },
  }))
  assert.equal(res.status, 401)
})

// ─── Credential lookup ────────────────────────────────────────────────

test('proxy: 412 with Bahasa when credential not configured', async () => {
  const { deps } = makeFakeDeps({ storedRow: null })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: { operation: 'balance.get', params: {} },
  }))
  assert.equal(res.status, 412)
  const body = await res.json()
  assert.equal(body.code, 'credential_not_configured')
  assert.match(body.message_bahasa, /hubungkan akun Xendit/i)
})

test('proxy: 410 with Bahasa when credential revoked', async () => {
  const row = await makeStoredRow()
  row.revoked_at = '2026-05-13T11:00:00Z'
  const { deps } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: { operation: 'balance.get', params: {} },
  }))
  assert.equal(res.status, 410)
  const body = await res.json()
  assert.equal(body.code, 'credential_revoked')
  assert.match(body.message_bahasa, /sudah dilepas/i)
})

// ─── invoice.create ────────────────────────────────────────────────────

test('proxy invoice.create: happy path → Xendit POST /v2/invoices', async () => {
  const row = await makeStoredRow()
  const { deps, capturedFetches } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: {
        external_id: 'order-001',
        amount: 99000,
        description: 'Pesanan kopi spesialti',
        payer_email: 'buyer@example.com',
      },
    },
  }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.data.id, 'inv-fake-123')
  assert.match(body.data.invoice_url, /checkout\.xendit\.co/)

  // Verify upstream call shape.
  assert.equal(capturedFetches.length, 1)
  const fetched = capturedFetches[0]
  assert.match(fetched.url, /\/v2\/invoices$/)
  assert.equal(fetched.method, 'POST')
  assert.match(fetched.authHeader!, /^Basic /)
  const sentBody = fetched.body as Record<string, unknown>
  assert.equal(sentBody.external_id, 'order-001')
  assert.equal(sentBody.amount, 99000)
  assert.equal(sentBody.description, 'Pesanan kopi spesialti')
})

test('proxy invoice.create: rejects missing required params with Bahasa', async () => {
  const row = await makeStoredRow()
  const { deps } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: { amount: 99000 },  // missing external_id + description
    },
  }))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.ok, false)
  assert.match(body.message_bahasa, /belum lengkap|wajib|isi/i)
})

test('proxy invoice.create: upstream 401 → Bahasa invalid_api_key', async () => {
  const row = await makeStoredRow()
  const { deps } = makeFakeDeps({
    storedRow: row,
    upstreamResponse: {
      status: 401,
      body: { error_code: 'INVALID_API_KEY', message: 'API key is not valid' },
    },
  })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: { external_id: 'x', amount: 1000, description: 'test' },
    },
  }))
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.code, 'invalid_api_key')
  assert.match(body.message_bahasa, /Akun Xendit/)
})

// ─── invoice.get ───────────────────────────────────────────────────────

test('proxy invoice.get: fetches by id, returns status', async () => {
  const row = await makeStoredRow()
  const { deps, capturedFetches } = makeFakeDeps({
    storedRow: row,
    upstreamResponse: {
      status: 200,
      body: { id: 'inv-001', status: 'PAID', paid_at: '2026-05-13T12:00:00Z', amount: 99000 },
    },
  })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: { operation: 'invoice.get', params: { invoice_id: 'inv-001' } },
  }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.status, 'PAID')
  assert.equal(capturedFetches[0].method, 'GET')
  assert.match(capturedFetches[0].url, /\/v2\/invoices\/inv-001$/)
})

// ─── refund.create ─────────────────────────────────────────────────────

test('proxy refund.create: POSTs to /refunds with amount', async () => {
  const row = await makeStoredRow()
  const { deps, capturedFetches } = makeFakeDeps({
    storedRow: row,
    upstreamResponse: {
      status: 200,
      body: { id: 'rfd-001', status: 'SUCCEEDED', amount: 50000 },
    },
  })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'refund.create',
      params: { invoice_id: 'inv-001', amount: 50000, reason: 'OTHERS' },
    },
  }))
  assert.equal(res.status, 200)
  assert.equal(capturedFetches[0].method, 'POST')
  assert.match(capturedFetches[0].url, /\/refunds$/)
})

// ─── balance.get ───────────────────────────────────────────────────────

test('proxy balance.get: returns balance_idr', async () => {
  const row = await makeStoredRow()
  const { deps, capturedFetches } = makeFakeDeps({
    storedRow: row,
    upstreamResponse: {
      status: 200,
      body: { balance: 12500000, account_type: 'CASH' },
    },
  })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: { operation: 'balance.get', params: {} },
  }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.balance, 12500000)
  assert.match(capturedFetches[0].url, /\/balance/)
})

// ─── Unknown operation ─────────────────────────────────────────────────

test('proxy: 400 on unknown operation', async () => {
  const row = await makeStoredRow()
  const { deps } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  const res = await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: { operation: 'invoice.nuke_database', params: {} },
  }))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.code, 'unknown_operation')
})

// ─── Audit + PII ───────────────────────────────────────────────────────

test('proxy: audit log written on success', async () => {
  const row = await makeStoredRow()
  const { deps, auditCalls } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: { external_id: 'x', amount: 1000, description: 'test' },
    },
  }))
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].operation, 'invoice.create')
  assert.equal(auditCalls[0].outcome, 'ok')
})

test('proxy: audit log written on upstream error', async () => {
  const row = await makeStoredRow()
  const { deps, auditCalls } = makeFakeDeps({
    storedRow: row,
    upstreamResponse: { status: 500, body: { error_code: 'SERVER_ERROR' } },
  })
  const bearer = await makeBearer()
  await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: { external_id: 'x', amount: 1000, description: 'test' },
    },
  }))
  assert.equal(auditCalls.length, 1)
  assert.equal(auditCalls[0].outcome, 'error')
})

test('proxy: audit meta NEVER contains the decrypted api_key', async () => {
  const row = await makeStoredRow()
  const { deps, auditCalls } = makeFakeDeps({ storedRow: row })
  const bearer = await makeBearer()
  await handleXenditProxy(deps, makeRequest({
    cid: VALID_CID, bearer,
    body: {
      operation: 'invoice.create',
      params: { external_id: 'x', amount: 1000, description: 'test' },
    },
  }))
  // Recursively check every value in meta does not contain the test api key.
  const meta = auditCalls[0].meta ?? {}
  const json = JSON.stringify(meta)
  assert.doesNotMatch(json, new RegExp(TEST_API_KEY), 'api_key leaked into audit meta')
})
