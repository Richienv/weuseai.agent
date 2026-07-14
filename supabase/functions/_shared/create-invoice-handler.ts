// Pure handler for create-invoice. Web Platform APIs only — runs in Deno
// (production Edge Function) and Node 18+ (test runner).

import {
  PLANS,
  type IInvoiceStore,
  type IXenditClient,
  type PaymentMethodId,
  type PurchasablePlan,
} from './types.ts'
import { totalCharge, XENDIT_PAYMENT_METHODS, paymentFee } from './pricing.ts'

export type CreateInvoiceDeps = {
  db: IInvoiceStore
  xendit: IXenditClient
  successRedirectBase: string
  failureRedirectBase: string
  now?: () => Date
  /** Count of paid subscriptions (status='active') — same definition as the
   *  public /api/public/subscription-count counter. Drives the library-full
   *  799→999 batch price-flip; optional so older wirings keep working. */
  countActiveSubscriptions?: () => Promise<number>
}

/** Launch batch (honesty lock, founder decision 2026-06-18): library-full setup
 *  GENUINELY rises from setupIdr (799k) to the advertised anchor setupOldIdr
 *  (999k) once the first 1000 are paid. Count errors fail OPEN to the launch
 *  price — never overcharge because a count query hiccuped. */
export const LIBRARY_FULL_BATCH_LIMIT = 1000

export type CreateInvoiceBody = {
  email: string
  displayName?: string
  /** v1.4 canonical slug (self-serve checkout) OR a frozen legacy v1.2
   *  slug the live checkout still emits. Validated against PLANS. */
  plan: PurchasablePlan
  alwaysOn: boolean
  methodId: PaymentMethodId
  country?: string
  postal?: string

  /**
   * Sesi D pass-3 P0 (2026-05-13): server-side ToS acceptance audit.
   *
   * REQUIRED — ISO8601 timestamp of when the customer ticked the "I
   * agree to Syarat dan Ketentuan" checkbox. The handler validates
   * this is parseable + within 24 hours of `now()` (not future-dated,
   * not stale) and writes a row to consent_events BEFORE the Xendit
   * invoice is created. Without it the request is rejected 400
   * 'tos_required'.
   *
   * Without this audit trail UU PDP Art. 22(1) compliance is broken
   * and any Xendit chargeback dispute is lost by default.
   */
  tos_accepted_at: string

  /**
   * Optional ISO8601 timestamp for marketing opt-in. When present,
   * the handler writes a separate consent_events row with
   * consent_type = 'marketing'. Missing / null = customer did NOT
   * opt in.
   */
  marketing_opt_in_at?: string | null

  /**
   * Policy version both consents apply to. Defaults to 'v1.0' (the
   * version live on /terms and /privacy as of 2026-05-13). Bump
   * when policy wording changes materially so historical consents
   * remain provable.
   */
  policy_version?: string
}

/**
 * Max age of `tos_accepted_at` accepted by the server (24 hours).
 * Tighter than localStorage staleness in checkout.html so an attacker
 * can't replay an old localStorage value across a long absence.
 */
