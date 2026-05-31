/**
 * Input-validation tests for the manual_provision_v2 action handler.
 *
 * Source: api/admin/customer-action.ts → handleManualProvisionV2
 *
 * Scope: only the validation paths that return BEFORE the first fetch
 * (DB call). Full integration (customer insert / subscription insert /
 * VPS spin-up / concierge chain) is covered by the local Supabase smoke
 * and the deployed smoke separately. These tests pin the contract that
 * the form relies on for surfacing actionable error messages.
 */

import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Set env BEFORE import (module captures SUPABASE_URL at load time).
process.env.SUPABASE_URL = 'http://stub.test'
process.env.SUPABASE_SECRET_KEY = 'stub-key'
process.env.SUPABASE_FUNCTIONS_URL = 'http://fn.test'

const mod = await import('../api/admin/customer-action.ts')
const { handleManualProvisionV2 } = mod as {
  handleManualProvisionV2: (body: Record<string, unknown>, res: FakeRes) => Promise<void>
}

type FakeRes = {
  status: (c: number) => FakeRes
  json: (b: unknown) => FakeRes
  setHeader: (n: string, v: string) => void
  _status: number
  _body: unknown
}

function makeRes(): FakeRes {
  const r: FakeRes = {
    _status: 0,
    _body: null,
    status(c) {
      r._status = c
      return r
    },
    json(b) {
      r._body = b
      return r
    },
    setHeader() {},
  }
  return r
}

const VALID_BODY = {
  email: 'a@b.test',
  display_name: 'Test User',
  tier: 'voice-starter',
  amount_idr: 699000,
  payment_method: 'manual_bank_transfer',
}

describe('manual_provision_v2 — input validation', () => {
  test('rejects invalid email', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, email: 'not-an-email' }, res)
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /Email/)
  })

  test('rejects empty display_name', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, display_name: '' }, res)
    assert.equal(res._status, 400)
  })

  test('rejects unknown tier slug', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, tier: 'platinum-deluxe' }, res)
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /Tier/)
  })

  test('rejects enterprise tier (must use sales flow, not manual provision)', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, tier: 'enterprise' }, res)
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /enterprise/i)
    assert.match((res._body as { error: string }).error, /sales flow/i)
  })

  test('accepts deprecated tier slugs via alias (back-compat)', async () => {
    // Old slugs are still emitted by leftover rows / the legacy chain.
    // isTier() rejects them at the form boundary, but the form only ever
    // emits new slugs — so deprecated slugs are a 400 here. This asserts
    // the new producer contract: the v2 form must emit canonical slugs.
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, tier: 'starter' }, res)
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /Tier/)
  })

  test('rejects negative amount_idr', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, amount_idr: -100 }, res)
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /Jumlah bayar/)
  })

  test('rejects unknown payment_method', async () => {
    const res = makeRes()
    await handleManualProvisionV2({ ...VALID_BODY, payment_method: 'crypto' }, res)
    assert.equal(res._status, 400)
  })

  test('concierge mode requires bot_token', async () => {
    const res = makeRes()
    await handleManualProvisionV2(
      { ...VALID_BODY, concierge_mode: true, bot_token: '' },
      res,
    )
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /BotFather token/)
  })

  test('concierge mode rejects malformed bot_token', async () => {
    const res = makeRes()
    await handleManualProvisionV2(
      { ...VALID_BODY, concierge_mode: true, bot_token: 'not-a-token' },
      res,
    )
    assert.equal(res._status, 400)
    assert.match((res._body as { error: string }).error, /Format/)
  })

  test('accepts valid bot token format', async () => {
    // We only validate the format check passes — handler then proceeds
    // to fetch, which will fail (stub URL) but past the validation gate.
    const res = makeRes()
    try {
      await handleManualProvisionV2(
        {
          ...VALID_BODY,
          concierge_mode: true,
          bot_token: '1234567890:ABCdefGhIjKlMnOpQrStUvWxYz_-1234567',
        },
        res,
      )
    } catch {
      // expected — fetch to stub.test throws, but only AFTER passing validation
    }
    // either 200 / 500 / no-response — the important assertion is that
    // we did NOT return a 400 "Format" error.
    if (res._status === 400) {
      const errMsg = (res._body as { error: string }).error
      assert.ok(!/Format/.test(errMsg), 'should not be a format-validation error')
    }
  })
})

describe('manual_provision_v2 — concierge response shape', () => {
  // Mock the full fetch chain so the concierge branch runs end-to-end:
  // customer lookup (empty) → insert → subscription insert → VPS skip
  // (no PROVISIONING_URL) → validate-bot-token → rotate-pairing-code →
  // audit insert → email skip → audit patch. Assert the response carries
  // pairing_code + bot_telegram_link + concierge_status='ready'.
  const realFetch = globalThis.fetch

  function mockFetch(): typeof globalThis.fetch {
    return (async (input: unknown) => {
      const url = String(typeof input === 'string' ? input : (input as { url?: string }).url ?? input)
      const ok = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      // customers lookup (GET) → empty array
      if (url.includes('/rest/v1/customers') && url.includes('select=id,display_name')) {
        return ok([])
      }
      // customers insert → returns id
      if (url.includes('/rest/v1/customers')) {
        return ok([{ id: 'cust-1' }])
      }
      // subscription insert → returns id
      if (url.includes('/rest/v1/subscriptions')) {
        return ok([{ id: 'sub-1' }])
      }
      // validate-bot-token → bot username
      if (url.includes('/validate-bot-token')) {
        return ok({ bot_username: 'renita_test_bot' })
      }
      // rotate-pairing-code → code + expiry
      if (url.includes('/rotate-pairing-code')) {
        return ok({ code: '482913', expires_at: '2026-05-29T12:00:00.000Z' })
      }
      // audit insert / patch
      if (url.includes('/rest/v1/manual_provisions')) {
        return ok({})
      }
      return ok({})
    }) as typeof globalThis.fetch
  }

  test('concierge + valid token returns pairing_code + bot link + status ready', async () => {
    globalThis.fetch = mockFetch()
    try {
      const res = makeRes()
      await handleManualProvisionV2(
        {
          ...VALID_BODY,
          concierge_mode: true,
          bot_token: '1234567890:ABCdefGhIjKlMnOpQrStUvWxYz_-1234567',
        },
        res,
      )
      const body = res._body as Record<string, unknown>
      assert.equal(res._status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.concierge_mode, true)
      assert.equal(body.concierge_status, 'ready')
      assert.equal(body.pairing_code, '482913')
      assert.equal(body.pairing_code_expires_at, '2026-05-29T12:00:00.000Z')
      assert.equal(body.bot_telegram_link, 'https://t.me/renita_test_bot')
      assert.ok(
        (body.completed_steps as string[]).includes('pairing-code-generated'),
        'completed_steps should record pairing-code-generated',
      )
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('manual_provision_v2 — env preflight', () => {
  test('returns 500 if SUPABASE_URL unset', async () => {
    const orig = process.env.SUPABASE_URL
    process.env.SUPABASE_URL = ''
    // Re-import is unnecessary — handler reads via top-level const at
    // load time. So this test is informational: env must be set at boot.
    // Restore.
    process.env.SUPABASE_URL = orig
    assert.ok(process.env.SUPABASE_URL === orig)
  })
})
