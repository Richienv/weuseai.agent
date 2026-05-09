// Phase 5-3.b: approval-queue-handler pure handler.
//
// Spec: docs/plans/2026-05-10-phase-5-spec.md (Q4=C per-action expiry).
// Schema: supabase/migrations/20260510100000_phase_5_master_agent_state.sql
//          (approval_requests table)
//
// Three modes:
//   create  — POST a new approval request. Computes expires_at from
//             action_kind unless override provided.
//   list    — GET ?customer_id=<uuid> — returns pending approvals.
//   decide  — POST ?id=<uuid>&decision=approve|reject — flips status,
//             stamps approved_by + approved_at.
//
// Pure handler — no IO. Caller (Deno entry) injects reader / writer /
// mutator dependencies.

// ─── Action_kind enum (Q4=C) ────────────────────────────────────────

export const ACTION_KINDS = [
  'incorporate',
  'contract_sign',
  'public_emission',
  'regulatory_filing',
] as const
export type ApprovalAction = (typeof ACTION_KINDS)[number]

const ACTION_KINDS_SET = new Set<string>(ACTION_KINDS)

/** Q4=C: per-action expiry hours. Renaming requires sync with the
 *  business-director SOUL.md + spec doc. */
export const ACTION_EXPIRY_HOURS: Record<ApprovalAction, number> = {
  incorporate: 14 * 24,        // 14 days
  contract_sign: 14 * 24,      // 14 days
  public_emission: 24,         // 24 hours
  regulatory_filing: 48,       // 48 hours
}

export function computeExpiry(action: ApprovalAction, nowIso: string): string {
  if (!ACTION_KINDS_SET.has(action)) {
    throw new Error(`unknown action_kind: ${action}`)
  }
  const hours = ACTION_EXPIRY_HOURS[action]
  const expiry = Date.parse(nowIso) + hours * 60 * 60 * 1000
  return new Date(expiry).toISOString()
}

// ─── Domain types ──────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type ApprovalRow = {
  id: string
  customer_id: string
  action_kind: ApprovalAction
  action_summary: string
  action_payload: Record<string, unknown>
  proposed_by_agent: string
  status: ApprovalStatus
  approved_by: string | null
  approved_at: string | null
  expires_at: string
  created_at: string
}

// ─── Handler input envelope ───────────────────────────────────────

export type HandlerInput =
  | {
      method: 'POST'
      mode: 'create'
      body: Record<string, unknown> | null
    }
  | {
      method: 'GET'
      mode: 'list'
      query: Record<string, string | undefined>
    }
  | {
      method: 'POST'
      mode: 'decide'
      query: Record<string, string | undefined>
      body: Record<string, unknown>
    }

// ─── Result envelope ───────────────────────────────────────────────

export type HandlerOk =
  | { ok: true; status: 200; body: { approvals: ApprovalRow[] } }
  | { ok: true; status: 200 | 201; body: { row: ApprovalRow } }

export type HandlerErr = {
  ok: false
  status: 400 | 404 | 500
  error: string
  detail?: string
}

export type HandlerResult = HandlerOk | HandlerErr

// ─── Injected dependencies ─────────────────────────────────────────

export type ApprovalRowReader = (params: {
  customer_id: string
  status?: ApprovalStatus
}) => Promise<ApprovalRow[]>

export type ApprovalRowWriter = (input: {
  customer_id: string
  action_kind: ApprovalAction
  action_summary: string
  action_payload: Record<string, unknown>
  proposed_by_agent: string
  expires_at: string
}) => Promise<{ ok: true; row: ApprovalRow } | { ok: false; error: string }>

export type ApprovalRowMutator = (
  id: string,
  updates: Partial<Pick<ApprovalRow, 'status' | 'approved_by' | 'approved_at'>>,
) => Promise<{ ok: true; row: ApprovalRow } | { ok: false; error: string }>

