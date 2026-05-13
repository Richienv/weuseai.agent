// customer-readiness — pure handler.
//
// Track 1 of post-pair UX polish (2026-05-10). Browser-facing wrapper
// around the Fly /customer-readiness-probe endpoint.
//
// Why this Edge Fn exists: welcome.html (in the customer's browser) needs
// to poll an "is my agent actually ready?" signal. The probe endpoint is
// on Fly behind PROVISIONING_AUTH_TOKEN, which the browser cannot bear.
// This Edge Fn is the auth bridge:
//
//   Browser (anon, cid in body)
//     → customer-readiness Edge Fn
//        validates cid format + customer exists with paid sub
//        proxies to Fly /customer-readiness-probe with bearer token
//     → Fly probe (8-check JSON)
//
// Auth model: anon-callable (verify_jwt=false in supabase/config.toml).
// Authz: customer_id must be a UUID present in customers row with a
// non-failed subscription. The probe response contains no PII beyond
// vps_id and ip_address, both of which are operational state the customer
// already sees on their own welcome page. We don't gate behind a session.
//
// Polling cadence: welcome.html polls every 10s. Probe RTT is ~1-2s
// (one SSH round-trip with bundled checks). At 10s cadence + 5min average
// build time, that's ~30 calls per customer per build. Cheap.

export type CustomerReadinessDeps = {
  /** Fly provisioning service base URL, e.g. https://weuseai-provisioning.fly.dev */
  provisioningUrl: string
  /** Bearer token for the Fly service. Server-side env only. */
  provisioningAuthToken: string
  /** Validates that customer_id maps to an existing customer with a
   *  non-failed subscription. Returns true on pass, false on
   *  unknown-customer / no-subscription. Throws on DB error. */
  validateCustomerExists(customerId: string): Promise<boolean>
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export type CustomerReadinessBody = {
  customer_id: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleCustomerReadiness(
  req: Request,
  deps: CustomerReadinessDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: CustomerReadinessBody
  try {
    body = (await req.json()) as CustomerReadinessBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.customer_id !== 'string' || !UUID_RE.test(body.customer_id)) {
    return json({ error: 'invalid_field', field: 'customer_id' }, 400)
  }

  // Sesi D pass-3 P1-2 (2026-05-13): X-CID is now MANDATORY + mismatches
  // return 403 (was 400 + soft-optional pre-pass-3). Closes the
  // cross-customer probe leak — without enforcement any anon-JWT holder
  // could probe any customer's VPS by submitting its UUID in the body
  // and skipping the header. Mirrors the customers + subscriptions
  // table enforcement (pass-1 P0-2 / P0-3).
  const headerCid = req.headers.get('x-cid')
  if (!headerCid || headerCid !== body.customer_id) {
    return json({ error: 'x_cid_mismatch' }, 403)
  }

  // Customer must exist + have a non-failed subscription. Otherwise we
  // refuse to expose probe data (operational sec — anyone with a UUID
  // shouldn't be able to discover whether random UUIDs are real customers).
  let exists: boolean
  try {
    exists = await deps.validateCustomerExists(body.customer_id)
  } catch (e) {
    console.error(
      `[customer-readiness] validateCustomerExists error for ${body.customer_id}: ${errMsg(e)}`,
    )
    return json({ error: 'internal' }, 500)
  }
  if (!exists) {
    return json({ error: 'unknown_customer' }, 404)
  }

  // Proxy to Fly /customer-readiness-probe.
  const fetchImpl = deps.fetchImpl ?? fetch
  const probeUrl = `${deps.provisioningUrl.replace(/\/$/, '')}/customer-readiness-probe`
  let probeRes: Response
  try {
    probeRes = await fetchImpl(probeUrl, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${deps.provisioningAuthToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ customer_id: body.customer_id }),
    })
  } catch (e) {
    // Fly unreachable — surface 503 so welcome.html can render
    // "Sedang membangun..." (provisioning hiccup is invisible to the
    // customer; just keep polling).
    console.error(
      `[customer-readiness] fetch failed for ${body.customer_id}: ${errMsg(e)}`,
    )
    return json(
      { error: 'provisioning_unreachable', detail: errMsg(e) },
      503,
    )
  }

  const probeBody = await probeRes.text()
  // Forward the probe body verbatim (it's already JSON) — preserves the
  // shape welcome.html expects without re-parse/re-serialize.
  return new Response(probeBody, {
    status: probeRes.status,
    headers: { 'content-type': 'application/json' },
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
  if (e && typeof e === 'object') {
    try { return JSON.stringify(e).slice(0, 300) } catch { /* fall through */ }
  }
  return String(e).slice(0, 300)
}
