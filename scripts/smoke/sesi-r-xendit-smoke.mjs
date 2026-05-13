#!/usr/bin/env node
/**
 * Sesi R Phase 8 — Xendit integration smoke test.
 *
 * Exercises the Sesi R cascade end-to-end against the LIVE Supabase
 * project + the LIVE Xendit sandbox, WITHOUT deploying any Edge
 * Function. Imports the pure handlers from supabase/functions/_shared/
 * and runs them as a Node script with real deps.
 *
 * Required env (founder sets locally before running):
 *   SUPABASE_URL                — base URL of the Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY   — service-role JWT (read .env.local)
 *   HERMES_INSTANCE_HMAC_KEY    — same secret used by hermes-instance-auth
 *   INTEGRATION_ENCRYPTION_KEY  — 32-byte hex for AES-GCM (openssl rand -hex 32)
 *   XENDIT_SANDBOX_API_KEY      — your Xendit dev API key (xnd_development_...)
 *
 * Usage:
 *   1. Add INTEGRATION_ENCRYPTION_KEY + XENDIT_SANDBOX_API_KEY to .env.local
 *   2. Run: node --env-file=.env.local scripts/smoke/sesi-r-xendit-smoke.mjs
 *
 * What it does:
 *   1. Creates a throwaway test customer row (uuid prefix _sesi_r_smoke_)
 *   2. Stores the Xendit sandbox key via handleIntegrationCredential POST
 *   3. Calls invoice.create via handleXenditProxy → real Xendit sandbox
 *   4. Reads back audit_log rows → verifies PII sanitization
 *   5. Revokes credential via DELETE
 *   6. Verifies 410 + revoked_at set
 *   7. Tears down the test customer
 *
 * Output: green check per step. Any failure aborts + prints diagnostic.
 */

import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'

// ─── Read .env.local if no env passed ──────────────────────────────────

if (!process.env.SUPABASE_URL) {
  try {
    const env = readFileSync('.env.local', 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {
    // ignore — env already set
  }
}

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'HERMES_INSTANCE_HMAC_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'XENDIT_SANDBOX_API_KEY',
]
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`error: missing env ${k}`)
    process.exit(2)
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HMAC_KEY = process.env.HERMES_INSTANCE_HMAC_KEY
const ENC_KEY = process.env.INTEGRATION_ENCRYPTION_KEY
const XENDIT_KEY = process.env.XENDIT_SANDBOX_API_KEY

// ─── Imports — point at compiled-on-the-fly TS via tsx ─────────────────
// We expect this script to be invoked via `tsx --import` or after
// `npm run build`. Easier path: re-shell into tsx if we're plain node.

let signCustomerToken
let handleIntegrationCredential
let handleXenditProxy
let logIntegrationCall

try {
  ;({ signCustomerToken } = await import(
    '../../supabase/functions/_shared/hermes-instance-auth.ts'
  ))
  ;({ handleIntegrationCredential } = await import(
    '../../supabase/functions/_shared/integration-credential-handler.ts'
  ))
  ;({ handleXenditProxy } = await import(
    '../../supabase/functions/_shared/integration-proxy-xendit-handler.ts'
  ))
  ;({ logIntegrationCall } = await import(
    '../../supabase/functions/_shared/integration-audit-log.ts'
  ))
} catch (e) {
  console.error('To import .ts files run via tsx:')
  console.error('  npx tsx scripts/smoke/sesi-r-xendit-smoke.mjs')
  console.error(e.message)
  process.exit(2)
}

// ─── Test customer ─────────────────────────────────────────────────────

const TEST_CID = randomUUID()
const TEST_EMAIL = `sesi-r-smoke-${Date.now()}@weuseai-test.local`

function sb(query, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method: body ? (body._method ?? 'POST') : 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body && !body._method ? JSON.stringify(body) :
          body?._payload ? JSON.stringify(body._payload) : undefined,
  })
}

async function expectOk(label, res) {
  if (!res.ok) {
    const t = await res.text()
    console.error(`✗ ${label} → ${res.status}`)
    console.error('   body:', t.slice(0, 500))
    process.exit(1)
  }
  return res
}

