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
  starter: { setupIdr: 399_000, setupOldIdr: 699_000, displayName: 'Starter' },
  pro: { setupIdr: 1_290_000, setupOldIdr: 2_500_000, displayName: 'Pro' },
  studio: { setupIdr: 5_900_000, setupOldIdr: 10_900_000, displayName: 'Studio' },
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
//
// telegram_bot_token is intentionally OMITTED from this row even though the
// column exists. It's stored as pgcrypto ciphertext (per migration
// 20260509200000_telegram_bot_per_customer.sql) and the row would be a leak
// risk if accidentally serialized to logs. Access via dedicated store
// methods setBotTokenAndUsername / getDecryptedBotToken instead.
export type CustomerRow = {
  id: string
  email: string
  display_name: string | null
  whatsapp_number: string | null
  telegram_chat_id: string | null
  /** Plaintext, e.g. 'andyfounderbot'. Used for tg://resolve deeplink in
   *  onboarding Step 3. Set during validate-bot-token-handler. */
  telegram_bot_username: string | null
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

  // ─── Per-customer bot (Pair-flow Option A, 2026-05-09) ────────────────
  //
  // Set during validate-bot-token-handler (Step 2 of onboarding). The
  // token plaintext is encrypted via SQL helper encrypt_bot_token() before
  // landing in customers.telegram_bot_token. Username is plaintext.
  setBotTokenAndUsername(
    customer_id: string,
    bot_token_plaintext: string,
    bot_username: string,
  ): Promise<void>

  // Used by the provisioning service to write the customer's token to
  // their VPS .env. Calls SQL decrypt_bot_token(). Service-role only.
  // Returns null if the customer has no bot token set yet.
  getDecryptedBotToken(customer_id: string): Promise<string | null>

  // Wrong-bot recovery (2026-05-10 P0 fix): clears all three bot-pairing
  // fields atomically (telegram_bot_token, telegram_bot_username,
  // telegram_chat_id). Used by reset-bot-pairing edge fn so a customer
  // who pasted a wrong-bot token can re-paste a different one. Idempotent
  // — safe to call when fields are already null.
  clearBotPairing(customer_id: string): Promise<void>
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
// Phase 1 surface: replyText for the @weuseaibot pairing handler.
// Pair-flow Option A (2026-05-09) added per-token operations so the
// validate-bot-token-handler + pair-customer-bot-webhook + complete-
// onboarding-handler can:
//   - call getMe to validate a customer's freshly-pasted bot token
//   - setWebhook on the customer's own bot during the pairing window
//   - sendMessage as the customer's bot (pairing-success reply)
//   - deleteWebhook on the customer's bot before VPS provisioning so
//     Hermes can long-poll cleanly
// All per-token methods take an explicit `botToken` parameter rather
// than reading from env, since the customer's token is per-row.

export interface ITelegramClient {
  /** Reply via the platform's @weuseaibot token (from env). Legacy. */
  replyText(chatId: number | string, text: string): Promise<void>

  /** Call /getMe on an arbitrary token. Returns the bot's username +
   *  numeric id, or null if the token is invalid (Telegram returns
   *  401/404). Throws on unexpected network/server errors. */
  getMe(botToken: string): Promise<{ id: number; username: string } | null>

  /** Call /setWebhook on an arbitrary token. The webhook URL must be
   *  HTTPS. secret_token is sent back in `X-Telegram-Bot-Api-Secret-Token`
   *  header on every webhook delivery — verify it server-side. */
  setWebhook(input: {
    botToken: string
    url: string
    secretToken: string
    allowedUpdates?: string[]
  }): Promise<void>

  /** Call /deleteWebhook on an arbitrary token. Idempotent. */
  deleteWebhook(botToken: string): Promise<void>

  /** Call /getWebhookInfo on an arbitrary token. Used by
   *  properDeleteWebhook to verify a delete actually cleared the
   *  webhook (Telegram's deleteWebhook is "fire and forget" — there
   *  are observed cases where it returns ok but the webhook url is
   *  still set on subsequent reads). Returns at minimum `{ url: '' }`
   *  when no webhook is configured. */
  getWebhookInfo(botToken: string): Promise<{ url: string }>

  /** Send text as a specific bot. Used for the pairing-success reply
   *  on the customer's own bot. */
  sendMessageAs(
    botToken: string,
    chatId: number | string,
    text: string,
  ): Promise<void>

  /** Phase 5-5b: send text + inline keyboard markup as a specific bot.
   *  Used by approval-queue post-create dispatch to surface Approve/Reject
   *  buttons to the customer. `replyMarkup` is the Telegram Bot API
   *  `reply_markup` payload (e.g. { inline_keyboard: [[...]] }). */
  sendMessageWithButtonsAs(
    botToken: string,
    chatId: number | string,
    text: string,
    replyMarkup: { inline_keyboard: { text: string; callback_data: string }[][] },
  ): Promise<void>

  /** Phase 5-5b: answer a callback_query (acknowledges the button press
   *  so Telegram dismisses the loading state). Optional `text` shows a
   *  brief toast on the customer's screen. */
  answerCallbackQuery(input: {
    botToken: string
    callbackQueryId: string
    text?: string
  }): Promise<void>
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
  /** Customer's own bot token (per Option A — pair-flow 2026-05-09).
   *  Provisioning writes this to /home/weuseai/.hermes/.env as
   *  TELEGRAM_BOT_TOKEN, replacing the legacy shared @weuseaibot token.
   *  Hermes long-polls THIS bot, not @weuseaibot. */
  telegramBotToken: string
  openrouterApiKey: string
  soulMdContent: string
  alwaysOnEnabled: boolean
}

export type SpinUpResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; body: string }

// Track 3b (2026-05-10): self-healing for cloud-init env drift.
// Caller (complete-onboarding step 8a, admin rescue) supplies the
// env values directly — provisioning service is a "dumb pipe", does
// NOT decrypt or source values. Per the pivot in design doc:
// docs/design/2026-05-10-vps-config-refresh.md.
export type RefreshEnvInput = {
  customerId: string
  envValues: { TELEGRAM_BOT_TOKEN?: string; OPENROUTER_API_KEY?: string }
  /** Caller-supplied UUID for idempotency. Same id within 10 min →
   *  cached outcome instead of re-SSH. */
  requestId: string
}

export type RefreshEnvResult =
  | {
      ok: true
      vpsId: string
      ipAddress: string
      applied: { TELEGRAM_BOT_TOKEN?: 'updated' | 'unchanged'; OPENROUTER_API_KEY?: 'updated' | 'unchanged' }
      hermesRestartAt: string
    }
  | {
      ok: false
      status: number
      body: string
      error?: string
    }

export interface IOnboardingProvisioningClient {
  spinUp(input: SpinUpInput): Promise<SpinUpResult>
  /** Track 3b 2026-05-10: refresh customer's VPS .env + restart hermes
   *  to close the spinUp-idempotency-doesn't-update-env gap. */
  refreshEnv(input: RefreshEnvInput): Promise<RefreshEnvResult>
}
