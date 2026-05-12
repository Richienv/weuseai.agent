/**
 * Phase 1 post-payment flow integration tests.
 *
 * Exercises the xendit-webhook handler end-to-end with mocks:
 *   webhook → handler → db update + credits + provisioning
 *   provisioning → spinUpCustomer → MockVPS + MockBroker (welcome message)
 *
 * No Deno, no real Xendit/IDCloudHost — all in-process mocks.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleXenditWebhook } from '../supabase/functions/_shared/xendit-webhook-handler.ts'
import type {
  IInvoiceStore,
  IProvisioningClient,
  SubscriptionRow,
  Tier,
} from '../supabase/functions/_shared/types.ts'

import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.js'
import { MockDataStore } from '../services/provisioning/src/stores/mock-store.js'
import { MockMessageBroker } from '../services/hermes/src/adapters/mock-broker.js'
import { MockSshProvisioner } from '../services/provisioning/src/ssh/mock-ssh-provisioner.js'
import { MockLlmKeyMinter } from '../services/provisioning/src/llm/mock-minter.js'
import { spinUpCustomer } from '../services/provisioning/src/customer-flow.js'

// ──────────────────────────────────────────────────────────
// Test-only IInvoiceStore — minimal in-memory impl
// ──────────────────────────────────────────────────────────

function makeFakeInvoiceStore(seed: {
  subscriptions: SubscriptionRow[]
}): IInvoiceStore & {
  state: {
    subscriptions: SubscriptionRow[]
    creditsAdds: { customerId: string; cents: number }[]
    invoiceMarks: { xenditInvoiceId: string; status: string }[]
    subscriptionUpdates: { id: string; patch: Partial<SubscriptionRow> }[]
  }
} {
  const subscriptions = [...seed.subscriptions]
  const creditsAdds: { customerId: string; cents: number }[] = []
  const invoiceMarks: { xenditInvoiceId: string; status: string }[] = []
  const subscriptionUpdates: { id: string; patch: Partial<SubscriptionRow> }[] = []

  return {
    state: { subscriptions, creditsAdds, invoiceMarks, subscriptionUpdates },

    async findCustomerByEmail() {
      return null
    },
    async findCustomerById() {
      // Receipt-email dep is not wired in these tests; method exists to
      // satisfy IInvoiceStore (Sesi B P0 #7).
      return null
    },
    async insertCustomer({ email }) {
      return { id: `cust_${email}`, email }
    },
    async findSubscriptionByXenditInvoiceId(xenditInvoiceId) {
      return subscriptions.find((s) => s.xendit_invoice_id === xenditInvoiceId) ?? null
    },
    async insertSubscription(input) {
      const row: SubscriptionRow = {
        id: `sub_${subscriptions.length + 1}`,
        customer_id: input.customer_id,
        tier: input.tier,
        status: input.status,
        xendit_invoice_id: input.xendit_invoice_id ?? null,
        always_on_enabled: input.always_on_enabled,
        hosting_active: false,
        next_billing_at: null,
      }
      subscriptions.push(row)
      return row
    },
    async updateSubscription(id, patch) {
      const i = subscriptions.findIndex((s) => s.id === id)
      if (i < 0) throw new Error(`subscription ${id} not found`)
      subscriptions[i] = { ...subscriptions[i], ...patch }
      subscriptionUpdates.push({ id, patch })
      return subscriptions[i]
    },
    async insertSubscriptionInvoice() {
      return { id: 'si_test' }
    },
    async markSubscriptionInvoicePaid(xenditInvoiceId) {
      invoiceMarks.push({ xenditInvoiceId, status: 'paid' })
    },
    async markSubscriptionInvoiceFailed(xenditInvoiceId, status) {
      invoiceMarks.push({ xenditInvoiceId, status })
    },
    async addStarterCredits(customerId, cents) {
      creditsAdds.push({ customerId, cents })
    },
    async clearStalePairState() {
      // HF-1 (2026-05-12): no-op for these tests. The dedicated
      // wipe-semantics tests live in
      // tests/xendit-webhook-wipe-stale-pair.spec.ts.
    },
  }
}

// ──────────────────────────────────────────────────────────
// IProvisioningClient that wires through to the real
// (mock-backed) spinUpCustomer flow.
// ──────────────────────────────────────────────────────────

function makeProvisioningWiredToSpinUp(opts: {
  shouldFail?: boolean
}): IProvisioningClient & {
  vps: MockVPSProvider
  store: MockDataStore
  broker: MockMessageBroker
  spinUpCalls: number
} {
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const broker = new MockMessageBroker()
  let spinUpCalls = 0

  // shouldFail is now plumbed into the SSH provisioner below — when set,
  // ssh.runSetup returns ok:false and the customer-flow's failure path runs.
  // Pre-pivot we simulated this via vps.create() throwing; SSH-based
  // provisioning makes ssh.runSetup the natural failure point.

  return {
    vps,
    store,
    broker,
    get spinUpCalls() {
      return spinUpCalls
    },
    async spinUp(input) {
      spinUpCalls++
      try {
        const result = await spinUpCustomer(
          {
            customerId: input.customerId,
            tier: input.tier,
            telegramChatId: `chat-${input.customerId}`,
            customerTelegramBotToken: input.customerTelegramBotToken,
            customerTelegramAllowedUserIds: input.customerTelegramAllowedUserIds,
            alwaysOnEnabled: input.alwaysOnEnabled,
            useStarterCredits: input.useStarterCredits,
          },
          {
            vps,
            store,
            broker,
            ssh: new MockSshProvisioner({
              nextResult: opts.shouldFail
                ? { ok: false, stdout: '', stderr: 'simulated SSH setup failure', exitCode: 1 }
                : { ok: true, stdout: '', stderr: '', exitCode: 0 },
            }),
            llmMinter: new MockLlmKeyMinter(),
            alertChatId: 'admin-chat',
            ipPollIntervalMs: 1,
            ipPollTimeoutMs: 1000,
            sshPollIntervalMs: 1,
            sshReadyTimeoutMs: 1000,
            waitForSshOpen: async () => {},
            log: () => {},
          },
        )
        await result.done
        return { ok: true } as const
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, status: 500, body: msg } as const
      }
    },
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const WEBHOOK_TOKEN = 'test-webhook-secret'

function paidWebhookRequest(invoiceId: string): Request {
  return new Request('http://test.local/xendit-webhook', {
    method: 'POST',
    headers: {
      'x-callback-token': WEBHOOK_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: invoiceId,
      external_id: `sub_${invoiceId}_external`,
      status: 'PAID',
      paid_at: '2026-04-30T00:00:00Z',
      payment_method: 'QRIS',
      amount: 1_308_100,
    }),
  })
}

function pendingSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_1',
    customer_id: 'cust_pelanggan@example.id',
    tier: 'starter' as Tier,
    status: 'pending',
    xendit_invoice_id: 'xnd_inv_123',
    always_on_enabled: false,
    hosting_active: false,
    next_billing_at: null,
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────
// Scenario 1: happy path
// ──────────────────────────────────────────────────────────

test('happy path: webhook PAID → subscription active + credits + provisioning + welcome', async () => {
  const db = makeFakeInvoiceStore({ subscriptions: [pendingSubscription()] })
  const prov = makeProvisioningWiredToSpinUp({})

  const res = await handleXenditWebhook(paidWebhookRequest('xnd_inv_123'), {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
  })

  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok: boolean }
  assert.equal(body.ok, true)

  // Subscription transitioned pending → active
  const sub = db.state.subscriptions[0]
  assert.equal(sub.status, 'active')
  assert.equal(sub.hosting_active, true)
  assert.ok(sub.next_billing_at, 'next_billing_at set')

  // Subscription invoice marked paid
  assert.equal(db.state.invoiceMarks.length, 1)
  assert.equal(db.state.invoiceMarks[0].xenditInvoiceId, 'xnd_inv_123')
  assert.equal(db.state.invoiceMarks[0].status, 'paid')

  // Starter tier → credits added
  assert.equal(db.state.creditsAdds.length, 1)
  assert.equal(db.state.creditsAdds[0].cents, 300)

  // Provisioning called once with correct payload
  assert.equal(prov.spinUpCalls, 1)

  // VPS create was invoked with starter spec
  const created = prov.vps.listAll()
  assert.equal(created.length, 1)

  // Welcome ("halo") is now sent by the setup script running ON the VM via
  // direct curl to Telegram (proof-of-life mechanism), NOT by our broker.
  // So broker.sentMessages stays empty on happy path. (Pre-pivot it sent
  // a "agent kamu hidup / BotFather" message; SSH-pivot moves that
  // responsibility into setup-script.ts.)
  assert.equal(prov.broker.sentMessages.length, 0, 'no broker messages on happy path — halo via VM-side curl')
})

// ──────────────────────────────────────────────────────────
// Scenario 2: idempotency
// ──────────────────────────────────────────────────────────

test('idempotency: same PAID webhook delivered twice → side-effects fire once', async () => {
  const db = makeFakeInvoiceStore({ subscriptions: [pendingSubscription()] })
  const prov = makeProvisioningWiredToSpinUp({})

  const r1 = await handleXenditWebhook(paidWebhookRequest('xnd_inv_123'), {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(r1.status, 200)

  // Second delivery (Xendit retry simulation)
  const r2 = await handleXenditWebhook(paidWebhookRequest('xnd_inv_123'), {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(r2.status, 200)
  const body2 = (await r2.json()) as { ok: boolean; idempotent?: boolean }
  assert.equal(body2.idempotent, true)

  // Provisioning ONLY called once
  assert.equal(prov.spinUpCalls, 1)

  // Credits added ONLY once
  assert.equal(db.state.creditsAdds.length, 1)

  // VPS created ONLY once
  assert.equal(prov.vps.listAll().length, 1)
})

// ──────────────────────────────────────────────────────────
// Scenario 3: provisioning HTTP fail → subscription pending_provision +
// alert + 200 (no Xendit retry-storm; payment is real)
// ──────────────────────────────────────────────────────────

test('provisioning HTTP fail: alert sent, subscription pending_provision, webhook 200 (no retry)', async () => {
  const db = makeFakeInvoiceStore({ subscriptions: [pendingSubscription()] })
  const prov = makeProvisioningWiredToSpinUp({ shouldFail: true })

  const alerts: { chatId: string; text: string }[] = []

  const res = await handleXenditWebhook(paidWebhookRequest('xnd_inv_123'), {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
    alertChatId: 'richie-chat',
    alertSend: async (chatId, text) => {
      alerts.push({ chatId, text })
    },
  })

  // Webhook returns 200 — payment is real, don't have Xendit retry-storm us.
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok: boolean; provision_deferred?: boolean }
  assert.equal(body.ok, true)
  assert.equal(body.provision_deferred, true)

  // Subscription parked for retry worker; payment side persists as paid.
  const sub = db.state.subscriptions[0]
  assert.equal(sub.status, 'pending_provision')
  assert.equal(sub.hosting_active, false, 'hosting_active rolled back — no VPS exists')
  assert.equal(db.state.invoiceMarks[0].status, 'paid')

  // Founder alerted
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].chatId, 'richie-chat')
  assert.match(alerts[0].text, /provisioning alert/)
  assert.match(alerts[0].text, /cust_pelanggan@example.id/)
  assert.match(alerts[0].text, /pending_provision/)

  // The downstream broker also got the spinUp's own alert about VPS create failure
  assert.ok(prov.broker.sentMessages.some((m) => /provisioning alert/.test(m.text)))
})

// ──────────────────────────────────────────────────────────
// Scenario 3b: provisioning THROWS (network error) — was the actual
// production failure mode on 2026-05-02 (PROVISIONING_URL unreachable).
// Previously crashed the function with EDGE_FUNCTION_ERROR / 500.
// ──────────────────────────────────────────────────────────

test('provisioning throws (network error): subscription pending_provision, alert sent, webhook 200', async () => {
  const db = makeFakeInvoiceStore({ subscriptions: [pendingSubscription()] })
  const throwingProv: IProvisioningClient = {
    async spinUp() {
      throw new TypeError('fetch failed')
    },
  }
  const alerts: { chatId: string; text: string }[] = []

  const res = await handleXenditWebhook(paidWebhookRequest('xnd_inv_123'), {
    db,
    provisioning: throwingProv,
    webhookToken: WEBHOOK_TOKEN,
    alertChatId: 'richie-chat',
    alertSend: async (chatId, text) => {
      alerts.push({ chatId, text })
    },
  })

  assert.equal(res.status, 200)
  const sub = db.state.subscriptions[0]
  assert.equal(sub.status, 'pending_provision')
  assert.equal(sub.hosting_active, false, 'hosting_active rolled back — no VPS exists')
  assert.equal(db.state.invoiceMarks[0].status, 'paid')
  assert.equal(alerts.length, 1)
  assert.match(alerts[0].text, /threw: fetch failed/)
  assert.match(alerts[0].text, /pending_provision/)
})

// ──────────────────────────────────────────────────────────
// Bonus: signature rejection
// ──────────────────────────────────────────────────────────

test('webhook rejects bad x-callback-token with 401', async () => {
  const db = makeFakeInvoiceStore({ subscriptions: [pendingSubscription()] })
  const prov = makeProvisioningWiredToSpinUp({})

  const req = new Request('http://test.local/xendit-webhook', {
    method: 'POST',
    headers: { 'x-callback-token': 'WRONG', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'xnd_inv_123', external_id: 'x', status: 'PAID' }),
  })

  const res = await handleXenditWebhook(req, {
    db,
    provisioning: prov,
    webhookToken: WEBHOOK_TOKEN,
  })

  assert.equal(res.status, 401)
  assert.equal(prov.spinUpCalls, 0)
  assert.equal(db.state.creditsAdds.length, 0)
})