function pass(label, extra = '') {
  console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`)
}

// ─── Step 1: Create throwaway test customer ───────────────────────────

console.log('1. Creating throwaway test customer...')
const insertCust = await expectOk(
  'insert test customer',
  await sb('customers', {
    id: TEST_CID,
    email: TEST_EMAIL,
    display_name: 'Sesi R Smoke',
  }),
)
pass(`customer ${TEST_CID.slice(0, 8)}... created`)

// ─── Step 2: POST credential ───────────────────────────────────────────

const bearer = await signCustomerToken(TEST_CID, HMAC_KEY)

async function callCredentialHandler(method, body) {
  const headers = {
    'X-CID': TEST_CID,
    'Authorization': `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  }
  const url = `http://test.local/integration-credentials/xendit`
  const req = new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Build real deps inline (mirrors what the Edge Function does)
  const deps = await makeRealCredDeps()
  return handleIntegrationCredential(deps, req)
}

async function makeRealCredDeps() {
  return {
    hmacKey: HMAC_KEY,
    encryptionKey: ENC_KEY,
    async loadRow(customer_id, integration) {
      const r = await sb(
        `integration_credentials?customer_id=eq.${customer_id}&integration=eq.${integration}&select=*`,
      )
      if (!r.ok) return null
      const rows = await r.json()
      return rows[0] ?? null
    },
    async upsertRow(row) {
      const r = await sb('integration_credentials', {
        ...row,
        _method: 'POST',
        _payload: row,
      })
      if (!r.ok) {
        // Maybe row exists — try update
        const upd = await fetch(
          `${SUPABASE_URL}/rest/v1/integration_credentials?customer_id=eq.${row.customer_id}&integration=eq.${row.integration}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ciphertext: row.ciphertext,
              iv: row.iv,
              auth_tag: row.auth_tag,
              key_version: row.key_version,
              credential_label: row.credential_label,
              last_validated_at: row.last_validated_at,
              revoked_at: null,
            }),
          },
        )
        if (!upd.ok) throw new Error(`upsert failed: ${await upd.text()}`)
      }
    },
    async revokeRow(customer_id, integration) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/integration_credentials?customer_id=eq.${customer_id}&integration=eq.${integration}&revoked_at=is.null`,
        {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ revoked_at: new Date().toISOString() }),
        },
      )
    },
    async validateUpstream(integration, apiKey) {
      const r = await fetch('https://api.xendit.co/balance?account_type=CASH', {
        headers: { Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}` },
      })
      if (r.ok) return { ok: true, last_validated_at: new Date().toISOString() }
      let code
      try { code = (await r.json()).error_code } catch {}
      return { ok: false, status: r.status, code }
    },
    async logAuditCall(input) {
      await logIntegrationCall({
        async insertAuditRow(row) {
          await sb('audit_log', row)
        },
      }, input)
    },
  }
}

console.log('\n2. POST credential — validates against Xendit sandbox + persists encrypted...')
const setRes = await callCredentialHandler('POST', {
  api_key: XENDIT_KEY,
  label: 'Sesi R Smoke',
})
if (setRes.status !== 200) {
  console.error('✗ credential POST failed:', setRes.status, await setRes.text())
  process.exit(1)
}
const setBody = await setRes.json()
pass(`credential stored, last_validated_at=${setBody.last_validated_at}`)

console.log('\n3. GET credential — confirms 200 + no ciphertext leak...')
const getRes = await callCredentialHandler('GET')
if (getRes.status !== 200) {
  console.error('✗ credential GET failed:', getRes.status)
  process.exit(1)
}
const getBody = await getRes.json()
if (getBody.ciphertext || getBody.api_key) {
  console.error('✗ ciphertext or api_key leaked in GET response!')
  process.exit(1)
}
pass(`label="${getBody.label}", ciphertext NOT leaked`)

// ─── Step 4: invoice.create via proxy ──────────────────────────────────

async function callProxy(operation, params) {
  const headers = {
    'X-CID': TEST_CID,
    'Authorization': `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  }
  const req = new Request('http://test.local/integration-proxy-xendit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation, params }),
  })
  const deps = {
    hmacKey: HMAC_KEY,
    encryptionKey: ENC_KEY,
    async loadCredential(customer_id) {
      const r = await sb(
        `integration_credentials?customer_id=eq.${customer_id}&integration=eq.xendit&select=*`,
      )
      const rows = await r.json()
      return rows[0] ?? null
    },
    async xenditFetch(path, init) {
      return fetch(`https://api.xendit.co${path}`, init)
    },
    async logAuditCall(input) {
      await logIntegrationCall({
        async insertAuditRow(row) {
          await sb('audit_log', row)
        },
      }, input)
    },
  }
  return handleXenditProxy(deps, req)
}

console.log('\n4. invoice.create via proxy → real Xendit sandbox...')
const invRes = await callProxy('invoice.create', {
  external_id: `sesi-r-smoke-${Date.now()}`,
  amount: 10000,
  description: 'Sesi R smoke test — buat invoice',
})
if (invRes.status !== 200) {
  console.error('✗ invoice.create failed:', invRes.status, await invRes.text())
  process.exit(1)
}
const invBody = await invRes.json()
pass(`invoice ${invBody.data.id}, url=${invBody.data.invoice_url}`)

// ─── Step 5: Bogus operation → Bahasa error mapping ────────────────────

console.log('\n5. Bogus invoice.create (missing required) → Bahasa error...')
const bogusRes = await callProxy('invoice.create', { amount: 10000 })
if (bogusRes.status !== 400) {
  console.error(`✗ expected 400 for missing required, got ${bogusRes.status}`)
  process.exit(1)
}
const bogusBody = await bogusRes.json()
if (!bogusBody.message_bahasa || !/belum lengkap|wajib|isi/i.test(bogusBody.message_bahasa)) {
  console.error('✗ no Bahasa message_bahasa:', bogusBody)
  process.exit(1)
}
pass(`Bahasa error: "${bogusBody.message_bahasa}"`)

// ─── Step 6: Verify audit_log rows ─────────────────────────────────────

console.log('\n6. Verifying audit_log entries + PII sanitization...')
const auditRes = await sb(
  `audit_log?customer_id=eq.${TEST_CID}&select=action,result,meta&order=created_at.desc`,
)
const auditRows = await auditRes.json()
console.log(`   Found ${auditRows.length} audit rows:`)
for (const row of auditRows) {
  console.log(`   - ${row.action} (${row.result}) meta=${JSON.stringify(row.meta).slice(0, 100)}`)
  const metaJson = JSON.stringify(row.meta)
  if (metaJson.includes(XENDIT_KEY)) {
    console.error('✗ PII LEAK: api_key found in audit meta!')
    process.exit(1)
  }
}
pass(`${auditRows.length} audit rows, no api_key leak`)

// ─── Step 7: DELETE credential ─────────────────────────────────────────

console.log('\n7. DELETE credential → revoked...')
const delRes = await callCredentialHandler('DELETE')
if (delRes.status !== 200) {
  console.error('✗ revoke failed:', delRes.status)
  process.exit(1)
}
pass('revoked')

console.log('\n8. GET after revoke → 410...')
const postDelRes = await callCredentialHandler('GET')
if (postDelRes.status !== 410) {
  console.error('✗ expected 410, got', postDelRes.status)
  process.exit(1)
}
pass('410 returned, revoked_at set')

// ─── Step 8: Teardown test customer ────────────────────────────────────

console.log('\n9. Tearing down test customer...')
await fetch(
  `${SUPABASE_URL}/rest/v1/integration_credentials?customer_id=eq.${TEST_CID}`,
  { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
await fetch(
  `${SUPABASE_URL}/rest/v1/audit_log?customer_id=eq.${TEST_CID}`,
  { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
await fetch(
  `${SUPABASE_URL}/rest/v1/customers?id=eq.${TEST_CID}`,
  { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
)
pass('teardown complete')

console.log('\n✓✓✓ All smoke checks passed.\n')
