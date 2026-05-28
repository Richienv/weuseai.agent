/**
 * Vercel Function: GET /api/admin/me
 *
 * Quick auth probe. Returns 200 { ok: true } if the cookie is valid,
 * 401 otherwise. Used by /admin/index.html to decide whether to bounce
 * to /admin/login or send the operator into /admin/manual-provision.
 */

import { isValidAdminCookie } from '../_shared/admin-cookie-auth.js'

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured' })
    return
  }
  if (!isValidAdminCookie(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  res.status(200).json({ ok: true })
}
