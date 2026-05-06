// Pairing-code generation + expiry helpers.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "Pairing code generator" (in Backend additions, item 4)
//
// Pure module. crypto.getRandomValues is available in Deno and
// Node ≥ 19 — for older Node test environments, the test polyfills via
// node:crypto.webcrypto.

const CODE_LENGTH = 6
const CODE_LIFETIME_MS = 30 * 60 * 1000  // 30 minutes per founder edit

export type PairingCode = {
  code: string                        // 6-digit zero-padded string, e.g. "012345"
  expiresAt: string                   // ISO-8601 UTC timestamp
}

/**
 * Generate a fresh 6-digit pairing code with a 30-minute expiry from
 * now. The code is uniformly distributed in [0, 1_000_000) using
 * Web Crypto's CSPRNG; zero-padded so any leading zero is preserved
 * for display.
 *
 * @param now — injectable clock for tests (default: Date.now())
 */
export function generatePairingCode(now: () => number = Date.now): PairingCode {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  // Modulo 1M biases the lowest ~96 codes by ~1 part in 4 billion —
  // negligible for a 30-minute single-use code, accept the simplicity.
  const n = buf[0] % 1_000_000
  const code = String(n).padStart(CODE_LENGTH, '0')
  const expiresAt = new Date(now() + CODE_LIFETIME_MS).toISOString()
  return { code, expiresAt }
}

/**
 * True if the supplied ISO timestamp is in the past (i.e. the code is
 * no longer valid). Defensive: a missing/null expiry counts as expired.
 */
export function isPairingCodeExpired(
  expiresAt: string | null | undefined,
  now: () => number = Date.now,
): boolean {
  if (!expiresAt) return true
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return true
  return t <= now()
}

export const PAIRING_CODE_LIFETIME_MS = CODE_LIFETIME_MS
export const PAIRING_CODE_LENGTH = CODE_LENGTH
