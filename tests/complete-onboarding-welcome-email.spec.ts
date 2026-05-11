/**
 * Sesi B P0 #7 — welcome email after complete-onboarding success.
 *
 * On step 10 (success path), the handler invokes the optional
 * sendWelcomeEmail dep with the customer's email + display name + bot
 * username + tier. Best-effort — any throw is swallowed so the
 * onboarding response is unaffected.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleCompleteOnboarding } from '../supabase/functions/_shared/complete-onboarding-handler.ts'
import { MockLlmKeyMinter } from '../supabase/functions/_shared/mock-llm-key-minter.ts'
import {
  buildWelcomeEmailBody,
} from '../supabase/functions/_shared/email-delivery.ts'
import { FakeOnboardingStore } from './_helpers/fake-onboarding-store.ts'
import type {
  IOnboardingProvisioningClient,
  ITelegramClient,
  SpinUpInput,
  SpinUpResult,
  RefreshEnvInput,
  RefreshEnvResult,
} from '../supabase/functions/_shared/types.ts'

class StubProvisioning implements IOnboardingProvisioningClient {
  async spinUp(_input: SpinUpInput): Promise<SpinUpResult> {
    return { ok: true, jobId: 'job-welcome-test' }
  }
  async refreshEnv(_input: RefreshEnvInput): Promise<RefreshEnvResult> {
    return {
      ok: true,
      vpsId: 'vps-test',
      ipAddress: '10.0.0.1',
      applied: { TELEGRAM_BOT_TOKEN: 'updated' },
      hermesRestartAt: '2026-05-12T00:00:00Z',
    }
  }
}

class StubTelegram implements ITelegramClient {
  async replyText() {}
  async getMe() { return null }
  async setWebhook() {}
  async deleteWebhook() {}
  async sendMessageAs() {}
  async sendMessageWithButtonsAs() {}
  async answerCallbackQuery() {}
  async getWebhookInfo() { return { url: '' } }
}

const PUBLIC_BASE = 'https://weuseai-agent.vercel.app'
const BOT_TOKEN = '8734001154:AAGGTR0PRNCy03aaVPb5qi9hWzxCe5yr_Ek'
const BOT_USERNAME = 'weuseai_welcome_bot'

function seededStore(): FakeOnboardingStore {
  const db = new FakeOnboardingStore()
  db.seedCustomer({
    id: 'cust-w',
    email: 'pelanggan@contoh.id',
    display_name: 'Pelanggan Baru',
    telegram_chat_id: '987654321',
    telegram_bot_username: BOT_USERNAME,
    pairing_code: '123456',
    pairing_code_expires_at: '2099-01-01T00:00:00.000Z',
  })
  void db.setBotTokenAndUsername('cust-w', BOT_TOKEN, BOT_USERNAME)
  db.seedSubscription({
    id: 'sub-w',
    customer_id: 'cust-w',
    tier: 'pro',
    status: 'pending_provision',
    always_on_enabled: false,
  })
  return db
}

function buildReq(body: unknown): Request {
  return new Request('https://x/functions/v1/complete-onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── builder ────────────────────────────────────────────────────────────

test('buildWelcomeEmailBody: BI subject + body includes bot link + display name', () => {
  const { subject, text } = buildWelcomeEmailBody({
    display_name: 'Pak Andi',
    bot_username: 'andi_agent_bot',
    tier: 'pro',
  })
  assert.match(subject, /aktif|active|weuseai\.agent/i)
  assert.ok(text.includes('Pak Andi'))
  assert.ok(text.includes('andi_agent_bot'))
  assert.ok(text.includes('pro'), 'body mentions tier')
  assert.ok(!text.includes('!'), 'no exclamation marks')
  assert.ok(!/basically|just|literally|10x/i.test(text), 'no banned words')
})

test('buildWelcomeEmailBody: tolerates missing bot_username', () => {
  const { text } = buildWelcomeEmailBody({
    display_name: 'Pelanggan',
    bot_username: null,
    tier: 'starter',
  })
  assert.match(text, /telegram/i, 'still mentions Telegram even without explicit username')
})

// ─── integration ────────────────────────────────────────────────────────

test('happy path: sendWelcomeEmail called with customer email + bot username + tier', async () => {
  const db = seededStore()
  const sends: { to: string; subject: string; text: string }[] = []

  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-w',
      whatsapp: '0812 3456 7890',
      expectations_text: 'Bantu draf email klien dan ringkas dokumen rapat.',
    }),
    {
      db,
      minter: new MockLlmKeyMinter(),
      provisioning: new StubProvisioning(),
      telegram: new StubTelegram(),
      publicBase: PUBLIC_BASE,
      sendWelcomeEmail: async (args) => {
        sends.push(args)
        return { ok: true }
      },
    },
  )

  assert.equal(res.status, 200)
  assert.equal(sends.length, 1, 'sendWelcomeEmail called once')
  assert.equal(sends[0].to, 'pelanggan@contoh.id')
  assert.ok(sends[0].text.includes('Pelanggan Baru'), 'uses display_name')
  assert.ok(sends[0].text.includes(BOT_USERNAME), 'uses bot username')
})

test('happy path: sendWelcomeEmail throws → onboarding still returns 200', async () => {
  const db = seededStore()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-w',
      whatsapp: '0812 3456 7890',
      expectations_text: 'Bantu draf email klien dan ringkas dokumen rapat.',
    }),
    {
      db,
      minter: new MockLlmKeyMinter(),
      provisioning: new StubProvisioning(),
      telegram: new StubTelegram(),
      publicBase: PUBLIC_BASE,
      sendWelcomeEmail: async () => {
        throw new Error('resend failed')
      },
    },
  )
  assert.equal(res.status, 200, 'email failure does not break onboarding')
})

test('happy path: no sendWelcomeEmail dep → handler still succeeds (back-compat)', async () => {
  const db = seededStore()
  const res = await handleCompleteOnboarding(
    buildReq({
      customer_id: 'cust-w',
      whatsapp: '0812 3456 7890',
      expectations_text: 'Bantu draf email klien dan ringkas dokumen rapat.',
    }),
    {
      db,
      minter: new MockLlmKeyMinter(),
      provisioning: new StubProvisioning(),
      telegram: new StubTelegram(),
      publicBase: PUBLIC_BASE,
    },
  )
  assert.equal(res.status, 200)
})
