/**
 * Vercel Function: /api/admin/observability/template-no-match
 *
 * Founder-monthly review surface for the strict template-fetch flow
 * (P1 of the 2026-05-22 consult). Lists every `template_no_match_log`
 * event — the customer asks for a deliverable, the persona's gated
 * skill can't match it to any library template, the agent records the
 * miss here. Reading this monthly = the feedback loop to "which
 * templates do we author next?".
 *
 * Auth model: Bearer ${OBSERVABILITY_ADMIN_SECRET} required. Fail-closed
 * same convention as cost.ts + customer.ts.
 *
 * Request:
 *   GET /api/admin/observability/template-no-match[?days=30]
 *
 * Response (200):
 *   {
 *     generated_at, window_days, total_events,
 *     by_persona_skill: [   // grouped counts
 *       { persona_slug, skill_id, count, sample_deliverables: [...] }
 *     ],
 *     recent: [   // last 100 raw events newest-first
 *       { id, persona_slug, skill_id, requested_deliverable, created_at }
 *     ]
 *   }
 *
 * Required Vercel env: OBSERVABILITY_ADMIN_SECRET, SUPABASE_URL,
 * SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { isValidBearer } from '../../_shared/timing-safe-bearer.js'
import { isValidAdminCookie } from '../../_shared/admin-cookie-auth.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 365
const RECENT_LIMIT = 100
const SAMPLE_PER_GROUP = 3

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
  url?: string
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

type LogRow = {
  id: string
  persona_slug: string
  skill_id: string
  requested_deliverable: string
  created_at: string
}

type GroupedEntry = {
  persona_slug: string
  skill_id: string
  count: number
  sample_deliverables: string[]
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const auth = (req.headers.authorization ?? '') as string
  if (!ADMIN_SECRET) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  // Bearer (legacy) OR weuseai_admin_session cookie (admin browser pages).
  if (!isValidBearer(auth, ADMIN_SECRET) && !isValidAdminCookie(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // ── Args ───────────────────────────────────────────────────────
  const daysRaw = readQuery(req, 'days')
  let days = DEFAULT_WINDOW_DAYS
  if (daysRaw) {
    const parsed = Number(daysRaw)
    if (!Number.isFinite(parsed) || parsed < 1) {
      res.status(400).json({ error: 'bad_days', detail: 'days must be integer >= 1' })
      return
    }
    days = Math.min(Math.floor(parsed), MAX_WINDOW_DAYS)
  }

  // ── Fetch ──────────────────────────────────────────────────────
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const base = SUPABASE_URL.replace(/\/$/, '')
  const url =
    `${base}/rest/v1/template_no_match_log` +
    `?select=id,persona_slug,skill_id,requested_deliverable,created_at` +
    `&created_at=gte.${encodeURIComponent(since)}` +
    `&order=created_at.desc`

  let rows: LogRow[]
  try {
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Accept: 'application/json',
      },
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`PostgREST HTTP ${r.status}: ${body.slice(0, 200)}`)
    }
    rows = (await r.json()) as LogRow[]
  } catch (e) {
    res.status(502).json({
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  // ── Derive ─────────────────────────────────────────────────────
  const groups = new Map<string, GroupedEntry>()
  for (const row of rows) {
    const key = `${row.persona_slug}::${row.skill_id}`
    let g = groups.get(key)
    if (!g) {
      g = { persona_slug: row.persona_slug, skill_id: row.skill_id, count: 0, sample_deliverables: [] }
      groups.set(key, g)
    }
    g.count += 1
    if (g.sample_deliverables.length < SAMPLE_PER_GROUP) {
      g.sample_deliverables.push(row.requested_deliverable)
    }
  }
  // Highest-volume gaps first — the most worth-authoring templates.
  const by_persona_skill = [...groups.values()].sort((a, b) => b.count - a.count)
  const recent = rows.slice(0, RECENT_LIMIT)

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    generated_at: new Date().toISOString(),
    window_days: days,
    total_events: rows.length,
    by_persona_skill,
    recent,
  })
}

function readQuery(req: VercelRequest, key: string): string | null {
  const v = req.query?.[key]
  if (Array.isArray(v)) return v[0] ?? null
  if (typeof v === 'string') return v
  const url = req.url
  if (typeof url === 'string') {
    try {
      const u = new URL(url, 'http://x')
      const q = u.searchParams.get(key)
      if (q !== null) return q
    } catch {
      // ignore
    }
  }
  return null
}
