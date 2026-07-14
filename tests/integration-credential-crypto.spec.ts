/**
 * Sesi R Phase 0 (2026-05-13): integration-credential-crypto contract.
 *
 * AES-256-GCM round-trip + tamper-detection + missing-key guards.
 *
 * Tested behaviors:
 *   1. Round-trip: encrypt(plaintext) → decrypt → original.
 *   2. Wrong key: decryption_failed (no plaintext leak).
 *   3. Tampered ciphertext: decryption_failed.
 *   4. Tampered auth_tag: decryption_failed.
 *   5. Tampered IV: decryption_failed.
 *   6. Missing INTEGRATION_ENCRYPTION_KEY env: encryption_key_unset.
 *   7. key_version preserved through round-trip.
 *   8. Each encryption uses a fresh random IV (two encrypts of same
 *      plaintext produce different ciphertext).
 *   9. Key must be 32 bytes (hex, 64 chars) — short key rejected.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  encryptCredential,
  decryptCredential,
  type CredentialCipher,
} from '../supabase/functions/_shared/integration-credential-crypto.ts'

// 32 bytes = 64 hex chars. Test fixtures only — never commit a real key.
const TEST_KEY = '00112233445566778899aabbccddeeff' +
                 '00112233445566778899aabbccddeeff'

const TEST_KEY_2 = 'ffeeddccbbaa99887766554433221100' +
                   'ffeeddccbbaa99887766554433221100'

const SAMPLE_PLAINTEXT = JSON.stringify({
  api_key: 'xnd_development_FAKE123abcdef',
  label: 'Xendit Sandbox',
})

test('crypto: round-trip plaintext → ciphertext → plaintext', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  const recovered = await decryptCredential(cipher, TEST_KEY)
  assert.equal(recovered, SAMPLE_PLAINTEXT)
})

test('crypto: cipher has shape { ciphertext, iv, auth_tag, key_version }', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  assert.ok(typeof cipher.ciphertext === 'string' && cipher.ciphertext.length > 0)
  assert.ok(typeof cipher.iv === 'string' && cipher.iv.length > 0)
  assert.ok(typeof cipher.auth_tag === 'string' && cipher.auth_tag.length > 0)
  assert.equal(cipher.key_version, 1)
})

test('crypto: two encryptions of same plaintext produce different ciphertext (random IV)', async () => {
  const c1 = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  const c2 = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  assert.notEqual(c1.ciphertext, c2.ciphertext, 'ciphertext must differ (random IV)')
  assert.notEqual(c1.iv, c2.iv, 'IVs must differ')
})

test('crypto: wrong key fails with decryption_failed', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  await assert.rejects(
    () => decryptCredential(cipher, TEST_KEY_2),
    /decryption_failed/,
  )
})

test('crypto: tampered ciphertext fails with decryption_failed', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  // Flip a byte in ciphertext (base64-safe — just change last char).
  const tampered: CredentialCipher = {
    ...cipher,
    ciphertext: flipBase64Char(cipher.ciphertext),
  }
  await assert.rejects(
    () => decryptCredential(tampered, TEST_KEY),
    /decryption_failed/,
  )
})

test('crypto: tampered auth_tag fails with decryption_failed', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  const tampered: CredentialCipher = {
    ...cipher,
    auth_tag: flipBase64Char(cipher.auth_tag),
  }
  await assert.rejects(
    () => decryptCredential(tampered, TEST_KEY),
    /decryption_failed/,
  )
})

test('crypto: tampered IV fails with decryption_failed', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  const tampered: CredentialCipher = {
    ...cipher,
    iv: flipBase64Char(cipher.iv),
  }
  await assert.rejects(
    () => decryptCredential(tampered, TEST_KEY),
    /decryption_failed/,
  )
})

test('crypto: missing key throws encryption_key_unset on encrypt', async () => {
  await assert.rejects(
    () => encryptCredential(SAMPLE_PLAINTEXT, ''),
    /encryption_key_unset/,
  )
})

test('crypto: missing key throws encryption_key_unset on decrypt', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  await assert.rejects(
    () => decryptCredential(cipher, ''),
    /encryption_key_unset/,
  )
})

test('crypto: short key (not 32 bytes) rejected with invalid_key_length', async () => {
  const shortKey = '00112233'  // 4 bytes
  await assert.rejects(
    () => encryptCredential(SAMPLE_PLAINTEXT, shortKey),
    /invalid_key_length/,
  )
})

test('crypto: non-hex key rejected with invalid_key_format', async () => {
  const nonHex = 'g'.repeat(64)  // 64 chars but not hex
  await assert.rejects(
    () => encryptCredential(SAMPLE_PLAINTEXT, nonHex),
    /invalid_key_format/,
  )
})

test('crypto: key_version preserved through round-trip', async () => {
  const cipher = await encryptCredential(SAMPLE_PLAINTEXT, TEST_KEY)
  assert.equal(cipher.key_version, 1)
  const recovered = await decryptCredential(cipher, TEST_KEY)
  assert.equal(recovered, SAMPLE_PLAINTEXT)
})

// ─── Helpers ───────────────────────────────────────────────────────────

function flipBase64Char(s: string): string {
  if (s.length === 0) return 'A'
  // Flip the middle char to something different.
  const mid = Math.floor(s.length / 2)
  const ch = s[mid]
  const replacement = ch === 'A' ? 'B' : 'A'
  return s.slice(0, mid) + replacement + s.slice(mid + 1)
}
