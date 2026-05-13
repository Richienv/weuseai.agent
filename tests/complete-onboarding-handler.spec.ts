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
  ITelegramClient,
  SpinUpInput,
  SpinUpResult,
} from '../supabase/functions/_shared/types.ts'

class FakeProvisioning implements IOnboardingProvisioningClient {
  calls: SpinUpInput[] = []
  next: SpinUpResult = { ok: true, jobId: 'job-test-1' }
  // Track 3b 2026-05-10: refreshEnv calls captured + tunable response.
  refreshCalls: import('../supabase/functions/_shared/types.ts').RefreshEnvInput[] = []
  refreshNext: import('../supabase/functions/_shared/types.ts').RefreshEnvResult = {
    ok: true,
    vpsId: 'vps-test-1',
    ipAddress: '10.0.0.1',
    applied: { TELEGRAM_BOT_TOKEN: 'updated' },
    hermesRestartAt: '2026-05-10T08:00:00Z',
  }

  async spinUp(input: SpinUpInput): Promise<SpinUpResult> {
    this.calls.push(input)
    return this.next
  }
  async refreshEnv(input: import('../supabase/functions/_shared/types.ts').RefreshEnvInput) {
    this.refreshCalls.push(input)
    return this.refreshNext
  }
}

// Pair-flow Option A (2026-05-09): handler now calls deleteWebhook on
// the customer's own bot after spinUp returns. Capture the calls so
// tests can assert the right token was used.
class FakeTelegram implements ITelegramClient {
  deleteWebhookCalls: string[] = []
  /** Simulate Telegram returning 5xx on next deleteWebhook (handler
   *  swallows by design; this just lets us assert it was tried). */
  failNextDeleteWebhook = false

  async replyText() {}
  async getMe() {
    return null
  }
  async setWebhook() {}
  async deleteWebhook(token: string) {
    this.deleteWebhookCalls.push(token)
    if (this.failNextDeleteWebhook) {
      this.failNextDeleteWebhook = false
      throw new Error('Telegram deleteWebhook -> 503')
    }
  }
  async sendMessageAs() {}
  // Phase 5-5b: no-op stubs.
  async sendMessageWithButtonsAs() {}
  async answerCallbackQuery() {}
  async getWebhookInfo(_token: string): Promise<{ url: string }> { return { url: '' } }
}

const PUBLIC_BASE = 'https://weuseai-agent.vercel.app'

// Per-customer bot token used in test setups. Mirrors the format
// founder-pasted in the diagnostic step so tests track production-shape.
const TEST_BOT_TOKEN = '8734001154:AAGGTR0PRNCy03aaVPb5qi9hWzxCe5yr_Ek'
const TEST_BOT_USERNAME = 'weuseai_e2e_fixture_bot'

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
  const telegram = new FakeTelegram()

  db.seedCustomer({
    id: 'cust-1',
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
    telegram_chat_id: '987654321',  // pairing already done
    telegram_bot_username: TEST_BOT_USERNAME,
    pairing_code: '123456',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })
  // Pair-flow Option A: handler requires the encrypted bot token to be
  // persisted before final submit. Seed it here so the happy path
  // reaches the provisioning + deleteWebhook steps.
  // (Synchronous in the fake store — real store is async via RPC.)
  void db.setBotTokenAndUsername('cust-1', TEST_BOT_TOKEN, TEST_BOT_USERNAME)
  db.seedSubscription({
    id: 'sub-1',
    customer_id: 'cust-1',
    tier: 'pro',
    status: 'pending_provision',
    always_on_enabled: false,
  })

  return { db, minter, provisioning, telegram }
}

// ─── happy path ────────────────────────────────────────────────────

