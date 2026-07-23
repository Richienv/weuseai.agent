/**
 * Access-code redemption — unit contract for
 * `supabase/functions/_shared/redeem-access-code-handler.ts`.
 *
 * WHY THIS FILE IS STRICT
 * -----------------------
 * A valid code is a free activation. It has to behave EXACTLY like a paid
 * Xendit invoice (active subscription, VPS spun up, same /welcome landing)
 * and nothing more. Three properties are load-bearing and each has a test
 * that fails loudly if the handler drifts:
 *
 *   1. NO ORACLE — unknown, malformed, expired, revoked and exhausted all
 *      answer with the byte-identical 400 `invalid_code`. Anything that
 *      distinguishes them turns the 6.56e11 keyspace into a search.
 *   2. NO ESCALATION — tier + always_on come from the CODE ROW only. A
 *      request carrying `tier` / `plan` / `alwaysOn` is ignored.
 *   3. NO BURNED CODES — the claim runs FIRST (so a caller without a valid
 *      code can never reach the 409 branch and use it to enumerate which
 *      emails are customers), and any path that then fails — a duplicate
 *      email, or an error before the subscription lands — RELEASES the claim.
 *      A client never loses a single-use code to our own bookkeeping.
 *
 * Deps are faked in-memory (same style as create-invoice-price-flip.spec.ts):
 * no network, no Supabase, no clock.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleRedeemAccessCode,
  normalizeCode,
  CODE_RE,
  MAX_FAILED_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
} from '../supabase/functions/_shared/redeem-access-code-handler.ts'
import type {
  AccessCodeRow,
  RedeemDeps,
} from '../supabase/functions/_shared/redeem-access-code-handler.ts'

const FIXED_NOW = new Date('2026-07-23T10:00:00Z')
const PUBLIC_BASE = 'https://weuseai.id'
const VALID_CODE = 'ABCD2345'

type SubscriptionInsert = Parameters<RedeemDeps['db']['insertSubscription']>[0]

interface Recorder {
  deps: RedeemDeps
  calls: string[]
  releases: string[]
  attempts: Array<{ ipHash: string; ok: boolean }>
  customers: Array<{ id: string; email: string }>
  subscriptions: Array<SubscriptionInsert & { id: string }>
  patches: Array<{ id: string; patch: Record<string, unknown> }>
  consents: Array<Record<string, unknown>>
  redemptions: Array<Record<string, unknown>>
  spinUps: Array<{ customer_id: string; tier: string; always_on: boolean }>
  alerts: string[]
}

const CODE_ROW: AccessCodeRow = {
  id: 'ac_1',
  code: VALID_CODE,
  tier: 'library-full',
  always_on: true,
  label: 'PT Sinar Jaya',
}

/**
 * In-memory RedeemDeps. Every override is optional; `calls` records the
 * order of the dep calls so the order-of-operations assertions (consent
 * before subscription, no claim after a 429/409) read directly.
 */
