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
  /** Sesi B P0 #7 (2026-05-12): customer lookup by id for receipt email. */
  findCustomerById(
    customerId: string,
  ): Promise<{ id: string; email: string; display_name: string | null } | null>
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

  /**
   * HF-1 (2026-05-12): wipe stale pair state on `customers` row.
   * Called by xendit-webhook.handlePaid on every pending → active
   * subscription transition. Founder Q1 lock: "new subscription = clean
   * wipe" — covers BOTH the email-reused test case AND the renewed-
   * after-cancel case. The idempotent retry path (already-active sub)
   * short-circuits BEFORE this is called, so persona-refresh flow
   * preserved.
   *
   * Wipes (per founder cascade brief):
   *   - telegram_bot_token (encrypted column)
   *   - telegram_bot_username
   *   - telegram_chat_id
   *   - soul_md_text
   *   - pairing_code
   *   - pairing_code_expires_at
   *
   * Service-role only; anon callers can't trigger this through any path.
   * Best-effort: caller (xendit-webhook handler) catches throws so a
   * wipe failure does not turn into a 5xx that would Xendit-retry.
   */
  clearStalePairState(customerId: string): Promise<void>

  /**
   * Phase E Option 2 part 2 (2026-05-14): decrypt the customer's
   * existing bot token. Returns null when customer has no stored token
   * (new customer) or when decryption fails for any reason (production
   * stores wrap pgcrypto's decrypt RPC — best-effort). Called by
   * xendit-webhook-handler BEFORE clearStalePairState to snapshot the
   * pre-wipe value, which is then passed to spinUp as
   * customerTelegramBotToken so setup-script's hasTelegram=true branch
   * starts the gateway directly (avoids the refresh-env race that bit
   * Renita 2026-05-14).
   *
   * Throws are caught + treated as null by the caller — a snapshot
   * failure must NOT block the webhook from returning 200.
   */
  getDecryptedBotToken(customerId: string): Promise<string | null>

  /**
   * Sesi D pass-3 P0 (2026-05-13): append one row to the consent_events
   * table. Called by create-invoice for both 'tos' (required) and
   * 'marketing' (optional) acceptance. The handler captures
   * ip_address + user_agent from request headers and forwards them
   * here so we satisfy UU PDP Art. 22(1)'s "demonstrate consent"
   * requirement + give Xendit chargeback evidence we can produce.
   *
   * Service-role only; the consent_events table is RLS-locked.
   */
  insertConsentEvent(input: {
    customer_id: string
    consent_type: 'tos' | 'marketing'
    accepted_at: string  // ISO8601
    ip_address: string | null
    user_agent: string | null
    version?: string  // policy version; defaults to 'v1.0' at DB level
  }): Promise<{ id: string }>
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
  /** Persona selection (2026-05-17): the persona slug the customer chose
   *  at onboarding — one of personasForTier(tier). Defaults to 'the-pro'
   *  at the DB level (migration 20260517000000) so a pre-picker customer
   *  row is never null. complete-onboarding validates the submitted slug
   *  against the tier before persisting it here, then threads it into
   *  spinUp + renderSoulMd. */
  agent_slug: string
  /** Bug-1 fix (2026-05-16): set the first time the proactive greeting
   *  is delivered. Idempotency guard so the greeting fires exactly once
   *  whether complete-onboarding's happy path OR the provisioning
   *  second-finisher (admin-customer-vps-refresh) is the one that
   *  completes the gateway-start sequence. Null = not yet greeted. */
  greeting_sent_at: string | null
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

  /**
   * Wait-page race fix (2026-05-16). Returns the status of the
   * customer's vps_instances row, or null when no row exists yet.
   *
   * complete-onboarding-handler gates its step-8a refreshEnv on this.
   * refreshEnv SSHes the VPS + runs the install-if-missing block, which
   * hits `exit 4` when the setup-script hasn't installed the hermes
   * binary yet (status still 'provisioning'). A fast customer who
   * finishes the onboarding form (~2 min) before their VPS finishes
   * provisioning (~6 min) would trip that race → gateway never starts →
   * welcome.html stuck on the provisioning view forever. When
   * status !== 'running' the handler DEFERS refreshEnv; the provisioning
   * service runs it itself the moment the setup-script completes
   * (customer-flow.ts notifyVpsReady → admin-customer-vps-refresh).
   *
   * Service-role read; one row per customer (vps_instances.customer_id
   * unique post-PR #75).
   */
  getActiveVPSStatus(
    customer_id: string,
  ): Promise<'provisioning' | 'running' | 'stopped' | 'failed' | null>

  /**
   * Bug-1 fix (2026-05-16): stamp customers.greeting_sent_at = now().
   * Called once, by whichever path actually delivers the proactive
   * greeting (complete-onboarding step 8c OR the admin-customer-vps-
   * refresh second-finisher). The other path reads greeting_sent_at on
   * the customer row and skips when it is already set — so the customer
   * is greeted exactly once. Idempotent: a second call just re-stamps.
   */
  markGreetingSent(customer_id: string): Promise<void>
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
  /** Persona selection (2026-05-17): the customer's chosen persona slug.
   *  Provisioning forwards this to the /spin-up route → spinUpCustomer's
   *  opts.agentSlug → setup-script WEUSEAI_AGENT_SLUG, which drives which
   *  bundle the VPS's bundle-pull fetches as the primary persona.
   *  Optional for back-compat; complete-onboarding always supplies it
   *  post-picker (defaults to 'the-pro' when omitted, downstream). */
  agentSlug?: string
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
  envValues: {
    TELEGRAM_BOT_TOKEN?: string
    // Phase E Option 2 part 1 (2026-05-14): TELEGRAM_ALLOWED_USERS
    // gets pushed alongside TELEGRAM_BOT_TOKEN by the admin handler
    // when the customer has a telegram_chat_id. Without it, Hermes
    // gateway restarts with a bot token but denies every customer
    // /start (Renita Stage 5 bug class). The atomic write semantics
    // are guaranteed by the refresh-env bash script's `set -euo pipefail`
    // gate — restart happens only if all rewrites succeed.
    TELEGRAM_ALLOWED_USERS?: string
    // Same value, two names: Hermes's primary chat path reads
    // OPENAI_API_KEY; auxiliary tasks (compression / title generation)
    // read OPENROUTER_API_KEY. Both should be set to the OpenRouter
    // sub-key to silence aux warnings on every message (2026-05-12).
    OPENAI_API_KEY?: string
    OPENROUTER_API_KEY?: string
    // Bug-2 fix (2026-05-16): TELEGRAM_HOME_CHANNEL is the customer's
    // own chat_id. Hermes upstream reads this env var (gateway/config.py
    // load_gateway_config) and sets it as the platform home channel —
    // which (a) suppresses the "No home channel is set for Telegram…
    // type /sethome" prompt that otherwise leaks to the customer on
    // first message, and (b) makes cron / cross-platform delivery route
    // to their chat. Config-only — no upstream Hermes patch.
    TELEGRAM_HOME_CHANNEL?: string
  }
  /** Optional: SOUL.md persona content. When provided, written to
   *  /home/weuseai/.hermes/SOUL.md on the VPS before hermes-gateway
   *  restart. Closes the dry-run Stage 7 gap (xendit-webhook's first
   *  spinUp doesn't have soulMdContent yet, so SOUL.md was empty on
   *  disk — Hermes had no persona to load on first start). */
  soulMdContent?: string
  /** Optional: pre-approve customer's Telegram chat_id. When provided,
   *  written into /home/weuseai/.hermes/pairing/telegram-approved.json
   *  before hermes-gateway restart so the customer's first /start
   *  lands directly on the in-character agent (skips Hermes upstream's
   *  pairing-code prompt). Idempotent. */
  telegramChatId?: string
  /** Optional: cosmetic display name for the pre-approve entry.
   *  Defaults to 'Customer' when omitted. */
  telegramUserName?: string
  /** Caller-supplied UUID for idempotency. Same id within 10 min →
   *  cached outcome instead of re-SSH. */
  requestId: string
}

export type RefreshEnvResult =
  | {
      ok: true
      vpsId: string
      ipAddress: string
      applied: {
        TELEGRAM_BOT_TOKEN?: 'updated' | 'unchanged'
        TELEGRAM_ALLOWED_USERS?: 'updated' | 'unchanged'
        TELEGRAM_HOME_CHANNEL?: 'updated' | 'unchanged'
        OPENAI_API_KEY?: 'updated' | 'unchanged'
        OPENROUTER_API_KEY?: 'updated' | 'unchanged'
      }
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