test('happy path: 200 + redirect_url, mints key, persists audit, calls provisioning', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '0812 3456 7890',
      expectations_text: 'Bantu briefing pagi dan ringkas berita.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
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
    const telegram = new FakeTelegram()

    db.seedCustomer({
      id: `cust-${tier}`,
      email: `${tier}@example.com`,
      display_name: 'Test',
      telegram_chat_id: '111',
      telegram_bot_username: TEST_BOT_USERNAME,
    })
    void db.setBotTokenAndUsername(`cust-${tier}`, TEST_BOT_TOKEN, TEST_BOT_USERNAME)
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
      { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
    )

    assert.equal(res.status, 200, tier)
    assert.equal(minter.minted[0].limitUsdCents, expected, tier)
  }
})

// ─── idempotency (edit G) ──────────────────────────────────────────

// Helper for the branched-idempotency tests: render a SOUL.md from the
// SAME template + inputs the handler will use, so we can pre-seed
// customer.soul_md_text matching what the handler will compute on
// re-submit. Without this the hash check at line 4b in the handler
// can't see "no change" and falls through to persona-refresh.
async function renderSeedSoulMd(args: { customerName: string; expectationsText: string }): Promise<string> {
  const { renderSoulMd, sanitizeExpectations } = await import(
    '../supabase/functions/_shared/soul-md-template.ts'
  )
  const sanitized = sanitizeExpectations(args.expectationsText)
  if (!sanitized.ok) throw new Error(`renderSeedSoulMd: invalid input — ${sanitized.reason}`)
  return renderSoulMd({
    customerName: args.customerName,
    expectationsClean: sanitized.clean,
  })
}

test('idempotent: re-submit with SAME expectations returns 409 + &job, no double mint, no refreshEnv', async () => {
  // Track 1 persona-refinement (2026-05-10): the binary 409 short-circuit
  // is now branched. Same-text re-submit (tab refresh, double-click
  // Lanjut) still 409s because the freshly-rendered SOUL.md hash matches
  // the persisted one. NEW-text re-submit takes the persona-refresh
  // path (tested below).
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()
  const telegram = new FakeTelegram()

  const expectations = 'Bantu saya untuk briefing pagi dan email triage harian.'
  // Seed soul_md_text matching what renderSoulMd would produce for these
  // inputs — that's how the handler detects "no change" and 409s.
  const seededSoul = await renderSeedSoulMd({
    customerName: 'Already Done',
    expectationsText: expectations,
  })

  db.seedCustomer({
    id: 'cust-X',
    email: 'x@example.com',
    display_name: 'Already Done',
    telegram_chat_id: '111',
    telegram_bot_username: TEST_BOT_USERNAME,
    soul_md_text: seededSoul,
  })
  await db.setBotTokenAndUsername('cust-X', TEST_BOT_TOKEN, TEST_BOT_USERNAME)
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
      expectations_text: expectations,  // identical to seed
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 409)
  const data = await readJson(res)
  assert.equal(data.error, 'already_onboarded')
  // 2026-05-10 onboarding-loop fix: redirect must include &job synthetic
  // marker so welcome.html's tick() doesn't fall into state C "Lengkapi
  // profil agent" and bounce the customer back into the loop.
  assert.equal(
    data.redirect,
    `${PUBLIC_BASE}/welcome.html?cid=cust-X&job=already-onboarded`,
  )

  // No new mint, no new provisioning call, NO refreshEnv call —
  // truly idempotent path skips everything.
  assert.equal(minter.minted.length, 0)
  assert.equal(provisioning.calls.length, 0)
  assert.equal(provisioning.refreshCalls.length, 0)
})

