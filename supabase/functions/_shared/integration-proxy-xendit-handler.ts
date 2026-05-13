// Sesi R Phase 1 (2026-05-13): Xendit proxy handler.
//
// Edge Function POST /integration-proxy-xendit. Single endpoint that
// routes by `operation` field in the body to the appropriate Xendit
// REST endpoint. Auth + credential lookup + decryption + upstream call
// + Bahasa error mapping + audit log — all in one place so the per-skill
// SKILL.md stays simple.
//
// Operations shipped this PR:
//   - invoice.create  → POST /v2/invoices
//   - invoice.get     → GET  /v2/invoices/:id
//   - refund.create   → POST /refunds
//   - balance.get     → GET  /balance
//
// Deferred to follow-on cascade:
//   - invoice.send_link via Telegram (requires per-customer bot)
//   - webhook receiver (separate Edge Function)
//
// Plaintext API key lifecycle: decrypted from credential_row,
// base64-encoded for Basic auth header, sent on the upstream fetch,
// then dropped on return. NEVER logged. NEVER returned to the caller.

import {
  extractBearerToken,
  verifyCustomerToken,
} from './hermes-instance-auth.ts'
import { decryptCredential } from './integration-credential-crypto.ts'
import { mapIntegrationError } from './integration-error-mapper.ts'
import type { CredentialRow } from './integration-credential-handler.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const XENDIT_BASE = 'https://api.xendit.co'

const KNOWN_OPERATIONS = [
  'invoice.create',
  'invoice.get',
  'refund.create',
  'balance.get',
] as const
type Operation = typeof KNOWN_OPERATIONS[number]

export interface XenditProxyDeps {
  hmacKey: string
  encryptionKey: string
  loadCredential(customer_id: string): Promise<CredentialRow | null>
  /** Test seam — production calls fetch(`https://api.xendit.co${path}`, init). */
  xenditFetch(path: string, init: RequestInit): Promise<Response>
  logAuditCall(input: {
    customer_id: string
    integration: 'xendit'
    operation: string
    outcome: 'ok' | 'error'
    meta?: Record<string, unknown>
  }): Promise<void>
}

interface ProxyBody {
  operation: string
  params: Record<string, unknown>
}

export async function handleXenditProxy(
  deps: XenditProxyDeps,
  req: Request,
): Promise<Response> {
  // ─── 1. Auth ───
  const cid = req.headers.get('X-CID')
  if (!cid) {
    return jsonResponse(403, { ok: false, error: 'x_cid_missing' })
  }
  const bearer = extractBearerToken(req.headers.get('Authorization'))
  if (!bearer) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' })
  }
  if (!/^[0-9a-fA-F]{64}$/.test(bearer)) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' })
  }
  const valid = await verifyCustomerToken(cid, bearer, deps.hmacKey)
  if (!valid) {
    return jsonResponse(403, { ok: false, error: 'x_cid_mismatch' })
  }

  // ─── 2. Parse body ───
  let body: ProxyBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' })
  }
  if (!body || typeof body.operation !== 'string') {
    return jsonResponse(400, {
      ok: false,
      code: 'unknown_operation',
      message_bahasa: 'Operasi tidak dikenal.',
    })
  }
  if (!KNOWN_OPERATIONS.includes(body.operation as Operation)) {
    return jsonResponse(400, {
      ok: false,
      code: 'unknown_operation',
      message_bahasa: 'Operasi tidak dikenal.',
    })
  }
  const operation = body.operation as Operation
  const params = body.params ?? {}

  // ─── 3. Credential lookup ───
  const row = await deps.loadCredential(cid)
  if (!row) {
    return jsonResponse(412, {
      ok: false,
      code: 'credential_not_configured',
      message_bahasa:
        'Untuk pakai fitur ini, kamu perlu hubungkan akun Xendit dulu. '
        + 'Buka pengaturan integrasi, paste API key kamu, lalu coba lagi.',
    })
  }
  if (row.revoked_at) {
    return jsonResponse(410, {
      ok: false,
      code: 'credential_revoked',
      message_bahasa:
        'Akun Xendit kamu sudah dilepas. Hubungkan ulang untuk pakai fitur ini.',
    })
  }

  // ─── 4. Decrypt credential ───
  let apiKey: string
  try {
    const plaintextJson = await decryptCredential(
      {
        ciphertext: row.ciphertext,
        iv: row.iv,
        auth_tag: row.auth_tag,
        key_version: row.key_version,
      },
      deps.encryptionKey,
    )
    apiKey = (JSON.parse(plaintextJson) as { api_key: string }).api_key
  } catch {
    // Encryption-key rotation case OR genuine corruption. Either way,
    // we surface a generic Bahasa error and audit-log the event.
    await deps.logAuditCall({
      customer_id: cid,
      integration: 'xendit',
      operation,
      outcome: 'error',
      meta: { error_code: 'credential_decrypt_failed' },
    })
    return jsonResponse(500, {
      ok: false,
      code: 'credential_decrypt_failed',
      message_bahasa: 'Ada masalah dengan kredensial tersimpan. Coba revoke + hubungkan ulang akun Xendit kamu.',
    })
  }

  // ─── 5. Dispatch operation ───
  try {
    switch (operation) {
      case 'invoice.create':
        return await invoiceCreate(deps, cid, apiKey, params)
      case 'invoice.get':
        return await invoiceGet(deps, cid, apiKey, params)
      case 'refund.create':
        return await refundCreate(deps, cid, apiKey, params)
      case 'balance.get':
        return await balanceGet(deps, cid, apiKey, params)
    }
  } catch (e) {
    await deps.logAuditCall({
      customer_id: cid,
      integration: 'xendit',
      operation,
      outcome: 'error',
      meta: { error_code: 'internal_error', message: (e as Error).message },
    })
    return jsonResponse(500, {
      ok: false,
      code: 'internal_error',
      message_bahasa: 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa menit.',
    })
  }
}

