/**
 * Vercel Function: /api/admin/observability/customer
 *
 * Internal-only customer onboarding observability endpoint. Reads the
 * customer's payment / provisioning / Hermes / bundle / Telegram /
 * first-message state from Supabase via PostgREST and returns a
 * StatusReport (JSON or HTML fragment).
 *
 * Auth model
 * ──────────
 * Header `Authorization: Bearer ${OBSERVABILITY_ADMIN_SECRET}` is
 * REQUIRED. Without OBSERVABILITY_ADMIN_SECRET set in Vercel env this
 * endpoint is unreachable (fail-closed, same convention as
 * api/nightly-cleanup.ts).
 *
 * The admin HTML page (admin/observability/customer.html) prompts the
 * founder for the secret, stores it in sessionStorage, and sends it
 * with every fetch.
 *
 * Request
 * ───────
 *   GET /api/admin/observability/customer?id=<uuid>&format=json|html
 *
 *   id      uuid (required)
 *   format  json | html  (default json)
 *
 * Response
 * ────────
 *   200  { ...StatusReport }              when format=json
 *   200  text/html  rendered <section>    when format=html
 *   400  { error: 'missing_id' | 'bad_id' | 'bad_format' }
 *   401  { error: 'unauthorized' }
 *   500  { error: 'misconfigured' }
 *   502  { error: 'fetch_failed', detail }
 *
 * Required Vercel env:
 *   OBSERVABILITY_ADMIN_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY            (or SUPABASE_SERVICE_ROLE_KEY)
 */

// NOTE: import path uses .js extension (NodeNext-style) even though the source
// is index.ts. Reasons:
//   1. Root package.json has "type": "module" — Node ESM strict resolution at
//      runtime requires explicit extensions.
//   2. Vercel's @vercel/node compiles .ts → .js per file (it does NOT inline
//      via bundler), so the runtime needs to find the compiled .js sibling.
//   3. The original `.ts` extension caused ERR_MODULE_NOT_FOUND at runtime
//      (log: 2026-05-09 dpl_BLvD8as4itsVFBcnxNeGw3SJ17eB).
// TS accepts the .js extension under moduleResolution: bundler.
import {
  deriveCustomerStatus,
  fetchCustomerSnapshot,
  renderStatusReportHtml,
} from '../../../packages/observability/src/index.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  send: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Only GET — no mutation surface intended.
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // ── Auth ────────────────────────────────────────────────────────
  const auth = (req.headers.authorization ?? '') as string
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // ── Args ───────────────────────────────────────────────────────
  const idRaw = readQuery(req, 'id')
  const formatRaw = readQuery(req, 'format') ?? 'json'

  if (!idRaw) {
    res.status(400).json({ error: 'missing_id' })
    return
  }
  if (!UUID_RE.test(idRaw)) {
    res.status(400).json({ error: 'bad_id' })
    return
  }
  if (formatRaw !== 'json' && formatRaw !== 'html') {
    res.status(400).json({ error: 'bad_format' })
    return
  }

  // ── Fetch + derive ─────────────────────────────────────────────
  let snapshot
  try {
    snapshot = await fetchCustomerSnapshot(idRaw, {
      supabaseUrl: SUPABASE_URL,
      supabaseServiceKey: SUPABASE_SERVICE_KEY,
    })
  } catch (e) {
    res.status(502).json({
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  const report = deriveCustomerStatus(snapshot)

  if (formatRaw === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(renderStatusReportHtml(report))
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(report)
}

function readQuery(req: VercelRequest, key: string): string | null {
  const v = req.query?.[key]
  if (Array.isArray(v)) return v[0] ?? null
  if (typeof v === 'string') return v
  // Fallback: parse from URL if the runtime didn't populate `req.query`.
  const url = (req as { url?: string }).url
  if (typeof url === 'string') {
    try {
      const u = new URL(url, 'http://x')
      const q = u.searchParams.get(key)
      if (q !== null) return q
    } catch {
      // ignore
    }
  }
  return null
}
