// Pure handler for redeem-access-code. Web Platform APIs only — runs in Deno
// (production Edge Function) and Node 18+ (test runner).
//
// Business context: some B2B clients pay the founder OUTSIDE the system (bank
// transfer). Those clients redeem an 8-character ACCESS CODE at checkout
// instead of paying via Xendit. A valid redemption must behave EXACTLY like a
// paid invoice — activate the customer on the code's tier, spin up the VPS,
// and land on the SAME /welcome page the Xendit flow lands on.
//
// Everything reaches the outside world through `deps` (no fetch, no Supabase
// client here) so the security-critical order of operations is unit-testable.

/**
 * Canonical code alphabet: ABCDEFGHJKMNPQRSTVWXYZ23456789 (30 chars).
 * I, L, O, U, 0 and 1 are excluded so a code read off a WhatsApp message or
 * a bank-transfer receipt can't be mis-transcribed. Length 8 → keyspace
 * 30^8 ≈ 6.56e11, which is why the throttle below is the real defense.
 */
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/

/** Failed attempts per IP inside ATTEMPT_WINDOW_MS before we stop answering. */
export const MAX_FAILED_ATTEMPTS = 10

/** Rolling window the failed-attempt count is measured over (15 minutes). */
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000

/**
 * Max age of `tos_accepted_at` accepted by the server (24 hours).
 * Same value + rationale as create-invoice-handler.ts: tighter than the
 * localStorage staleness in checkout.html so an attacker can't replay an old
 * localStorage value across a long absence.
 */
const TOS_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** One billing cycle. Mirrors xendit-webhook-handler's PAID branch. */
const BILLING_CYCLE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Normalize a customer-typed code to storage form: uppercase, strip
 * everything that isn't A–Z / 0–9. Absorbs the display dash (XXXX-XXXX),
 * spaces, and stray punctuation. Non-string input normalizes to a value the
 * format check will reject — never throws.
 */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** The columns claimAccessCode returns from its conditional UPDATE. */
export interface AccessCodeRow {
  id: string
  code: string
  tier: string
  always_on: boolean
  label: string | null
}

export interface RedeemDeps {
  db: {
    countRecentFailedAttempts(ipHash: string, sinceIso: string): Promise<number>
    recordAttempt(ipHash: string, ok: boolean): Promise<void>
    findCustomerByEmail(email: string): Promise<{ id: string; email: string } | null>
    hasActiveSubscription(customerId: string): Promise<boolean>
    claimAccessCode(code: string, nowIso: string): Promise<AccessCodeRow | null>
    /** Compensating decrement — gives a code back when the redemption it was
     *  claimed for cannot complete. Must be idempotent-safe (floor at 0). */
    releaseAccessCode(accessCodeId: string): Promise<void>
    insertCustomer(input: { email: string }): Promise<{ id: string; email: string }>
    insertSubscription(input: {
      customer_id: string
      tier: string
      always_on_enabled: boolean
      status: string
      hosting_active: boolean
      next_billing_at: string
      source: string
    }): Promise<{ id: string }>
    updateSubscription(id: string, patch: Record<string, unknown>): Promise<void>
    insertConsentEvent(input: Record<string, unknown>): Promise<{ id: string }>
    insertRedemption(input: {
      access_code_id: string
      customer_id: string
      subscription_id: string
      email: string
    }): Promise<void>
    clearStalePairState(customerId: string): Promise<void>
  }
  provisioning: {
    spinUp(input: { customer_id: string; tier: string; always_on: boolean }): Promise<void>
  }
  publicBaseUrl: string
  /** sha256 of the client IP, hashed upstream in index.ts. NEVER a raw IP. */
  ipHash: string
  now?: () => Date
  alert?: (msg: string) => Promise<void>
}

export type RedeemAccessCodeBody = {
  code: string
  email: string
  /** ISO8601 — same server-side ToS gate create-invoice enforces. */
  tos_accepted_at: string
  marketing_opt_in_at?: string | null
  policy_version?: string
}

