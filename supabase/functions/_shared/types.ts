// Shared types for create-invoice and xendit-webhook.
// Pure TypeScript — works in Deno (Edge Functions) and Node (tests).

export type Tier = 'starter' | 'pro' | 'studio'

export type PlanCatalog = Record<
  Tier,
  { setupIdr: number; setupOldIdr: number; displayName: string }
>

// Server-authoritative pricing — single source of truth, matches CLAUDE.md
// Business Model v1.1. Front-end PLANS object must mirror these numbers
// (display only; charge amount is recomputed here per request).
export const PLANS: PlanCatalog = {
  starter: { setupIdr: 299_000, setupOldIdr: 588_000, displayName: 'Starter' },
  pro: { setupIdr: 1_200_000, setupOldIdr: 3_500_000, displayName: 'Pro' },
  studio: { setupIdr: 4_900_000, setupOldIdr: 9_900_000, displayName: 'Studio' },
}

export const HOSTING_MONTHLY_IDR = 99_000
export const ALWAYS_ON_MONTHLY_IDR = 49_000
export const STARTER_CREDITS_USD_CENTS = 300

export type PaymentMethodId = 'qris' | 'va' | 'card' | 'cicilan' | 'ewallet' | 'bnpl'

export type PaymentMethodFee = { pct: number; flat: number }

// Mirror of METHODS in checkout.html — fees are server-authoritative.
export const PAYMENT_METHOD_FEES: Record<PaymentMethodId, PaymentMethodFee> = {
  qris: { pct: 0.7, flat: 0 },
  va: { pct: 0, flat: 4000 },
  card: { pct: 2.9, flat: 2000 },
  cicilan: { pct: 3.5, flat: 2000 },
  ewallet: { pct: 2.0, flat: 0 },
  bnpl: { pct: 3.0, flat: 0 },
}

// Minimal data-store shape needed by Edge Function handlers. Production wires
// to @supabase/supabase-js; tests inject a fake.
export interface IInvoiceStore {
  findCustomerByEmail(email: string): Promise<{ id: string; email: string } | null>
  insertCustomer(input: {
    email: string
    display_name?: string
  }): Promise<{ id: string; email: string }>

  findSubscriptionByXenditInvoiceId(
    xenditInvoiceId: string,
  ): Promise<SubscriptionRow | null>
  insertSubscription(input: {
    customer_id: string
    tier: Tier
    always_on_enabled: boolean
    status: 'pending' | 'active' | 'failed'
    xendit_invoice_id?: string
  }): Promise<SubscriptionRow>
  updateSubscription(
    id: string,
    patch: Partial<SubscriptionRow>,
  ): Promise<SubscriptionRow>

  insertSubscriptionInvoice(input: {
    subscription_id: string
    customer_id: string
    xendit_invoice_id: string
    kind: 'setup_first_month' | 'monthly_hosting' | 'monthly_always_on'
    amount_idr: number
    status: 'pending' | 'paid'
  }): Promise<{ id: string }>
  markSubscriptionInvoicePaid(xenditInvoiceId: string): Promise<void>
  markSubscriptionInvoiceFailed(
    xenditInvoiceId: string,
    status: 'expired' | 'failed',
  ): Promise<void>

  addStarterCredits(customerId: string, cents: number): Promise<void>
}

export type SubscriptionRow = {
  id: string
  customer_id: string
  tier: Tier
  status: 'pending' | 'active' | 'pending_provision' | 'paused' | 'canceled' | 'failed'
  xendit_invoice_id: string | null
  always_on_enabled: boolean
  hosting_active: boolean
  next_billing_at: string | null
}

export interface IXenditClient {
  createInvoice(input: {
    externalId: string
    amount: number
    payerEmail: string
    description: string
    paymentMethods: string[]
    fees: { type: 'ADMIN'; value: number }[]
    successRedirectUrl: string
    failureRedirectUrl: string
    metadata: Record<string, unknown>
  }): Promise<{ invoiceId: string; invoiceUrl: string }>
}

export interface IProvisioningClient {
  spinUp(input: {
    customerId: string
    tier: Tier
    customerTelegramBotToken?: string
    customerTelegramAllowedUserIds?: string
    alwaysOnEnabled: boolean
    useStarterCredits: boolean
  }): Promise<{ ok: true } | { ok: false; status: number; body: string }>
}

