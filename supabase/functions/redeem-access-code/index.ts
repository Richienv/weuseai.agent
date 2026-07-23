// Deno Edge Function entry — redeem-access-code.
//
// B2B clients who pay the founder OUTSIDE the system (bank transfer) enter
// an 8-character access code at checkout instead of paying via Xendit. A
// valid code must behave EXACTLY like a paid invoice: activate the customer
// on the code's tier, spin up the VPS, and land on the SAME /welcome page.
//
// Pure handler logic lives in ../_shared/redeem-access-code-handler.ts so
// Node tests can import and exercise it without Deno. This file only wires
// real deps (service-role Supabase client + Fly provisioning HTTP call).
//
// Deploy: supabase functions deploy redeem-access-code
//
// Required env:
//   SUPABASE_URL                — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — set automatically by Supabase
//   PROVISIONING_URL            — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN     — bearer for the Fly /spin-up route
//   ACCESS_CODE_IP_SALT         — server-side salt for the attempt-throttle
//                                 IP hash. NEVER store a raw IP.
// Optional env:
//   PUBLIC_BASE_URL             — defaults to https://weuseai-agent.vercel.app
//   SUPPORT_TELEGRAM_BOT_TOKEN  — founder DM bot (same one xendit-webhook uses)
//   RICHIE_CHAT_ID              — founder DM chat_id
//   When either alert env is unset, alert() is a no-op.
//
// Auth: none at the gateway (verify_jwt = false in supabase/config.toml) —
// the caller is checkout.html in the browser, pre-auth, exactly like
// create-invoice. The access code itself IS the credential, and the handler
// throttles per-IP-hash so the 6.56e11 keyspace can't be walked.

// @ts-ignore — Deno-only import; not resolved during Node typecheck.
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleRedeemAccessCode,
  type AccessCodeRow,
  type RedeemDeps,
} from '../_shared/redeem-access-code-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import type { Tier } from '../_shared/types.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://weuseai-agent.vercel.app'
// Salt for the attempt-throttle IP hash. Without it the hash would be a
// plain sha256 of an IP — trivially reversible by brute-forcing the v4
// space — which is why the column is `ip_hash` and never `ip`.
const IP_SALT = Deno.env.get('ACCESS_CODE_IP_SALT') ?? ''
const ALERT_CHAT_ID = Deno.env.get('RICHIE_CHAT_ID')
const TELEGRAM_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── IP hashing (privacy) ────────────────────────────────────────────

/**
 * The throttle key MUST NOT be attacker-controlled.
 *
 * `x-forwarded-for` is a chain the CLIENT can prefix: a caller sending
 * `x-forwarded-for: <random>` owns the LEFT-most entry, so keying on it
 * gives unlimited guesses (a fresh bucket per request) and also lets an
 * attacker evict a legitimate client by forging THEIR ip. Only the
 * right-most entry is the one appended by our trusted hop.
 *
 * Order: `cf-connecting-ip` (edge-set, unspoofable) → right-most XFF →
 * '' (everyone shares one bucket, which is stricter, so it fails CLOSED).
 */
function extractClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf && cf.trim().length > 0) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff && xff.length > 0) {
    const parts = xff.split(',').map((p) => p.trim()).filter((p) => p.length > 0)
    const last = parts[parts.length - 1]
    if (last) return last
  }
  return ''
}

