// Sesi D pass-2 P1 — timing-safe bearer comparison for Vercel api/* endpoints.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md (P1-PASS2-1)
//
// Mirrors supabase/functions/_shared/constant-time-equal.ts (pass-1 P1-1)
// but Node-side, so we can use the platform's vetted crypto.timingSafeEqual
// rather than a hand-rolled byte loop.
//
// Usage in any api/* Vercel function entry:
//
//   import { isValidBearer } from './_shared/timing-safe-bearer.js'
//   // (.js extension required by Vercel @vercel/node ESM resolution —
//   //  same convention as api/admin/observability/customer.ts)
//
//   if (!ADMIN_SECRET) { res.status(500).json({ error: 'misconfigured' }); return }
//   const auth = (req.headers.authorization ?? '') as string
//   if (!isValidBearer(auth, ADMIN_SECRET)) {
//     res.status(401).json({ error: 'unauthorized' })
//     return
//   }
//
// The pre-fix pattern was:
//   if (auth !== `Bearer ${ADMIN_SECRET}`)        // ← timing-unsafe, leaks
//                                                 //   secret one byte at a time
//                                                 //   via response-time differential.

import { timingSafeEqual } from 'node:crypto'

/**
 * True iff `auth` exactly equals `Bearer <secret>` in constant time.
 *
 * - Length-mismatched inputs return false immediately. `crypto.timingSafeEqual`
 *   would throw on mismatched buffer lengths; the length pre-check both
 *   prevents the throw and is itself information already observable
 *   (length of expected string is fixed by the secret length, which is
 *   not itself a secret in a `Bearer <secret>` framing).
 * - Equal-length inputs are compared byte-by-byte by the platform's
 *   timingSafeEqual primitive — guaranteed by Node 16+ to take the same
 *   wall time regardless of where the first mismatch is.
 * - Empty secret returns false (defense-in-depth — caller should have
 *   already gated on misconfigured env, but we don't want a literal
 *   `Bearer ` to match a literal empty secret).
 *
 * Scheme is case-sensitive (`Bearer` only). RFC 6750 actually permits
 * case-insensitive scheme matching; this helper preserves the existing
 * pre-fix behavior of the 4 callsites which all used the literal
 * `Bearer ` prefix.
 */
export function isValidBearer(auth: string, secret: string): boolean {
  if (!secret) return false
  // Convert to byte buffers BEFORE length comparison — JS `string.length`
  // is UTF-16 code units, not bytes, so multi-byte secrets can have
  // matching string lengths but different byte counts. timingSafeEqual
  // demands matching byte lengths and throws otherwise.
  const expectedBuf = Buffer.from(`Bearer ${secret}`, 'utf8')
  const authBuf = Buffer.from(auth, 'utf8')
  if (authBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(authBuf, expectedBuf)
}
