/**
 * Vercel Function: /api/admin/session
 *
 * Combined auth endpoint that dispatches on method:
 *
 *   POST   /api/admin/session   { password }   → log in (set cookie),
 *                                                200 { ok: true }
 *   GET    /api/admin/session                  → probe current auth,
 *                                                200 { ok: true } | 401
 *   DELETE /api/admin/session                  → log out (clear cookie),
 *                                                200 { ok: true }
 *
 * Consolidated into a single function so we stay under the Vercel Hobby
 * deployment limit on Functions (12 max). Older split-file shape:
 *   - api/admin/login.ts  (POST)
 *   - api/admin/me.ts     (GET)
 *   - api/admin/logout.ts (POST)
 * The /admin/* browser pages call the same paths under the new spelling.
 *
 * Cookie model = the env-secret IS the cookie. See api/_shared/admin-cookie-auth.ts
 * for the validation + Set-Cookie builders.
 */

import { timingSafeEqual } from 'node:crypto'
import {
  buildSessionCookie,
  buildClearSessionCookie,
  isValidAdminCookie,
} from '../_shared/admin-cookie-auth.js'

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
  const method = (req.method ?? 'GET').toUpperCase()
  res.setHeader('Cache-Control', 'no-store')

  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }

  if (method === 'GET') {
    if (!isValidAdminCookie(req)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (method === 'DELETE') {
    res.setHeader('Set-Cookie', buildClearSessionCookie())
    res.status(200).json({ ok: true })
    return
  }

  if (method === 'POST') {
    let body: Record<string, unknown> = {}
    try {
      if (typeof req.body === 'string') body = JSON.parse(req.body) as Record<string, unknown>
      else if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>
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
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
