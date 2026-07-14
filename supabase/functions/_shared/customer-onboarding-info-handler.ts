// customer-onboarding-info — returns the customer's payment-record
// email (+ name / whatsapp) so the onboarding form shows the SAME email
// the customer paid with. Pure handler — Deno (Edge Function) + Node
// (test runner).
//
// Why this exists — email-mismatch bug (2026-05-17):
//   onboarding.html cannot SELECT customers.email (Sesi D P0-2 added a
//   column-level REVOKE on PII for the anon role). So it fell back to a
//   GLOBAL browser localStorage key ('onboarding_checkout_email'). Any
//   browser that ran more than one checkout — a founder testing, a
//   shared/family machine, one person buying two agents — showed the
//   WRONG (previous) customer's email on the onboarding form.
//
//   The email is metadata of the PAYMENT: xendit-webhook writes it from
//   Xendit's payer_email when it creates the customers row. It must be
//   sourced from THAT row, server-side — never from browser state.
//
// This handler runs with the service-role store (bypasses the anon
// column REVOKE) and is X-CID gated exactly like customer-readiness /
// customer-progress-proxy: the X-CID header MUST equal the body
// customer_id, else 403 — closes the cross-customer email-leak surface.

import type { IOnboardingStore } from './types.ts'

export type CustomerOnboardingInfoDeps = {
  db: IOnboardingStore
}

export type CustomerOnboardingInfoBody = {
  customer_id: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleCustomerOnboardingInfo(
  req: Request,
  deps: CustomerOnboardingInfoDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: CustomerOnboardingInfoBody
  try {
    body = (await req.json()) as CustomerOnboardingInfoBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.customer_id !== 'string' || !UUID_RE.test(body.customer_id)) {
    return json({ error: 'invalid_field', field: 'customer_id' }, 400)
  }

  // X-CID gate — MANDATORY, mismatch → 403 (Sesi D pass-3 P1-2 pattern,
  // mirrors customer-readiness / customer-progress-proxy). Without it any
  // anon-JWT holder could read any customer's email by submitting its
  // UUID. The header is set by onboarding.html alongside the body.
  const headerCid = req.headers.get('x-cid')
  if (!headerCid || headerCid !== body.customer_id) {
    return json({ error: 'x_cid_mismatch' }, 403)
  }

  let customer
  try {
    customer = await deps.db.findCustomerById(body.customer_id)
  } catch (e) {
    console.error(
      `[customer-onboarding-info] findCustomerById error for ${body.customer_id}: ${errMsg(e)}`,
    )
    return json({ error: 'internal' }, 500)
  }
  if (!customer) {
    return json({ error: 'unknown_customer' }, 404)
  }

  // The payment-record email is the source of truth for the onboarding
  // form. display_name + whatsapp_number are returned too so the form
  // can prefill them from the server instead of browser state.
  return json({
    email: customer.email ?? null,
    display_name: customer.display_name ?? null,
    whatsapp_number: customer.whatsapp_number ?? null,
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e).slice(0, 300)
}