test('persona-refresh: re-submit with NEW expectations writes new soul_md + calls refreshEnv, no spinUp/mint/webhook/greeting', async () => {
  // Track 1 persona-refinement (2026-05-10): the missing capability
  // founder hit on e282ce25 — edit step 4 expectations to refine the
  // agent persona, expect the new persona to land on the VPS.
  // Pre-fix: silent discard, SOUL.md mtime stays at first-onboarding
  // time, customer's edits never reach disk.
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()
  const telegram = new FakeTelegram()

  // Seed with the OLD persona text.
  const oldExpectations = 'Briefing pagi saja.'
  const oldSoul = await renderSeedSoulMd({
    customerName: 'Sarah Test',
    expectationsText: oldExpectations,
  })

  db.seedCustomer({
    id: 'cust-X',
    email: 'sarah@example.com',
    display_name: 'Sarah Test',
    telegram_chat_id: '6805409051',
    telegram_bot_username: TEST_BOT_USERNAME,
    soul_md_text: oldSoul,
  })
  await db.setBotTokenAndUsername('cust-X', TEST_BOT_TOKEN, TEST_BOT_USERNAME)
  db.seedSubscription({
    id: 'sub-X',
    customer_id: 'cust-X',
    tier: 'pro',
    status: 'active',
  })

  // Submit NEW expectations.
  const newExpectations = 'Briefing pagi DAN code review harian, plus content drafting.'
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-X',
      whatsapp: '08123456789',
      expectations_text: newExpectations,
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 200, 'persona-refresh path returns 200, not 409')
  const data = await readJson(res)
  assert.equal(data.persona_refreshed, true)
  assert.equal(data.provisioning_job_id, 'persona-refresh')
  assert.equal(
    data.redirect_url,
    `${PUBLIC_BASE}/welcome.html?cid=cust-X&job=persona-refresh`,
  )
  assert.ok(typeof data.soul_md_sha256 === 'string' && data.soul_md_sha256.length === 64)

  // DB row updated with new SOUL.md.
  const updated = await db.findCustomerById('cust-X')
  assert.notEqual(updated?.soul_md_text, oldSoul, 'soul_md_text must change')
  assert.match(updated?.soul_md_text ?? '', /code review/, 'new persona must contain new expectations text')

  // refreshEnv called with NEW soul_md content + chat_id pre-approve.
  assert.equal(provisioning.refreshCalls.length, 1)
  const refreshCall = provisioning.refreshCalls[0]
  assert.equal(refreshCall.customerId, 'cust-X')
  assert.equal(refreshCall.envValues.TELEGRAM_BOT_TOKEN, TEST_BOT_TOKEN)
  assert.match(refreshCall.soulMdContent ?? '', /code review/)
  assert.equal(refreshCall.telegramChatId, '6805409051')
  assert.equal(refreshCall.telegramUserName, 'Sarah Test')

  // One-time-cost stages MUST NOT be re-run on persona refresh.
  assert.equal(minter.minted.length, 0, 'no second OpenRouter key mint')
  assert.equal(provisioning.calls.length, 0, 'no second spinUp call')
  assert.equal(telegram.deleteWebhookCalls.length, 0, 'no second deleteWebhook call')
})

// ─── pairing precondition ─────────────────────────────────────────

test('paired but no bot token (Pair-flow Option A regression): 409 no_bot_token', async () => {
  // Customer reached final submit with telegram_chat_id set but bot
  // token never validated. Impossible if Step 2 succeeded; possible if
  // a stale tab raced ahead. Handler must reject with no_bot_token so
  // the UI can kick back to Step 2.
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()
  const telegram = new FakeTelegram()

  db.seedCustomer({
    id: 'cust-NB',
    email: 'nb@example.com',
    display_name: 'Race-Condition User',
    telegram_chat_id: '999',
  })
  // No setBotTokenAndUsername — token absent on the row.
  db.seedSubscription({
    id: 'sub-NB',
    customer_id: 'cust-NB',
    tier: 'pro',
  })

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-NB',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 409)
  const data = await readJson(res)
  assert.equal(data.error, 'no_bot_token')
  // No mint, no provisioning call, no deleteWebhook
  assert.equal(minter.minted.length, 0)
  assert.equal(provisioning.calls.length, 0)
  assert.equal(telegram.deleteWebhookCalls.length, 0)
})

