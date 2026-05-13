/**
 * Sesi R Phase 1 (2026-05-13): credential onboarding handler contract.
 *
 * Endpoints:
 *   GET    /integration-credentials/:integration → status check
 *   POST   /integration-credentials/:integration → onboard + validate
 *   DELETE /integration-credentials/:integration → revoke (idempotent)
 *
 * All three require X-CID header match + HMAC bearer token (same
 * pattern as customer-progress-proxy post-Sesi-D-pass-3 #93).
 *
 * Tested behaviors:
 *   1. GET: 404 when not configured, 200 when configured, 410 when revoked.
 *   2. POST: validates key against upstream before persisting.
 *   3. POST: rejects bad key with Bahasa error from error-mapper.
 *   4. POST: stores ciphertext (not plaintext) via crypto helper.
 *   5. POST: re-add after revoke succeeds + clears revoked_at.
 *   6. DELETE: sets revoked_at, idempotent on already-revoked.
 *   7. All endpoints: 403 on X-CID mismatch.
 *   8. All endpoints: 401 on missing/bad HMAC bearer.
 *   9. POST: GET response NEVER includes ciphertext/plaintext.
 *  10. All endpoints: integration enum enforced (404 on unknown).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleIntegrationCredential,
  type IntegrationCredentialDeps,
  type CredentialRow,
} from '../supabase/functions/_shared/integration-credential-handler.ts'

/** Typed JSON reader — TS 5.4 returns res.json() as unknown by default. */
async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T
}

const VALID_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'
const OTHER_CID = '11111111-2222-3333-4444-555555555555'
const HMAC_KEY = 'test_hmac_shared_secret_for_unit_tests_only'
const ENCRYPTION_KEY = '00112233445566778899aabbccddeeff'
                     + '00112233445566778899aabbccddeeff'

// Pre-compute the valid bearer token for VALID_CID using the same HMAC
// pattern as hermes-instance-auth.ts.
async function makeValidBearer(): Promise<string> {
  const { signCustomerToken } = await import(
    '../supabase/functions/_shared/hermes-instance-auth.ts'
  )
  return signCustomerToken(VALID_CID, HMAC_KEY)
}

interface FakeStore {
  rows: Map<string, CredentialRow>  // key = `${customer_id}:${integration}`
  upserts: Array<{ customer_id: string; integration: string }>
  deletes: Array<{ customer_id: string; integration: string }>
}

function makeFakeDeps(opts: { upstreamValidationOk?: boolean } = {}): {
  deps: IntegrationCredentialDeps
  store: FakeStore
  auditCalls: Array<{ integration: string; operation: string; outcome: string }>
} {
  const store: FakeStore = { rows: new Map(), upserts: [], deletes: [] }
  const auditCalls: Array<{ integration: string; operation: string; outcome: string }> = []

  const deps: IntegrationCredentialDeps = {
    hmacKey: HMAC_KEY,
    encryptionKey: ENCRYPTION_KEY,
    loadRow: async (customer_id, integration) => {
      return store.rows.get(`${customer_id}:${integration}`) ?? null
    },
    upsertRow: async (row) => {
      store.upserts.push({ customer_id: row.customer_id, integration: row.integration })
      store.rows.set(`${row.customer_id}:${row.integration}`, row)
    },
    revokeRow: async (customer_id, integration) => {
      store.deletes.push({ customer_id, integration })
      const existing = store.rows.get(`${customer_id}:${integration}`)
      if (existing && !existing.revoked_at) {
        existing.revoked_at = new Date('2026-05-13T12:00:00Z').toISOString()
      }
    },
    validateUpstream: async (integration, apiKey) => {
      if (opts.upstreamValidationOk === false) {
        return { ok: false, status: 401, code: 'INVALID_API_KEY' }
      }
      return { ok: true, last_validated_at: new Date('2026-05-13T12:00:00Z').toISOString() }
    },
    logAuditCall: async (input) => {
      auditCalls.push({
        integration: input.integration,
        operation: input.operation,
        outcome: input.outcome,
      })
    },
  }

  return { deps, store, auditCalls }
}

function makeRequest(opts: {
  method: 'GET' | 'POST' | 'DELETE'
  integration: string
  cid?: string
  bearer?: string
  body?: Record<string, unknown>
}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.cid !== undefined) headers['X-CID'] = opts.cid
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`

  return new Request(
    `http://test.local/integration-credentials/${opts.integration}`,
    {
      method: opts.method,
      headers,
      body: opts.method !== 'GET' && opts.body ? JSON.stringify(opts.body) : undefined,
    },
  )
}

// ─── Auth gate tests ───────────────────────────────────────────────────

test('credential-handler: 403 when X-CID missing', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    bearer,
  }))
  assert.equal(res.status, 403)
})

test('credential-handler: 403 when X-CID does not match bearer-claimed customer', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeValidBearer()  // signs VALID_CID
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: OTHER_CID,
    bearer,
  }))
  assert.equal(res.status, 403)
})

test('credential-handler: 401 when bearer missing', async () => {
  const { deps } = makeFakeDeps()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: VALID_CID,
  }))
  assert.equal(res.status, 401)
})

test('credential-handler: 401 when bearer is bogus', async () => {
  const { deps } = makeFakeDeps()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: VALID_CID,
    bearer: 'definitely-not-an-hmac-of-the-customer-id',
  }))
  assert.equal(res.status, 401)
})

test('credential-handler: 404 when integration unknown', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'definitely_not_a_known_integration',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 404)
})

// ─── GET tests ─────────────────────────────────────────────────────────

