/**
 * End-to-end happy path test, fully mocked.
 *
 * Flow: pay → spawn → Hermes alive → telegram message.
 * Tidak nyentuh real services: VPS, Supabase, Xendit, Telegram, LLM.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.js'
import { MockDataStore } from '../services/provisioning/src/stores/mock-store.js'
import { MockMessageBroker } from '../services/hermes/src/adapters/mock-broker.js'
import { MockPaymentProvider } from '../services/payment/lib/payment/mock-payment.js'
import { MockLLMProvider } from '../services/proxy/src/providers/mock-llm.js'
import { spinUpCustomer } from '../services/provisioning/src/customer-flow.js'

test('happy path: pay → spawn → Hermes alive → telegram message', async () => {
  // ── arrange ───────────────────────────────────────────────
  const payment = new MockPaymentProvider()
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const broker = new MockMessageBroker()
  const llm = new MockLLMProvider()

  store.seedCustomer({
    id: 'cust-1',
    email: 'pelanggan@example.id',
    telegram_chat_id: '987654321',
    display_name: 'Pelanggan Demo',
  })

  // ── 1. pay ────────────────────────────────────────────────
  const invoice = await payment.createInvoice({
    customerId: 'cust-1',
    amountIdr: 299_000,
    description: 'Liren Starter — bulan 1',
  })
  assert.equal(invoice.status, 'PENDING')
  assert.ok(invoice.invoiceUrl)

  const callback = await payment.markAsPaid(invoice.id)
  assert.equal(callback.status, 'PAID')
  const refetched = await payment.getInvoice(invoice.id)
  assert.equal(refetched.status, 'PAID')

  // ── 2. spawn (deps injected, no real services) ────────────
  const result = await spinUpCustomer(
    {
      customerId: 'cust-1',
      tier: 'starter',
      telegramChatId: '987654321',
      customerTelegramBotToken: 'fake-bot-token',
      customerTelegramAllowedUserIds: '987654321',
    },
    {
      vps,
      store,
      broker,
      proxyUrl: 'https://proxy.test.local',
      billingAccountId: 'fake-billing',
      mintToken: async (id) => `tok-${id}`,
      healthCheck: async () => {
        // Hermes considered alive immediately
      },
      pollIntervalMs: 5,
      vpsRunningTimeoutMs: 1000,
      log: () => {},
    },
  )

  assert.ok(result.vpsId.startsWith('mock-vps-'))
  assert.equal(result.status, 'provisioning')

  // ── 3. background completes (Hermes alive) ────────────────
  await result.done

  const after = vps.listAll().find((v) => v.uuid === result.vpsId)
  assert.equal(after?.status, 'running', 'mock VPS reached running')

  const stored = await store.findActiveVPSByCustomer('cust-1')
  assert.equal(stored?.status, 'running', 'data store updated to running')
  assert.equal(stored?.vps_id, result.vpsId)

  // ── 4. telegram message sent ──────────────────────────────
  assert.equal(broker.sentMessages.length, 1)
  assert.equal(broker.sentMessages[0].chatId, '987654321')
  assert.match(broker.sentMessages[0].text, /agent kamu hidup/i)
  assert.match(broker.sentMessages[0].text, /BotFather/)

  // ── 5. LLM mock callable ──────────────────────────────────
  const reply = await llm.chatCompletion({
    model: 'mock-model',
    messages: [{ role: 'user', content: 'halo' }],
  })
  assert.match(reply.content, /halo/)
  assert.ok(reply.usage.totalTokens > 0)
  assert.equal(llm.calls.length, 1)
})

test('idempotency: spinUp dua kali ngembaliin VPS yang sama', async () => {
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const broker = new MockMessageBroker()

  const opts = {
    customerId: 'cust-2',
    tier: 'starter' as const,
    customerTelegramBotToken: 'fake',
    customerTelegramAllowedUserIds: '0',
  }
  const deps = {
    vps,
    store,
    broker,
    healthCheck: async () => {},
    pollIntervalMs: 5,
    vpsRunningTimeoutMs: 1000,
    log: () => {},
    mintToken: async () => 'tok',
    proxyUrl: 'https://proxy.test.local',
    billingAccountId: 'fake-billing',
  }

  const first = await spinUpCustomer(opts, deps)
  await first.done

  const second = await spinUpCustomer(opts, deps)
  assert.equal(second.vpsId, first.vpsId)
  assert.equal(vps.listAll().length, 1, 'no extra VM created on second call')
})

test('VPS create failure tetep route ke alert broker', async () => {
  const vps = new MockVPSProvider()
  // Make create blow up
  ;(vps as unknown as { create: () => Promise<never> }).create = async () => {
    throw new Error('idcloudhost down')
  }
  const store = new MockDataStore()
  const broker = new MockMessageBroker()

  await assert.rejects(
    () =>
      spinUpCustomer(
        {
          customerId: 'cust-3',
          tier: 'starter',
          customerTelegramBotToken: 'fake',
          customerTelegramAllowedUserIds: '0',
        },
        {
          vps,
          store,
          broker,
          alertChatId: 'admin-chat',
          mintToken: async () => 'tok',
          healthCheck: async () => {},
          log: () => {},
        },
      ),
    /idcloudhost down/,
  )

  assert.equal(broker.sentMessages.length, 1)
  assert.equal(broker.sentMessages[0].chatId, 'admin-chat')
  assert.match(broker.sentMessages[0].text, /\[provisioning alert\]/)
})