function makeDeps(over: Partial<{
  codeRow: AccessCodeRow | null
  failedAttempts: number
  existingCustomer: { id: string; email: string } | null
  active: boolean
  spinUpError: Error
  failInsertSubscription: boolean
  throwOn: string[]
}> = {}): Recorder {
  const calls: string[] = []
  const releases: string[] = []
  const attempts: Recorder['attempts'] = []
  const customers: Recorder['customers'] = []
  const subscriptions: Recorder['subscriptions'] = []
  const patches: Recorder['patches'] = []
  const consents: Recorder['consents'] = []
  const redemptions: Recorder['redemptions'] = []
  const spinUps: Recorder['spinUps'] = []
  const alerts: string[] = []
  const throwOn = new Set(over.throwOn ?? [])
  let seq = 0

  const track = (name: string) => {
    calls.push(name)
    if (throwOn.has(name)) throw new Error(`${name} exploded`)
  }

  const deps: RedeemDeps = {
    db: {
      async countRecentFailedAttempts(_ipHash, _sinceIso) {
        track('countRecentFailedAttempts')
        return over.failedAttempts ?? 0
      },
      async recordAttempt(ipHash, ok) {
        track('recordAttempt')
        attempts.push({ ipHash, ok })
      },
      async findCustomerByEmail(_email) {
        track('findCustomerByEmail')
        return over.existingCustomer ?? null
      },
      async hasActiveSubscription(_customerId) {
        track('hasActiveSubscription')
        return over.active ?? false
      },
      async claimAccessCode(_code, _nowIso) {
        track('claimAccessCode')
        return over.codeRow === undefined ? CODE_ROW : over.codeRow
      },
      async releaseAccessCode(accessCodeId: string) {
        track('releaseAccessCode')
        releases.push(accessCodeId)
      },
      async insertCustomer({ email }) {
        track('insertCustomer')
        const row = { id: `cust_${++seq}`, email }
        customers.push(row)
        return row
      },
      async insertSubscription(input) {
        track('insertSubscription')
        if (over.failInsertSubscription) throw new Error('simulated subscription insert failure')
        const row = { ...input, id: `sub_${++seq}` }
        subscriptions.push(row)
        return { id: row.id }
      },
      async updateSubscription(id, patch) {
        track('updateSubscription')
        patches.push({ id, patch })
      },
      async insertConsentEvent(input) {
        track('insertConsentEvent')
        consents.push(input)
        return { id: `consent_${++seq}` }
      },
      async insertRedemption(input) {
        track('insertRedemption')
        redemptions.push(input)
      },
      async clearStalePairState(_customerId) {
        track('clearStalePairState')
      },
    },
    provisioning: {
      async spinUp(input) {
        track('spinUp')
        if (over.spinUpError) throw over.spinUpError
        spinUps.push(input)
      },
    },
    publicBaseUrl: PUBLIC_BASE,
    ipHash: 'sha256-of-ip',
    now: () => FIXED_NOW,
    async alert(msg) {
      alerts.push(msg)
    },
  }

  return {
    deps,
    calls,
    releases,
    attempts,
    customers,
    subscriptions,
    patches,
    consents,
    redemptions,
    spinUps,
    alerts,
  }
}