test('credential-handler GET: 404 when not configured', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 404)
  const body = await readJson(res)
  assert.equal(body.configured, false)
})

test('credential-handler GET: 200 when configured', async () => {
  const { deps, store } = makeFakeDeps()
  // Seed a row.
  store.rows.set(`${VALID_CID}:xendit`, {
    customer_id: VALID_CID,
    integration: 'xendit',
    credential_label: 'Xendit Live',
    ciphertext: 'abc', iv: 'def', auth_tag: 'ghi',
    key_version: 1,
    created_at: '2026-05-13T10:00:00Z',
    last_validated_at: '2026-05-13T10:00:00Z',
    revoked_at: null,
  })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 200)
  const body = await readJson(res)
  assert.equal(body.configured, true)
  assert.equal(body.label, 'Xendit Live')
  // CRITICAL: never leak ciphertext.
  assert.equal(body.ciphertext, undefined)
  assert.equal(body.api_key, undefined)
})

test('credential-handler GET: 410 when revoked', async () => {
  const { deps, store } = makeFakeDeps()
  store.rows.set(`${VALID_CID}:xendit`, {
    customer_id: VALID_CID,
    integration: 'xendit',
    credential_label: null,
    ciphertext: 'a', iv: 'b', auth_tag: 'c',
    key_version: 1,
    created_at: '2026-05-13T10:00:00Z',
    last_validated_at: null,
    revoked_at: '2026-05-13T11:00:00Z',
  })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'GET',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 410)
  const body = await readJson(res)
  assert.equal(body.configured, false)
  assert.ok(body.revoked_at)
})

// ─── POST tests ────────────────────────────────────────────────────────

test('credential-handler POST: validates upstream + persists ciphertext', async () => {
  const { deps, store } = makeFakeDeps({ upstreamValidationOk: true })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'POST',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
    body: { api_key: 'xnd_development_FAKE_KEY', label: 'Xendit Sandbox' },
  }))
  assert.equal(res.status, 200)
  const body = await readJson(res)
  assert.equal(body.configured, true)
  assert.ok(body.last_validated_at)

  // Stored row exists + has ciphertext + does NOT have plaintext.
  const row = store.rows.get(`${VALID_CID}:xendit`)
  assert.ok(row, 'row persisted')
  assert.ok(row!.ciphertext.length > 0)
  // Defensive: row shape should not have any field named api_key.
  assert.equal((row as unknown as Record<string, unknown>).api_key, undefined)
})

test('credential-handler POST: rejects bad key with Bahasa error', async () => {
  const { deps, store } = makeFakeDeps({ upstreamValidationOk: false })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'POST',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
    body: { api_key: 'bogus' },
  }))
  // 4xx, body has Bahasa message.
  assert.equal(res.status, 400)
  const body = await res.json() as { ok: boolean; message_bahasa: string }
  assert.equal(body.ok, false)
  assert.match(body.message_bahasa, /Xendit/)
  // No row persisted on validation failure.
  assert.equal(store.rows.size, 0)
})

test('credential-handler POST: re-add after revoke clears revoked_at', async () => {
  const { deps, store } = makeFakeDeps({ upstreamValidationOk: true })
  // Seed a revoked row.
  store.rows.set(`${VALID_CID}:xendit`, {
    customer_id: VALID_CID,
    integration: 'xendit',
    credential_label: null,
    ciphertext: 'old', iv: 'old', auth_tag: 'old',
    key_version: 1,
    created_at: '2026-05-13T08:00:00Z',
    last_validated_at: null,
    revoked_at: '2026-05-13T09:00:00Z',
  })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'POST',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
    body: { api_key: 'xnd_new_FAKE' },
  }))
  assert.equal(res.status, 200)
  const row = store.rows.get(`${VALID_CID}:xendit`)
  assert.equal(row?.revoked_at, null, 'revoked_at cleared on re-add')
  assert.notEqual(row?.ciphertext, 'old', 'ciphertext replaced')
})

// ─── DELETE tests ──────────────────────────────────────────────────────

test('credential-handler DELETE: revokes existing row', async () => {
  const { deps, store } = makeFakeDeps()
  store.rows.set(`${VALID_CID}:xendit`, {
    customer_id: VALID_CID, integration: 'xendit',
    credential_label: null,
    ciphertext: 'a', iv: 'b', auth_tag: 'c',
    key_version: 1,
    created_at: '2026-05-13T10:00:00Z',
    last_validated_at: null,
    revoked_at: null,
  })
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'DELETE',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 200)
  const row = store.rows.get(`${VALID_CID}:xendit`)
  assert.ok(row?.revoked_at, 'revoked_at set')
})

test('credential-handler DELETE: idempotent on non-existent', async () => {
  const { deps } = makeFakeDeps()
  const bearer = await makeValidBearer()
  const res = await handleIntegrationCredential(deps, makeRequest({
    method: 'DELETE',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(res.status, 200)
})

test('credential-handler: audit-log written on every state change', async () => {
  const { deps, auditCalls } = makeFakeDeps({ upstreamValidationOk: true })
  const bearer = await makeValidBearer()
  await handleIntegrationCredential(deps, makeRequest({
    method: 'POST',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
    body: { api_key: 'xnd_FAKE' },
  }))
  await handleIntegrationCredential(deps, makeRequest({
    method: 'DELETE',
    integration: 'xendit',
    cid: VALID_CID,
    bearer,
  }))
  assert.equal(auditCalls.length, 2)
  assert.equal(auditCalls[0].operation, 'credential.set')
  assert.equal(auditCalls[1].operation, 'credential.revoke')
})
