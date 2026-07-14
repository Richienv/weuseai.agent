// Sesi R Phase 0 (2026-05-13): integration audit logging.
//
// Thin wrapper around the existing audit_log table (created in
// supabase/schema.sql) for third-party API call telemetry. Every
// integration-proxy call logs one row: customer_id + integration +
// operation + outcome.
//
// PII discipline: meta is sanitized before write. We strip any key
// whose name matches a known PII vector (api_key, phone, email, name,
// address, nik, npwp, access_token, secret) — recursively, so nested
// objects are scrubbed too. The intent is "if a developer accidentally
// puts the api_key in meta, the audit log doesn't leak it."
//
// Best-effort: if the DB insert fails (network, RLS, missing service
// role), we swallow the error rather than crashing the integration call.
// The actual third-party operation has already succeeded by the time
// we log — failing the customer's API call because we couldn't write
// an audit row would be backwards.

const KNOWN_INTEGRATIONS = ['xendit', 'whatsapp_cloud_api', 'onlinepajak'] as const
type KnownIntegration = typeof KNOWN_INTEGRATIONS[number]

const VALID_OUTCOMES = ['ok', 'error'] as const
type Outcome = typeof VALID_OUTCOMES[number]

// Keys that MUST never land in audit_log. Lowercase match.
const PII_KEYS = new Set([
  'api_key',
  'access_token',
  'secret',
  'password',
  'phone',
  'phone_number',
  'email',
  'name',
  'full_name',
  'address',
  'nik',         // Indonesian national ID
  'npwp',        // Indonesian taxpayer ID
  'card_number',
  'cvv',
  'pin',
])

export interface IntegrationAuditDeps {
  /** Insert one row into audit_log. Caller responsible for service-role auth. */
  insertAuditRow(row: {
    customer_id: string
    action: string
    target: string | null
    result: Outcome
    meta: Record<string, unknown>
  }): Promise<void>
}

export interface LogIntegrationCallInput {
  customer_id: string
  integration: KnownIntegration
  /** e.g. "invoice.create", "balance.get" — combined with integration */
  operation: string
  outcome: Outcome
  meta?: Record<string, unknown>
}

/**
 * Log one third-party API call to audit_log. Best-effort (DB failures
 * are swallowed, not propagated). Sanitizes meta before write.
 */
export async function logIntegrationCall(
  deps: IntegrationAuditDeps,
  input: LogIntegrationCallInput,
): Promise<void> {
  // Validation — these are caller bugs, not DB errors, so we DO throw.
  if (!KNOWN_INTEGRATIONS.includes(input.integration as KnownIntegration)) {
    throw new Error(`invalid_integration: ${input.integration}`)
  }
  if (!VALID_OUTCOMES.includes(input.outcome as Outcome)) {
    throw new Error(`invalid_outcome: ${input.outcome}`)
  }

  const sanitized = sanitizeAuditMeta(input.meta ?? {})

  try {
    await deps.insertAuditRow({
      customer_id: input.customer_id,
      action: `${input.integration}.${input.operation}`,
      target: input.customer_id,
      result: input.outcome,
      meta: sanitized,
    })
  } catch (e) {
    // Best-effort. Surface for observability but don't break the caller.
    console.error('[integration-audit-log] insert failed:', (e as Error).message)
  }
}

/**
 * Recursively strip PII keys from a meta object. Replaces values with
 * the literal string '[REDACTED]' so it's visible in audit logs that
 * something was scrubbed.
 *
 * Pure function. Returns a new object — input is not mutated.
 */
export function sanitizeAuditMeta(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]'
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeAuditMeta(value as Record<string, unknown>)
    } else {
      out[key] = value
    }
  }
  return out
}
