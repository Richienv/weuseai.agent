// Phase 5-3.c: per-customer HMAC-signed tokens.
//
// Replaces the MVP customer_id existence check used by:
//   - hermes-kanban-proxy-handler (Phase 4-5b)
//   - approval-queue-handler create + decide modes (Phase 5-3.b)
//
// Auth model
// ──────────
// Single shared secret HERMES_INSTANCE_HMAC_KEY lives in:
//   - Supabase Edge Function environment (this side, verifier)
//   - Customer VPS Hermes cloud-init (issuer)
//
// At provision time, cloud-init computes the per-customer token:
//   token = hex(HMAC_SHA256(customer_id, HERMES_INSTANCE_HMAC_KEY))
// and writes it into /home/weuseai/.hermes/.env. Hermes side passes the
// token in `Authorization: Bearer <token>` on every callback to platform.
//
// Verifier recomputes the expected token and compares constant-time. A
// match proves: "the caller knows the shared secret AND claims to be
// customer X."
//
// Leak surface
// ────────────
// If ANY customer's VPS is compromised + the env file leaks, the attacker
// gets the shared secret + can mint tokens for ANY customer. This is
// strictly weaker than per-customer-secret schemes but strictly stronger
// than the MVP "customer_id is unguessable enough" assumption — and
// enough for Phase 5 paying-customer scope. Future hardening (Phase 6+)
// could rotate the shared secret periodically or move to per-customer
// keys hashed in DB.

// Web Crypto is available in both Deno (Edge Functions) and Node 20+
// (test runner via tsx). No npm dependency needed.

const TOKEN_HEX_LEN = 64 // SHA-256 = 32 bytes = 64 hex chars

/** Compute the per-customer HMAC token. Returns lowercase hex (64 chars).
 *  Used by Hermes side to mint, verifier side to compare. */
export async function signCustomerToken(
  customer_id: string,
  hmacKey: string,
): Promise<string> {
  if (!customer_id) throw new Error('signCustomerToken: customer_id required')
  if (!hmacKey) throw new Error('signCustomerToken: hmacKey required')

  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(hmacKey)
  const messageBytes = encoder.encode(customer_id)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes)
  return bytesToHex(new Uint8Array(signature))
}

/** Verify that a presented token matches the expected HMAC for the
 *  claimed customer_id. Constant-time comparison via length-equal +
 *  bitwise diff to avoid timing side-channels.
 *
 *  Returns true on match, false on any kind of mismatch (bad length,
 *  bad hex, wrong customer_id, wrong key). Throws only if hmacKey is
 *  unset — that's a server-config bug, not an auth fail. */
export async function verifyCustomerToken(
  claimed_customer_id: string,
  presented_token: string,
  hmacKey: string,
): Promise<boolean> {
  if (!hmacKey) throw new Error('verifyCustomerToken: hmacKey unset (server misconfig)')

  // Token must be the right length first — otherwise constantTimeEqual's
  // length check would leak via early-return timing.
  if (
    typeof presented_token !== 'string' ||
    presented_token.length !== TOKEN_HEX_LEN
  ) {
    return false
  }
  // Lowercase normalize. Token must be hex.
  const presented = presented_token.toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(presented)) {
    return false
  }

  let expected: string
  try {
    expected = await signCustomerToken(claimed_customer_id, hmacKey)
  } catch {
    return false
  }
  return constantTimeEqual(presented, expected)
}

/** Extract the bearer token from an Authorization header. Returns null
 *  if the header is missing, malformed, or not "Bearer". */
export function extractBearerToken(
  authHeader: string | null | undefined,
): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

// ─── Internal helpers ─────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0')
  }
  return hex
}

/** Constant-time string equality. Both inputs must already be
 *  length-validated by the caller. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
