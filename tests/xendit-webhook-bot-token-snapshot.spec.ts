/**
 * Phase E Option 2 part 2 (2026-05-14): xendit-webhook handler snapshots
 * customers.telegram_bot_token BEFORE clearStalePairState wipes it, and
 * passes that snapshot to provisioning.spinUp as customerTelegramBotToken.
 *
 * Root cause this closes: pre-Phase-E xendit-webhook hardcoded
 * `customerTelegramBotToken: ''` (line 160 of xendit-webhook-handler.ts).
 * The setup-script's `hasTelegram = Boolean(p.telegramBotToken)` branch
 * therefore ALWAYS evaluated false on first spin-up, so the gateway was
 * installed-but-not-started, and the flow depended on complete-onboarding
 * calling refresh-env later. That refresh-env race (Phase A forensic /
 * PR #118) is the root cause of Renita being stuck.
 *
 * Fix: when the customer already has a bot token stored (existing-
 * customer re-subscribe case), pass it through to spin-up so the
 * setup-script starts the gateway directly. The refresh-env handshake
 * becomes optional rather than required.
 *
 * Critical ordering invariant: snapshot MUST run BEFORE clearStalePairState
 * wipe. After the wipe, customers.telegram_bot_token is null. This test
 * file is the drift gate for that ordering.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleXenditWebhook } from '../supabase/functions/_shared/xendit-webhook-handler.ts'
import type {
  IInvoiceStore,
  IProvisioningClient,
  SubscriptionRow,
} from '../supabase/functions/_shared/types.ts'

// The xendit-webhook handler talks to IProvisioningClient.spinUp,
// whose input is an inline anonymous shape with customerTelegramBotToken
// (distinct from the higher-level SpinUpInput type used by the spin-up-
// customer flow). Derive it from the interface so the test stays in
// lockstep with any future widening.
type WebhookSpinUpInput = Parameters<IProvisioningClient['spinUp']>[0]

const WEBHOOK_TOKEN = 'test-webhook-secret'

function paidRequest(invoiceId: string): Request {
  return new Request('http://test.local/xendit-webhook', {
    method: 'POST',
    headers: {
      'x-callback-token': WEBHOOK_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: invoiceId,
      external_id: `ext_${invoiceId}`,
      status: 'PAID',
      paid_at: '2026-05-14T12:30:00Z',
      payment_method: 'QRIS',
      amount: 1_290_000,
    }),
  })
}

type StoreState = {
  events: Array<{ kind: 'getDecryptedBotToken' | 'clearStalePairState'; cid: string }>
  decryptedTokensByCid: Map<string, string | null>
  decryptThrowsForCid?: string
}

function makeStore(opts: {
  sub: SubscriptionRow
  decryptedTokensByCid?: Record<string, string | null>
  decryptThrowsForCid?: string
}): IInvoiceStore & { state: StoreState } {
  const subs = [opts.sub]
  const state: StoreState = {
    events: [],
    decryptedTokensByCid: new Map(Object.entries(opts.decryptedTokensByCid ?? {})),
    decryptThrowsForCid: opts.decryptThrowsForCid,
  }
  return {
    state,
    async findCustomerByEmail() { return null },
    async findCustomerById() { return null },
    async insertCustomer({ email }) { return { id: `cust_${email}`, email } },
    async findSubscriptionByXenditInvoiceId(id) {
      return subs.find((s) => s.xendit_invoice_id === id) ?? null
    },
    async insertSubscription() { throw new Error('not used') },
    async updateSubscription(id, patch) {
      const i = subs.findIndex((s) => s.id === id)
      subs[i] = { ...subs[i], ...patch }
      return subs[i]
    },
    async insertSubscriptionInvoice() { return { id: 'si_test' } },
    async markSubscriptionInvoicePaid() {},
    async markSubscriptionInvoiceFailed() {},
    async addStarterCredits() {},
    async clearStalePairState(customerId: string) {
      state.events.push({ kind: 'clearStalePairState', cid: customerId })
      // Mirror prod: AFTER wipe, decrypted bot token returns null.
      state.decryptedTokensByCid.set(customerId, null)
    },
    async insertConsentEvent() { return { id: 'consent_stub' } },
    async getDecryptedBotToken(customerId: string) {
      state.events.push({ kind: 'getDecryptedBotToken', cid: customerId })
      if (state.decryptThrowsForCid === customerId) {
        throw new Error('fake-store: simulated decrypt failure')
      }
      return state.decryptedTokensByCid.get(customerId) ?? null
    },
  } as IInvoiceStore & { state: StoreState }
}

function makeProvisioning(): IProvisioningClient & { calls: WebhookSpinUpInput[] } {
  const calls: WebhookSpinUpInput[] = []
  return {
    calls,
    async spinUp(input: WebhookSpinUpInput) {
      calls.push(input)
      return { ok: true }
    },
  } as IProvisioningClient & { calls: WebhookSpinUpInput[] }
}

function pendingSub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub_under_test',
    customer_id: 'cust_under_test',
    tier: 'pro',
    status: 'pending',
    xendit_invoice_id: 'xnd_inv_42',
    always_on_enabled: false,
    hosting_active: false,
    next_billing_at: null,
    ...overrides,
  }
}

// ─── Case A: existing customer (had bot token) → snapshot → spinUp ──

test('Phase E P2: existing-customer bot token survives wipe via snapshot, passed to spinUp', async () => {
  const db = makeStore({
    sub: pendingSub(),
    decryptedTokensByCid: {
      cust_under_test: '12345:plaintext_existing_bot_token',
    },
  })
  const provisioning = makeProvisioning()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  // spinUp was called with the snapshotted token, NOT an empty string.
  assert.equal(provisioning.calls.length, 1)
  assert.equal(
    provisioning.calls[0]!.customerTelegramBotToken,
    '12345:plaintext_existing_bot_token',
    'spinUp must receive the pre-wipe snapshot — without this the setup-script\'s ' +
      'hasTelegram=true branch never fires for re-subscribe customers (Renita class).',
  )
})

// ─── Case B: new customer (no bot token) → spinUp called with empty string ──

test('Phase E P2: new-customer (no bot token) → spinUp gets empty string (back-compat)', async () => {
  const db = makeStore({
    sub: pendingSub({ customer_id: 'cust_new' }),
    // No entry in decryptedTokensByCid → getDecryptedBotToken returns null.
  })
  const provisioning = makeProvisioning()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200)
  // setup-script's hasTelegram=false branch fires (preserves current new-customer
  // behavior: install gateway, defer start to refresh-env).
  assert.equal(provisioning.calls[0]!.customerTelegramBotToken, '')
})

// ─── Case C: decrypt throws → still proceed with empty token (best-effort) ──

test('Phase E P2: decrypt failure does NOT block webhook — falls back to empty token', async () => {
  // Hostile case: pgcrypto RPC throws, network blip, etc. The wipe + spinUp
  // must still run so Xendit doesn't see a 5xx and retry-storm us. The
  // snapshot is a "best-effort optimisation," not a contract.
  const db = makeStore({
    sub: pendingSub(),
    decryptThrowsForCid: 'cust_under_test',
  })
  const provisioning = makeProvisioning()
  const res = await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  assert.equal(res.status, 200, 'webhook must succeed despite decrypt failure')
  assert.equal(provisioning.calls.length, 1, 'spinUp still fires')
  assert.equal(
    provisioning.calls[0]!.customerTelegramBotToken,
    '',
    'token falls back to empty string on decrypt failure (refresh-env recovers later)',
  )
})

// ─── Case D: ordering invariant — snapshot BEFORE wipe ──

test('Phase E P2: getDecryptedBotToken runs BEFORE clearStalePairState (ordering drift gate)', async () => {
  const db = makeStore({
    sub: pendingSub(),
    decryptedTokensByCid: { cust_under_test: '12345:order_test' },
  })
  const provisioning = makeProvisioning()
  await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  const decryptIdx = db.state.events.findIndex(
    (e) => e.kind === 'getDecryptedBotToken' && e.cid === 'cust_under_test',
  )
  const wipeIdx = db.state.events.findIndex(
    (e) => e.kind === 'clearStalePairState' && e.cid === 'cust_under_test',
  )
  assert.ok(decryptIdx >= 0, 'decrypt must be called')
  assert.ok(wipeIdx >= 0, 'wipe must still run (HF-1 invariant)')
  assert.ok(
    decryptIdx < wipeIdx,
    'getDecryptedBotToken MUST happen BEFORE clearStalePairState. ' +
      'After the wipe, the bot token is gone — a post-wipe snapshot would always read null ' +
      'and Option 2 part 2 would be a no-op.',
  )
})

// ─── Case E: HF-1 wipe invariant preserved ──────────────────────────

test('Phase E P2: wipe still fires in all cases (HF-1 invariant preserved)', async () => {
  // The new snapshot must NOT bypass the wipe.
  const db = makeStore({
    sub: pendingSub(),
    decryptedTokensByCid: { cust_under_test: '12345:has_token' },
  })
  const provisioning = makeProvisioning()
  await handleXenditWebhook(paidRequest('xnd_inv_42'), {
    db,
    provisioning,
    webhookToken: WEBHOOK_TOKEN,
  })
  const wipes = db.state.events.filter((e) => e.kind === 'clearStalePairState')
  assert.equal(wipes.length, 1, 'HF-1: wipe runs on every pending→active transition')
})
