/**
 * Vercel Function: /api/admin/support-tickets
 *
 * Internal-only admin endpoint for the support_tickets table
 * (Phase 5+ admin dashboard scaffolding).
 *
 * Auth model
 * ──────────
 * Same convention as /api/admin/observability/customer:
 *   Header `Authorization: Bearer ${OBSERVABILITY_ADMIN_SECRET}`
 * Without OBSERVABILITY_ADMIN_SECRET set in Vercel env, this endpoint
 * is unreachable (fail-closed).
 *
 * Modes (derived from method + query)
 * ────────────────────────────────────
 *   GET  /api/admin/support-tickets                            → list (filterable)
 *   GET  /api/admin/support-tickets?customer_id=<uuid>         → list for one customer
 *   POST /api/admin/support-tickets                            → create
 *   POST /api/admin/support-tickets?id=<uuid>                  → update
 *
 * Required Vercel env:
 *   OBSERVABILITY_ADMIN_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY            (or SUPABASE_SERVICE_ROLE_KEY)
 */

// NOTE: import path uses .js extension (NodeNext-style). See
// api/admin/observability/customer.ts for the rationale (Vercel
// @vercel/node compiles per-file under "type": "module").
//
// This file is self-contained: pure handler + Vercel entry colocated.
// Tests import handleAdminSupportTickets directly.

import { isValidBearer } from '../_shared/timing-safe-bearer.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Domain types (mirror schema CHECK enums) ──────────────────────

export const TICKET_KINDS = [
  'provisioning_stuck',
  'pairing_failed',
  'bundle_pull_failed',
  'hermes_crash',
  'first_message_silence',
  'tier_change_request',
  'billing_dispute',
  'feature_request',
  'other',
] as const
export type TicketKind = (typeof TICKET_KINDS)[number]

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'awaiting_customer',
  'resolved',
  'closed_no_action',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_SEVERITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number]

const KIND_SET = new Set<string>(TICKET_KINDS)
const STATUS_SET = new Set<string>(TICKET_STATUSES)
const SEVERITY_SET = new Set<string>(TICKET_SEVERITIES)

export type TicketRow = {
  id: string
  customer_id: string
  kind: TicketKind
  status: TicketStatus
  title: string
  body_md: string | null
  resolution_md: string | null
  severity: TicketSeverity
  created_at: string
  updated_at: string
  resolved_at: string | null
}

// ─── Pure handler input + result envelopes ─────────────────────────

export type HandlerInput =
  | {
      method: 'GET'
      mode: 'list'
      query: Record<string, string | undefined>
    }
  | {
      method: 'POST'
      mode: 'create'
      body: Record<string, unknown> | null
    }
  | {
      method: 'POST'
      mode: 'update'
      query: Record<string, string | undefined>
      body: Record<string, unknown>
    }

export type HandlerOk =
  | { ok: true; status: 200; body: { tickets: TicketRow[] } }
  | { ok: true; status: 200 | 201; body: { ticket: TicketRow } }

export type HandlerErr = {
  ok: false
  status: 400 | 404 | 500
  error: string
  detail?: string
}

export type HandlerResult = HandlerOk | HandlerErr

// ─── Injected dependencies ─────────────────────────────────────────

export type TicketRowReader = (params: {
  customer_id?: string
  status?: TicketStatus
  severity?: TicketSeverity
  limit?: number
}) => Promise<TicketRow[]>

export type TicketRowWriter = (input: {
  customer_id: string
  kind: TicketKind
  title: string
  body_md?: string | null
  severity?: TicketSeverity
}) => Promise<{ ok: true; row: TicketRow } | { ok: false; error: string }>

export type TicketRowMutator = (
  id: string,
  updates: {
    status?: TicketStatus
    body_md?: string | null
    resolution_md?: string | null
    severity?: TicketSeverity
  },
) => Promise<{ ok: true; row: TicketRow } | { ok: false; error: string }>

export type Deps = {
  reader: TicketRowReader
  writer: TicketRowWriter
  mutator: TicketRowMutator
  now: () => string
}

// ─── Pure handler ─────────────────────────────────────────────────

export async function handleAdminSupportTickets(
  input: HandlerInput,
  deps: Deps,
): Promise<HandlerResult> {
  if (input.mode === 'list') {
    return await handleList(input.query, deps)
  }
  if (input.mode === 'create') {
    return await handleCreate(input.body, deps)
  }
  if (input.mode === 'update') {
    return await handleUpdate(input.query, input.body, deps)
  }
  return { ok: false, status: 400, error: 'invalid_mode' }
}

async function handleList(
  query: Record<string, string | undefined>,
  deps: Deps,
): Promise<HandlerResult> {
  const params: {
    customer_id?: string
    status?: TicketStatus
    severity?: TicketSeverity
    limit?: number
  } = {}
  if (query.customer_id) {
    if (!UUID_RE.test(query.customer_id)) {
      return { ok: false, status: 400, error: 'bad_customer_id' }
    }
    params.customer_id = query.customer_id
  }
  if (query.status) {
    if (!STATUS_SET.has(query.status)) {
      return { ok: false, status: 400, error: 'bad_status' }
    }
    params.status = query.status as TicketStatus
  }
  if (query.severity) {
    if (!SEVERITY_SET.has(query.severity)) {
      return { ok: false, status: 400, error: 'bad_severity' }
    }
    params.severity = query.severity as TicketSeverity
  }
  if (query.limit) {
    const n = parseInt(query.limit, 10)
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return { ok: false, status: 400, error: 'bad_limit' }
    }
    params.limit = n
  }
  const rows = await deps.reader(params)
  return { ok: true, status: 200, body: { tickets: rows } }
}

