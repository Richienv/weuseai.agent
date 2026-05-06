// Pure handler for rotate-pairing-code. Web Platform APIs only — runs in
// Deno (production Edge Function) and Node ≥18 (test runner).
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "Pairing code generator" — replaces in-page PATCH after the
//   2026-05-06 incident (anon column-grant approach was insufficient
//   to scope writes; broader role grants combined to allow mutating
//   any column).
//
// Contract:
//   POST /functions/v1/rotate-pairing-code
//   Body:  { customer_id: string }
//   200:   { code: string, expires_at: string }   // both rotated
//          or:
//          { code: string, expires_at: string, reused: true }
//          // when an existing non-expired code is found and reused
//   404:   { error: 'no_paid_subscription' } (no paid sub for this cid)
//   400:   { error: 'invalid_json' | 'missing_field' }
//   405:   { error: 'method_not_allowed' }
//   500:   { error: 'internal' }
//
// Auth model: anyone with the cid UUID can rotate. Same risk profile as
// anon SELECT on customers (Phase 1 acceptable; Phase 2B JWT swap
// scopes by bearer).

import {
  generatePairingCode,
  isPairingCodeExpired,
} from './pairing-code.ts'
import type { IOnboardingStore } from './types.ts'

export type RotatePairingCodeDeps = {
  db: IOnboardingStore
  now?: () => number
  /** Number of unique-collision retries before failing. Default 5. */
  maxRetries?: number
}

export type RotatePairingCodeBody = {
  customer_id: string
}

export async function handleRotatePairingCode(
  req: Request,
  deps: RotatePairingCodeDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: RotatePairingCodeBody
  try {
    body = (await req.json()) as RotatePairingCodeBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!body || typeof body.customer_id !== 'string' || !body.customer_id) {
    return json({ error: 'missing_field', field: 'customer_id' }, 400)
  }

  const { customer_id } = body
  const now = deps.now ?? (() => Date.now())

  // Verify cid maps to a paid subscription. Without this anyone with a
  // valid customers.id (e.g. an old test row) could rotate codes.
  const subscription = await deps.db
    .findActiveOrPendingSubscriptionByCustomer(customer_id)
  if (!subscription) {
    return json({ error: 'no_paid_subscription' }, 404)
  }

  const customer = await deps.db.findCustomerById(customer_id)
  if (!customer) {
    return json({ error: 'no_paid_subscription' }, 404)
  }

  // Reuse case: a fresh, unexpired code already exists. Return it
  // without rotating — saves a round-trip + keeps the code stable
  // across tab reloads (important UX detail per the spec).
  if (
    customer.pairing_code &&
    !isPairingCodeExpired(customer.pairing_code_expires_at, now)
  ) {
    return json({
      code: customer.pairing_code,
      expires_at: customer.pairing_code_expires_at!,
      reused: true,
    })
  }

  // Rotation: generate a fresh code + expiry. Retry on unique-violation
  // collisions (the partial unique index on customers.pairing_code
  // protects against two customers ending up with the same active code).
  const maxRetries = deps.maxRetries ?? 5
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { code, expiresAt } = generatePairingCode(now)
    try {
      await deps.db.updateCustomer(customer_id, {
        pairing_code: code,
        pairing_code_expires_at: expiresAt,
      })
      return json({ code, expires_at: expiresAt })
    } catch (err) {
      // Detect Postgres unique violation by SQLSTATE or message.
      const msg = err instanceof Error ? err.message : String(err)
      const isUniqueViolation =
        msg.includes('23505') || /unique/i.test(msg)
      if (!isUniqueViolation) {
        return json(
          { error: 'internal', detail: msg.slice(0, 300) },
          500,
        )
      }
      // else: loop, try a different random code
    }
  }

  return json(
    { error: 'internal', detail: 'pairing code collision after retries' },
    500,
  )
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
