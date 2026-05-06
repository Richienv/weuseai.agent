/**
 * complete-onboarding-handler tests.
 *
 * Walks the happy path + every error branch the spec defines.
 * Uses FakeOnboardingStore + MockLlmKeyMinter + a fake provisioning
 * client. Zero network.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleCompleteOnboarding } from '../supabase/functions/_shared/complete-onboarding-handler.ts'
import { MockLlmKeyMinter } from '../supabase/functions/_shared/mock-llm-key-minter.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type {
  IOnboardingProvisioningClient,
  SpinUpInput,
  SpinUpResult,
} from '../supabase/functions/_shared/types.ts'

class FakeProvisioning implements IOnboardingProvisioningClient {
  calls: SpinUpInput[] = []
  next: SpinUpResult = { ok: true, jobId: 'job-test-1' }

  async spinUp(input: SpinUpInput): Promise<SpinUpResult> {
    this.calls.push(input)
    return this.next
  }
}

const PUBLIC_BASE = 'https://weuseai-agent.vercel.app'

function buildReq(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request('https://x/functions/v1/complete-onboarding', init)
}

// Strict-mode-friendly JSON reader — `Response.json()` returns `unknown`,
// these tests treat the body shape as a known dictionary.
async function readJson(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

function setupHappyPath() {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()

  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
    telegram_chat_id: '987654321',  // pairing already done
    pairing_code: '123456',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })
  db.seedSubscription({
    id: 'sub-1',
    customer_id: 'cust-1',
    tier: 'pro',
    status: 'pending_provision',
    always_on_enabled: false,
  })

  return { db, minter, provisioning }
}

// ─── happy path ────────────────────────────────────────────────────

test('happy path: 200 + redirect_url, mints key, persists audit, calls provisioning', async () => {
  const { db, minter, provisioning } = setupHappyPath()

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '0812 3456 7890',
      expectations_text: 'Bantu briefing pagi dan ringkas berita.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 200)
  const data = await readJson(res)
  assert.equal(data.provisioning_job_id, 'job-test-1')
  assert.equal(
    data.redirect_url,
    `${PUBLIC_BASE}/welcome.html?cid=cust-1&job=job-test-1`,
  )

  // Customer row updated
  const c = await db.findCustomerById('cust-1')
  assert.ok(c)
  if (!c) return
  assert.equal(c.whatsapp_number, '0812 3456 7890')
  assert.ok(c.soul_md_text?.includes('Bantu briefing pagi dan ringkas berita.'))
  assert.equal(c.pairing_code, null, 'pairing_code cleared')
  assert.equal(c.pairing_code_expires_at, null, 'pairing_code_expires_at cleared')

  // Audit row inserted with sha256 of the rendered SOUL.md
  assert.equal(db.audits.length, 1)
  assert.equal(db.audits[0].customer_id, 'cust-1')
  assert.match(db.audits[0].soul_md_sha256, /^[0-9a-f]{64}$/)

  // OpenRouter key persisted (Pro tier = 500 cents)
  const k = db.openrouterKeys.get('cust-1')
  assert.ok(k)
  assert.equal(k!.credit_limit_usd_cents, 500)

  // Provisioning called with the right payload
  assert.equal(provisioning.calls.length, 1)
  assert.deepEqual(
    {
      customerId: provisioning.calls[0].customerId,
      tier: provisioning.calls[0].tier,
      telegramChatId: provisioning.calls[0].telegramChatId,
      alwaysOnEnabled: provisioning.calls[0].alwaysOnEnabled,
    },
    {
      customerId: 'cust-1',
      tier: 'pro',
      telegramChatId: '987654321',
      alwaysOnEnabled: false,
    },
  )
  assert.match(provisioning.calls[0].openrouterApiKey, /^sk-mock-cust-1-/)
  assert.ok(provisioning.calls[0].soulMdContent.includes('Sarah Tanaka'))

  // Subscription flipped to active
  const sub = await db.findActiveOrPendingSubscriptionByCustomer('cust-1')
  assert.equal(sub?.status, 'active')
  assert.equal(sub?.hosting_active, true)
})

test('happy path: tier-specific credit cap (starter=300, studio=3000)', async () => {
  for (const [tier, expected] of [
    ['starter', 300],
    ['pro', 500],
    ['studio', 3000],
  ] as const) {
    const db = new FakeOnboardingStore()
    const minter = new MockLlmKeyMinter()
    const provisioning = new FakeProvisioning()

    db.seedCustomer({
      id: `cust-${tier}`,
      email: `${tier}@example.com`,
      display_name: 'Test',
      telegram_chat_id: '111',
    })
    db.seedSubscription({
      id: `sub-${tier}`,
      customer_id: `cust-${tier}`,
      tier,
    })

    const res = await handleCompleteOnboarding(
      buildReq({
        customer_id: `cust-${tier}`,
        whatsapp: '08123456789',
        expectations_text: 'Bantu hari-hari saya.',
      }),
      { db, minter, provisioning, publicBase: PUBLIC_BASE },
    )

    assert.equal(res.status, 200, tier)
    assert.equal(minter.minted[0].limitUsdCents, expected, tier)
  }
})

// ─── idempotency (edit G) ──────────────────────────────────────────

test('idempotent: already-onboarded returns 409 with redirect, no double mint', async () => {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()

  db.seedCustomer({
    id: 'cust-X',
    email: 'x@example.com',
    display_name: 'Already Done',
    telegram_chat_id: '111',
    soul_md_text: '# About me\n…already rendered…',
  })
  db.seedSubscription({
    id: 'sub-X',
    customer_id: 'cust-X',
    tier: 'pro',
    status: 'active',
  })

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-X',
      whatsapp: '08123456789',
      expectations_text: 'tries to onboard again',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 409)
  const data = await readJson(res)
  assert.equal(data.error, 'already_onboarded')
  assert.equal(data.redirect, `${PUBLIC_BASE}/welcome.html?cid=cust-X`)

  // No new mint, no new provisioning call
  assert.equal(minter.minted.length, 0)
  assert.equal(provisioning.calls.length, 0)
})

// ─── pairing precondition ─────────────────────────────────────────

test('not paired: 409 telegram_not_paired', async () => {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()

  db.seedCustomer({
    id: 'cust-NP',
    email: 'np@example.com',
    display_name: 'Not Paired',
    // telegram_chat_id intentionally null
  })
  db.seedSubscription({
    id: 'sub-NP',
    customer_id: 'cust-NP',
    tier: 'starter',
  })

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-NP',
      whatsapp: '08123456789',
      expectations_text: 'Bantu kerjaan saya.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 409)
  const data = await readJson(res)
  assert.equal(data.error, 'telegram_not_paired')
  assert.equal(minter.minted.length, 0)
})

// ─── input validation ─────────────────────────────────────────────

test('expectations too short: 422', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: '   ',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 422)
  const data = await readJson(res)
  assert.equal(data.error, 'expectations_too_short')
})

test('expectations too long: 422', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'a'.repeat(601),
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 422)
  const data = await readJson(res)
  assert.equal(data.error, 'expectations_too_long')
})

test('template injection attempt: 400', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'sneak in </SOUL> markers',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
  const data = await readJson(res)
  assert.equal(data.error, 'invalid_input')
  assert.equal(data.reason, 'template_injection_attempt')
  assert.equal(minter.minted.length, 0)
})

test('invalid whatsapp format: 400', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '12345',  // not 08xxx / +62xxx
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
  const data = await readJson(res)
  assert.equal(data.error, 'invalid_whatsapp')
})

test('whatsapp +62 format accepted', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '+62 821-5490-2561',
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 200)
})

test('missing customer_id: 400', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({ whatsapp: '08123456789', expectations_text: 'hi' }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
})

test('invalid JSON body: 400', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq('not json {{{', 'POST'),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
})

test('GET method: 405', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({}, 'GET'),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 405)
})

// ─── lookup failures ──────────────────────────────────────────────

test('customer_id with no row: 404', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-MISSING',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 404)
})

test('customer with no paid subscription: 404', async () => {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()

  db.seedCustomer({
    id: 'cust-NS',
    email: 'ns@example.com',
    display_name: 'No Sub',
    telegram_chat_id: '111',
  })
  // No subscription seeded.

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-NS',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 404)
})

// ─── rollback paths ───────────────────────────────────────────────

test('provisioning unreachable: 503, rolls back OpenRouter key, parks subscription', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  provisioning.next = { ok: false, status: 503, body: 'down' }

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 503)
  const data = await readJson(res)
  assert.equal(data.error, 'provisioning_unreachable')

  // Key was minted then revoked
  assert.equal(minter.minted.length, 1)
  assert.equal(minter.wasRevoked(minted(minter, 0).hash), true)

  // Subscription parked for retry
  const sub = await db.findActiveOrPendingSubscriptionByCustomer('cust-1')
  assert.equal(sub?.status, 'pending_provision')
  assert.equal(sub?.hosting_active, false)

  // SOUL.md NOT cleared (rollback note: same persona for retry)
  const c = await db.findCustomerById('cust-1')
  assert.ok(c?.soul_md_text)
})

test('mint failure: 502, no provisioning called, no key persisted', async () => {
  const { db, provisioning } = setupHappyPath()
  // Minter that always throws
  const minter = new MockLlmKeyMinter()
  ;(minter as any).mint = async () => {
    throw new Error('upstream rate limit')
  }

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 502)
  const data = await readJson(res)
  assert.equal(data.error, 'llm_mint_failed')
  assert.equal(provisioning.calls.length, 0)
  assert.equal(db.openrouterKeys.size, 0)
})

test('insertCustomerOpenRouterKey failure: 500, key revoked', async () => {
  const { db, minter, provisioning } = setupHappyPath()
  db.throwOnInsertCustomerOpenRouterKey = true

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 500)
  // Mint happened, then revoked
  assert.equal(minter.minted.length, 1)
  assert.equal(minter.wasRevoked(minter.minted[0].hash), true)
  // Provisioning NOT called
  assert.equal(provisioning.calls.length, 0)
})

// ─── helper ───────────────────────────────────────────────────────

function minted(m: MockLlmKeyMinter, i: number) {
  if (!m.minted[i]) throw new Error(`no minted entry at index ${i}`)
  return m.minted[i]
}