export async function handleRedeemAccessCode(
  req: Request,
  deps: RedeemDeps,
): Promise<Response> {
  // 1. POST-only.
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Claim-compensation state. A code is consumed the moment claimAccessCode
  // succeeds, but the customer is not really served until the subscription
  // row lands. Anything that throws in between must give the code back —
  // otherwise our own bookkeeping error silently destroys a client's
  // single-use code. Released in the top-level catch below.
  let claimedCodeId: string | null = null
  let activated = false

  try {
    let body: RedeemAccessCodeBody
    try {
      body = (await req.json()) as RedeemAccessCodeBody
    } catch {
      return json({ error: 'invalid_input' }, 400)
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'invalid_input' }, 400)
    }
    // Email shape check mirrors create-invoice-handler's validate().
    if (typeof body.email !== 'string' || !body.email.includes('@')) {
      return json({ error: 'invalid_input' }, 400)
    }
    if (typeof body.code !== 'string' || body.code.length === 0) {
      return json({ error: 'invalid_input' }, 400)
    }
    // NOTE: tier / plan / always_on are NEVER read from the request. They come
    // from the claimed access_codes row only (step 10). Any such field in the
    // body is ignored outright — that is the whole privilege-escalation guard.

    const now = deps.now?.() ?? new Date()
    const code = normalizeCode(body.code)

    // 2. THROTTLE FIRST — before the format check, before consent, before any
    // read that could confirm or deny a code. A brute-forcer must learn
    // nothing but "too_many_attempts". A throw here propagates to the
    // top-level catch → 500, i.e. the limiter fails CLOSED: an attacker can
    // never bypass it by making the counter query error.
    const sinceIso = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString()
    const recentFailures = await deps.db.countRecentFailedAttempts(deps.ipHash, sinceIso)
    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      logRedeemReject('throttled', code.length, 429)
      return json({ error: 'too_many_attempts' }, 429)
    }

    // 3. Format check. Malformed is answered with the SAME error as unknown /
    // expired / revoked / exhausted — no oracle, no status-code tell.
    if (!CODE_RE.test(code)) {
      await recordAttemptBestEffort(deps, false)
      logRedeemReject('malformed', code.length, 400)
      return json({ error: 'invalid_code' }, 400)
    }

    // 4. Consent gate — BEFORE any side effect, so a request without a
    // recorded ToS acceptance can never burn a code or create a customer.
    // Same rules + error codes as create-invoice-handler (UU PDP Art. 22(1)).
    const consentError = validateConsent(body, now)
    if (consentError) return json({ error: consentError }, 400)

    // 5. Atomic claim — FIRST, before any email lookup.
    //
    // The conditional UPDATE (revoked_at is null, not expired,
    // redeemed_count < max_redemptions) is THE concurrency guard: two
    // simultaneous requests for the last redemption cannot both win. A null
    // return means unknown OR expired OR revoked OR exhausted, answered
    // identically so the endpoint leaks nothing.
    //
    // Claiming BEFORE the duplicate-email check is deliberate: it means an
    // attacker without a valid code can never reach the `already_active`
    // branch, so this endpoint cannot be used to enumerate which emails are
    // customers. The cost — a claim that later turns out to be unusable — is
    // paid back by releaseAccessCode below, so no client loses a code to our
    // own bookkeeping.
    const email = body.email
    const codeRow = await deps.db.claimAccessCode(code, now.toISOString())
    if (!codeRow) {
      await recordAttemptBestEffort(deps, false)
      logRedeemReject('unclaimable', code.length, 400)
      return json({ error: 'invalid_code' }, 400)
    }
    claimedCodeId = codeRow.id

    // 6. Duplicate guard. Now that the code is known-good, refuse to build a
    // SECOND subscription (and a second billed VPS) for a customer who
    // already has one — and hand the code back so they can use it properly.
    let customer = await deps.db.findCustomerByEmail(email)
    if (customer && (await deps.db.hasActiveSubscription(customer.id))) {
      await releaseBestEffort(deps, codeRow.id)
      return json({ error: 'already_active' }, 409)
    }

    // 7 + 8. Customer must exist before consent can be written:
    // consent_events.customer_id is NOT NULL and FKs to customers(id) (see
    // 20260513000000_sesi_d_pass3_p0_consent_events.sql), so the insert would
    // fail with a null id. The ordering that MATTERS is preserved — consent
    // is persisted before the subscription, the redemption row, and spin-up,
    // so no customer can end up activated without a server-side ToS record.
    if (!customer) {
      customer = await deps.db.insertCustomer({ email })
    }

    const ip = extractClientIp(req)
    const userAgent = req.headers.get('user-agent')?.slice(0, 1000) ?? null
    const policyVersion = body.policy_version || 'v1.0'
    // NOT best-effort: no consent row, no activation. A throw lands in the
    // top-level catch → 500 server_error.
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

    // 9. Wipe stale pair state (HF-1, same rationale as xendit-webhook's PAID
    // branch): a reused email must not bind the new VPS to an OLD bot token.
    // Best-effort — loud, but never fails an otherwise-good redemption.
    try {
      await deps.db.clearStalePairState(customer.id)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(
        `[redeem-access-code] clearStalePairState failed for ${customer.id} ` +
          `(stale pair state — new VPS may bind the OLD bot, corruption risk): ${detail}`,
      )
      await alertBestEffort(
        deps,
        `[stale-pair-state alert]\nclearStalePairState failed for ${customer.id} during access-code redemption: ${detail}\nStale token may bind the new VPS to the OLD bot — investigate before the customer pairs.`,
      )
    }

    // 10. Activate. tier + always_on come FROM THE CODE ROW ONLY. Status is
    // 'active' and hosting_active true up front because /welcome polls
    // subscriptions.status and must not see a pending row after redirect.
    const nextBilling = new Date(now.getTime() + BILLING_CYCLE_MS)
    const subscription = await deps.db.insertSubscription({
      customer_id: customer.id,
      tier: codeRow.tier,
      always_on_enabled: codeRow.always_on,
      status: 'active',
      hosting_active: true,
      next_billing_at: nextBilling.toISOString(),
      source: 'access_code',
    })
    // Past the point of no return: the customer is live, so the code stays
    // consumed even if a later best-effort step fails.
    activated = true

    // 11. Audit row. Best-effort: the code is already claimed and the customer
    // is already active — losing the audit row must not 500 a live customer.
    try {
      await deps.db.insertRedemption({
        access_code_id: codeRow.id,
        customer_id: customer.id,
        subscription_id: subscription.id,
        email,
      })
    } catch (err) {
      console.error(
        `[redeem-access-code] insertRedemption failed for customer=${customer.id} ` +
          `sub=${subscription.id} code_id=${codeRow.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      )
      await alertBestEffort(
        deps,
        `[access-code alert]\nRedemption audit row failed to write for customer ${customer.id} (sub ${subscription.id}, code_id ${codeRow.id}). The code IS claimed and the customer IS active — reconcile manually.`,
      )
    }

    // 12. Spin up. Same posture as xendit-webhook's provision_deferred: the
    // "payment" is real (it landed in the founder's bank account), so a
    // provisioning failure parks the subscription for the retry worker and
    // STILL returns 200 — /welcome polls and the customer sees progress there
    // instead of a dead end on checkout.
    let provisionFailureReason: string | null = null
    try {
      await deps.provisioning.spinUp({
        customer_id: customer.id,
        tier: codeRow.tier,
        always_on: codeRow.always_on,
      })
    } catch (err) {
      provisionFailureReason = `threw: ${err instanceof Error ? err.message : String(err)}`
      const errClass = err instanceof Error ? err.name : typeof err
      console.error(
        `[redeem-access-code] spinUp threw for ${customer.id} (sub ${subscription.id}) ` +
          `[errClass=${errClass}]: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (provisionFailureReason) {
      // hosting_active false so the dashboard doesn't lie about service state.
      // next_billing_at stays put — the cycle starts from redemption date.
      await deps.db.updateSubscription(subscription.id, {
        status: 'pending_provision',
        hosting_active: false,
      })
      await alertBestEffort(
        deps,
        `[provisioning alert]\nspin-up failed for ${customer.id} (sub ${subscription.id}, access code): ${provisionFailureReason}\nSubscription marked pending_provision — retry worker should pick up.`,
      )
    }

    // 13. Success. The attempt log records the hit so the throttle window
    // reflects reality; a write failure here never blocks the customer.
    await recordAttemptBestEffort(deps, true)

    return json({
      ok: true,
      redirect_url: `${trimTrailingSlash(deps.publicBaseUrl)}/welcome?cid=${customer.id}`,
    })
  } catch (err) {
    // Never echo the submitted code (or any DB detail) back to the caller.
    console.error(
      `[redeem-access-code] unhandled failure: ` +
        (err instanceof Error ? `${err.name}: ${err.message}` : String(err)),
    )
    // The claim happened but the customer never got activated — give the code
    // back so our failure does not cost the client their single use.
    if (claimedCodeId && !activated) {
      await releaseBestEffort(deps, claimedCodeId)
    }
    return json({ error: 'server_error' }, 500)
  }
}

