/**
 * Vercel Function: /api/admin/customers
 *
 * Internal-only admin endpoint backing /admin/customers.html.
 *
 * Auth: same as observability + support-tickets — `Authorization: Bearer
 * ${OBSERVABILITY_ADMIN_SECRET}`. Without env unset → 500 misconfigured.
 *
 * Modes
 * ─────
 *   GET  /api/admin/customers                                  → list (filterable)
 *     Filters: ?tier=starter|pro|studio
 *              ?phase_5_enabled=true|false
 *              ?phase_6_enabled=true|false
 *              ?limit=N (1-200, default 100)
 *
 *   POST /api/admin/customers?id=<uuid>                        → update
 *     Body: { tier?, phase_5_enabled?, phase_6_enabled?,
 *             monthly_llm_budget_cents? }
 *     Founder uses this to flip tier on tier-bump, enable/disable phase
 *     5/6 access, raise per-customer LLM cap.
 */

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Domain types ─────────────────────────────────────────────────

// NOTE: tier is NOT a column on `customers` — it lives on `subscriptions`.
// Hotfix: tier flip is removed from this admin endpoint entirely (separate
// concern; use customer-tier-bump-handler Edge Function for actual tier
// changes which need VPS resize coordination). Tier is still surfaced in
// the list view as READ-ONLY via PostgREST nested embed of subscriptions.

export const TIERS = ['starter', 'pro', 'studio'] as const
export type Tier = (typeof TIERS)[number]

export type CustomerRow = {
  id: string
  email: string
  display_name: string | null
  phase_5_enabled: boolean
  phase_6_enabled: boolean
  monthly_llm_budget_cents: number
  telegram_chat_id: string | null
  created_at: string
  /** READ-ONLY: embedded from active subscription via PostgREST.
   *  May be null if customer has no active subscription row. */
  subscriptions?: { tier: Tier; status: string }[] | null
}

// ─── Pure handler types ────────────────────────────────────────────

export type HandlerInput =
  | {
      method: 'GET'
      mode: 'list'
      query: Record<string, string | undefined>
    }
  | {
      method: 'POST'
      mode: 'update'
      query: Record<string, string | undefined>
      body: Record<string, unknown>
    }

export type HandlerOk =
  | { ok: true; status: 200; body: { customers: CustomerRow[] } }
  | { ok: true; status: 200; body: { customer: CustomerRow } }

export type HandlerErr = {
  ok: false
  status: 400 | 404 | 500
  error: string
  detail?: string
}

export type HandlerResult = HandlerOk | HandlerErr

// ─── Injected dependencies ─────────────────────────────────────────

export type CustomerRowReader = (params: {
  phase_5_enabled?: boolean
  phase_6_enabled?: boolean
  limit?: number
}) => Promise<CustomerRow[]>

export type CustomerRowMutator = (
  id: string,
  updates: {
    phase_5_enabled?: boolean
    phase_6_enabled?: boolean
    monthly_llm_budget_cents?: number
  },
) => Promise<{ ok: true; row: CustomerRow } | { ok: false; error: string }>

export type Deps = {
  reader: CustomerRowReader
  mutator: CustomerRowMutator
  now: () => string
}

// ─── Pure handler ─────────────────────────────────────────────────

