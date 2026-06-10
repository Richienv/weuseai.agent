// Sesi R Phase 1 (2026-05-13): BYO credential onboarding handler.
//
// Three endpoints under /integration-credentials/<integration>:
//   GET    → status check (200 / 404 / 410)
//   POST   → onboard or rotate (validates upstream first, then encrypts + persists)
//   DELETE → revoke (soft delete; idempotent)
//
// Auth: X-CID header == HMAC-bearer's claimed customer_id. Same pattern
// as customer-progress-proxy post-Sesi-D-pass-3 (PR #93).
//
// Customer's plaintext API key is NEVER persisted. It's used once to
// validate against the upstream service (e.g. Xendit GET /balance) and
// to encrypt via integration-credential-crypto, then discarded.

import {
  extractBearerToken,
  verifyCustomerToken,
} from './hermes-instance-auth.ts'
import { encryptCredential } from './integration-credential-crypto.ts'
import { mapIntegrationError, type IntegrationName } from './integration-error-mapper.ts'
import { logIntegrationCall } from './integration-audit-log.ts'

const KNOWN_INTEGRATIONS: readonly IntegrationName[] = [
  'xendit',
  'whatsapp_cloud_api',
  'onlinepajak',
]

export interface CredentialRow {
  customer_id: string
  integration: IntegrationName
  credential_label: string | null
  ciphertext: string
  iv: string
  auth_tag: string
  key_version: number
  created_at: string
  last_validated_at: string | null
  revoked_at: string | null
}

export interface UpstreamValidationResult {
  ok: boolean
  status?: number
  code?: string
  last_validated_at?: string
}

export interface IntegrationCredentialDeps {
  hmacKey: string
  encryptionKey: string
  loadRow(
    customer_id: string,
    integration: IntegrationName,
  ): Promise<CredentialRow | null>
  upsertRow(row: CredentialRow): Promise<void>
  revokeRow(
    customer_id: string,
    integration: IntegrationName,
  ): Promise<void>
  validateUpstream(
    integration: IntegrationName,
    apiKey: string,
  ): Promise<UpstreamValidationResult>
  logAuditCall(input: {
    customer_id: string
    integration: IntegrationName
    operation: string
    outcome: 'ok' | 'error'
    meta?: Record<string, unknown>
  }): Promise<void>
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function handleIntegrationCredential(
  deps: IntegrationCredentialDeps,
  req: Request,
): Promise<Response> {
  // ─── 1. Parse integration from URL ──────────────────────────────────
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const integrationSegment = segments[segments.length - 1]
  if (!KNOWN_INTEGRATIONS.includes(integrationSegment as IntegrationName)) {
    return jsonResponse(404, { ok: false, error: 'unknown_integration' })
  }
  const integration = integrationSegment as IntegrationName

  // ─── 2. Auth: X-CID + HMAC bearer ───────────────────────────────────
  const cid = req.headers.get('X-CID')
  if (!cid) {
    return jsonResponse(403, { ok: false, error: 'x_cid_missing' })
  }
  const bearer = extractBearerToken(req.headers.get('Authorization'))
  if (!bearer) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' })
  }
  // Format check first: 64-char lowercase hex (sha256 = 32 bytes = 64 hex).
  // A bearer that fails this check is malformed → 401. A well-formed bearer
  // that doesn't verify against the X-CID is a CLAIM mismatch → 403.
  if (!/^[0-9a-fA-F]{64}$/.test(bearer)) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' })
  }
  const validBearer = await verifyCustomerToken(cid, bearer, deps.hmacKey)
  if (!validBearer) {
    return jsonResponse(403, { ok: false, error: 'x_cid_mismatch' })
  }

  // ─── 3. Dispatch by method ──────────────────────────────────────────
  switch (req.method) {
    case 'GET':    return handleGet(deps, cid, integration)
    case 'POST':   return handlePost(deps, cid, integration, req)
    case 'DELETE': return handleDelete(deps, cid, integration)
    default:
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' })
  }
}

// ─── GET ────────────────────────────────────────────────────────────────

async function handleGet(
  deps: IntegrationCredentialDeps,
  customer_id: string,
  integration: IntegrationName,
): Promise<Response> {
  const row = await deps.loadRow(customer_id, integration)
  if (!row) {
    return jsonResponse(404, { configured: false })
  }
  if (row.revoked_at) {
    return jsonResponse(410, {
      configured: false,
      revoked_at: row.revoked_at,
    })
  }
  return jsonResponse(200, {
    configured: true,
    label: row.credential_label,
    last_validated_at: row.last_validated_at,
    created_at: row.created_at,
    // CRITICAL: never include ciphertext / iv / auth_tag in response.
  })
}

// ─── POST ───────────────────────────────────────────────────────────────

async function handlePost(
  deps: IntegrationCredentialDeps,
  customer_id: string,
  integration: IntegrationName,
  req: Request,
): Promise<Response> {
  let body: { api_key?: string; label?: string }
  try {
    // Cast: undici's Request.json() (root tsconfig, no DOM lib) types as
    // Promise<unknown>. Fields are runtime-validated immediately below.
    body = (await req.json()) as { api_key?: string; label?: string }
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' })
  }
  if (!body.api_key || typeof body.api_key !== 'string') {
    return jsonResponse(400, { ok: false, error: 'api_key_required' })
  }

  // Validate against upstream first — refuse to persist a bad key.
  const validation = await deps.validateUpstream(integration, body.api_key)
  if (!validation.ok) {
    const mapped = mapIntegrationError(integration, {
      status: validation.status ?? 0,
      code: validation.code,
    })
    await deps.logAuditCall({
      customer_id,
      integration,
      operation: 'credential.set',
      outcome: 'error',
      meta: { error_code: mapped.code, upstream_status: validation.status ?? 0 },
    })
    return jsonResponse(400, {
      ok: false,
      code: mapped.code,
      message_bahasa: mapped.message_bahasa,
      suggested_action: mapped.suggested_action,
    })
  }

  // Encrypt + upsert.
  const cipher = await encryptCredential(
    JSON.stringify({ api_key: body.api_key }),
    deps.encryptionKey,
  )
  const now = new Date().toISOString()
  await deps.upsertRow({
    customer_id,
    integration,
    credential_label: body.label ?? null,
    ciphertext: cipher.ciphertext,
    iv: cipher.iv,
    auth_tag: cipher.auth_tag,
    key_version: cipher.key_version,
    created_at: now,
    last_validated_at: validation.last_validated_at ?? now,
    revoked_at: null,  // Explicit — re-add after revoke clears the flag.
  })

  await deps.logAuditCall({
    customer_id,
    integration,
    operation: 'credential.set',
    outcome: 'ok',
  })

  return jsonResponse(200, {
    ok: true,
    configured: true,
    last_validated_at: validation.last_validated_at ?? now,
  })
}

// ─── DELETE ─────────────────────────────────────────────────────────────

async function handleDelete(
  deps: IntegrationCredentialDeps,
  customer_id: string,
  integration: IntegrationName,
): Promise<Response> {
  await deps.revokeRow(customer_id, integration)
  await deps.logAuditCall({
    customer_id,
    integration,
    operation: 'credential.revoke',
    outcome: 'ok',
  })
  return jsonResponse(200, { ok: true, revoked: true })
}

// ─── Utility ───────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
