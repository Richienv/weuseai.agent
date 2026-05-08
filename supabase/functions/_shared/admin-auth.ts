// admin-auth.ts — shared JWT-role admin auth for Edge Functions.
//
// One-line rule: admin-only Edge Functions (server-to-server, never
// customer-callable) gate on the role claim of the gateway-issued JWT.
// Don't compare bearer-string equality against env — Supabase's new
// sb_secret_*/sb_publishable_* key system rewrites the bearer into a
// synthesized JWT before the function sees it, breaking raw equality.
//
// Reference: docs/security/jwt-role-pattern.md
// Diagnosed during Phase 2E-2 smoke. Pattern locked Phase 2E-3.
//
// Usage in any admin Edge Function entrypoint:
//
//   import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
//
//   Deno.serve(async (req) => {
//     if (!isServiceRoleCaller(req)) {
//       return new Response(JSON.stringify({ error: 'unauthorized' }), {
//         status: 401,
//         headers: { 'Content-Type': 'application/json' },
//       })
//     }
//     // ... rest of handler
//   })
//
// Customer-callable functions (workflow-list, bundle-fetch, etc.) gate
// on customer_id + active subscription, NOT this helper.

/**
 * Decode the payload section of a JWT without verifying the signature.
 *
 * Safe to call on untrusted input — pure parsing, no side effects.
 * Returns null when:
 *   - the input doesn't have 3 dot-separated segments
 *   - the middle segment isn't valid base64url
 *   - the decoded segment isn't valid JSON
 *
 * We don't verify the signature because Supabase's gateway already
 * authenticated the bearer and rewrote it into a freshly-signed JWT
 * before forwarding to this function. Trusting the role claim is
 * equivalent to trusting the gateway.
 */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    // base64url → base64 → utf-8 string → JSON.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = atob(padded)
    const payload = JSON.parse(json)
    // JWT spec mandates the payload is a JSON object — reject arrays and
    // primitives even though `typeof [] === 'object'`.
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null
    }
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * True iff the request carries a Bearer JWT whose `role` claim is
 * `service_role`. Returns false for: missing bearer, malformed bearer,
 * malformed JWT, role !== 'service_role', empty token.
 *
 * Auth flow (with Supabase verify_jwt=false):
 *   - No bearer            → empty token reaches us → decodeJwtPayload
 *                            returns null → return false → 401.
 *   - Anon key bearer      → gateway forwards an `anon` JWT → role !==
 *                            'service_role' → false.
 *   - sb_publishable_*     → same as anon (gateway rewrites to anon JWT).
 *   - Legacy service-role JWT → forwarded untouched → role === 'service_role'
 *                                → true.
 *   - sb_secret_*          → gateway rewrites to synthesized service_role
 *                            JWT → role === 'service_role' → true.
 *   - Forged JWT           → gateway upstream-rejects → never reaches here.
 *   - Malformed Authorization header → false.
 *
 * Test the 5 scenarios per Phase 2E-3 spec audit table.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  if (!token) return false
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  return payload.role === 'service_role'
}
