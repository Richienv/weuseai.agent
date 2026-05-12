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

export type WebhookDeps = {
  db: IInvoiceStore
  provisioning: IProvisioningClient
  webhookToken: string
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

  // Constant-time compare. Xendit's "x-callback-token" is a shared secret,
  // not an HMAC — direct equality is what they document.
  // Sesi D P1-1: comparator now lives in ./constant-time-equal.ts
  // (single source of truth across all Edge Functions).
  const callbackToken = req.headers.get('x-callback-token') ?? ''
  if (!constantTimeEqual(callbackToken, deps.webhookToken)) {
    return json({ error: 'unauthorized' }, 401)
  }

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
  // Best-effort: a wipe failure must NOT turn the webhook into a 5xx
  // (would trigger Xendit retry storm + re-fire spinUp). Log + continue.
  try {
    await deps.db.clearStalePairState(subscription.customer_id)
  } catch (err) {
    console.error(
      `[xendit-webhook] clearStalePairState failed for ${subscription.customer_id}: ` +
        (err instanceof Error ? err.message : String(err)),
    )
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
      // Explicit empty string — keeps the key PRESENT in the JSON body so
      // spin-up-helpers.ts treats this as "caller deliberately said no
      // bot token" instead of falling back to env.TELEGRAM_BOT_TOKEN
      // (the shared @weuseaibot platform token). Without this empty
      // string, fresh provisions install + start hermes-gateway with the
      // shared token and log Telegram 409s for the entire onboarding
      // window. The customer's own bot token gets installed later when
      // complete-onboarding step 8a calls refreshEnv.
      // Per docs/investigation/2026-05-10-fresh-provision-dry-run.md
      // Stage 4.
      customerTelegramBotToken: '',
      alwaysOnEnabled: subscription.always_on_enabled,
      useStarterCredits: subscription.tier === 'starter',
    })
    if (!result.ok) {
      provisionFailureReason = `HTTP ${result.status} ${result.body}`
    }
  } catch (err) {
    provisionFailureReason = `threw: ${err instanceof Error ? err.message : String(err)}`
  }

  if (provisionFailureReason) {
    await deps.db.updateSubscription(subscription.id, {
      status: 'pending_provision',
      hosting_active: false,
    })
    if (deps.alertChatId && deps.alertSend) {
      await deps.alertSend(
        deps.alertChatId,
        `[provisioning alert]\nspin-up failed for ${subscription.customer_id} (sub ${subscription.id}): ${provisionFailureReason}\nSubscription marked pending_provision — retry worker should pick up.`,
      )
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
    })
    await deps.sendReceiptEmail({ to: customer.email, subject, text })
  } catch {
    // Best-effort — never block webhook on email send.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
