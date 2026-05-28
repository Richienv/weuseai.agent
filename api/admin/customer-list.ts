/**
 * Vercel Function: GET /api/admin/customer-list
 *
 * Backs /admin/customers.html — the new browser admin Tab 2.
 *
 * Cookie-gated. Returns customers with embedded latest subscription +
 * latest vps_instance, sorted by created_at desc. Supports a single
 * `status` filter — applied client-side to keep the endpoint simple.
 *
 * Distinct from the older /api/admin/customers (bearer-gated, used by
 * the legacy /admin/customers.html UI that supports tier-flip POSTs).
 * The two endpoints serve different UIs and have different shapes; the
 * older one stays in place for the operational tier-bump path.
 */

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!requireAdminCookie(req, res)) return
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  const select =
    'id,email,display_name,telegram_chat_id,created_at,' +
    'subscriptions(id,tier,status,hosting_active,started_at),' +
    'vps_instances(id,status,ip_address,created_at)'
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=${encodeURIComponent(select)}&order=created_at.desc&limit=500`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        accept: 'application/json',
      },
    },
  )
  if (!r.ok) {
    res.status(502).json({ error: 'fetch_failed', detail: `${r.status}: ${(await r.text()).slice(0, 300)}` })
    return
  }
  const rows = await r.json()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ customers: rows })
}
