// Pure handler for save-onboarding-profile. Web Platform APIs only.
//
// Wired by onboarding.html step 1 submit (2026-05-10 P0 fix). Captures
// display_name + email + whatsapp_number for customers who completed
// checkout without filling those fields.
//
// Why this exists: checkout's create-invoice required `email` but
// `name` (display_name) and `whatsapp_number` were collected only
// in the UI and not always populated when the form was submitted.
// Founder's e2e repro (2026-05-10) hit this — paid invoice without
// Name + WhatsApp, then onboarding step 1 had nowhere to capture
// them server-side because step 1's submit was localStorage-only.
//
// Service-role only (anon UPDATE on customers is locked per Sesi D
// P0-2 + the prior pairing-anon-update lock-out).
//
// Contract:
//   POST /functions/v1/save-onboarding-profile
//   Body: { customer_id, display_name, email, whatsapp_number }
//   200:  { ok: true }
//   400:  { error: 'invalid_json' | 'missing_field' | 'invalid_field', field }
//   404:  { error: 'unknown_customer' }
//   405:  { error: 'method_not_allowed' }
//   500:  { error: 'internal' }

import type { IOnboardingStore } from './types.ts'

export type SaveOnboardingProfileDeps = {
  db: IOnboardingStore
}

export type SaveOnboardingProfileBody = {
  customer_id: string
  display_name: string
  email: string
  whatsapp_number: string
}

// Permissive but real check — anything with one '@' and a dot in the
// domain. Keeps the door open for unicode local parts (Bahasa users
// with non-ASCII display names sometimes have unicode in mailboxes).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Indonesian mobile: 08xxxxxxxxx or +62xxxxxxxxxx, with optional spaces /
// dashes between groups. Matches the validator used in onboarding.html
// step 1 (validWhatsappFormat).
const WHATSAPP_RE = /^(\+?62|0)[\d\s-]{7,18}\d$/

export async function handleSaveOnboardingProfile(
  req: Request,
  deps: SaveOnboardingProfileDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: SaveOnboardingProfileBody
  try {
    body = (await req.json()) as SaveOnboardingProfileBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_json' }, 400)
  }

  if (typeof body.customer_id !== 'string' || !body.customer_id) {
    return json({ error: 'missing_field', field: 'customer_id' }, 400)
  }
  if (typeof body.display_name !== 'string') {
    return json({ error: 'missing_field', field: 'display_name' }, 400)
  }
  if (typeof body.email !== 'string') {
    return json({ error: 'missing_field', field: 'email' }, 400)
  }
  if (typeof body.whatsapp_number !== 'string') {
    return json({ error: 'missing_field', field: 'whatsapp_number' }, 400)
  }

  const display_name = body.display_name.trim()
  const email = body.email.trim()
  const whatsapp_number = body.whatsapp_number.trim()

  if (display_name.length === 0) {
    return json({ error: 'invalid_field', field: 'display_name' }, 400)
  }
  if (display_name.length > 80) {
    return json({ error: 'invalid_field', field: 'display_name' }, 400)
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: 'invalid_field', field: 'email' }, 400)
  }
  if (!WHATSAPP_RE.test(whatsapp_number)) {
    return json({ error: 'invalid_field', field: 'whatsapp_number' }, 400)
  }

  const existing = await deps.db.findCustomerById(body.customer_id)
  if (!existing) {
    return json({ error: 'unknown_customer' }, 404)
  }

  try {
    // Service-role UPDATE — capable of writing email even though
    // updateCustomer's typed patch omits 'email' for safety. We need to
    // mutate email here because the customer may have an empty/wrong
    // email captured at checkout. Cast widens the patch to allow it.
    await deps.db.updateCustomer(body.customer_id, {
      display_name,
      whatsapp_number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      email,
    } as Parameters<IOnboardingStore['updateCustomer']>[1] & { email?: string })
  } catch (err) {
    return json({ error: 'internal', detail: errMsg(err) }, 500)
  }

  return json({ ok: true })
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