export type Deps = {
  reader: ApprovalRowReader
  writer: ApprovalRowWriter
  mutator: ApprovalRowMutator
  now: () => string
}

// ─── Handler ───────────────────────────────────────────────────────

export async function approvalQueueHandler(
  input: HandlerInput,
  deps: Deps,
): Promise<HandlerResult> {
  if (input.mode === 'create') {
    return await handleCreate(input.body, deps)
  }
  if (input.mode === 'list') {
    return await handleList(input.query, deps)
  }
  if (input.mode === 'decide') {
    return await handleDecide(input.query, input.body, deps)
  }
  // exhaustive — TS catches at compile, runtime catches typo'd modes
  return { ok: false, status: 400, error: 'invalid_mode' }
}

async function handleCreate(
  body: Record<string, unknown> | null,
  deps: Deps,
): Promise<HandlerResult> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_input' }
  }
  const customer_id = body.customer_id
  const action_kind = body.action_kind
  const action_summary = body.action_summary
  const action_payload = body.action_payload
  const proposed_by_agent = body.proposed_by_agent
  const expires_at_override = body.expires_at

  if (typeof customer_id !== 'string' || !customer_id) {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (typeof action_kind !== 'string' || !ACTION_KINDS_SET.has(action_kind)) {
    return { ok: false, status: 400, error: 'invalid_action_kind' }
  }
  if (typeof action_summary !== 'string' || !action_summary.trim()) {
    return { ok: false, status: 400, error: 'invalid_action_summary' }
  }
  if (action_payload == null || typeof action_payload !== 'object') {
    return { ok: false, status: 400, error: 'invalid_action_payload' }
  }
  if (typeof proposed_by_agent !== 'string' || !proposed_by_agent.trim()) {
    return { ok: false, status: 400, error: 'invalid_proposed_by_agent' }
  }

  const expires_at =
    typeof expires_at_override === 'string' && expires_at_override
      ? expires_at_override
      : computeExpiry(action_kind as ApprovalAction, deps.now())

  const written = await deps.writer({
    customer_id,
    action_kind: action_kind as ApprovalAction,
    action_summary,
    action_payload: action_payload as Record<string, unknown>,
    proposed_by_agent,
    expires_at,
  })
  if (!written.ok) {
    return {
      ok: false,
      status: 500,
      error: 'writer_failed',
      detail: written.error,
    }
  }
  return { ok: true, status: 201, body: { row: written.row } }
}

async function handleList(
  query: Record<string, string | undefined>,
  deps: Deps,
): Promise<HandlerResult> {
  const customer_id = query.customer_id
  if (!customer_id) {
    return { ok: false, status: 400, error: 'missing_customer_id' }
  }
  const statusFilter = query.status as ApprovalStatus | undefined
  const status: ApprovalStatus =
    statusFilter && ['pending', 'approved', 'rejected', 'expired'].includes(statusFilter)
      ? statusFilter
      : 'pending'
  const rows = await deps.reader({ customer_id, status })
  return { ok: true, status: 200, body: { approvals: rows } }
}

async function handleDecide(
  query: Record<string, string | undefined>,
  body: Record<string, unknown>,
  deps: Deps,
): Promise<HandlerResult> {
  const id = query.id
  if (!id) {
    return { ok: false, status: 400, error: 'missing_id' }
  }
  const decision = query.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, status: 400, error: 'invalid_decision' }
  }

  const approved_by =
    typeof body.approved_by === 'string' && body.approved_by
      ? (body.approved_by as string)
      : null

  const updates = {
    status: (decision === 'approve' ? 'approved' : 'rejected') as ApprovalStatus,
    approved_by,
    approved_at: deps.now(),
  }

  const result = await deps.mutator(id, updates)
  if (!result.ok) {
    return {
      ok: false,
      status: 500,
      error: 'mutator_failed',
      detail: result.error,
    }
  }
  return { ok: true, status: 200, body: { row: result.row } }
}
