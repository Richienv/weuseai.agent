// Pure handler for xendit-webhook. Web Platform APIs only.

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

  // Constant-time-ish compare. Xendit's "x-callback-token" is a shared secret,
  // not an HMAC — direct equality is what they document.
  const callbackToken = req.headers.get('x-callback-token') ?? ''
  if (!safeEqual(callbackToken, deps.webhookToken)) {
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

  const result = await deps.provisioning.spinUp({
    customerId: subscription.customer_id,
    tier: subscription.tier,
    alwaysOnEnabled: subscription.always_on_enabled,
    useStarterCredits: subscription.tier === 'starter',
  })

  if (!result.ok) {
    // Mark subscription failed so customer can retry; alert founder.
    await deps.db.updateSubscription(subscription.id, { status: 'failed' })
    if (deps.alertChatId && deps.alertSend) {
      await deps.alertSend(
        deps.alertChatId,
        `[provisioning alert]\nspin-up failed for ${subscription.customer_id}: HTTP ${result.status} ${result.body}`,
      )
    }
    // 500 → Xendit retries the webhook, which is what we want.
    return json({ error: 'provisioning_failed', detail: result }, 500)
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
