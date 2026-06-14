// Pure handler for xendit-webhook. Web Platform APIs only.

import { constantTimeEqual } from './constant-time-equal.ts'
import { buildPaymentReceiptEmailBody } from './email-delivery.ts'
import {
  STARTER_CREDITS_USD_CENTS,
  type IInvoiceStore,
  type IProvisioningClient,
  type SubscriptionRow,
  type XenditInvoiceEvent,
} from './types.ts'

/**
 * Sesi B P0 #7 (2026-05-12): optional receipt-email dep.
 *
 * Signature matches what the handler needs (resolved email body + recipient).
 * Default impl in supabase/functions/xendit-webhook/index.ts wires this to
 * sendEmail() in email-delivery.ts — that module is stub-tolerant when
 * RESEND_API_KEY is missing, so this dep can stay set in all environments.
 */
export type SendReceiptEmailFn = (args: {
  to: string
  subject: string
  text: string
}) => Promise<{ ok: boolean }>

/**
 * Xendit API-key mode. Drives the prod-readiness seam in the token check.
 *
 * Xendit uses the SAME `x-callback-token` verification scheme in test and
 * live mode — see the doc citation on `verifyCallbackToken()` below — but
 * the secret VALUE rotates per environment: the test-mode dashboard issues
 * one Verification Token, the live-mode dashboard issues another. The mode
 * here lets us (a) refuse to run prod traffic against an unset/blank token
 * and (b) emit the env tag in the structured rejection log so a
 * cross-environment misconfig (live key + stale test token, or vice-versa)
 * is visible the moment the first real webhook lands.
 *
 * Resolved upstream from `XENDIT_API_KEY`'s prefix:
 *   `xnd_production_*` → 'live', anything else (incl. `xnd_development_*`,
 *   unset) → 'test'. See xendit-webhook/index.ts.
 */
export type XenditKeyMode = 'test' | 'live'

export type WebhookDeps = {
  db: IInvoiceStore
  provisioning: IProvisioningClient
  webhookToken: string
  /**
   * Which Xendit environment the configured API key targets. Optional for
   * back-compat — callers that omit it default to 'test', matching the
   * founder-locked test-mode posture (CLAUDE.md § Deferred gate). When the
   * key rotates to `xnd_production_*`, index.ts passes 'live' and the SAME
   * token check applies (Xendit's scheme is mode-agnostic), just with the
   * stricter empty-token guard and the env tag in reject logs.
   */
  keyMode?: XenditKeyMode
  alertChatId?: string
  alertSend?: (chatId: string, text: string) => Promise<void>
  /**
   * Optional. When provided AND the customer row carries an email
   * address, a receipt is sent on the PAID branch (best-effort — any
   * throw is caught + ignored so Xendit doesn't see a 5xx).
   */
  sendReceiptEmail?: SendReceiptEmailFn
  now?: () => Date
}

export async function handleXenditWebhook(
  req: Request,
  deps: WebhookDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Every call MUST carry a valid x-callback-token. Reject (401) with a
  // structured log otherwise — same gate in test and live mode.
  const authError = verifyCallbackToken(req, deps)
  if (authError) return authError

  let event: XenditInvoiceEvent
  try {
    event = (await req.json()) as XenditInvoiceEvent
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!event.id || !event.external_id || !event.status) {
    return json({ error: 'invalid_event' }, 400)
  }

  // Idempotency lookup
  const existing = await deps.db.findSubscriptionByXenditInvoiceId(event.id)
  if (!existing) {
    // Webhook for an invoice we don't know about — possibly a top-up via
    // credit_topups, not in scope here. Acknowledge so Xendit stops retrying.
    return json({ ok: true, ignored: 'unknown_invoice' })
  }

  if (existing.status === 'active' && event.status === 'PAID') {
    return json({ ok: true, idempotent: true })
  }
  if (existing.status === 'failed' && event.status !== 'PAID') {
    return json({ ok: true, idempotent: true })
  }

  if (event.status === 'PAID') {
    return await handlePaid(event, existing, deps)
  }
  if (event.status === 'EXPIRED' || event.status === 'FAILED') {
    return await handleFailed(event, existing, deps)
  }

  return json({ ok: true, ignored: `status_${event.status}` })
}

