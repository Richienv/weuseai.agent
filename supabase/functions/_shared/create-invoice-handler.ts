// Pure handler for create-invoice. Web Platform APIs only — runs in Deno
// (production Edge Function) and Node 18+ (test runner).

import {
  PLANS,
  type IInvoiceStore,
  type IXenditClient,
  type PaymentMethodId,
  type Tier,
} from './types.ts'
import { totalCharge, XENDIT_PAYMENT_METHODS, paymentFee } from './pricing.ts'

export type CreateInvoiceDeps = {
  db: IInvoiceStore
  xendit: IXenditClient
  successRedirectBase: string
  failureRedirectBase: string
  now?: () => Date
}

export type CreateInvoiceBody = {
  email: string
  displayName?: string
  plan: Tier
  alwaysOn: boolean
  methodId: PaymentMethodId
  country?: string
  postal?: string
}

export async function handleCreateInvoice(
  req: Request,
  deps: CreateInvoiceDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: CreateInvoiceBody
  try {
    body = (await req.json()) as CreateInvoiceBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const validation = validate(body)
  if (validation) return json({ error: validation }, 400)

  const { email, plan, alwaysOn, methodId } = body
  const displayName = body.displayName?.trim() || undefined

  // Find or create customer
  let customer = await deps.db.findCustomerByEmail(email)
  if (!customer) {
    customer = await deps.db.insertCustomer({ email, display_name: displayName })
  }

  // Compute server-authoritative amount — fee is added so customer pays
  // gateway+platform together, matching what checkout.html displays.
  const charge = totalCharge(plan, alwaysOn, methodId)
  const fee = paymentFee(charge.base, methodId)

  // Insert pending subscription. xendit_invoice_id filled after Xendit call.
  const subscription = await deps.db.insertSubscription({
    customer_id: customer.id,
    tier: plan,
    always_on_enabled: alwaysOn,
    status: 'pending',
  })

  const externalId = `sub_${subscription.id}_${(deps.now?.() ?? new Date())
    .getTime()
    .toString()}`

  const description = `weuseai.agent · ${PLANS[plan].displayName} setup + bulan-1 hosting${
    alwaysOn ? ' + Always-On' : ''
  }`

  const invoice = await deps.xendit.createInvoice({
    externalId,
    amount: charge.total,
    payerEmail: email,
    description,
    paymentMethods: XENDIT_PAYMENT_METHODS[methodId],
    fees: [{ type: 'ADMIN', value: fee }],
    successRedirectUrl: `${deps.successRedirectBase}?cid=${customer.id}`,
    failureRedirectUrl: `${deps.failureRedirectBase}?plan=${plan}&error=failed`,
    metadata: {
      customer_id: customer.id,
      subscription_id: subscription.id,
      plan,
      always_on: alwaysOn,
      kind: 'setup_first_month',
    },
  })

  await deps.db.updateSubscription(subscription.id, {
    xendit_invoice_id: invoice.invoiceId,
  })

  await deps.db.insertSubscriptionInvoice({
    subscription_id: subscription.id,
    customer_id: customer.id,
    xendit_invoice_id: invoice.invoiceId,
    kind: 'setup_first_month',
    amount_idr: charge.total,
    status: 'pending',
  })

  return json({
    invoice_url: invoice.invoiceUrl,
    customer_id: customer.id,
    subscription_id: subscription.id,
    amount_idr: charge.total,
  })
}

function validate(body: CreateInvoiceBody): string | null {
  if (!body) return 'missing_body'
  if (typeof body.email !== 'string' || !body.email.includes('@')) return 'invalid_email'
  if (!(body.plan in PLANS)) return 'invalid_plan'
  if (typeof body.alwaysOn !== 'boolean') return 'invalid_alwaysOn'
  const validMethods: PaymentMethodId[] = ['qris', 'va', 'card', 'cicilan', 'ewallet', 'bnpl']
  if (!validMethods.includes(body.methodId)) return 'invalid_methodId'
  return null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}
