// Pure handler for complete-onboarding. Web Platform APIs only — runs in
// Deno (production Edge Function) and Node ≥18 (test runner).
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "Edge Function: complete-onboarding" + edit G (idempotency) +
//   edit H (SOUL.md scaffold + sanitizer + sha256 audit).

import {
  TIER_CREDIT_USD_CENTS,
  type ILlmKeyMinter,
  type IOnboardingStore,
  type IOnboardingProvisioningClient,
  type CustomerRow,
  type SubscriptionRow,
} from './types.ts'
import {
  renderSoulMd,
  sanitizeExpectations,
  sha256Hex,
} from './soul-md-template.ts'

export type CompleteOnboardingDeps = {
  db: IOnboardingStore
  minter: ILlmKeyMinter
  provisioning: IOnboardingProvisioningClient
  publicBase: string                 // e.g. https://weuseai-agent.vercel.app
  now?: () => Date
}

export type CompleteOnboardingBody = {
  customer_id: string
  whatsapp: string
  expectations_text: string
}

export async function handleCompleteOnboarding(
  req: Request,
  deps: CompleteOnboardingDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: CompleteOnboardingBody
  try {
    body = (await req.json()) as CompleteOnboardingBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const fieldErr = validateFields(body)
  if (fieldErr) return json(fieldErr, 400)

  const { customer_id, whatsapp, expectations_text } = body

  // ─── 1. Customer must exist + have a paid subscription ────────────
  const customer = await deps.db.findCustomerById(customer_id)
  if (!customer) {
    return json({ error: 'no_paid_subscription' }, 404)
  }

  const subscription = await deps.db
    .findActiveOrPendingSubscriptionByCustomer(customer_id)
  if (!subscription) {
    return json({ error: 'no_paid_subscription' }, 404)
  }

  // ─── 2. Idempotency (edit G) ──────────────────────────────────────
  // Already onboarded → return 409 with redirect URL. Client follows it.
  if (
    customer.telegram_chat_id &&
    customer.soul_md_text &&
    subscription.status === 'active'
  ) {
    return json(
      {
        error: 'already_onboarded',
        redirect: `${deps.publicBase}/welcome.html?cid=${customer_id}`,
      },
      409,
    )
  }

  // ─── 3. Pairing must have completed BEFORE submit ─────────────────
  if (!customer.telegram_chat_id) {
    return json({ error: 'telegram_not_paired' }, 409)
  }

  // ─── 4. Sanitize expectations + render SOUL.md ────────────────────
  const sanitized = sanitizeExpectations(expectations_text)
  if (!sanitized.ok) {
    if (sanitized.reason === 'expectations_too_short') {
      return json({ error: 'expectations_too_short' }, 422)
    }
    if (sanitized.reason === 'expectations_too_long') {
      return json({ error: 'expectations_too_long' }, 422)
    }
    return json(
      { error: 'invalid_input', reason: sanitized.reason },
      400,
    )
  }

  const customerName = (customer.display_name ?? '').trim() || customer.email
  const soulMdText = renderSoulMd({
    customerName,
    expectationsClean: sanitized.clean,
  })
  const soulMdSha256 = await sha256Hex(soulMdText)

  // ─── 5. Persist customer fields + audit row BEFORE provisioning ──
  // We commit the persona before calling the external provisioning
  // service. If provisioning fails, we rollback the LLM key (which IS
  // cheap and external) but leave soul_md_text intact — the retry
  // worker should reuse the same persona, not regenerate.
  const trimmedWhatsapp = whatsapp.trim()
  await deps.db.updateCustomer(customer_id, {
    whatsapp_number: trimmedWhatsapp,
    soul_md_text: soulMdText,
    pairing_code: null,
    pairing_code_expires_at: null,
  })
  await deps.db.insertPersonaAudit({
    customer_id,
    soul_md_sha256: soulMdSha256,
  })

  // ─── 6. Mint LLM key (Mock in dev, OpenRouter in prod) ────────────
  let mintResult
  try {
    mintResult = await deps.minter.mint({
      name: customer_id,
      limitUsdCents: TIER_CREDIT_USD_CENTS[subscription.tier],
    })
  } catch (e) {
    return json(
      { error: 'llm_mint_failed', detail: errMessage(e) },
      502,
    )
  }

  // ─── 7. Persist key hash (NOT the secret) ─────────────────────────
  try {
    await deps.db.insertCustomerOpenRouterKey({
      customer_id,
      openrouter_key_hash: mintResult.hash,
      credit_limit_usd_cents: mintResult.limitUsdCents,
    })
  } catch (e) {
    // If we can't store the hash we can't revoke later — burn the key.
    await safeRevoke(deps.minter, mintResult.hash)
    return json(
      { error: 'internal', detail: errMessage(e) },
      500,
    )
  }

  // ─── 8. POST to provisioning service ──────────────────────────────
  const spinResult = await deps.provisioning.spinUp({
    customerId: customer_id,
    tier: subscription.tier,
    telegramChatId: customer.telegram_chat_id,
    openrouterApiKey: mintResult.key,
    soulMdContent: soulMdText,
    alwaysOnEnabled: subscription.always_on_enabled,
  })

  if (!spinResult.ok) {
    // Rollback: free the OpenRouter key + park subscription for the
    // existing webhook retry worker.
    await safeRevoke(deps.minter, mintResult.hash)
    await safeUpdateSubscription(deps.db, subscription.id, {
      status: 'pending_provision',
      hosting_active: false,
    })
    return json(
      { error: 'provisioning_unreachable', upstream_status: spinResult.status },
      503,
    )
  }

  // ─── 9. Flip subscription to active ───────────────────────────────
  await deps.db.updateSubscription(subscription.id, {
    status: 'active',
    hosting_active: true,
  })

  // ─── 10. Done — redirect to welcome with job id ───────────────────
  return json({
    provisioning_job_id: spinResult.jobId,
    redirect_url: `${deps.publicBase}/welcome.html?cid=${customer_id}&job=${spinResult.jobId}`,
  })
}

// ─── helpers ──────────────────────────────────────────────────────

function validateFields(
  body: CompleteOnboardingBody,
): { error: string; field?: string } | null {
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_json' }
  }
  if (typeof body.customer_id !== 'string' || !body.customer_id) {
    return { error: 'missing_field', field: 'customer_id' }
  }
  if (typeof body.whatsapp !== 'string' || !validWhatsappFormat(body.whatsapp)) {
    return { error: 'invalid_whatsapp' }
  }
  if (typeof body.expectations_text !== 'string') {
    return { error: 'missing_field', field: 'expectations_text' }
  }
  return null
}

// Indonesian numbers: 08xxx (10–13 digits total) or +62xxx / 62xxx.
// Liberal on separators (spaces, dashes); we strip them before checking.
const WA_RE = /^(?:\+?62|0)\d{8,13}$/
function validWhatsappFormat(s: string): boolean {
  const digits = s.replace(/[\s\-().]/g, '')
  return WA_RE.test(digits)
}

async function safeRevoke(minter: ILlmKeyMinter, hash: string): Promise<void> {
  try {
    await minter.revoke(hash)
  } catch {
    /* swallow — rollback is best-effort, the key is small dollars */
  }
}

async function safeUpdateSubscription(
  db: IOnboardingStore,
  id: string,
  patch: Partial<SubscriptionRow>,
): Promise<void> {
  try {
    await db.updateSubscription(id, patch)
  } catch {
    /* swallow — DB write failure during rollback is logged via Edge logs */
  }
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e).slice(0, 500)
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

// Re-export for tests so they can typecheck against the same `CustomerRow`
// shape without re-importing from types.ts.
export type { CustomerRow }
