// Unit tests for the shared JWT-role admin auth helper.
//
// Reference: supabase/functions/_shared/admin-auth.ts
//          + docs/security/jwt-role-pattern.md
//
// 5 scenarios per the Phase 2E-3 audit pattern:
//   1. No bearer
//   2. Anon-role JWT bearer
//   3. Service-role JWT bearer
//   4. Malformed JWT (not 3 parts / bad base64 / bad JSON)
//   5. Role-claim of unexpected value (e.g. 'authenticated')

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeJwtPayload,
  isServiceRoleCaller,
} from '../supabase/functions/_shared/admin-auth.ts'

// ─── helpers ────────────────────────────────────────────────────────────

/**
 * Build a fake JWT for tests. We don't sign these — the function under
 * test deliberately does NOT verify signatures (the Supabase gateway
 * does that). So an unsigned JWT with the right role claim is exactly
 * what production sees post-rewrite.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.fake-signature-not-verified`
}

function reqWith(authHeader: string | null): Request {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return new Request('http://localhost/test', { method: 'POST', headers })
}

// ─── decodeJwtPayload ───────────────────────────────────────────────────

describe('decodeJwtPayload', () => {
  test('returns the payload object for a well-formed JWT', () => {
    const jwt = makeJwt({ role: 'service_role', sub: 'abc' })
    const result = decodeJwtPayload(jwt)
    assert.deepEqual(result, { role: 'service_role', sub: 'abc' })
  })

  test('returns null for non-JWT strings', () => {
    assert.equal(decodeJwtPayload(''), null)
    assert.equal(decodeJwtPayload('not.a.jwt.too.many.dots'), null)
    assert.equal(decodeJwtPayload('singlestring'), null)
    assert.equal(decodeJwtPayload('a.b'), null)
  })

  test('returns null when the middle segment is not valid base64', () => {
    assert.equal(decodeJwtPayload('abc.!!!.xyz'), null)
  })

  test('returns null when the decoded segment is not valid JSON', () => {
    const b64 = Buffer.from('not json').toString('base64').replace(/=+$/, '')
    assert.equal(decodeJwtPayload(`abc.${b64}.xyz`), null)
  })

  test('returns null when the decoded payload is a non-object (string, array, number, null)', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/=+$/, '')
    assert.equal(decodeJwtPayload(`abc.${b64('"a string"')}.xyz`), null)
    assert.equal(decodeJwtPayload(`abc.${b64('[1,2,3]')}.xyz`), null)
    assert.equal(decodeJwtPayload(`abc.${b64('42')}.xyz`), null)
    assert.equal(decodeJwtPayload(`abc.${b64('null')}.xyz`), null)
  })

  test('handles base64url-specific characters (- and _) without padding', () => {
    // Real Supabase JWT payloads can contain - and _ from b64url encoding.
    // Confirm we accept them.
    const jwt = makeJwt({ role: 'service_role', special: 'a-b_c' })
    const result = decodeJwtPayload(jwt)
    assert.equal((result as { role: string }).role, 'service_role')
    assert.equal((result as { special: string }).special, 'a-b_c')
  })
})

// ─── isServiceRoleCaller ────────────────────────────────────────────────

describe('isServiceRoleCaller', () => {
  test('passes for legacy service-role JWT bearer', () => {
    const jwt = makeJwt({ role: 'service_role', iss: 'supabase' })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), true)
  })

  test('passes for the post-gateway sb_secret_*-rewritten JWT (same role claim)', () => {
    // What the gateway forwards when caller sends sb_secret_*: a fresh
    // JWT with role: service_role. Function-side this is indistinguishable
    // from the legacy JWT case — same payload shape.
    const jwt = makeJwt({
      role: 'service_role',
      iss: 'supabase',
      iat: Math.floor(Date.now() / 1000),
    })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), true)
  })

  test('rejects anon-role bearer (sb_publishable_* or anon JWT)', () => {
    const jwt = makeJwt({ role: 'anon' })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), false)
  })

  test('rejects authenticated-role bearer (real customer-side JWT, somehow leaked here)', () => {
    const jwt = makeJwt({ role: 'authenticated', sub: 'customer-uuid' })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), false)
  })

  test('rejects missing Authorization header', () => {
    assert.equal(isServiceRoleCaller(reqWith(null)), false)
  })

  test('rejects empty bearer token', () => {
    assert.equal(isServiceRoleCaller(reqWith('Bearer ')), false)
  })

  test('rejects malformed Authorization header (no Bearer prefix)', () => {
    const jwt = makeJwt({ role: 'service_role' })
    assert.equal(isServiceRoleCaller(reqWith(`Token ${jwt}`)), false)
    assert.equal(isServiceRoleCaller(reqWith(jwt)), false)
  })

  test('rejects malformed JWT (not 3 segments)', () => {
    assert.equal(isServiceRoleCaller(reqWith('Bearer not.a.real.jwt.too.many')), false)
    assert.equal(isServiceRoleCaller(reqWith('Bearer onlyone')), false)
  })

  test('rejects JWT with no role claim', () => {
    const jwt = makeJwt({ sub: 'no-role-here', iat: 12345 })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), false)
  })

  test('rejects JWT with empty-string role', () => {
    const jwt = makeJwt({ role: '' })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), false)
  })

  test('case-sensitive on role value (Service_Role !== service_role)', () => {
    // Defensive: don't accept role-name typos.
    const jwt = makeJwt({ role: 'Service_Role' })
    assert.equal(isServiceRoleCaller(reqWith(`Bearer ${jwt}`)), false)
  })
})
