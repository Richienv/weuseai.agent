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
} from './types.ts'

export type AdminCustomerVpsRefreshDeps = {
  db: IOnboardingStore
  provisioning: IOnboardingProvisioningClient
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
  const requestId = crypto.randomUUID()
  const refreshResult = await deps.provisioning.refreshEnv({
    customerId: body.customer_id,
    envValues: { TELEGRAM_BOT_TOKEN: botToken },
    // Pass SOUL.md too so admin rescue produces an in-character agent.
    // When customer has no soul_md_text yet (rare — would mean step 4
    // never ran), refreshEnv just skips the SOUL.md write.
    soulMdContent: customer.soul_md_text ?? undefined,
    // Pre-approve customer's chat_id so first /start lands directly
    // on the in-character agent (skips Hermes upstream's pairing-code
    // prompt). chat_id is whatever was captured during step 3 /pair
    // (or null if pairing never completed — refreshEnv just skips
    // pre-approve in that case).
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

  return json({
    ok: true,
    customer_id: body.customer_id,
    vps_id: refreshResult.vpsId,
    ip_address: refreshResult.ipAddress,
    applied: refreshResult.applied,
    hermes_restart_at: refreshResult.hermesRestartAt,
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