async function handleCreate(
  body: Record<string, unknown> | null,
  deps: Deps,
): Promise<HandlerResult> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_input' }
  }
  const customer_id = body.customer_id
  const kind = body.kind
  const title = body.title
  const body_md = body.body_md
  const severity = body.severity

  if (typeof customer_id !== 'string' || !UUID_RE.test(customer_id)) {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (typeof kind !== 'string' || !KIND_SET.has(kind)) {
    return { ok: false, status: 400, error: 'invalid_kind' }
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 120) {
    return { ok: false, status: 400, error: 'invalid_title' }
  }
  if (body_md !== undefined && body_md !== null && typeof body_md !== 'string') {
    return { ok: false, status: 400, error: 'invalid_body_md' }
  }
  if (severity !== undefined) {
    if (typeof severity !== 'string' || !SEVERITY_SET.has(severity)) {
      return { ok: false, status: 400, error: 'invalid_severity' }
    }
  }

  const written = await deps.writer({
    customer_id,
    kind: kind as TicketKind,
    title: title.trim(),
    body_md: typeof body_md === 'string' ? body_md : null,
    severity: severity as TicketSeverity | undefined,
  })
  if (!written.ok) {
    return {
      ok: false,
      status: 500,
      error: 'writer_failed',
      detail: written.error,
    }
  }
  return { ok: true, status: 201, body: { ticket: written.row } }
}

async function handleUpdate(
  query: Record<string, string | undefined>,
  body: Record<string, unknown>,
  deps: Deps,
): Promise<HandlerResult> {
  const id = query.id
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, status: 400, error: 'invalid_id' }
  }
  const updates: {
    status?: TicketStatus
    body_md?: string | null
    resolution_md?: string | null
    severity?: TicketSeverity
  } = {}
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUS_SET.has(body.status)) {
      return { ok: false, status: 400, error: 'invalid_status' }
    }
    updates.status = body.status as TicketStatus
  }
  if (body.severity !== undefined) {
    if (typeof body.severity !== 'string' || !SEVERITY_SET.has(body.severity)) {
      return { ok: false, status: 400, error: 'invalid_severity' }
    }
    updates.severity = body.severity as TicketSeverity
  }
  if (body.body_md !== undefined) {
    if (body.body_md !== null && typeof body.body_md !== 'string') {
      return { ok: false, status: 400, error: 'invalid_body_md' }
    }
    updates.body_md = body.body_md as string | null
  }
  if (body.resolution_md !== undefined) {
    if (body.resolution_md !== null && typeof body.resolution_md !== 'string') {
      return { ok: false, status: 400, error: 'invalid_resolution_md' }
    }
    updates.resolution_md = body.resolution_md as string | null
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, error: 'empty_update' }
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
  return { ok: true, status: 200, body: { ticket: result.row } }
}

// ─── Vercel function entry (default export) ───────────────────────

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  url?: string
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  send: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const auth = (req.headers.authorization ?? '') as string
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  // Sesi D pass-2 P1: timing-safe bearer comparison (was plain `!==`).
  if (!isValidBearer(auth, ADMIN_SECRET)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // Parse query from URL (Vercel may not always populate req.query)
  const url = req.url ?? ''
  const u = new URL(url, 'http://x')
  const query: Record<string, string | undefined> = {}
  u.searchParams.forEach((v, k) => {
    query[k] = v
  })

  const method = (req.method ?? 'GET').toUpperCase()
  let input: HandlerInput
  if (method === 'GET') {
    input = { method: 'GET', mode: 'list', query }
  } else if (method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body) as Record<string, unknown>
      } else if (req.body && typeof req.body === 'object') {
        body = req.body as Record<string, unknown>
      }
    } catch {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
    if (query.id) {
      input = { method: 'POST', mode: 'update', query, body }
    } else {
      input = { method: 'POST', mode: 'create', body }
    }
  } else {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // Build PostgREST-backed deps inline (kept colocated for Vercel
  // bundling — packages/observability has the same pattern).
  const reader: TicketRowReader = async (params) => {
    const qp: string[] = ['order=created_at.desc']
    if (params.customer_id) qp.push(`customer_id=eq.${params.customer_id}`)
    if (params.status) qp.push(`status=eq.${params.status}`)
    if (params.severity) qp.push(`severity=eq.${params.severity}`)
    if (params.limit) qp.push(`limit=${params.limit}`)
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?${qp.join('&')}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          accept: 'application/json',
        },
      },
    )
    if (!r.ok) return []
    const data = (await r.json()) as TicketRow[]
    return data
  }

  const writer: TicketRowWriter = async (input) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({
        customer_id: input.customer_id,
        kind: input.kind,
        title: input.title,
        body_md: input.body_md ?? null,
        severity: input.severity ?? 'medium',
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return { ok: false, error: `${r.status}: ${txt.slice(0, 300)}` }
    }
    const rows = (await r.json()) as TicketRow[]
    if (rows.length === 0) return { ok: false, error: 'no row returned' }
    return { ok: true, row: rows[0] }
  }

  const mutator: TicketRowMutator = async (id, updates) => {
    const patch: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    }
    if (updates.status === 'resolved' || updates.status === 'closed_no_action') {
      patch.resolved_at = new Date().toISOString()
    }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
      },
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return { ok: false, error: `${r.status}: ${txt.slice(0, 300)}` }
    }
    const rows = (await r.json()) as TicketRow[]
    if (rows.length === 0) return { ok: false, error: 'no row updated' }
    return { ok: true, row: rows[0] }
  }

  const result = await handleAdminSupportTickets(input, {
    reader,
    writer,
    mutator,
    now: () => new Date().toISOString(),
  })

  res.setHeader('Cache-Control', 'no-store')
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, detail: result.detail })
    return
  }
  res.status(result.status).json(result.body)
}
