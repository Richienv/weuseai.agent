// Browser-callable Edge Functions MUST be listed in supabase/config.toml
// with `verify_jwt = false`. Without it, Supabase platform rejects all
// requests as 401 UNAUTHORIZED_NO_AUTH_HEADER before the handler runs —
// because the default per `supabase functions deploy` is verify_jwt = true.
//
// Recurring failure mode (3rd time in 6 months):
//   - 2026-05-02: xendit-webhook deployed without entry → callbacks broke
//     (recovered by adding [functions.xendit-webhook] verify_jwt=false)
//   - 2026-05-10: reset-bot-pairing (PR #56) deployed without entry →
//     "Bukan bot kamu" recovery silently 401s
//   - 2026-05-10: save-onboarding-profile (PR #57) deployed without entry →
//     onboarding step 1 "Lanjut" silently 401s, founder caught in e2e
//
// This test makes the regression class permanent — if a future PR adds a
// new browser-callable function and forgets the config entry, it fails CI.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const CONFIG = path.join(ROOT, 'supabase/config.toml')

// Browser-callable functions: anything called from onboarding.html,
// welcome.html, checkout.html, dashboard.html, or admin pages without
// a Supabase user JWT. These MUST have verify_jwt = false.
const BROWSER_CALLABLE = [
  'create-invoice',           // checkout.html
  'rotate-pairing-code',      // onboarding.html step 3
  'validate-bot-token',       // onboarding.html step 2
  'complete-onboarding',      // onboarding.html step 4
  'reset-bot-pairing',        // onboarding.html step 3 recovery (PR #56)
  'save-onboarding-profile',  // onboarding.html step 1 (PR #57)
  'customer-readiness',       // welcome.html readiness probe wrapper (post-pair Track 1)
] as const

// External-webhook callable (Telegram / Xendit servers, no Supabase JWT).
const WEBHOOK_CALLABLE = [
  'xendit-webhook',
  'telegram-bot-webhook',
  'pair-customer-bot-webhook',
] as const

// Admin-only functions: caller MUST send Supabase service-role JWT.
// Gateway verifies bearer (verify_jwt=true), then isServiceRoleCaller
// in the handler trusts the role claim. Per docs/security/jwt-role-pattern.md.
const ADMIN_CALLABLE_VERIFY_JWT = [
  'admin-customer-vps-refresh',  // Track 3c (2026-05-10) — manual VPS rescue
] as const

function parseVerifyJwtSection(toml: string, fnName: string): boolean | null {
  // TOML section: `[functions.<name>]` followed by config lines until next `[`.
  const re = new RegExp(
    `\\[functions\\.${fnName.replace(/-/g, '\\-')}\\][^\\[]*?verify_jwt\\s*=\\s*(true|false)`,
    's',
  )
  const m = toml.match(re)
  if (!m) return null
  return m[1] === 'true'
}

test('supabase/config.toml exists', () => {
  assert.ok(fs.existsSync(CONFIG), 'supabase/config.toml must exist')
})

for (const fn of ADMIN_CALLABLE_VERIFY_JWT) {
  test(`${fn} is registered in config.toml with verify_jwt = true (admin-only)`, () => {
    const toml = fs.readFileSync(CONFIG, 'utf8')
    const verifyJwt = parseVerifyJwtSection(toml, fn)
    assert.notEqual(
      verifyJwt,
      null,
      `[functions.${fn}] section missing from config.toml — admin functions need explicit verify_jwt=true`,
    )
    assert.equal(
      verifyJwt,
      true,
      `[functions.${fn}] must have verify_jwt = true so the gateway verifies the service-role bearer (got verify_jwt = ${verifyJwt})`,
    )
  })
}

for (const fn of [...BROWSER_CALLABLE, ...WEBHOOK_CALLABLE]) {
  test(`${fn} is registered in config.toml with verify_jwt = false`, () => {
    const toml = fs.readFileSync(CONFIG, 'utf8')
    const verifyJwt = parseVerifyJwtSection(toml, fn)
    assert.notEqual(
      verifyJwt,
      null,
      `[functions.${fn}] section missing from config.toml — without it, deploy defaults to verify_jwt = true and the function returns 401 UNAUTHORIZED_NO_AUTH_HEADER for browser/webhook callers`,
    )
    assert.equal(
      verifyJwt,
      false,
      `[functions.${fn}] must have verify_jwt = false (got verify_jwt = ${verifyJwt})`,
    )
  })
}

// ─── Live probe (opt-in) — confirms the deployed config matches ────

const SUPABASE_URL = process.env.SUPABASE_URL
const skip = !SUPABASE_URL || process.env.SKIP_EDGE_FN_LIVE === '1'

for (const fn of BROWSER_CALLABLE) {
  test(
    `LIVE: ${fn} does NOT 401 on no-auth request (verify_jwt is OFF on prod)`,
    { skip },
    async () => {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      // Anything but 401 platform-level is fine — the function should
      // either accept (200 / handler-level 4xx for bad input) or fail
      // for a non-auth reason (404 / 500). 401 specifically means
      // the platform Auth check rejected the call before the handler ran.
      assert.notEqual(
        r.status,
        401,
        `${fn} returned 401 — likely missing verify_jwt = false in config.toml. Run \`supabase functions deploy ${fn}\` after adding the config entry.`,
      )
    },
  )
}