/** Hex-encoded SHA-256 of `<salt>:<ip>`. The raw IP never leaves this fn. */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${IP_SALT}:${ip}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Store (service-role; bypasses the default-deny RLS on the three
//     access_code* tables, which have RLS enabled and NO policies) ─────

const db: RedeemDeps['db'] = {
  async countRecentFailedAttempts(ipHash, sinceIso) {
    const { count, error } = await supabase
      .from('access_code_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('ok', false)
      .gte('attempted_at', sinceIso)
    // FAIL CLOSED. Returning 0 here would silently disable the ONLY
    // brute-force defense on an endpoint that hands out paid VPSes — an
    // attacker who can make this query fail would get unlimited guesses.
    // Throwing surfaces as a generic 500 via the handler's top-level
    // catch (no oracle), which is the safe direction to fail.
    if (error || typeof count !== 'number') {
      console.error('[redeem-access-code] countRecentFailedAttempts failed:', error)
      throw error ?? new Error('attempt_count_unavailable')
    }
    return count
  },
  async recordAttempt(ipHash, ok) {
    // Best-effort telemetry — a failed audit insert must never break a
    // valid redemption (the code has already been claimed by then).
    const { error } = await supabase
      .from('access_code_attempts')
      .insert({ ip_hash: ipHash, ok })
    if (error) console.error('[redeem-access-code] recordAttempt failed:', error)
  },
  async findCustomerByEmail(email) {
    const { data } = await supabase
      .from('customers')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()
    return data ?? null
  },
  async hasActiveSubscription(customerId) {
    // 'pending_provision' counts as active: the customer already paid (or
    // already redeemed) and their VPS is mid-build. Letting them through
    // would create a SECOND subscription + a SECOND VPS for one customer.
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('customer_id', customerId)
      .in('status', ['active', 'pending_provision'])
      .limit(1)
    if (error) throw error
    return Array.isArray(data) && data.length > 0
  },
  async claimAccessCode(code, nowIso) {
    // THE concurrency guard. PostgREST cannot express either half of this
    // (`redeemed_count = redeemed_count + 1` is a column-referencing SET,
    // and `redeemed_count < max_redemptions` is a column-to-column filter),
    // so the atomic conditional UPDATE lives in the Postgres function
    // public.claim_access_code — see supabase/migrations/20260723000000_access_codes.sql.
    const { data, error } = await supabase.rpc('claim_access_code', {
      p_code: code,
      p_now: nowIso,
    })
    if (error) throw error
    const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
    return (row as AccessCodeRow | null) ?? null
  },
  async releaseAccessCode(accessCodeId) {
    // Compensating decrement (floors at 0 inside the function), so a
    // redemption that fails after the claim does not cost the client their
    // single use. Defined alongside claim_access_code in the same migration.
    const { error } = await supabase.rpc('release_access_code', { p_id: accessCodeId })
    if (error) throw error
  },
  async insertCustomer(input) {
    const { data, error } = await supabase
      .from('customers')
      .insert(input)
      .select('id, email')
      .single()
    if (error) throw error
    return data as { id: string; email: string }
  },
  async insertSubscription(input) {
    // NOTE: unlike create-invoice / xendit-webhook this does NOT force
    // hosting_active:false — a redeemed code activates immediately, so
    // the handler's hosting_active:true is written through as-is.
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(input)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  },
  async updateSubscription(id, patch) {
    const { error } = await supabase
      .from('subscriptions')
      .update(patch)
      .eq('id', id)
    if (error) throw error
  },
  async insertConsentEvent(input) {
    const { data, error } = await supabase
      .from('consent_events')
      .insert(input)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  },
  async insertRedemption(input) {
    const { error } = await supabase
      .from('access_code_redemptions')
      .insert(input)
    if (error) throw error
  },
  // Mirrors xendit-webhook's clearStalePairState: wipe pair state on every
  // transition into an active subscription so a returning customer's new
  // VPS never binds their OLD bot. The handler calls this best-effort.
  async clearStalePairState(customerId) {
    const { error } = await supabase
      .from('customers')
      .update({
        telegram_bot_token: null,
        telegram_bot_username: null,
        telegram_chat_id: null,
        soul_md_text: null,
        pairing_code: null,
        pairing_code_expires_at: null,
      })
      .eq('id', customerId)
    if (error) throw error
  },
}

// ─── Provisioning client (HTTP call to Fly /spin-up) ─────────────────

const provisioning: RedeemDeps['provisioning'] = {
  async spinUp(input) {
    const url = PROVISIONING_URL.replace(/\/$/, '') + '/spin-up'
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        customerId: input.customer_id,
        tier: input.tier as Tier,
        // Always '' here: a code redemption is always a fresh pre-pairing
        // customer, and empty-string keeps spin-up-helpers.ts from falling
        // back to the shared @weuseaibot platform token (Telegram 409
        // conflict storms). Same semantics as xendit-webhook's case 2.
        customerTelegramBotToken: '',
        alwaysOnEnabled: input.always_on,
        // Mirrors xendit-webhook-handler exactly — starter credits are
        // scoped to the legacy `starter` slug only.
        useStarterCredits: input.tier === 'starter',
      }),
    })
    // Contract: spinUp resolves void on success and THROWS on failure, so
    // the handler parks the subscription as pending_provision, alerts, and
    // still returns 200 (the retry worker + /welcome polling take over).
    if (!r.ok) {
      const body = await r.text().catch(() => '<unreadable>')
      throw new Error(`spin-up failed: HTTP ${r.status} ${body}`)
    }
  },
}

// ─── Founder alert (best-effort) ─────────────────────────────────────

async function alert(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !ALERT_CHAT_ID) return
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: ALERT_CHAT_ID, text }),
      },
    )
    if (!r.ok) {
      const body = await r.text().catch(() => '<unreadable>')
      console.error(`[redeem-access-code] alert Telegram non-2xx: ${r.status} ${body}`)
    }
  } catch (err) {
    console.error(
      '[redeem-access-code] alert Telegram fetch threw: ' +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  try {
    if (!IP_SALT) {
      // Without the salt the ip_hash column would be a reversible sha256
      // of a raw IP. Refuse rather than ship a privacy regression.
      console.error('[redeem-access-code] ACCESS_CODE_IP_SALT is not set')
      return withCors(
        new Response(
          JSON.stringify({ error: 'server_error' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
        req,
      )
    }

    const ipHash = await hashIp(extractClientIp(req))
    const res = await handleRedeemAccessCode(req, {
      db,
      provisioning,
      publicBaseUrl: PUBLIC_BASE,
      ipHash,
      alert,
    })
    return withCors(res, req)
  } catch (e) {
    // Same guard as create-invoice: an uncaught error must not escape as a
    // raw 500 WITHOUT cors headers, or the browser mislabels it a CORS block.
    console.error('[redeem-access-code] uncaught:', e)
    return withCors(
      new Response(
        JSON.stringify({ error: 'server_error' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }
})
