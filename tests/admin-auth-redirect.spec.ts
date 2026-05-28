/**
 * Unit tests for the shared admin cookie-auth helper.
 *
 * Source: api/_shared/admin-cookie-auth.ts
 *
 * Cookie-based auth replaces the older bearer-only model for the /admin/*
 * browser pages. The same helper is used by every cookie-gated endpoint
 * under /api/admin/* — login + logout + manual-provision + customer-list
 * + customer-detail + customer-resend-onboarding + the 3 stubs. The 3
 * observability endpoints accept it as a fallback to the bearer.
 *
 * Scenarios:
 *   1. No cookie header at all                       → reject
 *   2. Cookie header but wrong cookie name           → reject
 *   3. Correct cookie name but wrong value           → reject
 *   4. Correct cookie name + value (the env secret)  → accept
 *   5. Empty OBSERVABILITY_ADMIN_SECRET in env       → reject (fail-closed)
 *   6. Multiple cookies, target wedged in the middle → accept (parse correctness)
 *   7. requireAdminCookie writes 401 on reject       → caller short-circuits
 *   8. requireAdminCookie writes 500 if env unset    → misconfigured surfaced
 *   9. Length-mismatched cookies                     → reject (no timingSafe throw)
 *  10. readCookie parses leading/trailing whitespace → tolerant
 */

import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// Mutate process.env BEFORE importing the module under test, since it
// captures ADMIN_SECRET at module load time.
const ORIG_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET
process.env.OBSERVABILITY_ADMIN_SECRET = 'test-admin-secret-12345'

const mod = await import('../api/_shared/admin-cookie-auth.ts')
const { readCookie, isValidAdminCookie, requireAdminCookie, SESSION_COOKIE } = mod

// We can't easily change ADMIN_SECRET after module load (it's a const
// captured at import). For the "secret unset" scenario we re-import a
// second module instance in a child scope via a fresh URL-import trick.
async function importWithSecret(secret: string | undefined): Promise<typeof mod> {
  const previous = process.env.OBSERVABILITY_ADMIN_SECRET
  if (secret === undefined) {
    delete process.env.OBSERVABILITY_ADMIN_SECRET
  } else {
    process.env.OBSERVABILITY_ADMIN_SECRET = secret
  }
  // Cache-busting query so we get a fresh module evaluation. Works under
  // tsx --test because node's module loader treats different URLs as
  // different modules.
  const url = new URL('../api/_shared/admin-cookie-auth.ts', import.meta.url)
  url.searchParams.set('reload', `${secret ?? 'unset'}-${Math.random()}`)
  const fresh = (await import(url.href)) as typeof mod
  // Restore env for sibling tests.
  if (previous === undefined) delete process.env.OBSERVABILITY_ADMIN_SECRET
  else process.env.OBSERVABILITY_ADMIN_SECRET = previous
  return fresh
}

function mockReq(cookieHeader?: string) {
  return {
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
  }
}

function mockRes() {
  const calls: { status?: number; body?: unknown } = {}
  const res = {
    status(code: number) {
      calls.status = code
      return res
    },
    json(body: unknown) {
      calls.body = body
      return res
    },
  }
  return { res, calls }
}

// ─── readCookie ────────────────────────────────────────────────────────

describe('readCookie', () => {
  test('returns null for undefined or empty header', () => {
    assert.equal(readCookie(undefined, SESSION_COOKIE), null)
    assert.equal(readCookie('', SESSION_COOKIE), null)
  })

  test('finds a single cookie', () => {
    assert.equal(readCookie('weuseai_admin_session=abc', 'weuseai_admin_session'), 'abc')
  })

  test('finds a cookie wedged between others', () => {
    const header = 'foo=bar; weuseai_admin_session=secret-value; baz=qux'
    assert.equal(readCookie(header, 'weuseai_admin_session'), 'secret-value')
  })

  test('tolerates leading/trailing whitespace around segments', () => {
    const header = '  foo=bar ;   weuseai_admin_session=spaced   ; baz=qux'
    assert.equal(readCookie(header, 'weuseai_admin_session'), 'spaced')
  })

  test('returns null when cookie name not present', () => {
    assert.equal(readCookie('foo=bar; baz=qux', 'weuseai_admin_session'), null)
  })

  test('exact-name match (does not match prefix)', () => {
    // `weuseai_admin_session_v2=...` should NOT match `weuseai_admin_session`.
    assert.equal(readCookie('weuseai_admin_session_v2=xyz', 'weuseai_admin_session'), null)
  })
})

// ─── isValidAdminCookie ────────────────────────────────────────────────