// Webhook event subset — Xendit sends many fields; we only need these.
export type XenditInvoiceEvent = {
  id: string
  external_id: string
  status: 'PAID' | 'EXPIRED' | 'FAILED' | string
  paid_at?: string
  payment_method?: string
  amount?: number
}

// ─────────────────────────────────────────────────────────
// Onboarding flow (Phase 1 post-payment)
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
// ─────────────────────────────────────────────────────────

// Customer row — the slice of `customers` the onboarding handlers read/write.
// Not every column is included; only what these handlers need.
export type CustomerRow = {
  id: string
  email: string
  display_name: string | null
  whatsapp_number: string | null
  telegram_chat_id: string | null
  pairing_code: string | null
  pairing_code_expires_at: string | null   // ISO timestamp
  soul_md_text: string | null
}

// Data-store contract for the onboarding handlers.
// Production wires to @supabase/supabase-js; tests inject a fake.
export interface IOnboardingStore {
  findCustomerById(id: string): Promise<CustomerRow | null>
  findCustomerByPairingCode(code: string): Promise<CustomerRow | null>

  // For idempotency check + spin-up payload (we need the tier + always_on).
  findActiveOrPendingSubscriptionByCustomer(
    customerId: string,
  ): Promise<SubscriptionRow | null>

  updateCustomer(
    id: string,
    patch: Partial<Omit<CustomerRow, 'id' | 'email'>>,
  ): Promise<CustomerRow>

  // Subscription status flip after provisioning succeeds.
  updateSubscription(
    id: string,
    patch: Partial<SubscriptionRow>,
  ): Promise<SubscriptionRow>

  // Audit-only row; never stores raw SOUL.md text.
  insertPersonaAudit(input: {
    customer_id: string
    soul_md_sha256: string
  }): Promise<{ id: number }>

  // Phase 2A table — tracks the OpenRouter key hash + spend cap per customer.
  insertCustomerOpenRouterKey(input: {
    customer_id: string
    openrouter_key_hash: string
    credit_limit_usd_cents: number
  }): Promise<void>
}

// ─── LLM key minter (decoupled from Phase 2A merge) ───
//
// Same contract as services/provisioning/src/llm/llm-key-minter.ts so the
// Node provisioning service and the Deno Edge Function can share mental
// models. Two implementations live in this directory:
//   - mock-llm-key-minter.ts  (default in dev, env LLM_MINTER_MODE=mock)
//   - openrouter-key-minter.ts (env LLM_MINTER_MODE=live)

export type MintKeyOpts = {
  /** Logical name, used as `customers.id` so we can find/revoke later. */
  name: string
  /** Spend cap in USD cents. starter=300 / pro=500 / studio=3000. */
  limitUsdCents: number
}

export type MintKeyResult = {
  /** The actual API key (secret). NEVER logged, only shipped to VPS. */
  key: string
  /** Stable identifier for revocation. Stored in customer_openrouter_keys. */
  hash: string
  limitUsdCents: number
}

export type RevokeResult = { ok: true }

export interface ILlmKeyMinter {
  mint(opts: MintKeyOpts): Promise<MintKeyResult>
  revoke(hash: string): Promise<RevokeResult>
}

// Tier → credit-cap map. Single source of truth. Used by complete-onboarding
// to translate `subscriptions.tier` into a mint limit.
export const TIER_CREDIT_USD_CENTS: Record<Tier, number> = {
  starter: 300,    // $3
  pro: 500,        // $5
  studio: 3000,    // $30
}

// ─── Telegram bot client (for webhook reply) ───
//
// The bot only ever sends text replies in Phase 1. Wider capabilities
// (inline keyboards, photos) live in Phase 2C if/when we need them.

export interface ITelegramClient {
  replyText(chatId: number | string, text: string): Promise<void>
}

// ─── Provisioning client (extended) ───
//
// The webhook-time `IProvisioningClient` above is missing the fields we
// need post-onboarding (telegramChatId, openrouterApiKey, soulMdContent).
// Define the richer shape here so both can coexist during the transition;
// the webhook-time variant will deprecate as soon as onboarding is the
// real entry point.

export type SpinUpInput = {
  customerId: string
  tier: Tier
  telegramChatId: string
  openrouterApiKey: string
  soulMdContent: string
  alwaysOnEnabled: boolean
}

export type SpinUpResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; body: string }

export interface IOnboardingProvisioningClient {
  spinUp(input: SpinUpInput): Promise<SpinUpResult>
}
