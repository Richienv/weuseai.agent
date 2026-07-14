/**
 * Shared cookie auth helper for /api/admin/* Vercel Functions.
 *
 * Cookie model:
 *   - Cookie name:   `weuseai_admin_session`
 *   - Cookie value:  `OBSERVABILITY_ADMIN_SECRET` (the env secret itself)
 *   - Validation:    timing-safe byte compare via node:crypto.timingSafeEqual
 *
 * The cookie value IS the env secret. Anyone who knows the secret can mint
 * a cookie equivalent to the legacy `Authorization: Bearer <secret>` header.
 * The login endpoint sets HttpOnly + Secure + SameSite=Strict so a browser
 * cookie can't be read by JS. Same model that the now-deleted admin-app/
 * Next.js sub-app used (see admin-app/middleware.ts + app/lib/auth.ts).
 *
 * Usage:
 *
 *   import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'
 *
 *   export default async function handler(req, res) {
 *     if (!requireAdminCookie(req, res)) return
 *     // ... handler body
 *   }
 *
 * Endpoints that also accept the legacy bearer (the 3 observability
 * endpoints retain it for back-compat) call `isValidAdminCookie` directly
 * after checking the bearer fails.
 */

import { timingSafeEqual } from 'node:crypto'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''

export const SESSION_COOKIE = 'weuseai_admin_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

type ReqLike = {
  headers: Record<string, string | string[] | undefined>
}
type ResLike = {
  status: (code: number) => ResLike
  json: (body: unknown) => ResLike
}

/**
 * Parse a Cookie header value and return the named cookie's value, or
 * null if not present. Tolerates multiple cookies separated by `; `,
 * tolerates extra spaces, does NOT decode URI-encoded values (the secret
 * is opaque ASCII; URL-encoding is irrelevant).
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const raw of parts) {
    const eqIdx = raw.indexOf('=')
    if (eqIdx < 0) continue
    const k = raw.slice(0, eqIdx).trim()
    if (k === name) {
      return raw.slice(eqIdx + 1).trim()
    }
  }
  return null
}

/**
 * True iff the request carries a `weuseai_admin_session` cookie whose
 * value matches OBSERVABILITY_ADMIN_SECRET in constant time.
 */
export function isValidAdminCookie(req: ReqLike): boolean {
  if (!ADMIN_SECRET) return false
  const rawCookie = req.headers.cookie
  const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join('; ') : rawCookie
  const value = readCookie(cookieHeader, SESSION_COOKIE)
  if (!value) return false
  const expectedBuf = Buffer.from(ADMIN_SECRET, 'utf8')
  const candidateBuf = Buffer.from(value, 'utf8')
  if (candidateBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(candidateBuf, expectedBuf)
}

/**
 * Gate helper. If the cookie is valid returns true. Otherwise writes
 * a 401 (or 500 if the env secret is unset) and returns false — caller
 * should short-circuit (early return).
 */
export function requireAdminCookie(req: ReqLike, res: ResLike): boolean {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return false
  }
  if (!isValidAdminCookie(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

/**
 * Build a `Set-Cookie` header value that sets the session cookie. The
 * value passed in is what gets compared back by `isValidAdminCookie` —
 * callers should pass the env secret itself (same-secret-as-cookie model).
 */
export function buildSessionCookie(value: string, opts?: { maxAgeSeconds?: number }): string {
  const maxAge = opts?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS
  return [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ')
}

/**
 * Build a `Set-Cookie` header value that clears the session cookie.
 */
export function buildClearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ')
}
