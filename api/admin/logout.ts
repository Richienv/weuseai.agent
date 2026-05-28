/**
 * Vercel Function: POST /api/admin/logout
 *
 * Clears the weuseai_admin_session cookie. POST-only so a CSRF link
 * can't log the founder out from a third-party site.
 */

import { buildClearSessionCookie } from '../_shared/admin-cookie-auth.js'

type VercelRequest = { method?: string }
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  res.setHeader('Set-Cookie', buildClearSessionCookie())
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true })
}
