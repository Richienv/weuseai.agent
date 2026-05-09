// Pure handler for xendit-webhook. Web Platform APIs only.

import { constantTimeEqual } from './constant-time-equal.ts'
import {
  STARTER_CREDITS_USD_CENTS,
  type IInvoiceStore,
  type IProvisioningClient,
  type SubscriptionRow,
  type XenditInvoiceEvent,
} from './types.ts'

export type WebhookDeps = {
  db: IInvoiceStore
  provisioning: IProvisioningClient
  webhookToken: string
  alertChatId?: string
  alertSend?: (chatId: string, text: string) => Promise<void>
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
    // 200, NOT 500 — payment is real, don't have Xendit retry-storm us.
    return json({ ok: true, provision_deferred: true })
  }

  return json({ ok: true })
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
