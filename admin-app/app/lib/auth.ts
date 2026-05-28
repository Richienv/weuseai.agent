/**
 * Shared admin auth helpers.
 *
 * Single password = OBSERVABILITY_ADMIN_SECRET (env, already set on Vercel
 * for the existing /api/admin/observability/* endpoints). The Next.js
 * admin sub-app re-uses the same secret — no separate session store.
 *
 * Cookie value = the secret itself (HTTPOnly + SameSite=Strict + Secure).
 * That keeps the auth model dead-simple: any cookie that timing-safe-
 * matches the env secret is a valid session.
 */

import { timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'weuseai_admin_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function getAdminSecret(): string {
  return process.env.OBSERVABILITY_ADMIN_SECRET ?? '';
}

/**
 * True iff `candidate` exactly equals `expected` in constant time.
 *
 * Mirrors api/_shared/timing-safe-bearer.ts (without the `Bearer ` prefix)
 * so cookie-mode auth gets the same byte-level guarantees the Vercel
 * Functions already enforce.
 */
export function timingSafeEqualStrings(candidate: string, expected: string): boolean {
  if (!expected) return false;
  if (!candidate) return false;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const candidateBuf = Buffer.from(candidate, 'utf8');
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}

export function isValidSessionCookie(value: string | undefined): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;
  if (!value) return false;
  return timingSafeEqualStrings(value, secret);
}
