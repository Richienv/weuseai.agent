// Sesi R Phase 0 (2026-05-13): AES-256-GCM credential encryption.
//
// Encrypts customer-provided third-party API keys (Xendit, Meta WhatsApp
// Cloud API, OnlinePajak) at rest in the integration_credentials table.
// Decryption happens server-side only — Edge Functions running as
// service_role load the row, decrypt with INTEGRATION_ENCRYPTION_KEY,
// make the third-party API call, then drop the plaintext. The customer's
// VPS never sees the raw key.
//
// Auth model: same single-shared-secret philosophy as
// hermes-instance-auth.ts. One key, rotated only via INTEGRATION_ENCRYPTION_KEY
// env var + key_version bump on the table.
//
// Web Crypto only — works in Deno (Edge Function runtime) AND Node 20+
// (tests via tsx). No npm deps.

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12          // GCM standard; 96-bit IV
const KEY_BYTES = 32         // AES-256
const KEY_HEX_LEN = KEY_BYTES * 2  // 64 hex chars

export interface CredentialCipher {
  /** Base64-encoded ciphertext (does NOT include the auth tag). */
  ciphertext: string
  /** Base64-encoded 12-byte random IV. */
  iv: string
  /** Base64-encoded 16-byte GCM auth tag. */
  auth_tag: string
  /** Reserved for key rotation. v1 = launch. */
  key_version: number
}

/**
 * Encrypt a UTF-8 plaintext string with the given hex-encoded key.
 *
 * @param plaintext - The data to encrypt. Typically `JSON.stringify(credObj)`.
 * @param hexKey - 64-char hex string (32 bytes raw). Source:
 *                 `process.env.INTEGRATION_ENCRYPTION_KEY` or equivalent.
 * @throws `encryption_key_unset` if hexKey is empty.
 * @throws `invalid_key_format` if hexKey contains non-hex chars.
 * @throws `invalid_key_length` if hexKey is not 64 chars.
 */
export async function encryptCredential(
  plaintext: string,
  hexKey: string,
): Promise<CredentialCipher> {
  validateKey(hexKey)

  const keyBytes = hexToBytes(hexKey)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ptBytes = new TextEncoder().encode(plaintext)

  // Web Crypto's encrypt returns ciphertext + auth tag concatenated.
  // GCM standard: last 16 bytes are the tag.
  const fullOutput = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, cryptoKey, ptBytes),
  )
  const TAG_BYTES = 16
  const ciphertextBytes = fullOutput.slice(0, fullOutput.length - TAG_BYTES)
  const tagBytes = fullOutput.slice(fullOutput.length - TAG_BYTES)

  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    iv: bytesToBase64(iv),
    auth_tag: bytesToBase64(tagBytes),
    key_version: 1,
  }
}

/**
 * Decrypt a CredentialCipher back to the original UTF-8 plaintext.
 *
 * @throws `encryption_key_unset` if hexKey is empty.
 * @throws `invalid_key_format` if hexKey contains non-hex chars.
 * @throws `invalid_key_length` if hexKey is not 64 chars.
 * @throws `decryption_failed` on tag mismatch, tampering, wrong key,
 *         or any other Web Crypto error. NEVER leaks plaintext on failure.
 */
export async function decryptCredential(
  cipher: CredentialCipher,
  hexKey: string,
): Promise<string> {
  validateKey(hexKey)

  try {
    const keyBytes = hexToBytes(hexKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: ALGORITHM },
      false,
      ['decrypt'],
    )
    const iv = base64ToBytes(cipher.iv)
    const ctBytes = base64ToBytes(cipher.ciphertext)
    const tagBytes = base64ToBytes(cipher.auth_tag)

    // Reassemble ciphertext + tag for Web Crypto's decrypt.
    const combined = new Uint8Array(ctBytes.length + tagBytes.length)
    combined.set(ctBytes, 0)
    combined.set(tagBytes, ctBytes.length)

    const ptBytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: ALGORITHM, iv }, cryptoKey, combined),
    )
    return new TextDecoder().decode(ptBytes)
  } catch {
    // Single error string regardless of cause — avoids oracle attacks
    // distinguishing "wrong key" from "tampered tag" from "bad base64".
    throw new Error('decryption_failed')
  }
}

// ─── Validation + encoding helpers ─────────────────────────────────────

function validateKey(hexKey: string): void {
  if (!hexKey) {
    throw new Error('encryption_key_unset')
  }
  if (hexKey.length !== KEY_HEX_LEN) {
    throw new Error('invalid_key_length')
  }
  if (!/^[0-9a-fA-F]+$/.test(hexKey)) {
    throw new Error('invalid_key_format')
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  // btoa works in both Deno and Node 20+ (global).
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