function buildReq(body: Record<string, unknown>, method = 'POST'): Request {
  return new Request('https://edge.test/redeem-access-code', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

/** Valid body: consent 30s before FIXED_NOW, so never stale. */
function body(over: Record<string, unknown> = {}) {
  return {
    code: VALID_CODE,
    email: 'kamu@email.com',
    tos_accepted_at: '2026-07-23T09:59:30Z',
    policy_version: 'v1.0',
    ...over,
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

// ─── 0. the shared format contract ─────────────────────────────────────

test('normalizeCode upper-cases and strips dashes/spaces; CODE_RE rejects I/L/O/U/0/1', () => {
  assert.equal(normalizeCode('abcd-2345'), VALID_CODE)
  assert.equal(normalizeCode(' ab cd 23 45 '), VALID_CODE)
  assert.equal(normalizeCode(null), '')
  assert.ok(CODE_RE.test(VALID_CODE))
  for (const bad of ['ABCD234I', 'ABCD234L', 'ABCD234O', 'ABCD234U', 'ABCD2340', 'ABCD2341']) {
    assert.equal(CODE_RE.test(bad), false, `${bad} must not pass CODE_RE`)
  }
  assert.equal(CODE_RE.test('ABCD234'), false) // too short
  assert.equal(CODE_RE.test('ABCD23456'), false) // too long
})

// ─── 1. happy path ─────────────────────────────────────────────────────

test('happy path activates the subscription and redirects to /welcome', async () => {
  const r = makeDeps()
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 200)

  const out = await readJson(res)
  assert.equal(out.ok, true)
  const customerId = r.customers[0].id
  assert.equal(out.redirect_url, `${PUBLIC_BASE}/welcome?cid=${customerId}`)

  assert.equal(r.subscriptions.length, 1)
  const sub = r.subscriptions[0]
  assert.equal(sub.customer_id, customerId)
  assert.equal(sub.status, 'active')
  assert.equal(sub.hosting_active, true)
  assert.equal(sub.source, 'access_code')

  // next_billing_at ≈ now + 30d (ISO string)
  const billing = Date.parse(sub.next_billing_at)
  assert.ok(!Number.isNaN(billing), 'next_billing_at must be an ISO timestamp')
  const expected = FIXED_NOW.getTime() + 30 * 24 * 60 * 60 * 1000
  assert.ok(Math.abs(billing - expected) < 60_000, `next_billing_at ${sub.next_billing_at} != ~+30d`)

  // provisioning ran, redemption was audited, attempt logged as ok
  assert.deepEqual(r.spinUps, [
    { customer_id: customerId, tier: 'library-full', always_on: true },
  ])
  assert.equal(r.redemptions.length, 1)
  assert.equal(r.redemptions[0].access_code_id, CODE_ROW.id)
  assert.equal(r.redemptions[0].email, 'kamu@email.com')
  assert.deepEqual(r.attempts, [{ ipHash: 'sha256-of-ip', ok: true }])
})

test('the throttle window is queried before anything else', async () => {
  const r = makeDeps()
  await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(r.calls[0], 'countRecentFailedAttempts')
  assert.equal(MAX_FAILED_ATTEMPTS, 10)
  assert.equal(ATTEMPT_WINDOW_MS, 15 * 60 * 1000)
})

test('non-POST is rejected with 405', async () => {
  const r = makeDeps()
  const res = await handleRedeemAccessCode(buildReq({}, 'GET'), r.deps)
  assert.equal(res.status, 405)
})

test('missing or malformed email is 400 invalid_input', async () => {
  for (const email of [undefined, '', 'bukan-email', 123]) {
    const r = makeDeps()
    const res = await handleRedeemAccessCode(buildReq(body({ email })), r.deps)
    assert.equal(res.status, 400, `email=${String(email)}`)
    assert.deepEqual(await readJson(res), { error: 'invalid_input' })
    assert.equal(r.calls.includes('claimAccessCode'), false)
  }
})

// ─── 2. escalation guard ───────────────────────────────────────────────

test('tier and always_on come from the CODE, never from the request', async () => {
  const r = makeDeps({
    codeRow: { id: 'ac_2', code: VALID_CODE, tier: 'solo', always_on: false, label: null },
  })
  const res = await handleRedeemAccessCode(
    buildReq(
      body({
        tier: 'done-for-you',
        plan: 'done-for-you',
        alwaysOn: true,
        always_on: true,
        source: 'xendit',
      }),
    ),
    r.deps,
  )
  assert.equal(res.status, 200)
  const sub = r.subscriptions[0]
  assert.equal(sub.tier, 'solo')
  assert.equal(sub.always_on_enabled, false)
  assert.equal(sub.source, 'access_code')
  assert.deepEqual(r.spinUps, [
    { customer_id: r.customers[0].id, tier: 'solo', always_on: false },
  ])
})

// ─── 3 + 4. no oracle ──────────────────────────────────────────────────

test('single-use: a second redeem (claim returns null) is 400 invalid_code', async () => {
  const first = makeDeps()
  assert.equal((await handleRedeemAccessCode(buildReq(body()), first.deps)).status, 200)

  // Second attempt — the atomic claim finds no eligible row.
  const second = makeDeps({ codeRow: null })
  const res = await handleRedeemAccessCode(buildReq(body()), second.deps)
  assert.equal(res.status, 400)
  assert.deepEqual(await readJson(res), { error: 'invalid_code' })
  assert.equal(second.subscriptions.length, 0)
  assert.deepEqual(second.attempts, [{ ipHash: 'sha256-of-ip', ok: false }])
})

test('unknown / expired / revoked / exhausted / malformed are byte-identical 400 invalid_code', async () => {
  // Every DB-side rejection (unknown, expired, revoked, exhausted) surfaces
  // as claimAccessCode → null; malformed never reaches the DB. All five must
  // be indistinguishable to the caller.
  const bodies = [
    body({ code: 'ZZZZ2345' }), // unknown
    body({ code: 'ZZZZ2346' }), // expired
    body({ code: 'ZZZZ2347' }), // revoked
    body({ code: 'ZZZZ2348' }), // exhausted
  ]
  const responses: Array<{ status: number; text: string }> = []
  for (const b of bodies) {
    const r = makeDeps({ codeRow: null })
    const res = await handleRedeemAccessCode(buildReq(b), r.deps)
    responses.push({ status: res.status, text: await res.text() })
  }
  for (const malformed of ['ABC', 'ABCD234I', 'ABCD23456', 'abcd-234o']) {
    const r = makeDeps()
    const res = await handleRedeemAccessCode(buildReq(body({ code: malformed })), r.deps)
    responses.push({ status: res.status, text: await res.text() })
    assert.equal(r.calls.includes('claimAccessCode'), false, 'malformed must never hit the DB')
  }

  const first = responses[0]
  assert.equal(first.status, 400)
  assert.equal(JSON.parse(first.text).error, 'invalid_code')
  for (const got of responses) {
    assert.equal(got.status, first.status)
    assert.equal(got.text, first.text, 'error bodies must be byte-identical (no oracle)')
  }
})

test('every invalid_code path records a FAILED attempt', async () => {
  const unknown = makeDeps({ codeRow: null })
  await handleRedeemAccessCode(buildReq(body({ code: 'ZZZZ2345' })), unknown.deps)
  assert.deepEqual(unknown.attempts, [{ ipHash: 'sha256-of-ip', ok: false }])

  const malformed = makeDeps()
  await handleRedeemAccessCode(buildReq(body({ code: 'ABC' })), malformed.deps)
  assert.deepEqual(malformed.attempts, [{ ipHash: 'sha256-of-ip', ok: false }])
})

// ─── 5. throttle ───────────────────────────────────────────────────────

test('at MAX_FAILED_ATTEMPTS the request is 429 and no claim is attempted', async () => {
  const r = makeDeps({ failedAttempts: MAX_FAILED_ATTEMPTS })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 429)
  assert.deepEqual(await readJson(res), { error: 'too_many_attempts' })
  assert.equal(r.calls.includes('claimAccessCode'), false)
  assert.equal(r.calls.includes('findCustomerByEmail'), false)
  assert.equal(r.subscriptions.length, 0)
})

test('the throttle fires even for a well-formed valid code (no bypass)', async () => {
  const r = makeDeps({ failedAttempts: MAX_FAILED_ATTEMPTS + 5 })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 429)
  assert.equal(r.spinUps.length, 0)
})

test('just below the limit the request proceeds normally', async () => {
  const r = makeDeps({ failedAttempts: MAX_FAILED_ATTEMPTS - 1 })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 200)
})

