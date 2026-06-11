/**
 * Vercel Function: /api/admin/library-proposal-decide
 *
 * Self-Improving Library (Mission 3): the founder's one-click decision.
 * Authenticates the founder (cookie/bearer), then proxies server-to-server
 * to the Supabase `library-proposal-apply` Edge Function which does the
 * real work (bundle patch + upload + broadcast on approve; mark on
 * reject). No client ever holds the service key.
 *
 * Request:  POST { id: string, decision: 'approve' | 'reject' }
 * Response: passthrough of the Edge Function result.
 */

import { isValidBearer } from '../_shared/timing-safe-bearer.js'
import { isValidAdminCookie } from '../_shared/admin-cookie-auth.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

type VercelRequest = {
  method?: string
  body?: unknown
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
  if (req.method !== 'POST') {
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
