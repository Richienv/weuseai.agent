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
import { MockSshProvisioner } from '../services/provisioning/src/ssh/mock-ssh-provisioner.js'
import { MockLlmKeyMinter } from '../services/provisioning/src/llm/mock-minter.js'
import { spinUpCustomer } from '../services/provisioning/src/customer-flow.js'

test('happy path: pay → spawn → SSH setup → halo + ready marker', async () => {
  // ── arrange ───────────────────────────────────────────────
  const payment = new MockPaymentProvider()
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const broker = new MockMessageBroker()
  const ssh = new MockSshProvisioner()
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
      ssh,
    llmMinter: new MockLlmKeyMinter(),
      billingAccountId: 'fake-billing',
      ipPollIntervalMs: 1,
      ipPollTimeoutMs: 1000,
      sshPollIntervalMs: 1,
      sshReadyTimeoutMs: 1000,
      waitForSshOpen: async () => {/* mock — port always open */},
      log: () => {},
    },
  )

  assert.ok(result.vpsId.startsWith('mock-vps-'))
  assert.equal(result.status, 'provisioning')

  // ── 3. background completes (SSH setup ran) ──────────────
  await result.done

  const stored = await store.findActiveVPSByCustomer('cust-1')
  assert.equal(stored?.status, 'running', 'data store updated to running')
  assert.equal(stored?.vps_id, result.vpsId)
  assert.ok(stored?.ip_address, 'public IP populated from getPublicIp')

  // ── 4. SSH setup script ran with halo + Hermes install ───
  assert.equal(ssh.calls.length, 1, 'ssh.runSetup called once')
  assert.equal(ssh.calls[0].user, 'liren', 'IDCloudHost default user')
  assert.match(ssh.calls[0].script, /Halo, gue agen lo/, 'halo greeting in script')
  assert.match(ssh.calls[0].script, /install\.sh/, 'Hermes installer in script')

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
  const ssh = new MockSshProvisioner()

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
    ssh,
    llmMinter: new MockLlmKeyMinter(),
    ipPollIntervalMs: 1,
    ipPollTimeoutMs: 1000,
    sshPollIntervalMs: 1,
    sshReadyTimeoutMs: 1000,
    waitForSshOpen: async () => {},
    log: () => {},
    billingAccountId: 'fake-billing',
  }

  const first = await spinUpCustomer(opts, deps)
  await first.done

  const second = await spinUpCustomer(opts, deps)
  assert.equal(second.vpsId, first.vpsId)
  assert.equal(vps.listAll().length, 1, 'no extra VM created on second call')
  assert.equal(ssh.calls.length, 1, 'no second SSH run')
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
          ssh: new MockSshProvisioner(),
          llmMinter: new MockLlmKeyMinter(),
          alertChatId: 'admin-chat',
          waitForSshOpen: async () => {},
          log: () => {},
        },
      ),
    /idcloudhost down/,
  )

  assert.equal(broker.sentMessages.length, 1)
  assert.equal(broker.sentMessages[0].chatId, 'admin-chat')
  assert.match(broker.sentMessages[0].text, /\[provisioning alert\]/)
})
