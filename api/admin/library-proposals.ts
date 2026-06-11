/**
 * Vercel Function: /api/admin/library-proposals
 *
 * Self-Improving Library (Mission 3): founder approval queue — list
 * proposals with their triggering-signal evidence (which no-matches, how
 * many customers affected). Read-only; decisions go through
 * /api/admin/library-proposal-decide.
 *
 * Auth: Bearer ${OBSERVABILITY_ADMIN_SECRET} or admin cookie (same
 * conventions as cost.ts). Fail-closed.
 *
 * Request:  GET /api/admin/library-proposals[?status=pending|all]
 * Response: 200 { generated_at, count, proposals: [...] }
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
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
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
