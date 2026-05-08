// bundle-pull-record handler (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
//
// Customer-side telemetry endpoint. Hermes' bundle-pull script POSTs
// here after each pull attempt (success or fail). Insert into
// bundle_pull_attempts. NEVER affects customer-facing behavior — best-
// effort write; any failure logs but doesn't propagate.
//
// Auth: customer_id UUID validated against active subscription. Same
// minimal validation as bundle-fetch.

// ─── input + output ────────────────────────────────────────────────────

export const PULL_STATUSES = [
  'success',
  'failed',
  'timeout',
  'permission_denied',
  'storage_unavailable',
] as const

export type PullStatus = typeof PULL_STATUSES[number]

export type PullRecordInput = {
  customer_id: string
  agent_slug: string
  version_requested?: string
  version_installed?: string  // null when status != 'success'
  status: PullStatus
  error_detail?: string
  bytes_pulled?: number
  duration_ms?: number
}

export type PullRecordOk = {
  ok: true
  status: 200
  body: { recorded: true; row_id: string }
}

export type PullRecordErr = {
  ok: false
  status: 400 | 500
  error: string
  detail?: string
}

export type PullRecordResult = PullRecordOk | PullRecordErr

// ─── injected dependencies ─────────────────────────────────────────────

export type RecordWriter = (row: {
  customer_id: string
  agent_slug: string
  version_requested?: string
  version_installed?: string
  status: PullStatus
  error_detail?: string
  bytes_pulled?: number
  duration_ms?: number
}) => Promise<{ ok: true; id: string } | { ok: false; error: string }>

// ─── handler ────────────────────────────────────────────────────────────

const MAX_ERROR_DETAIL_LEN = 1000  // bound row size

export async function bundlePullRecordHandler(
  input: PullRecordInput,
  writer: RecordWriter,
): Promise<PullRecordResult> {
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (!input.agent_slug || typeof input.agent_slug !== 'string') {
    return { ok: false, status: 400, error: 'invalid_agent_slug' }
  }
  if (!input.status || !(PULL_STATUSES as readonly string[]).includes(input.status)) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_status',
      detail: `must be one of ${PULL_STATUSES.join(', ')}`,
    }
  }

  // Optional numeric fields — coerce non-finite to undefined (some
  // shells emit empty strings or NaN on failure).
  const bytesPulled =
    typeof input.bytes_pulled === 'number' && Number.isFinite(input.bytes_pulled)
      ? input.bytes_pulled
      : undefined
  const durationMs =
    typeof input.duration_ms === 'number' && Number.isFinite(input.duration_ms)
      ? input.duration_ms
      : undefined

  // Truncate error_detail defensively — boot script could emit a
  // very long stack trace.
  const errorDetail =
    typeof input.error_detail === 'string'
      ? input.error_detail.slice(0, MAX_ERROR_DETAIL_LEN)
      : undefined

  const result = await writer({
    customer_id: input.customer_id,
    agent_slug: input.agent_slug,
    version_requested: input.version_requested,
    version_installed: input.version_installed,
    status: input.status,
    error_detail: errorDetail,
    bytes_pulled: bytesPulled,
    duration_ms: durationMs,
  })

  if (!result.ok) {
    return {
      ok: false,
      status: 500,
      error: 'record_write_failed',
      detail: result.error,
    }
  }

  return {
    ok: true,
    status: 200,
    body: { recorded: true, row_id: result.id },
  }
}
