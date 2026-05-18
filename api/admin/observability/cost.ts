/**
 * Vercel Function: /api/admin/observability/cost
 *
 * Internal-only per-customer LLM cost dashboard (Item 3, 2026-05-18
 * consult). Reads the `customer_llm_cost` view, live-refreshes each
 * customer's spend from the OpenRouter management API, and returns a
 * report flagging every customer at or above 70% of their sub-key cap.
 *
 * Auth model
 * ──────────
 * Header `Authorization: Bearer ${OBSERVABILITY_ADMIN_SECRET}` is
 * REQUIRED. Without OBSERVABILITY_ADMIN_SECRET set in Vercel env this
 * endpoint is unreachable (fail-closed, same convention as
 * api/admin/observability/customer.ts).
 *
 * Request
 * ───────
 *   GET /api/admin/observability/cost
 *
 * Response
 * ────────
 *   200  { generated_at, alert_threshold_pct, customer_count,
 *          alert_count, customers: [...] }   (JSON v0)
 *   401  { error: 'unauthorized' }
 *   405  { error: 'method_not_allowed' }
 *   500  { error: 'misconfigured', detail }
 *   502  { error: 'fetch_failed', detail }
 *
 * Required Vercel env:
 *   OBSERVABILITY_ADMIN_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY            (or SUPABASE_SERVICE_ROLE_KEY)
 *   OPENROUTER_PROVISIONING_KEY    — management key, GET /keys/{hash}
 *
 * The hard per-customer rate-limit floated in the original consult was
 * dropped by the founder (2026-05-18): we are not in the OpenRouter
 * request path, so the sub-key spend cap IS the hard ceiling. This
 * endpoint is monitoring + alerting only.
 */

// Import paths use .js extensions — see api/admin/observability/customer.ts
// for the NodeNext / @vercel/node rationale.
import {
  deriveLlmCostReport,
  fetchLlmCostRows,
} from '../../../packages/observability/src/index.js'
import { isValidBearer } from '../../_shared/timing-safe-bearer.js'

const ADMIN_SECRET = process.env.OBSERVABILITY_ADMIN_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const OPENROUTER_PROVISIONING_KEY =
  process.env.OPENROUTER_PROVISIONING_KEY ?? ''

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
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
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' })
    return
  }
  // Timing-safe bearer comparison (same as the sibling customer.ts).
  if (!isValidBearer(auth, ADMIN_SECRET)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // ── Fetch + derive ─────────────────────────────────────────────
  let rows
  try {
    rows = await fetchLlmCostRows({
      supabaseUrl: SUPABASE_URL,
      supabaseServiceKey: SUPABASE_SERVICE_KEY,
      openRouterProvisioningKey: OPENROUTER_PROVISIONING_KEY,
    })
  } catch (e) {
    res.status(502).json({
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  const report = deriveLlmCostReport(rows)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(report)
}
