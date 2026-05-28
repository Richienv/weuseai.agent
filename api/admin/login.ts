/**
 * Vercel Function: POST /api/admin/login
 *
 * Validates the submitted password against OBSERVABILITY_ADMIN_SECRET
 * (timing-safe compare). On match, sets the weuseai_admin_session cookie
 * (value = the secret itself; HttpOnly + Secure + SameSite=Strict).
 *
 * Same model the now-deleted admin-app/ Next.js sub-app used. See
 * api/_shared/admin-cookie-auth.ts for the validation side.
 *
 * Request:  POST /api/admin/login   body: { password: string }
 * Response: 200 { ok: true }
 *           400 { error: 'invalid_json' | 'missing_password' }
 *           401 { error: 'unauthorized' }
 *           405 { error: 'method_not_allowed' }
 *           500 { error: 'misconfigured' }
 */

import { timingSafeEqual } from 'node:crypto'
import { buildSessionCookie } from '../_shared/admin-cookie-auth.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }

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
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) {
    res.status(400).json({ error: 'missing_password' })
    return
  }
  if (!timingSafeStringEqual(password, ADMIN_SECRET)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  res.setHeader('Set-Cookie', buildSessionCookie(ADMIN_SECRET))
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true })
}
