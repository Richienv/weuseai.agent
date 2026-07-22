/**
 * Vercel Function: /api/public/subscription-count
 *
 * Mission 2 Phase 0.3 (2026-06-10). The landing's "first 100 customers"
 * counter MUST read a real subscription count (CLAUDE.md honesty lock) —
 * before this it was a hardcoded 247 with a random decrement labeled
 * "real-time". This endpoint is the real number.
 *
 * PUBLIC + unauthenticated by design: it exposes ONE aggregate integer (the
 * count of active paid subscriptions), no PII, no per-customer data. Cached
 * at the edge for 5 minutes so traffic never hammers the DB.
 *
 * Response:
 *   200 { paid_customers: number, generated_at: string }
 *   500 { error: 'misconfigured' | 'fetch_failed' }
 *
 * Required Vercel env (already set for the admin endpoints):
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

/**
 * Count active PAID subscriptions via PostgREST's count header — no row data
 * crosses the wire. Exported for tests (fetchImpl injectable).
 *
 * `source=neq.access_code` excludes COMPED subscriptions — B2B clients who paid
 * the founder by bank transfer and redeemed an access code. The landing shows
 * this number as real paying customers (honesty lock), so comped rows must not
 * inflate it. Rows predating the `source` migration default to 'xendit' and
 * still count as paid.
 */
export async function fetchActiveSubscriptionCount(opts: {
  supabaseUrl: string
  serviceKey: string
  fetchImpl?: typeof fetch
}): Promise<number> {
  const doFetch = opts.fetchImpl ?? fetch
  const headers = {
    apikey: opts.serviceKey,
    authorization: `Bearer ${opts.serviceKey}`,
    prefer: 'count=exact',
  }
  const base = `${opts.supabaseUrl}/rest/v1/subscriptions?status=eq.active`

  let r = await doFetch(`${base}&source=neq.access_code&select=id`, { method: 'HEAD', headers })

  // DEPLOY-RACE FALLBACK. Vercel republishes this function on push, but the
  // `source` column arrives via the Supabase migration job on a SEPARATE rail
  // — so for a few minutes this can run against a schema that has no `source`
  // yet, and PostgREST answers 4xx. Retry unfiltered rather than let the
  // landing's batch band go dark. Safe: before that migration lands there are
  // no comped rows to exclude, so both queries return the same number.
  if (!r.ok && r.status >= 400 && r.status < 500) {
    r = await doFetch(`${base}&select=id`, { method: 'HEAD', headers })
  }

  if (!r.ok) throw new Error(`subscriptions count HTTP ${r.status}`)
  // content-range: 0-24/3129  → count after the slash.
  const range = r.headers.get('content-range') ?? ''
  const count = Number(range.split('/')[1])
  if (!Number.isFinite(count)) throw new Error(`unparseable content-range "${range}"`)
  return count
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: 'misconfigured' })
    return
  }
  try {
    const count = await fetchActiveSubscriptionCount({
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_KEY,
    })
    // Edge-cache 5 min; serve stale while revalidating so the landing never
    // blocks on this.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json({
      paid_customers: count,
      generated_at: new Date().toISOString(),
    })
  } catch {
    // No detail in the public error body — internals stay internal.
    res.status(500).json({ error: 'fetch_failed' })
  }
}
