// admin-customer-vps-refresh — pure handler.
//
// Track 3c (2026-05-10): manual rescue path for customers whose VPS
// has stale .env (per-customer bot token never reached the VPS).
// Decrypts the customer's bot token via Supabase RPC + calls
// provisioning's /refresh-env with caller-supplied env values.
//
// Auth: caller MUST be service-role (verified at the Edge Function
// entry via isServiceRoleCaller from admin-auth.ts). This pure
// handler trusts that the entry point did the check.

import type {
  IOnboardingProvisioningClient,
  IOnboardingStore,
  ITelegramClient,
} from './types.ts'
import { sendProactiveGreeting } from './proactive-greeting.ts'

export type AdminCustomerVpsRefreshDeps = {
  db: IOnboardingStore
  provisioning: IOnboardingProvisioningClient
  /** Bug-1 fix (2026-05-16): used to deliver the proactive greeting on
   *  the second-finisher path. This handler is the path that starts the
   *  gateway for a fast customer whose complete-onboarding deferred —
   *  so it must also be the path that greets them. */
  telegram: ITelegramClient
}

export type AdminCustomerVpsRefreshBody = {
  customer_id: string
  /** Free-text reason for the audit log. Optional but encouraged. */
  reason?: string
}

export async function handleAdminCustomerVpsRefresh(
  req: Request,
  deps: AdminCustomerVpsRefreshDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: AdminCustomerVpsRefreshBody
  try {
    body = (await req.json()) as AdminCustomerVpsRefreshBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.customer_id !== 'string' || body.customer_id.length === 0) {
    return json({ error: 'missing_field', field: 'customer_id' }, 400)
  }

  // Customer must exist (check before doing crypto work).
  const customer = await deps.db.findCustomerById(body.customer_id)
  if (!customer) {
    return json({ error: 'unknown_customer' }, 404)
  }

  // Decrypt the customer's current bot token. This is the value we
  // want on the VPS .env (Hermes uses it to long-poll Telegram).
  let botToken: string | null
  try {
    botToken = await deps.db.getDecryptedBotToken(body.customer_id)
  } catch (err) {
    return json(
      { error: 'decrypt_failed', detail: errMsg(err) },
      500,
    )
  }
  if (!botToken) {
    return json(
      {
        error: 'no_bot_token',
        detail: 'customer has no bot token set — cannot refresh env',
      },
      409,
    )
  }

  // Call provisioning. request_id includes the caller's reason hash so
  // an admin can re-fire safely without colliding with a different
  // refresh kicked off by complete-onboarding-handler.
  //
  // Phase E Option 2 part 1 (2026-05-14): atomic token + allowlist push.
  // The pre-Phase-E version pushed only TELEGRAM_BOT_TOKEN, leaving the
  // gateway running but TELEGRAM_ALLOWED_USERS unset → all /start
  // messages denied (Renita Stage 5 bug class found by Phase D smoke).
  // When customer.telegram_chat_id is present, push both keys in the
  // same envValues map. The refresh-env route runs them under
  // `set -euo pipefail` so the gateway is only restarted if BOTH
  // writes succeed. When chat_id is null (customer paid but never
  // paired), pushing an empty allowlist would lock the bot to nobody —
  // we omit the key entirely instead (handler-side gate, mirrors
  // upstream pre-approve gating below).
  const envValues: {
    TELEGRAM_BOT_TOKEN: string
    TELEGRAM_ALLOWED_USERS?: string
    TELEGRAM_HOME_CHANNEL?: string
  } = {
    TELEGRAM_BOT_TOKEN: botToken,
  }
  if (customer.telegram_chat_id) {
    envValues.TELEGRAM_ALLOWED_USERS = customer.telegram_chat_id
    // Bug-2 fix (2026-05-16): set the customer's chat as the Telegram
    // home channel so Hermes never prompts "No home channel is set…
    // /sethome". Config-only — Hermes reads TELEGRAM_HOME_CHANNEL from
    // .env. Pushed in the same atomic .env rewrite as the token.
    envValues.TELEGRAM_HOME_CHANNEL = customer.telegram_chat_id
  }
  const requestId = crypto.randomUUID()
  const refreshResult = await deps.provisioning.refreshEnv({
    customerId: body.customer_id,
    envValues,
    // Pass SOUL.md too so admin rescue produces an in-character agent.
    // When customer has no soul_md_text yet (rare — would mean step 4
    // never ran), refreshEnv just skips the SOUL.md write.
    soulMdContent: customer.soul_md_text ?? undefined,
    // Pre-approve customer's chat_id so first /start lands directly
    // on the in-character agent (skips Hermes upstream's pairing-code
    // prompt). chat_id is whatever was captured during step 3 /pair
    // (or null if pairing never completed — refreshEnv just skips
    // pre-approve in that case). Distinct from TELEGRAM_ALLOWED_USERS
    // above: the env var is what the gateway reads at boot; this
    // pre-approve writes to /home/weuseai/.hermes/pairing/telegram-
    // approved.json (upstream Hermes pairing-cache).
    telegramChatId: customer.telegram_chat_id ?? undefined,
    telegramUserName: customer.display_name ?? undefined,
    requestId,
  })

  // Audit: ad-hoc inline logging today (per docs/triggers/admin-audit-
  // consolidation.md, we don't promote to admin_audit_log until N=3
  // admin functions exist).
  console.log(
    `[admin-customer-vps-refresh] cid=${body.customer_id} ` +
      `reason="${(body.reason ?? '').slice(0, 200)}" ` +
      `request_id=${requestId} ` +
      `outcome=${refreshResult.ok ? 'ok' : 'fail'} ` +
      `${refreshResult.ok ? `vps_id=${refreshResult.vpsId} ip=${refreshResult.ipAddress}` : `status=${refreshResult.status} error=${refreshResult.error ?? 'n/a'}`}`,
  )

  if (!refreshResult.ok) {
    // Map provisioning failure status → admin-side response.
    return json(
      {
        ok: false,
        error: refreshResult.error ?? 'provisioning_error',
        upstream_status: refreshResult.status,
        upstream_body: refreshResult.body,
        request_id: requestId,
      },
      refreshResult.status === 404 ? 404
        : refreshResult.status === 502 ? 502
        : refreshResult.status === 503 ? 503
        : 500,
    )
  }

  // ─── Bug-1 fix (2026-05-16): second-finisher proactive greeting ────
  // refreshEnv succeeded → the gateway is up with the customer's bot
  // token. This handler is the path that starts the gateway for a fast
  // customer whose complete-onboarding deferred (and therefore skipped
  // the greeting). Deliver the greeting now, gated by greeting_sent_at
  // so it fires exactly once across both paths. The admin path has no
  // plaintext OpenRouter key, so sendProactiveGreeting falls back to
  // the in-character Indonesian template — still a real greeting.
  // Best-effort: a greeting failure never downgrades the refresh result.
  let greeting: { ok: boolean; source: string } = { ok: false, source: 'skipped' }
  if (customer.greeting_sent_at) {
    greeting = { ok: true, source: 'already_sent' }
  } else if (customer.telegram_chat_id) {
    const g = await sendProactiveGreeting(
      {
        chatId: customer.telegram_chat_id,
        botToken,
        soulMdText: customer.soul_md_text,
        customerName: (customer.display_name ?? '').trim() || customer.email,
        openrouterApiKey: null,
      },
      { telegram: deps.telegram },
    )
    greeting = { ok: g.ok, source: g.source }
    if (g.ok) {
      try {
        await deps.db.markGreetingSent(body.customer_id)
      } catch (err) {
        console.error(
          `[admin-customer-vps-refresh] markGreetingSent failed cid=${body.customer_id}: ${errMsg(err)}`,
        )
      }
    } else {
      console.error(
        `[admin-customer-vps-refresh] proactive greeting failed cid=${body.customer_id} ` +
          `source=${g.source} error=${g.error ?? 'n/a'}`,
      )
    }
  }

  return json({
    ok: true,
    customer_id: body.customer_id,
    vps_id: refreshResult.vpsId,
    ip_address: refreshResult.ipAddress,
    applied: refreshResult.applied,
    hermes_restart_at: refreshResult.hermesRestartAt,
    greeting,
    request_id: requestId,
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