async function handlePaid(
  event: XenditInvoiceEvent,
  subscription: SubscriptionRow,
  deps: WebhookDeps,
): Promise<Response> {
  const now = deps.now?.() ?? new Date()
  const nextBilling = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Phase E Option 2 part 2 (2026-05-14): snapshot the customer's
  // existing bot token BEFORE the wipe. When an existing customer
  // re-subscribes (their previous pair state is about to be wiped by
  // HF-1 below), we want spinUp to receive the OLD bot token so
  // setup-script's hasTelegram=true branch starts the gateway directly.
  // This skips the refresh-env round-trip that races setup-script
  // (PR #118 forensic — Renita's stuck-bot bug).
  //
  // Ordering matters: snapshot BEFORE wipe. After clearStalePairState
  // runs, telegram_bot_token is null in the DB and getDecryptedBotToken
  // would always return null — defeating the purpose. The
  // tests/xendit-webhook-bot-token-snapshot.spec.ts ordering drift gate
  // pins this.
  //
  // Best-effort: any throw or null is treated as "no existing token,"
  // and we pass '' to spinUp (the pre-Phase-E behavior). A snapshot
  // failure must NEVER block the webhook from returning 200 — Xendit
  // would otherwise retry-storm us.
  let existingBotToken = ''
  try {
    const snap = await deps.db.getDecryptedBotToken(subscription.customer_id)
    if (snap && typeof snap === 'string' && snap.length > 0) {
      existingBotToken = snap
    }
  } catch (err) {
    console.error(
      `[xendit-webhook] getDecryptedBotToken snapshot failed for ${subscription.customer_id} ` +
        `(falling back to empty token, refresh-env will recover): ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }

  // HF-1 (2026-05-12 founder Q1 lock): wipe stale pair state on every
  // pending → active transition. Reaches this path ONLY when the
  // subscription was previously 'pending' (the idempotent-retry path
  // short-circuits at the "existing.status === 'active'" branch in
  // handleXenditWebhook before we get here). So:
  //   - new customer + new sub → wipe is a no-op (fields already NULL)
  //   - reused-email customer + new sub → wipe clears stale chat_id /
  //     bot_username / soul_md_text from previous test cycle
  //   - renewed sub after a cancel → wipe clears whatever lingered
  //   - idempotent re-delivery on an already-active sub → never reaches
  //     here (caller returns idempotent: true earlier)
  //
  // The Phase E snapshot above ran BEFORE this wipe, so the in-memory
  // `existingBotToken` survives even though the row is now cleared.
  //
  // Best-effort: a wipe failure must NOT turn the webhook into a 5xx
  // (would trigger Xendit retry storm + re-fire spinUp). Log + continue.
  try {
    await deps.db.clearStalePairState(subscription.customer_id)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    // A stale token means the new VPS binds the OLD bot — corruption.
    // Keep best-effort (don't fail the webhook → no Xendit retry-storm)
    // but make it LOUD: log + founder alert so it can't slip silently.
    console.error(
      `[xendit-webhook] clearStalePairState failed for ${subscription.customer_id} ` +
        `(stale pair state — new VPS may bind the OLD bot, corruption risk): ${detail}`,
    )
    if (deps.alertChatId && deps.alertSend) {
      try {
        await deps.alertSend(
          deps.alertChatId,
          `[stale-pair-state alert]\nclearStalePairState failed for ${subscription.customer_id} (sub ${subscription.id}): ${detail}\nStale token may bind the new VPS to the OLD bot — investigate before the customer pairs.`,
        )
      } catch (alertErr) {
        console.error(
          `[xendit-webhook] clearStalePairState founder-alert failed for ${subscription.customer_id}: ` +
            (alertErr instanceof Error ? alertErr.message : String(alertErr)),
        )
      }
    }
  }

  await deps.db.updateSubscription(subscription.id, {
    status: 'active',
    hosting_active: true,
    next_billing_at: nextBilling.toISOString(),
  })
  await deps.db.markSubscriptionInvoicePaid(event.id)

  if (subscription.tier === 'starter') {
    await deps.db.addStarterCredits(subscription.customer_id, STARTER_CREDITS_USD_CENTS)
  }

  // Provisioning is best-effort at this point. Payment is confirmed and the
  // invoice is paid — we MUST return 200 so Xendit doesn't retry-storm the
  // webhook (every retry would re-alert and waste resources). If spin-up
  // fails for any reason — HTTP error from the service OR a thrown network
  // error reaching it (DNS / connection refused / TLS) — we park the
  // subscription in 'pending_provision' for a retry worker to pick up and
  // alert the founder. `hosting_active` is set false so the dashboard
  // doesn't lie about service state. `next_billing_at` is intentionally
  // left in place — billing cycle correctly starts from payment date.
  let provisionFailureReason: string | null = null
  try {
    const result = await deps.provisioning.spinUp({
      customerId: subscription.customer_id,
      tier: subscription.tier,
      // Phase E Option 2 part 2 (2026-05-14): pass the snapshot from
      // BEFORE the wipe. Two cases:
      //   1. Existing customer re-subscribes (had paired bot before) →
      //      existingBotToken is the decrypted plaintext. setup-script's
      //      hasTelegram=true branch fires → gateway starts directly →
      //      no refresh-env race.
      //   2. New customer (never paired) → existingBotToken is ''. The
      //      pre-Phase-E behavior preserves: setup-script installs but
      //      defers start to refresh-env (now retry-aware per Option 1).
      // The empty-string semantics are preserved for case 2 to keep
      // spin-up-helpers.ts from falling back to env.TELEGRAM_BOT_TOKEN
      // (the shared @weuseaibot platform token), which would cause
      // Telegram 409 conflict storms during onboarding. Per
      // docs/investigation/2026-05-10-fresh-provision-dry-run.md Stage 4.
      customerTelegramBotToken: existingBotToken,
      alwaysOnEnabled: subscription.always_on_enabled,
      useStarterCredits: subscription.tier === 'starter',
    })
    if (!result.ok) {
      provisionFailureReason = `HTTP ${result.status} ${result.body}`
    }
  } catch (err) {
    provisionFailureReason = `threw: ${err instanceof Error ? err.message : String(err)}`
    // Log the error CLASS so transient outages (network/timeout — likely
    // recoverable by the retry worker) are distinguishable from other
    // failures in the logs. Control flow unchanged: still parked below.
    const errClass = err instanceof Error ? err.name : typeof err
    console.error(
      `[xendit-webhook] spinUp threw for ${subscription.customer_id} (sub ${subscription.id}) ` +
        `[errClass=${errClass}]: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (provisionFailureReason) {
    await deps.db.updateSubscription(subscription.id, {
      status: 'pending_provision',
      hosting_active: false,
    })
    if (deps.alertChatId && deps.alertSend) {
      // Best-effort: a failed founder-alert must NEVER fail the webhook
      // (would 500 → Xendit retry-storm). Log loudly + continue.
      try {
        await deps.alertSend(
          deps.alertChatId,
          `[provisioning alert]\nspin-up failed for ${subscription.customer_id} (sub ${subscription.id}): ${provisionFailureReason}\nSubscription marked pending_provision — retry worker should pick up.`,
        )
      } catch (err) {
        console.error(
          `[xendit-webhook] provisioning alertSend failed for ${subscription.customer_id} (sub ${subscription.id}): ` +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    }
    // Still send receipt — payment is real, customer deserves audit trail
    // regardless of provisioning outcome.
    await trySendReceipt(event, subscription, deps)
    // 200, NOT 500 — payment is real, don't have Xendit retry-storm us.
    return json({ ok: true, provision_deferred: true })
  }

  await trySendReceipt(event, subscription, deps)

  return json({ ok: true })
}

/**
 * Sesi B P0 #7 (2026-05-12): best-effort receipt email.
 *
 * Resolution order:
 *   1. deps.sendReceiptEmail missing → skip silently (back-compat).
 *   2. customer lookup misses or email blank → skip silently (logged in
 *      future when we add an alert hook; for now we don't want noisy
 *      stub-mode logs every PAID).
 *   3. Any thrown error from sendReceiptEmail → caught + swallowed. The
 *      webhook MUST return 200 to Xendit.
 */
async function trySendReceipt(
  event: XenditInvoiceEvent,
  subscription: SubscriptionRow,
  deps: WebhookDeps,
): Promise<void> {
  if (!deps.sendReceiptEmail) return
  try {
    const customer = await deps.db.findCustomerById(subscription.customer_id)
    if (!customer?.email) return
    const { subject, text } = buildPaymentReceiptEmailBody({
      invoice_id: event.id,
      tier: subscription.tier,
      amount_idr: event.amount ?? 0,
      payment_method: event.payment_method ?? 'unknown',
      paid_at_iso: event.paid_at ?? new Date().toISOString(),
      // Audit doc §P2-CF-3: embed cid in welcome URL so customers who
      // lose the welcome-tab (closed browser, switched device) can
      // recover via the receipt email instead of WhatsApp support.
      customer_id: subscription.customer_id,
    })
    await deps.sendReceiptEmail({ to: customer.email, subject, text })
  } catch (err) {
    // Best-effort — never block webhook on email send. But a silent
    // receipt failure is invisible; log (greppable) so it's not lost.
    console.warn(
      `[xendit-webhook] trySendReceipt failed for ${subscription.customer_id}: ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

async function handleFailed(
  event: XenditInvoiceEvent,
  subscription: SubscriptionRow,
  deps: WebhookDeps,
): Promise<Response> {
  await deps.db.updateSubscription(subscription.id, { status: 'failed' })
  await deps.db.markSubscriptionInvoiceFailed(
    event.id,
    event.status === 'EXPIRED' ? 'expired' : 'failed',
  )
  return json({ ok: true, marked_failed: true })
}

// Sesi D P1-1: safeEqual deleted; callers use constantTimeEqual from
// ./constant-time-equal.ts (single source of truth).

/**
 * Xendit webhook authenticity check — the production-ready gate.
 *
 * SCHEME (verified against Xendit docs — "Handling webhooks" /
 * help.xendit.co article 360038072991 "How to validate if the webhook is
 * sent from Xendit"): Xendit signs every webhook by including a token in
 * the `x-callback-token` header (lowercase). You verify it against the
 * Verification Token shown in Dashboard → Webhook settings. It is a SHARED
 * SECRET, not an HMAC — direct string equality is the documented check, so
 * there is no payload signature to recompute. This SAME header + same
 * comparison applies in BOTH test/development and live/production mode; the
 * only thing that changes across environments is the token VALUE (each mode
 * issues its own Verification Token).
 *
 * Because the scheme is mode-agnostic, the prod-mode seam below does NOT
 * branch the comparison itself — it only (a) hardens the empty-token guard
 * and (b) tags the structured reject log with the environment so a
 * cross-mode misconfig surfaces on the first real webhook. When
 * XENDIT_API_KEY rotates to `xnd_production_*`, index.ts flips keyMode to
 * 'live' and this exact function keeps working unchanged.
 *
 * Returns a 401 Response on any failure (missing / mismatched / unconfigured
 * token), or null when the token is valid and the handler may proceed.
 *
 * Hardening over the prior inline check:
 *  - Treats a missing header and an empty header identically (both '').
 *  - REFUSES to authenticate when the configured token is blank. The old
 *    `constantTimeEqual('', '')` returned true, so a deploy that forgot to
 *    set XENDIT_WEBHOOK_TOKEN would have accepted any caller that sent an
 *    empty (or absent) header. We now reject those with `misconfigured`.
 *  - Emits a single greppable, structured log line on every rejection
 *    (`[xendit-webhook] callback-token rejected ...`) for audit + alerting.
 */
function verifyCallbackToken(req: Request, deps: WebhookDeps): Response | null {
  const mode: XenditKeyMode = deps.keyMode ?? 'test'
  const presented = req.headers.get('x-callback-token') ?? ''
  const expected = deps.webhookToken ?? ''

  // Misconfiguration guard. An unset/blank XENDIT_WEBHOOK_TOKEN must NEVER
  // resolve to "auth passes for an empty header" — that would be an open
  // webhook. This matters most in live mode (real money), so we log it
  // loudly, but we reject in both modes. Constant-time compare can't save
  // us here: the secret itself is absent, so there is nothing to compare.
  if (expected.length === 0) {
    logTokenReject(mode, 'misconfigured', presented.length)
    return json({ error: 'unauthorized' }, 401)
  }

  // Missing/blank header → reject before the constant-time compare. (The
  // compare would reject it anyway via the length-mismatch branch, but an
  // explicit reason makes the log actionable.)
  if (presented.length === 0) {
    logTokenReject(mode, 'missing', 0)
    return json({ error: 'unauthorized' }, 401)
  }

  // Constant-time equality — single source of truth in constant-time-equal.ts.
  // Same comparison in test and live mode (Xendit's scheme is mode-agnostic).
  if (!constantTimeEqual(presented, expected)) {
    logTokenReject(mode, 'mismatch', presented.length)
    return json({ error: 'unauthorized' }, 401)
  }

  return null
}

/**
 * Structured, greppable rejection log. Never logs the token values (only
 * the presented length, for debugging a truncation/whitespace issue) so the
 * secret is never written to logs. The `mode` tag makes a cross-environment
 * misconfig (live key paired with a stale test token) visible immediately.
 */
function logTokenReject(
  mode: XenditKeyMode,
  reason: 'missing' | 'mismatch' | 'misconfigured',
  presentedLen: number,
): void {
  console.warn(
    `[xendit-webhook] callback-token rejected ` +
      `reason=${reason} mode=${mode} presented_len=${presentedLen} status=401`,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