describe('isValidAdminCookie (env secret = test-admin-secret-12345)', () => {
  test('rejects request with no cookie header at all', () => {
    assert.equal(isValidAdminCookie(mockReq()), false)
  })

  test('rejects when cookie header is present but missing the session cookie', () => {
    assert.equal(isValidAdminCookie(mockReq('foo=bar; baz=qux')), false)
  })

  test('rejects when the session cookie value is wrong', () => {
    assert.equal(
      isValidAdminCookie(mockReq('weuseai_admin_session=wrong-value')),
      false,
    )
  })

  test('accepts when the session cookie value matches OBSERVABILITY_ADMIN_SECRET exactly', () => {
    assert.equal(
      isValidAdminCookie(mockReq('weuseai_admin_session=test-admin-secret-12345')),
      true,
    )
  })

  test('rejects length-mismatched cookie (no timingSafeEqual throw)', () => {
    assert.equal(
      isValidAdminCookie(mockReq('weuseai_admin_session=test-admin-secret-12345-LONGER')),
      false,
    )
    assert.equal(
      isValidAdminCookie(mockReq('weuseai_admin_session=test-admin-secret')),
      false,
    )
  })

  test('accepts session cookie when wedged between unrelated cookies', () => {
    const header = '_ga=GA1.2.123; weuseai_admin_session=test-admin-secret-12345; theme=dark'
    assert.equal(isValidAdminCookie(mockReq(header)), true)
  })
})

describe('isValidAdminCookie when OBSERVABILITY_ADMIN_SECRET is unset', () => {
  test('rejects even when a cookie is provided (fail-closed on misconfig)', async () => {
    const fresh = await importWithSecret(undefined)
    assert.equal(
      fresh.isValidAdminCookie({
        headers: { cookie: 'weuseai_admin_session=anything' },
      }),
      false,
    )
  })
})

// ─── requireAdminCookie ────────────────────────────────────────────────

describe('requireAdminCookie', () => {
  test('returns true and does not touch res for a valid cookie', () => {
    const { res, calls } = mockRes()
    const ok = requireAdminCookie(
      mockReq('weuseai_admin_session=test-admin-secret-12345'),
      res,
    )
    assert.equal(ok, true)
    assert.equal(calls.status, undefined)
    assert.equal(calls.body, undefined)
  })

  test('writes 401 and returns false for missing cookie', () => {
    const { res, calls } = mockRes()
    const ok = requireAdminCookie(mockReq(), res)
    assert.equal(ok, false)
    assert.equal(calls.status, 401)
    assert.deepEqual(calls.body, { error: 'unauthorized' })
  })

  test('writes 401 and returns false for wrong-value cookie', () => {
    const { res, calls } = mockRes()
    const ok = requireAdminCookie(mockReq('weuseai_admin_session=wrong'), res)
    assert.equal(ok, false)
    assert.equal(calls.status, 401)
    assert.deepEqual(calls.body, { error: 'unauthorized' })
  })

  test('writes 500 misconfigured when OBSERVABILITY_ADMIN_SECRET unset', async () => {
    const fresh = await importWithSecret(undefined)
    const { res, calls } = mockRes()
    const ok = fresh.requireAdminCookie(
      { headers: { cookie: 'weuseai_admin_session=anything' } },
      res,
    )
    assert.equal(ok, false)
    assert.equal(calls.status, 500)
    assert.deepEqual(calls.body, {
      error: 'misconfigured',
      detail: 'OBSERVABILITY_ADMIN_SECRET unset',
    })
  })
})

// ─── buildSessionCookie / buildClearSessionCookie ──────────────────────

describe('buildSessionCookie / buildClearSessionCookie', () => {
  test('buildSessionCookie sets HttpOnly + Secure + SameSite=Strict + Path=/', () => {
    const s = mod.buildSessionCookie('secret-value')
    assert.match(s, /^weuseai_admin_session=secret-value/)
    assert.match(s, /HttpOnly/)
    assert.match(s, /Secure/)
    assert.match(s, /SameSite=Strict/)
    assert.match(s, /Path=\//)
    assert.match(s, /Max-Age=\d+/)
  })

  test('buildClearSessionCookie sets Max-Age=0 + empty value', () => {
    const s = mod.buildClearSessionCookie()
    assert.match(s, /^weuseai_admin_session=;/)
    assert.match(s, /Max-Age=0/)
    assert.match(s, /HttpOnly/)
  })
})

// Restore env at the very end so concurrent test files don't see our
// mutated value (node:test runs files sequentially but be defensive).
if (ORIG_SECRET === undefined) delete process.env.OBSERVABILITY_ADMIN_SECRET
else process.env.OBSERVABILITY_ADMIN_SECRET = ORIG_SECRET
