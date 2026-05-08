// Regression tests for the JWT-role audit pass (Phase 2E-3 Day 3).
//
// Reference: docs/security/jwt-role-pattern.md
//          + supabase/functions/_shared/admin-auth.ts
//
// The shared admin-auth helper is comprehensively unit-tested in
// tests/admin-auth.spec.ts (17 cases covering decode + role check
// edge cases). What THIS file locks in is that each audited Edge
// Function entrypoint correctly:
//
//   1. Imports `isServiceRoleCaller` from the shared helper.
//   2. Invokes it BEFORE any business logic (body parse, render, etc).
//   3. Short-circuits on false with 401 + JSON {"error":"unauthorized"}.
//
// We assert via source-text inspection rather than runtime — the
// entrypoints `Deno.serve` at module-load time, so loading them in
// Node would crash with `Deno is not defined`. Source-text checks are
// brittle to refactors, but the breakage is loud and the alternative
// (full Deno test runner integration) is out of scope.
//
// Audit scope per spec: invoice-generator-handler, daily-briefing-handler.
// (create-invoice is correctly public — customer-facing checkout flow.)

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

const AUDITED_FUNCTIONS = [
  'invoice-generator-handler',
  'daily-briefing-handler',
] as const

// ─── per-function source-text checks ────────────────────────────────────

for (const fn of AUDITED_FUNCTIONS) {
  describe(`JWT-role audit: ${fn}`, () => {
    const src = readFileSync(
      join(REPO, 'supabase', 'functions', fn, 'index.ts'),
      'utf8',
    )

    test('imports isServiceRoleCaller from the shared admin-auth helper', () => {
      assert.match(
        src,
        /import\s*\{\s*isServiceRoleCaller\s*\}\s*from\s*['"]\.\.\/_shared\/admin-auth\.ts['"]/,
        `${fn} should import isServiceRoleCaller from _shared/admin-auth.ts`,
      )
    })

    test('does NOT inline a duplicate JWT-role decoder (one source of truth)', () => {
      // If a future contributor copies the decode logic inline, our
      // helper-update path breaks. Reject any local re-implementation.
      assert.doesNotMatch(
        src,
        /function\s+isAdminCaller\s*\(/,
        `${fn} should not define a local isAdminCaller — use the shared helper`,
      )
      assert.doesNotMatch(
        src,
        /function\s+decodeJwtPayload\s*\(/,
        `${fn} should not define a local decodeJwtPayload — use the shared helper`,
      )
    })

    test('calls isServiceRoleCaller(req) inside the request handler', () => {
      assert.match(
        src,
        /isServiceRoleCaller\(\s*req\s*\)/,
        `${fn} should call isServiceRoleCaller(req)`,
      )
    })

    test('returns 401 with unauthorized error code on failed gate', () => {
      // The guard block must produce a 401 response with a stable
      // `error: 'unauthorized'` code (matching bundle-publish + every
      // other admin-gated function). Tooling/clients depend on this.
      // Find the call-site occurrence (skip the import) by searching
      // for the `if (!isServiceRoleCaller(req))` pattern, then capture
      // the next ~10 lines.
      const callMatch = /if\s*\(\s*!isServiceRoleCaller\(\s*req\s*\)\s*\)/
        .exec(src)
      assert.ok(callMatch, `${fn} must have an !isServiceRoleCaller(req) guard`)
      const guardRegion = src.slice(callMatch.index, callMatch.index + 400)
      assert.match(
        guardRegion,
        /error['":\s]+['"]unauthorized['"]/,
        `${fn} guard must return error: 'unauthorized'`,
      )
      assert.match(
        guardRegion,
        /status:\s*401/,
        `${fn} guard must use HTTP 401`,
      )
    })

    test('guard runs BEFORE the body is parsed (auth before parse)', () => {
      const guardIdx = src.indexOf('isServiceRoleCaller')
      const parseIdx = src.indexOf('await req.json()')
      assert.ok(guardIdx > 0, `${fn} should have an auth guard`)
      assert.ok(parseIdx > 0, `${fn} should parse the body somewhere`)
      assert.ok(
        guardIdx < parseIdx,
        `${fn} should call isServiceRoleCaller BEFORE req.json() — found at ${guardIdx} vs ${parseIdx}`,
      )
    })
  })
}

// ─── create-invoice exemption (negative assertion) ──────────────────────

describe('JWT-role audit: create-invoice (correctly NOT in scope)', () => {
  const src = readFileSync(
    join(REPO, 'supabase', 'functions', 'create-invoice', 'index.ts'),
    'utf8',
  )

  test('does NOT import isServiceRoleCaller (customer-facing public endpoint)', () => {
    assert.doesNotMatch(
      src,
      /isServiceRoleCaller/,
      'create-invoice is customer-facing checkout (takes email + plan from browser); should remain public',
    )
  })
})