test('happy path also calls deleteWebhook on customer bot after spinUp ACK', async () => {
  // Pair-flow Option A: handler must free the customer's own bot for
  // Hermes long-poll once provisioning has been triggered.
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 200)
  // deleteWebhook called exactly once with the customer's plaintext token
  assert.equal(telegram.deleteWebhookCalls.length, 1)
  assert.equal(telegram.deleteWebhookCalls[0], TEST_BOT_TOKEN)
  // SpinUp received the customer's bot token
  assert.equal(provisioning.calls[0].telegramBotToken, TEST_BOT_TOKEN)
})

test('deleteWebhook 5xx → properDeleteWebhook retries → onboarding still 200', async () => {
  // 2026-05-10: replaced the prior safeDeleteWebhook (silent swallow)
  // with properDeleteWebhook (3 attempts + getWebhookInfo verify).
  // Failing the first attempt should now trigger a retry and ultimately
  // succeed without blocking onboarding.
  const { db, minter, provisioning, telegram } = setupHappyPath()
  telegram.failNextDeleteWebhook = true   // attempt 1 throws, attempt 2 ok
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    {
      db,
      minter,
      provisioning,
      telegram,
      publicBase: PUBLIC_BASE,
      webhookDeleteSleepMs: () => {},   // skip the 2s backoff in test
    },
  )
  assert.equal(res.status, 200)
  // Two attempts: attempt 1 throws (5xx), attempt 2 succeeds.
  assert.equal(telegram.deleteWebhookCalls.length, 2)
  const body = (await res.json()) as { webhook_warning?: unknown }
  // Retry succeeded → no warning.
  assert.equal(body.webhook_warning, undefined)
})

test('not paired: 409 telegram_not_paired', async () => {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()
  const telegram = new FakeTelegram()

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
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 409)
  const data = await readJson(res)
  assert.equal(data.error, 'telegram_not_paired')
  assert.equal(minter.minted.length, 0)
})

// ─── input validation ─────────────────────────────────────────────

test('expectations too short: 422', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: '   ',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 422)
  const data = await readJson(res)
  assert.equal(data.error, 'expectations_too_short')
})

test('expectations too long: 422', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'a'.repeat(601),
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 422)
  const data = await readJson(res)
  assert.equal(data.error, 'expectations_too_long')
})

test('template injection attempt: 400', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'sneak in </SOUL> markers',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
  const data = await readJson(res)
  assert.equal(data.error, 'invalid_input')
  assert.equal(data.reason, 'template_injection_attempt')
  assert.equal(minter.minted.length, 0)
})

test('invalid whatsapp format: 400', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '12345',  // not 08xxx / +62xxx
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
  const data = await readJson(res)
  assert.equal(data.error, 'invalid_whatsapp')
})

test('whatsapp +62 format accepted', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '+62 821-5490-2561',
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 200)
})

test('missing customer_id: 400', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({ whatsapp: '08123456789', expectations_text: 'hi' }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
})

test('invalid JSON body: 400', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq('not json {{{', 'POST'),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 400)
})

test('GET method: 405', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({}, 'GET'),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 405)
})

// ─── lookup failures ──────────────────────────────────────────────

test('customer_id with no row: 404', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-MISSING',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )
  assert.equal(res.status, 404)
})

test('customer with no paid subscription: 404', async () => {
  const db = new FakeOnboardingStore()
  const minter = new MockLlmKeyMinter()
  const provisioning = new FakeProvisioning()
  const telegram = new FakeTelegram()

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
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 404)
})

// ─── rollback paths ───────────────────────────────────────────────