// ─── 6. consent gate ───────────────────────────────────────────────────

test('missing ToS is 400 tos_required, before any side effect', async () => {
  for (const tos of [undefined, '', null, 42]) {
    const r = makeDeps()
    const res = await handleRedeemAccessCode(buildReq(body({ tos_accepted_at: tos })), r.deps)
    assert.equal(res.status, 400, `tos=${String(tos)}`)
    assert.deepEqual(await readJson(res), { error: 'tos_required' })
    assert.equal(r.calls.includes('claimAccessCode'), false)
    assert.equal(r.consents.length, 0)
    assert.equal(r.subscriptions.length, 0)
  }
})

test('ToS older than 24h or future-dated is 400 tos_stale', async () => {
  const stale = [
    '2026-07-22T09:00:00Z', // >24h old
    '2026-07-23T10:05:00Z', // future-dated beyond the 60s skew allowance
  ]
  for (const tos of stale) {
    const r = makeDeps()
    const res = await handleRedeemAccessCode(buildReq(body({ tos_accepted_at: tos })), r.deps)
    assert.equal(res.status, 400, tos)
    assert.deepEqual(await readJson(res), { error: 'tos_stale' })
    assert.equal(r.calls.includes('claimAccessCode'), false)
  }
})

// ─── 7. no burned code on a duplicate ──────────────────────────────────

test('an already-active email is 409 and the claimed code is RELEASED (not burned)', async () => {
  // The claim runs BEFORE the email lookup on purpose: it means a caller
  // without a valid code can never reach this branch, so the endpoint cannot
  // be used to enumerate which emails are customers. The code is handed back
  // so the duplicate submit still costs the client nothing.
  const r = makeDeps({
    existingCustomer: { id: 'cust_existing', email: 'kamu@email.com' },
    active: true,
  })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 409)
  assert.deepEqual(await readJson(res), { error: 'already_active' })
  assert.deepEqual(r.releases, [CODE_ROW.id], 'the duplicate must give the code back')
  assert.equal(r.subscriptions.length, 0)
  assert.equal(r.spinUps.length, 0)
})

test('a failure AFTER the claim releases the code (our error never burns a client code)', async () => {
  const r = makeDeps({ failInsertSubscription: true })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 500)
  assert.deepEqual(await readJson(res), { error: 'server_error' })
  assert.deepEqual(r.releases, [CODE_ROW.id], 'a post-claim failure must compensate the claim')
  assert.equal(r.subscriptions.length, 0)
})

