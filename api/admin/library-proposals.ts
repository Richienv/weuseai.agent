/**
 * Vercel Function: /api/admin/library-proposals
 *
 * Self-Improving Library founder queue — consolidated (2026-06-11, Hobby
 * 12-function cap):
 *   GET  → list proposals with their triggering-signal evidence
 *   POST → { id, decision: 'approve' | 'reject' } — proxies server-to-
 *          server to the Supabase `library-proposal-apply` Edge Function
 *          (bundle patch + upload + broadcast on approve). No client ever
 *          holds the service key.
 *
 * The old /api/admin/library-proposal-decide URL keeps working via a
 * vercel.json rewrite.
 *
 * Auth: Bearer ${OBSERVABILITY_ADMIN_SECRET} or admin cookie. Fail-closed.
 */

import { isValidBearer } from '../_shared/timing-safe-bearer.js'
import { isValidAdminCookie } from '../_shared/admin-cookie-auth.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

type VercelRequest = {
  method?: string
  url?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  const statusParam = new URL(req.url ?? '/', 'https://x').searchParams.get('status') ?? 'pending'
  const filter = statusParam === 'all' ? '' : `&status=eq.${encodeURIComponent(statusParam)}`
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/library_proposals?select=*&order=created_at.desc&limit=100${filter}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
    )
    if (!r.ok) throw new Error(`PostgREST ${r.status}`)
    const proposals = (await r.json()) as unknown[]
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      generated_at: new Date().toISOString(),
      count: proposals.length,
      proposals,
    })
  } catch (e) {
    res.status(502).json({
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

async function handleDecide(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = (req.body ?? {}) as { id?: string; decision?: string }
  if (!body.id || (body.decision !== 'approve' && body.decision !== 'reject')) {
    res.status(400).json({ error: 'invalid_input', detail: 'need { id, decision: approve|reject }' })
    return
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/library-proposal-apply`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ id: body.id, decision: body.decision }),
    })
    const payload = await r.json().catch(() => ({ ok: false, error: 'unparseable_response' }))
    res.setHeader('Cache-Control', 'no-store')
    res.status(r.status).json(payload)
  } catch (e) {
    res.status(502).json({
      error: 'apply_proxy_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const auth = (req.headers.authorization ?? '') as string
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  if (!isValidBearer(auth, ADMIN_SECRET) && !isValidAdminCookie(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: 'misconfigured', detail: 'SUPABASE env unset' })
    return
  }
  if (req.method === 'GET') {
    await handleList(req, res)
  } else {
    await handleDecide(req, res)
  }
}
