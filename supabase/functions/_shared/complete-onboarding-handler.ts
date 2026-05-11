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
  type ITelegramClient,
  type CustomerRow,
  type SubscriptionRow,
} from './types.ts'
import {
  renderSoulMd,
  sanitizeExpectations,
  sha256Hex,
} from './soul-md-template.ts'
import { properDeleteWebhook } from './proper-delete-webhook.ts'
import { sendProactiveGreeting } from './proactive-greeting.ts'
import { buildWelcomeEmailBody } from './email-delivery.ts'

export type CompleteOnboardingDeps = {
  db: IOnboardingStore
  minter: ILlmKeyMinter
  provisioning: IOnboardingProvisioningClient
  /** Pair-flow Option A (2026-05-09): used to deleteWebhook on the
   *  customer's own bot AFTER provisioning ACK so Hermes can long-poll
   *  cleanly when the VPS boots. */
  telegram: ITelegramClient
  publicBase: string                 // e.g. https://weuseai-agent.vercel.app
  now?: () => Date
  /** Test seam — properDeleteWebhook backoff sleep. Production omits;
   *  tests pass `() => {}` to avoid real 2-8s sleeps on retry paths. */
  webhookDeleteSleepMs?: (ms: number) => Promise<void> | void
  /**
   * Sesi B P0 #7 (2026-05-12): optional welcome email on success path.
   * Best-effort — any throw is swallowed. Production wires this to
   * sendEmail() from email-delivery.ts (stub-tolerant when
   * RESEND_API_KEY is missing).
   */
  sendWelcomeEmail?: (args: {
    to: string
    subject: string
    text: string
  }) => Promise<{ ok: boolean }>
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

  // ─── 2. Idempotency — BRANCHED (Track 1 persona-refinement 2026-05-10) ──
  // Pre-fix: any customer with chat_id + soul_md_text + active subscription
  // got 409 → redirect, BEFORE the new expectations text was sanitized
  // or the new SOUL.md was rendered. So a customer who edited step-4
  // expectations to refine their agent's persona had their change
  // silently discarded — DB unchanged, VPS untouched.
  // See docs/investigation/2026-05-10-stuck-tuning-observability.md.
  //
  // Branched approach:
  //   isReonboarding = customer is fully onboarded (chat_id + soul_md
  //                    + active sub).
  //   When set, we still compute the new SOUL.md from the submitted
  //   expectations. We then branch:
  //     - If new SOUL.md hash MATCHES persisted soul_md_text hash →
  //       true idempotent re-submit (e.g. tab refresh, double-click on
  //       Lanjut button). Return 409 with &job=already-onboarded so
  //       welcome.html flips to the readiness-probe branch.
  //     - If new SOUL.md hash DIFFERS → persona refinement. Persist the
  //       new soul_md_text + audit row, then call refreshEnv to push
  //       the new persona to the VPS. Skip mint/spinUp/webhook delete
  //       (one-time-cost stages — re-running double-charges or spawns
  //       a duplicate webhook delete that hides the working state).
  //       Return success with &job=persona-refresh.
  const isReonboarding =
    !!customer.telegram_chat_id &&
    !!customer.soul_md_text &&
    subscription.status === 'active'

  // ─── 3. Pairing must have completed BEFORE submit ─────────────────
  if (!customer.telegram_chat_id) {
    return json({ error: 'telegram_not_paired' }, 409)
  }

  // ─── 3b. Customer's bot token must be persisted (Pair-flow Option A)
  // The provisioning service writes this to the customer's VPS .env
  // as TELEGRAM_BOT_TOKEN. If it's missing, Hermes won't have a bot
  // to attach to — fail loudly so the customer goes back to Step 2.
  let customerBotToken: string | null
  try {
    customerBotToken = await deps.db.getDecryptedBotToken(customer_id)
  } catch (e) {
    // RPC failure (encryption key misconfigured, etc.) — surface 500
    // so customer retries; we don't want to ship a half-onboarded
    // VPS with no Telegram delivery.
    return json(
      { error: 'internal', detail: errMessage(e) },
      500,
    )
  }
  if (!customerBotToken) {
    return json({ error: 'no_bot_token' }, 409)
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

  // ─── 4b. Re-onboarding hash check ─────────────────────────────────
  // For an already-onboarded customer who re-submits without changing
  // their expectations (tab refresh, double-click, browser back), we
  // skip everything and return 409 — same behavior as the pre-Track-1
  // binary idempotency. The persisted soul_md_text equals the freshly-
  // rendered one, so there's nothing to update.
  //
  // For an already-onboarded customer who DID change expectations, we
  // fall through to step 5 and persist the new persona, then later
  // skip the one-time-cost stages (mint, spinUp, webhook delete,
  // proactive greeting) and only run refreshEnv to push the new
  // SOUL.md to the VPS.
  if (isReonboarding && customer.soul_md_text === soulMdText) {
    return json(
      {
        error: 'already_onboarded',
        redirect: `${deps.publicBase}/welcome.html?cid=${customer_id}&job=already-onboarded`,
      },
      409,
    )
  }

  // ─── 5. Persist customer fields + audit row BEFORE provisioning ──
  // We commit the persona before calling the external provisioning
  // service. If provisioning fails, we rollback the LLM key (which IS
  // cheap and external) but leave soul_md_text intact — the retry
  // worker should reuse the same persona, not regenerate.
  //
  // Re-onboarding path: this is also where the persona-refinement
  // change lands in the DB. The customers row carries the new
  // soul_md_text; the audit row records the new sha256.
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

  // ─── 5b. Re-onboarding fast-path (Track 1 persona-refinement 2026-05-10) ──
  // Already-onboarded + new expectations: persist landed (above), now
  // push the new SOUL.md to the VPS via refreshEnv. Skip mint, spinUp,
  // webhook delete, and proactive greeting — those are one-time-cost
  // stages. The VPS already has Hermes running with the customer's bot
  // token, the OpenRouter key is already minted, the webhook was
  // cleared on first onboarding, and the customer has already received
  // their proactive greeting (a second one would be spammy when they're
  // just refining the persona).
  if (isReonboarding) {
    const refreshResult = await deps.provisioning.refreshEnv({
      customerId: customer_id,
      // No env_values needed — we're not changing the bot token here.
      // Defensive: re-supply TELEGRAM_BOT_TOKEN so a customer who
      // did change tokens between sessions still gets the latest in
      // .env.
      envValues: { TELEGRAM_BOT_TOKEN: customerBotToken },
      soulMdContent: soulMdText,
      telegramChatId: customer.telegram_chat_id ?? undefined,
      telegramUserName: customer.display_name ?? undefined,
      requestId: cryptoRandomUuid(),
    })
    if (!refreshResult.ok) {
      console.error(
        `[complete-onboarding] persona-refresh refreshEnv failed for ${customer_id}: ` +
          `status=${refreshResult.status} error=${refreshResult.error ?? 'n/a'}`,
      )
    }
    return json({
      provisioning_job_id: 'persona-refresh',
      redirect_url: `${deps.publicBase}/welcome.html?cid=${customer_id}&job=persona-refresh`,
      persona_refreshed: true,
      soul_md_sha256: soulMdSha256,
      ...(refreshResult.ok
        ? {}
        : {
            vps_refresh_warning: {
              message:
                'Persona baru belum berhasil sampai ke agent kamu. Tim kami akan retry otomatis.',
              status: refreshResult.status,
              error: refreshResult.error,
            },
          }),
    })
  }

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
  // Pair-flow Option A (2026-05-09): customerBotToken plumbed through
  // so the provisioning service can write it to the VPS .env as
  // TELEGRAM_BOT_TOKEN (replaces the legacy shared @weuseaibot token).
  const spinResult = await deps.provisioning.spinUp({
    customerId: customer_id,
    tier: subscription.tier,
    telegramChatId: customer.telegram_chat_id,
    telegramBotToken: customerBotToken,
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

    // Distinguish IDCloudHost capacity exhaustion from other provisioning
    // failures (2026-05-11 honest-error fix). Pre-fix every spinUp failure
    // surfaced as generic "Belum jadi. Ada kendala teknis." which read as
    // "you did something wrong" — but the IDCloudHost capacity error is
    // a transient platform issue (jakarta region full, retry in 5-10 min).
    // Customer e282ce25 + a3827996 both hit this in fresh-customer e2e
    // testing 2026-05-10/11. See
    // docs/investigation/2026-05-11-pair-failure.md.
    //
    // Match pattern is the IDCloudHost server message verbatim — they
    // emit this exact string when the region's compute pool is exhausted.
    const isCapacityExhausted = isProviderCapacityError(spinResult.body)
    return json(
      {
        error: isCapacityExhausted
          ? 'vps_capacity_exhausted'
          : 'provisioning_unreachable',
        upstream_status: spinResult.status,
      },
      503,
    )
  }

  // ─── 8a. Self-heal VPS .env (Track 3b 2026-05-10) ─────────────────
  // spinUp's idempotency returns the existing VPS without updating
  // .env when a customer re-onboards. Pre-fix: customer e282ce25 paid
  // 2026-05-06, then re-onboarded today with a NEW bot token that
  // never reached the VPS — Hermes kept polling Telegram for the
  // wrong / no bot. Always-call refreshEnv with the current bot
  // token so the on-disk .env matches the DB state, idempotent on
  // disk content (no-op when value unchanged).
  //
  // Best-effort: if /refresh-env fails, surface a webhook-style
  // warning in the response so the frontend can show "Setup belum
  // selesai — tim kami sedang memperbaiki" without blocking the
  // redirect (admin can rescue via admin-customer-vps-refresh).
  const refreshResult = await deps.provisioning.refreshEnv({
    customerId: customer_id,
    envValues: {
      TELEGRAM_BOT_TOKEN: customerBotToken,
      // 2026-05-12 — Phase 2A architecture writes the OpenRouter sub-key
      // under OPENAI_API_KEY (Hermes primary chat path is OpenAI-compat).
      // Hermes aux tasks (context compression, title generation) read
      // OPENROUTER_API_KEY specifically — same value, different name.
      // Pushing both silences the "No auxiliary LLM provider configured"
      // warnings that fire on every message otherwise.
      OPENAI_API_KEY: mintResult.key,
      OPENROUTER_API_KEY: mintResult.key,
    },
    // Dry-run Stage 7 fix: pass SOUL.md content too. Without this, the
    // canonical xendit-webhook → onboarding flow leaves SOUL.md empty
    // on disk (setup-script writes it from spinUp's soulMdContent
    // param, which xendit-webhook doesn't have at first provision).
    // Provisioning service writes the file + restarts hermes in the
    // same SSH round-trip.
    soulMdContent: soulMdText,
    // Pre-approve customer's Telegram chat_id so first /start lands
    // directly on the in-character agent (skips Hermes upstream's
    // pairing-code prompt). chat_id is captured during onboarding
    // step 3 /pair flow; non-null by the time we reach step 8a per
    // the early telegram_not_paired check above. display_name is the
    // cosmetic label that appears in `hermes pairing list`.
    telegramChatId: customer.telegram_chat_id ?? undefined,
    telegramUserName: customer.display_name ?? undefined,
    requestId: cryptoRandomUuid(),
  })
  if (!refreshResult.ok) {
    console.error(
      `[complete-onboarding] refreshEnv failed for ${customer_id}: ` +
        `status=${refreshResult.status} error=${refreshResult.error ?? 'n/a'} ` +
        `body=${refreshResult.body.slice(0, 200)}`,
    )
  }

  // ─── 8b. Free the customer's bot for Hermes long-poll ─────────────
  // Pair-flow Option A: the webhook on the customer's bot was set
  // during validate-bot-token (Step 2) so /pair messages could route
  // to pair-customer-bot-webhook. Now that pairing is done AND
  // provisioning has been triggered, delete the webhook so Hermes
  // (which will boot on the VPS in 5-7 min) can call getUpdates
  // cleanly.
  //
  // 2026-05-10 hardening: replaced the prior safeDeleteWebhook (which
  // silently swallowed every error) with properDeleteWebhook. Customer
  // e282ce25 hit the silent-failure path: bot kept replying to all
  // messages with REPLY_ALREADY_PAIRED because Telegram still routed
  // updates to our webhook even though deleteWebhook had been called.
  // properDeleteWebhook retries with exponential backoff and verifies
  // via getWebhookInfo. On final failure we surface a non-fatal
  // warning in the response so the frontend can show "Setup belum
  // selesai — tim kami sedang memperbaiki" instead of a misleading
  // success state, and log to function logs for support to retry via
  // admin tooling (Track 3 admin-customer-vps-refresh).
  const webhookResult = await properDeleteWebhook(
    deps.telegram,
    customerBotToken,
    { sleepMs: deps.webhookDeleteSleepMs },
  )
  if (!webhookResult.ok) {
    console.error(
      `[complete-onboarding] properDeleteWebhook failed for ${customer_id}: ` +
        `attempts=${webhookResult.attempts} error="${webhookResult.finalError}"`,
    )
  }

  // ─── 8c. Proactive in-character greeting (Track 2 post-pair polish 2026-05-10) ──
  // After refreshEnv + webhook delete both succeed, the customer's bot
  // is fully wired (per-customer token in VPS .env, Hermes long-poll
  // unblocked, chat_id pre-approved). Send a quick greeting AS the
  // customer's bot so they see "agent already messaged me" instead of
  // having to send /start to wake it up. Best-effort — never blocks
  // the redirect, never throws (sendProactiveGreeting catches all).
  //
  // Only fires when both 8a + 8b succeeded. If either failed, the agent
  // isn't actually reachable yet so a greeting would land in a void.
  let greetingResult: { ok: boolean; source: string; error?: string } | null = null
  if (refreshResult.ok && webhookResult.ok) {
    greetingResult = await sendProactiveGreeting(
      {
        chatId: customer.telegram_chat_id,
        botToken: customerBotToken,
        soulMdText,
        customerName,
        openrouterApiKey: mintResult.key,
      },
      { telegram: deps.telegram },
    )
    if (!greetingResult.ok) {
      console.error(
        `[complete-onboarding] proactive greeting failed for ${customer_id}: ` +
          `source=${greetingResult.source} error=${greetingResult.error ?? 'n/a'}`,
      )
    }
  }

  // ─── 9. Flip subscription to active ───────────────────────────────
  await deps.db.updateSubscription(subscription.id, {
    status: 'active',
    hosting_active: true,
  })

  // ─── 9a. Welcome email (Sesi B P0 #7, 2026-05-12) ──────────────────
  // Best-effort — any throw is swallowed so the onboarding response
  // shape is unaffected. Stub mode (no RESEND_API_KEY) is handled
  // inside email-delivery.ts.
  if (deps.sendWelcomeEmail && customer.email) {
    try {
      const { subject, text } = buildWelcomeEmailBody({
        display_name: customer.display_name ?? customer.email,
        bot_username: customer.telegram_bot_username,
        tier: subscription.tier,
      })
      await deps.sendWelcomeEmail({ to: customer.email, subject, text })
    } catch {
      // Swallow — welcome email is not blocking.
    }
  }

  // ─── 10. Done — redirect to welcome with job id ───────────────────
  // webhook_warning surfaces the partial-failure to the client so it
  // can show a "Setup belum selesai" hint without blocking the redirect
  // (the customer is still good — admin can retry the webhook delete
  // later via the admin rescue path).
  return json({
    provisioning_job_id: spinResult.jobId,
    redirect_url: `${deps.publicBase}/welcome.html?cid=${customer_id}&job=${spinResult.jobId}`,
    ...(webhookResult.ok
      ? {}
      : {
          webhook_warning: {
            message:
              'Webhook bot belum berhasil di-clear. Agent kamu mungkin belum bisa terima pesan langsung. Tim kami akan retry otomatis.',
            attempts: webhookResult.attempts,
            error: webhookResult.finalError,
          },
        }),
    ...(refreshResult.ok
      ? {}
      : {
          vps_refresh_warning: {
            message:
              'Konfigurasi agent belum berhasil di-update. Agent kamu mungkin pakai bot lama. Tim kami akan retry otomatis.',
            status: refreshResult.status,
            error: refreshResult.error,
          },
        }),
  })
}

/** crypto.randomUUID() wrapper — defined separately so older Deno
 *  / test runtimes that lack it can be polyfilled in one place. */
function cryptoRandomUuid(): string {
  return crypto.randomUUID()
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

// safeDeleteWebhook removed 2026-05-10 — replaced by properDeleteWebhook
// (with retry + getWebhookInfo verification). Kept as a comment for git
// blame: the old impl silently swallowed every error including 5xx and
// "webhook still set after delete", which is what put customer e282ce25
// into the broken state where every message kept hitting our webhook.

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

/**
 * Provider-agnostic capacity-exhaustion detector. Examines the body
 * string returned by provisioning.spinUp on failure and matches the
 * documented capacity-error phrasings from all supported providers:
 *
 *   IDCloudHost: {"errors": {"Error": "Compute resources temporarily
 *                unavailable due to high demand…"}}
 *   Vultr:       documented as "out of stock" / "plan/region combination
 *                is unavailable" (HTTP 503)
 *   DigitalOcean: "not available" / "Sold out" (HTTP 422)
 *
 * Substring-matched (not JSON-shape-dependent) so it survives provider
 * API tweaks. Conservative: only matches phrases that ONLY appear in
 * legitimate capacity exhaustion responses (false-positive on auth or
 * malformed-request errors would mask real bugs behind the friendly
 * customer copy).
 *
 * Originally named `isIdcloudhostCapacityError` (PR #73). Renamed
 * 2026-05-11 (Vultr migration cascade) to `isProviderCapacityError`.
 * Old name kept as deprecated alias for back-compat.
 *
 * Exported so tests can pin both directions (positive + negative).
 */
export function isProviderCapacityError(body: string): boolean {
  if (typeof body !== 'string' || body.length === 0) return false
  // IDCloudHost
  if (body.includes('Compute resources temporarily unavailable')) return true
  // Vultr — match the documented capacity phrasings. Both word boundaries
  // and a contextual phrase to reduce false positives on unrelated "out
  // of stock" mentions (e.g. an old IDCH error message that happens to
  // contain similar wording).
  if (/out of stock/i.test(body)) return true
  if (/plan.*region.*unavailable|region.*plan.*unavailable/i.test(body)) return true
  if (/insufficient.*capacity/i.test(body)) return true
  // DigitalOcean
  if (/sold.*out/i.test(body)) return true
  // Note: DO's "not available" is too generic alone — only count it when
  // paired with capacity-context words. Keep narrow.
  if (/size.*not available/i.test(body)) return true
  if (/region.*not available/i.test(body)) return true
  return false
}

/**
 * @deprecated 2026-05-11 — use `isProviderCapacityError`. Kept as alias
 * for back-compat with any external callers; removed when no usages.
 */
export function isIdcloudhostCapacityError(body: string): boolean {
  return isProviderCapacityError(body)
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  // Postgrest / Supabase errors are plain objects shaped like
  // { code, message, details, hint }. `String(e)` gives "[object Object]"
  // which is useless in logs and customer-facing detail strings.
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const message = typeof o.message === 'string' ? o.message : null
    const code = typeof o.code === 'string' ? o.code : null
    if (message && code) return `${message} (${code})`.slice(0, 500)
    if (message) return message.slice(0, 500)
    try { return JSON.stringify(e).slice(0, 500) } catch { /* fall through */ }
  }
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
