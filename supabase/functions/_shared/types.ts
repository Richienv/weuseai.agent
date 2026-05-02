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