test('no oracle: an unknown email and an active email are indistinguishable without a valid code', async () => {
  // With an unclaimable code, BOTH an active and an unknown email get the
  // identical 400 invalid_code — the 409 is unreachable, so no enumeration.
  const activeR = makeDeps({ codeRow: null, existingCustomer: { id: 'c1', email: 'kamu@email.com' }, active: true })
  const unknownR = makeDeps({ codeRow: null })
  const a = await handleRedeemAccessCode(buildReq(body()), activeR.deps)
  const b = await handleRedeemAccessCode(buildReq(body()), unknownR.deps)
  const aJson = await readJson(a)
  const bJson = await readJson(b)
  assert.equal(a.status, b.status)
  assert.deepEqual(aJson, bJson)
  assert.deepEqual(aJson, { error: 'invalid_code' })
})

test('an existing customer WITHOUT an active subscription redeems onto the same customer row', async () => {
  const r = makeDeps({
    existingCustomer: { id: 'cust_existing', email: 'kamu@email.com' },
    active: false,
  })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 200)
  assert.equal((await readJson(res)).redirect_url, `${PUBLIC_BASE}/welcome?cid=cust_existing`)
  assert.equal(r.calls.includes('insertCustomer'), false, 'must not duplicate the customer')
  assert.equal(r.subscriptions[0].customer_id, 'cust_existing')
})

// ─── 8. provisioning failure degrades, never fails the redemption ──────

test('spinUp failure parks the subscription pending_provision but still returns 200', async () => {
  const r = makeDeps({ spinUpError: new Error('vultr 500') })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 200)
  const out = await readJson(res)
  assert.equal(out.ok, true)
  assert.equal(out.redirect_url, `${PUBLIC_BASE}/welcome?cid=${r.customers[0].id}`)

  assert.equal(r.patches.length, 1)
  assert.equal(r.patches[0].id, r.subscriptions[0].id)
  assert.equal(r.patches[0].patch.status, 'pending_provision')
  assert.equal(r.patches[0].patch.hosting_active, false)
  assert.equal(r.alerts.length, 1, 'the founder alert must fire on a deferred provision')
})

// ─── 9. consent is durable before the subscription exists ──────────────

test('the consent event is written before the subscription insert', async () => {
  const r = makeDeps()
  await handleRedeemAccessCode(buildReq(body()), r.deps)
  const consentAt = r.calls.indexOf('insertConsentEvent')
  const subAt = r.calls.indexOf('insertSubscription')
  assert.ok(consentAt >= 0, 'consent must be recorded')
  assert.ok(subAt >= 0, 'subscription must be inserted')
  assert.ok(consentAt < subAt, `consent (${consentAt}) must precede the subscription (${subAt})`)
  assert.equal(r.consents[0].consent_type, 'tos')
  assert.equal(r.consents[0].accepted_at, '2026-07-23T09:59:30Z')
  assert.equal(r.consents[0].version, 'v1.0')
})

test('marketing opt-in is recorded as its own consent event when supplied', async () => {
  const r = makeDeps()
  await handleRedeemAccessCode(
    buildReq(body({ marketing_opt_in_at: '2026-07-23T09:59:30Z' })),
    r.deps,
  )
  assert.equal(r.consents.length, 2)
  assert.deepEqual(
    r.consents.map((c) => c.consent_type),
    ['tos', 'marketing'],
  )
})

// ─── 10. best-effort deps never sink the redemption ────────────────────

test('a throwing clearStalePairState / recordAttempt / insertRedemption still yields 200', async () => {
  for (const dep of ['clearStalePairState', 'recordAttempt', 'insertRedemption']) {
    const r = makeDeps({ throwOn: [dep] })
    const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
    assert.equal(res.status, 200, `${dep} throwing must not fail the redemption`)
    const out = await readJson(res)
    assert.equal(out.ok, true)
    assert.equal(String(out.redirect_url).startsWith(`${PUBLIC_BASE}/welcome?cid=`), true)
    assert.equal(r.subscriptions.length, 1)
  }
})

test('all three best-effort deps throwing at once still yields 200', async () => {
  const r = makeDeps({ throwOn: ['clearStalePairState', 'recordAttempt', 'insertRedemption'] })
  const res = await handleRedeemAccessCode(buildReq(body()), r.deps)
  assert.equal(res.status, 200)
  assert.equal(r.spinUps.length, 1)
})