/**
 * Consent validation — byte-for-byte the same rules as
 * create-invoice-handler.validateConsent():
 *   - tos_required: `tos_accepted_at` missing, non-string, or unparseable
 *   - tos_stale: future-dated (beyond 60s of clock skew) OR older than 24h
 * `marketing_opt_in_at` is optional but validated under the same prefix when
 * present — the two checkboxes share one submit event.
 */
function validateConsent(body: RedeemAccessCodeBody, now: Date): string | null {
  if (typeof body.tos_accepted_at !== 'string' || body.tos_accepted_at.length === 0) {
    return 'tos_required'
  }
  const tosTs = Date.parse(body.tos_accepted_at)
  if (Number.isNaN(tosTs)) return 'tos_required'
  const nowMs = now.getTime()
  if (tosTs > nowMs + 60_000) return 'tos_stale'
  if (nowMs - tosTs > TOS_MAX_AGE_MS) return 'tos_stale'

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
 * Attempt logging is telemetry for the throttle, never a gate. A failed write
 * must not turn a good redemption into a 500 (nor a bad code into anything
 * other than invalid_code).
 */
async function recordAttemptBestEffort(deps: RedeemDeps, ok: boolean): Promise<void> {
  try {
    await deps.db.recordAttempt(deps.ipHash, ok)
  } catch (err) {
    console.error(
      `[redeem-access-code] recordAttempt(ok=${ok}) failed: ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

/** Founder alert. Best-effort by contract — a failed alert never fails a request. */
/**
 * Hand a claimed code back. Used when a redemption cannot complete AFTER the
 * claim — a duplicate email, or any failure before the subscription lands.
 * Never throws: losing the release is bad (one code burned) but throwing here
 * would mask the real error that triggered it.
 */
async function releaseBestEffort(deps: RedeemDeps, accessCodeId: string): Promise<void> {
  try {
    await deps.db.releaseAccessCode(accessCodeId)
  } catch (err) {
    console.error(
      `[redeem-access-code] releaseAccessCode failed for code_id=${accessCodeId} ` +
        `(code stays consumed — reconcile manually): ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

async function alertBestEffort(deps: RedeemDeps, msg: string): Promise<void> {
  if (!deps.alert) return
  try {
    await deps.alert(msg)
  } catch (err) {
    console.error(
      `[redeem-access-code] alert failed: ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }
}

/**
 * Structured, greppable rejection log. Mirrors logTokenReject in
 * xendit-webhook-handler: reason + LENGTH only, never the code itself, so a
 * valid B2B code can never be lifted out of the function logs.
 */
function logRedeemReject(
  reason: 'malformed' | 'unclaimable' | 'throttled',
  presentedLen: number,
  status: number,
): void {
  console.warn(
    `[redeem-access-code] rejected reason=${reason} presented_len=${presentedLen} status=${status}`,
  )
}

/**
 * Originating client IP for the consent_events audit row — same extraction
 * create-invoice-handler uses. Unrelated to `deps.ipHash`, which is the
 * already-hashed value the throttle keys on (access_code_attempts NEVER
 * stores a raw IP).
 */
function extractClientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf && cf.length > 0) return sanitizeIp(cf)
  const xff = req.headers.get('x-forwarded-for')
  if (xff && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first && first.length > 0) return sanitizeIp(first)
  }
  return null
}

/**
 * `consent_events.ip_address` is Postgres `inet` — an unparseable value makes
 * the INSERT throw. This value ultimately derives from a CLIENT-SUPPLIED proxy
 * header, so a malformed one must degrade to null rather than fail (and thereby
 * burn) an otherwise-valid redemption. Anything not clearly IPv4/IPv6 → null.
 */
function sanitizeIp(raw: string | null): string | null {
  if (!raw) return null
  const ip = raw.trim()
  if (ip.length === 0 || ip.length > 45) return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (v4) {
    return v4.slice(1).every((o) => o.length <= 3 && Number(o) <= 255) ? ip : null
  }
  if (ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip)) return ip
  return null
}

function trimTrailingSlash(url: string): string {
  return (url ?? '').replace(/\/+$/, '')
}

/**
 * CORS is deliberately NOT applied here — the entrypoint wraps every response
 * with withCors(res, req) from _shared/cors.ts so the origin echo stays
 * dynamic. Do not add an access-control-allow-origin header in this file.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