test('provisioning unreachable: 503, rolls back OpenRouter key, parks subscription', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  provisioning.next = { ok: false, status: 503, body: 'down' }

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
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

test('vps_capacity_exhausted: 503 with distinct error code when provisioning body matches IDCloudHost capacity message (2026-05-11 honest-error fix)', async () => {
  // Pre-fix: every spinUp failure surfaced as generic 'provisioning_unreachable'
  // → onboarding.html rendered "Belum jadi. Ada kendala teknis." which read
  // as "you did something wrong." But IDCloudHost's "Compute resources
  // temporarily unavailable" is a transient platform issue (Jakarta region
  // full). Customer should be told it's not their fault. Customer e282ce25 +
  // a3827996 hit this in fresh-customer e2e testing 2026-05-10/11.
  // See docs/investigation/2026-05-11-pair-failure.md.
  const { db, minter, provisioning, telegram } = setupHappyPath()
  provisioning.next = {
    ok: false,
    status: 500,
    // Verbatim IDCloudHost server message (passed through by provisioning service).
    body: 'IDCloudHost POST /vm -> 500: {"errors": {"Error": "Compute resources temporarily unavailable due to high demand. If possible, choose a different region or location."}}',
  }

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 503)
  const data = await readJson(res)
  assert.equal(
    data.error,
    'vps_capacity_exhausted',
    'must return distinct code (not generic provisioning_unreachable)',
  )

  // Same rollback semantics as other spinUp failures.
  assert.equal(minter.minted.length, 1)
  assert.equal(minter.wasRevoked(minted(minter, 0).hash), true)
  const sub = await db.findActiveOrPendingSubscriptionByCustomer('cust-1')
  assert.equal(sub?.status, 'pending_provision')
})

test('isProviderCapacityError: positive + negative across Vultr + DO (legacy IDCH phrasing kept defensively)', async () => {
  const { isProviderCapacityError } = await import(
    '../supabase/functions/_shared/complete-onboarding-handler.ts'
  )
  // Positive: legacy IDCloudHost phrasing kept defensively — historical
  // error messages may still surface from old log paths even though the
  // IDCH adapter was retired 2026-05-13.
  assert.equal(
    isProviderCapacityError(
      'IDCloudHost POST /vm -> 500: {"errors": {"Error": "Compute resources temporarily unavailable due to high demand. If possible, choose a different region or location."}}',
    ),
    true,
  )
  // Positive: Vultr documented capacity phrasings.
  assert.equal(
    isProviderCapacityError('Vultr POST /v2/instances -> 503: "plan and region combination is unavailable"'),
    true,
  )
  assert.equal(isProviderCapacityError('vc2-1c-1gb is out of stock in sgp'), true)
  assert.equal(isProviderCapacityError('insufficient capacity in region'), true)
  // Positive: DigitalOcean.
  assert.equal(isProviderCapacityError('Droplet size is not available in this region'), true)
  assert.equal(isProviderCapacityError('region is not available'), true)
  assert.equal(isProviderCapacityError('Sold out'), true)
  // Negative: other 5xx provisioning failures (must NOT misclassify and
  // hide real bugs behind the friendly capacity copy).
  assert.equal(isProviderCapacityError('connection refused'), false)
  assert.equal(isProviderCapacityError('SSH auth failed'), false)
  assert.equal(isProviderCapacityError(''), false)
  assert.equal(isProviderCapacityError('Vultr POST /v2/instances -> 401: unauthorized'), false)
})

test('mint failure: 502, no provisioning called, no key persisted', async () => {
  const { db, provisioning, telegram } = setupHappyPath()
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
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
  )

  assert.equal(res.status, 502)
  const data = await readJson(res)
  assert.equal(data.error, 'llm_mint_failed')
  assert.equal(provisioning.calls.length, 0)
  assert.equal(db.openrouterKeys.size, 0)
})

test('insertCustomerOpenRouterKey failure: 500, key revoked', async () => {
  const { db, minter, provisioning, telegram } = setupHappyPath()
  db.throwOnInsertCustomerOpenRouterKey = true

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-1',
      whatsapp: '08123456789',
      expectations_text: 'Bantu briefing pagi.',
    }),
    { db, minter, provisioning, telegram, publicBase: PUBLIC_BASE },
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