// ─── Operation implementations ──────────────────────────────────────────

async function invoiceCreate(
  deps: XenditProxyDeps,
  cid: string,
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Response> {
  // Required: external_id, amount, description. Optional: payer_email,
  // success_redirect_url, failure_redirect_url, invoice_duration (sec), items.
  const required = ['external_id', 'amount', 'description']
  for (const field of required) {
    if (!(field in params)) {
      await deps.logAuditCall({
        customer_id: cid,
        integration: 'xendit',
        operation: 'invoice.create',
        outcome: 'error',
        meta: { error_code: 'params_incomplete', missing_field: field },
      })
      return jsonResponse(400, {
        ok: false,
        code: 'params_incomplete',
        message_bahasa: `Data ${field} belum lengkap. Lengkapi dulu, lalu coba lagi.`,
      })
    }
  }

  const xenditBody = {
    external_id: params.external_id,
    amount: params.amount,
    description: params.description,
    ...(params.payer_email !== undefined ? { payer_email: params.payer_email } : {}),
    ...(params.invoice_duration !== undefined ? { invoice_duration: params.invoice_duration } : {}),
    ...(params.success_redirect_url !== undefined ? { success_redirect_url: params.success_redirect_url } : {}),
    ...(params.failure_redirect_url !== undefined ? { failure_redirect_url: params.failure_redirect_url } : {}),
    ...(params.items !== undefined ? { items: params.items } : {}),
    // Default expiry 24h if customer didn't set it.
    ...(params.invoice_duration === undefined ? { invoice_duration: 86400 } : {}),
  }

  return upstream(deps, cid, 'invoice.create', '/v2/invoices', 'POST', apiKey, xenditBody, {
    external_id: String(params.external_id),
    amount: Number(params.amount),
  })
}

async function invoiceGet(
  deps: XenditProxyDeps,
  cid: string,
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Response> {
  const invoiceId = params.invoice_id
  if (!invoiceId || typeof invoiceId !== 'string') {
    return jsonResponse(400, {
      ok: false,
      code: 'params_incomplete',
      message_bahasa: 'ID invoice belum dikirim. Lengkapi dulu, lalu coba lagi.',
    })
  }
  return upstream(deps, cid, 'invoice.get', `/v2/invoices/${invoiceId}`, 'GET', apiKey, undefined, {
    invoice_id: invoiceId,
  })
}

async function refundCreate(
  deps: XenditProxyDeps,
  cid: string,
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Response> {
  const required = ['invoice_id', 'amount']
  for (const field of required) {
    if (!(field in params)) {
      return jsonResponse(400, {
        ok: false,
        code: 'params_incomplete',
        message_bahasa: `Data ${field} belum lengkap. Lengkapi dulu, lalu coba lagi.`,
      })
    }
  }
  const xenditBody = {
    invoice_id: params.invoice_id,
    amount: params.amount,
    reason: params.reason ?? 'OTHERS',
  }
  return upstream(deps, cid, 'refund.create', '/refunds', 'POST', apiKey, xenditBody, {
    invoice_id: String(params.invoice_id),
    amount: Number(params.amount),
  })
}

async function balanceGet(
  deps: XenditProxyDeps,
  cid: string,
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Response> {
  const accountType = params.account_type ?? 'CASH'
  const path = `/balance?account_type=${encodeURIComponent(String(accountType))}`
  return upstream(deps, cid, 'balance.get', path, 'GET', apiKey, undefined, {
    account_type: String(accountType),
  })
}

// ─── Common upstream call helper ────────────────────────────────────────

async function upstream(
  deps: XenditProxyDeps,
  cid: string,
  operation: string,
  path: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body: unknown | undefined,
  auditMeta: Record<string, unknown>,
): Promise<Response> {
  const authHeader = `Basic ${btoa(`${apiKey}:`)}`
  const init: RequestInit = {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  const resp = await deps.xenditFetch(path, init)
  const respBody = await resp.json().catch(() => ({}))

  if (resp.ok) {
    await deps.logAuditCall({
      customer_id: cid,
      integration: 'xendit',
      operation,
      outcome: 'ok',
      meta: auditMeta,
    })
    return jsonResponse(200, { ok: true, data: respBody })
  }

  // Map upstream error → Bahasa.
  const errCode = (respBody as { error_code?: string }).error_code
  const mapped = mapIntegrationError('xendit', { status: resp.status, code: errCode })
  await deps.logAuditCall({
    customer_id: cid,
    integration: 'xendit',
    operation,
    outcome: 'error',
    meta: { ...auditMeta, error_code: mapped.code, upstream_status: resp.status },
  })
  // Use 502 for upstream-failure category — communicates "we tried but
  // Xendit responded badly" vs 4xx (caller's fault).
  return jsonResponse(502, {
    ok: false,
    code: mapped.code,
    message_bahasa: mapped.message_bahasa,
    suggested_action: mapped.suggested_action,
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