const TOS_MAX_AGE_MS = 24 * 60 * 60 * 1000

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

  // Sesi D pass-3 P0: server-side ToS acceptance gate. Validates the
  // timestamp is parseable + within 24h of `now()` so an attacker can't
  // replay a stale localStorage value. Rejected before any Xendit call
  // (no invoice = no chargeback exposure) or DB write.
  const now = deps.now?.() ?? new Date()
  const consentValidation = validateConsent(body, now)
  if (consentValidation) return json({ error: consentValidation }, 400)

  const { email, alwaysOn, methodId } = body
  // L3 (security audit, 2026-06-14): normalize a deprecated plan slug to its
  // canonical equivalent BEFORE pricing — the SAME mapping checkout.html
  // applies client-side (LEGACY_PLAN_ALIAS), now enforced server-side too. The
  // PLANS table still carries the old v1.2 legacy entries (starter/pro/studio)
  // at their stale prices, so without this a direct create-invoice call with
  // plan=pro would charge the legacy 1,290,000 instead of the canonical
  // done-for-you 1,299,000 (and plan=studio the stale 5,900,000 instead of
  // library-full's 799,000). The live checkout never sends a legacy slug — it
  // already aliases — so real customers are unaffected; this closes the
  // direct-API price drift. The legacy slug set is frozen (expand-then-contract),
  // so this 3-entry map cannot drift.
  const LEGACY_PLAN_ALIAS: Record<string, string> = {
    starter: 'voice-starter',
    pro: 'done-for-you',
    studio: 'library-full',
  }
  // Cast back to the plan type: a legacy slug maps to a canonical slug, both of
  // which are valid members of the plan union; an already-canonical slug is
  // returned unchanged.
  const plan = (LEGACY_PLAN_ALIAS[body.plan] ?? body.plan) as typeof body.plan
  const displayName = body.displayName?.trim() || undefined

  // Find or create customer
  let customer = await deps.db.findCustomerByEmail(email)
  if (!customer) {
    customer = await deps.db.insertCustomer({ email, display_name: displayName })
  }

  // Sesi D pass-3 P0: persist consent BEFORE Xendit call. Order matters —
  // if the consent insert fails, we surface 500 and the customer never
  // sees an invoice, so they can't pay something they have no
  // server-recorded acceptance for. Conversely, if Xendit fails AFTER
  // consent insert, we have a paper trail but no charge — totally fine.
  // ip_address + user_agent captured from request headers.
  const ip = extractClientIp(req)
  const userAgent = req.headers.get('user-agent')?.slice(0, 1000) ?? null
  const policyVersion = body.policy_version || 'v1.0'
  try {
    await deps.db.insertConsentEvent({
      customer_id: customer.id,
      consent_type: 'tos',
      accepted_at: body.tos_accepted_at,
      ip_address: ip,
      user_agent: userAgent,
      version: policyVersion,
    })
    if (body.marketing_opt_in_at) {
      await deps.db.insertConsentEvent({
        customer_id: customer.id,
        consent_type: 'marketing',
        accepted_at: body.marketing_opt_in_at,
        ip_address: ip,
        user_agent: userAgent,
        version: policyVersion,
      })
    }
  } catch (e) {
    return json(
      {
        error: 'consent_persist_failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    )
  }

  // Compute server-authoritative amount — fee is added so customer pays
  // gateway+platform together, matching what checkout.html displays.
  // Library-full batch flip: after the first LIBRARY_FULL_BATCH_LIMIT paid
  // customers, setup charges the advertised anchor (setupOldIdr) — keeping
  // "naik ke Rp 999rb setelah 1.000 pertama" an honest claim. Count failures
  // fall back to the launch price (never overcharge on an infra hiccup).
  let setupIdrOverride: number | undefined
  const anchor = PLANS[plan].setupOldIdr
  if (plan === 'library-full' && anchor && deps.countActiveSubscriptions) {
    try {
      const paid = await deps.countActiveSubscriptions()
      if (paid >= LIBRARY_FULL_BATCH_LIMIT) setupIdrOverride = anchor
    } catch { /* fail open to the launch price */ }
  }
  const charge = totalCharge(plan, alwaysOn, methodId, setupIdrOverride)
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

/**
 * Sesi D pass-3 P0 (2026-05-13): consent validation.
 *
 * Returns null on pass, otherwise the error code the handler should
 * respond with. Two failure modes:
 *   - tos_required: `tos_accepted_at` missing, non-string, or
 *     unparseable as a Date
 *   - tos_stale: `tos_accepted_at` is in the future OR older than 24h
 *
 * Same validation runs against `marketing_opt_in_at` when present,
 * but it reports under the same prefix ('tos_*') because the marketing
 * checkbox can never be ticked without ToS also being ticked — they
 * share a submit event. This keeps the error surface small and
 * matches the audit doc's recommendation.
 */
function validateConsent(body: CreateInvoiceBody, now: Date): string | null {
  if (typeof body.tos_accepted_at !== 'string' || body.tos_accepted_at.length === 0) {
    return 'tos_required'
  }
  const tosTs = Date.parse(body.tos_accepted_at)
  if (Number.isNaN(tosTs)) return 'tos_required'
  const nowMs = now.getTime()
  // Future-dated → clock-skew or replay attempt. Reject.
  // Older than 24h → stale localStorage / replay. Reject.
  if (tosTs > nowMs + 60_000) return 'tos_stale'
  if (nowMs - tosTs > TOS_MAX_AGE_MS) return 'tos_stale'

  // Marketing opt-in is OPTIONAL — null/undefined is fine — but when
  // present it must be a parseable, recent timestamp.
  if (
    body.marketing_opt_in_at !== null &&
    body.marketing_opt_in_at !== undefined &&
    body.marketing_opt_in_at !== ''
  ) {
    if (typeof body.marketing_opt_in_at !== 'string') return 'tos_required'
    const mTs = Date.parse(body.marketing_opt_in_at)
    if (Number.isNaN(mTs)) return 'tos_required'
    if (mTs > nowMs + 60_000) return 'tos_stale'
    if (nowMs - mTs > TOS_MAX_AGE_MS) return 'tos_stale'
  }
  return null
}

/**
 * Extract the originating client IP from request headers. Cloudflare /
 * Supabase edge sets `cf-connecting-ip` (single value, trusted). Falls
 * back to the left-most entry of `x-forwarded-for` (which is a
 * comma-separated chain). Returns null when neither header is present
 * — null is valid in the consent_events.ip_address column.
 *
 * We deliberately don't try to parse / canonicalize the value; the
 * inet column in Postgres validates it on INSERT. If a malformed
 * value sneaks in the DB throws and the handler surfaces 500 — that's
 * better than silently dropping the row.
 */
function extractClientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf && cf.length > 0) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first && first.length > 0) return first
  }
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