export async function handleAdminCustomers(
  input: HandlerInput,
  deps: Deps,
): Promise<HandlerResult> {
  if (input.mode === 'list') {
    return await handleList(input.query, deps)
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
  const params: Parameters<CustomerRowReader>[0] = {}
  // tier filter intentionally not supported here — tier lives on
  // subscriptions, not customers. UI can client-side filter on the
  // embedded subscriptions[0].tier if needed.
  if (query.phase_5_enabled) {
    if (query.phase_5_enabled !== 'true' && query.phase_5_enabled !== 'false') {
      return { ok: false, status: 400, error: 'bad_phase_5_enabled' }
    }
    params.phase_5_enabled = query.phase_5_enabled === 'true'
  }
  if (query.phase_6_enabled) {
    if (query.phase_6_enabled !== 'true' && query.phase_6_enabled !== 'false') {
      return { ok: false, status: 400, error: 'bad_phase_6_enabled' }
    }
    params.phase_6_enabled = query.phase_6_enabled === 'true'
  }
  if (query.limit) {
    const n = parseInt(query.limit, 10)
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return { ok: false, status: 400, error: 'bad_limit' }
    }
    params.limit = n
  }
  const rows = await deps.reader(params)
  return { ok: true, status: 200, body: { customers: rows } }
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
  const updates: Parameters<CustomerRowMutator>[1] = {}
  // tier flip intentionally not supported here — needs VPS-resize
  // coordination via customer-tier-bump-handler. Body field 'tier' is
  // explicitly rejected to surface the misuse early.
  if (body.tier !== undefined) {
    return {
      ok: false,
      status: 400,
      error: 'tier_flip_not_supported_here',
      detail: 'Use customer-tier-bump-handler Edge Function for tier changes (VPS resize coordination required).',
    }
  }
  if (body.phase_5_enabled !== undefined) {
    if (typeof body.phase_5_enabled !== 'boolean') {
      return { ok: false, status: 400, error: 'invalid_phase_5_enabled' }
    }
    updates.phase_5_enabled = body.phase_5_enabled
  }
  if (body.phase_6_enabled !== undefined) {
    if (typeof body.phase_6_enabled !== 'boolean') {
      return { ok: false, status: 400, error: 'invalid_phase_6_enabled' }
    }
    updates.phase_6_enabled = body.phase_6_enabled
  }
  if (body.monthly_llm_budget_cents !== undefined) {
    if (
      typeof body.monthly_llm_budget_cents !== 'number' ||
      !Number.isInteger(body.monthly_llm_budget_cents) ||
      body.monthly_llm_budget_cents < 0 ||
      body.monthly_llm_budget_cents > 100_000 // $1000 cap, prevents typos like 500000 cents
    ) {
      return { ok: false, status: 400, error: 'invalid_monthly_llm_budget_cents' }
    }
    updates.monthly_llm_budget_cents = body.monthly_llm_budget_cents
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
  return { ok: true, status: 200, body: { customer: result.row } }
}

// ─── Vercel function entry ────────────────────────────────────────

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  url?: string
  body?: unknown
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
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

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
    if (!query.id) {
      res.status(400).json({ error: 'missing_id_for_update' })
      return
    }
    input = { method: 'POST', mode: 'update', query, body }
  } else {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const reader: CustomerRowReader = async (params) => {
    // tier comes from subscriptions via PostgREST nested embed.
    // Filtering subscriptions to status='active' would be ideal but
    // PostgREST nested filters add complexity; for the admin UI a single
    // embedded row is fine (assume one active subscription per customer).
    const qp: string[] = [
      'select=id,email,display_name,phase_5_enabled,phase_6_enabled,monthly_llm_budget_cents,telegram_chat_id,created_at,subscriptions(tier,status)',
      'order=created_at.desc',
    ]
    if (params.phase_5_enabled !== undefined)
      qp.push(`phase_5_enabled=eq.${params.phase_5_enabled}`)
    if (params.phase_6_enabled !== undefined)
      qp.push(`phase_6_enabled=eq.${params.phase_6_enabled}`)
    qp.push(`limit=${params.limit ?? 100}`)
    const r = await fetch(`${SUPABASE_URL}/rest/v1/customers?${qp.join('&')}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        accept: 'application/json',
      },
    })
    if (!r.ok) return []
    return (await r.json()) as CustomerRow[]
  }

  const mutator: CustomerRowMutator = async (id, updates) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(updates),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return { ok: false, error: `${r.status}: ${txt.slice(0, 300)}` }
    }
    const rows = (await r.json()) as CustomerRow[]
    if (rows.length === 0) return { ok: false, error: 'no row updated' }
    return { ok: true, row: rows[0] }
  }

  const result = await handleAdminCustomers(input, {
    reader,
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
