/**
 * Vercel Function: GET /api/admin/customer-data
 *
 * Combined customer-data reader for the new cookie-gated admin pages:
 *
 *   GET /api/admin/customer-data          → list of all customers
 *                                            (Tab 2: /admin/customers.html)
 *   GET /api/admin/customer-data?id=<id>  → one customer's detail
 *                                            (Tab 2: /admin/customers/:id)
 *
 * Consolidated from two separate endpoints to stay under the Vercel
 * Hobby Functions limit. Cookie-gated; differs from the older bearer-
 * gated /api/admin/customers (which supports tier-flip POSTs) — the
 * two endpoints serve different UIs.
 *
 * Detail mode returns { customer, subscriptions, vps_instances,
 * manual_provisions }; list mode returns { customers } with embedded
 * subscriptions + vps_instances per customer.
 */

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  url?: string
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    accept: 'application/json',
  }
}

async function listCustomers(res: VercelResponse): Promise<void> {
  const select =
    'id,email,display_name,telegram_chat_id,created_at,' +
    'subscriptions(id,tier,status,hosting_active,started_at),' +
    'vps_instances(id,status,ip_address,created_at)'
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=${encodeURIComponent(select)}&order=created_at.desc&limit=500`,
    { headers: supabaseHeaders() },
  )
  if (!r.ok) {
    res.status(502).json({ error: 'fetch_failed', detail: `${r.status}: ${(await r.text()).slice(0, 300)}` })
    return
  }
  const rows = await r.json()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ customers: rows })
}

async function detailCustomer(id: string, res: VercelResponse): Promise<void> {
  const custSelect =
    'id,email,display_name,telegram_chat_id,telegram_bot_username,whatsapp_number,created_at'
  const subSelect =
    'id,tier,status,hosting_active,always_on_enabled,started_at,next_billing_at'
  const vpsSelect = 'id,status,ip_address,region,created_at'
  const auditSelect =
    'id,payment_method,payment_reference,amount_idr,persona_slug,tier,notes,created_at'

  const [cRes, sRes, vRes, mRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/customers?select=${encodeURIComponent(custSelect)}&id=eq.${id}&limit=1`,
      { headers: supabaseHeaders() },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?select=${encodeURIComponent(subSelect)}&customer_id=eq.${id}&order=started_at.desc`,
      { headers: supabaseHeaders() },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/vps_instances?select=${encodeURIComponent(vpsSelect)}&customer_id=eq.${id}&order=created_at.desc`,
      { headers: supabaseHeaders() },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/manual_provisions?select=${encodeURIComponent(auditSelect)}&customer_id=eq.${id}&order=created_at.desc&limit=10`,
      { headers: supabaseHeaders() },
    ),
  ])

  if (!cRes.ok) {
    res.status(502).json({ error: 'fetch_failed', detail: `customers ${cRes.status}` })
    return
  }
  const customers = (await cRes.json()) as Record<string, unknown>[]
  if (customers.length === 0) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // Manual_provisions may not exist yet (migration applied post-deploy).
  // Treat any non-2xx as empty rather than failure.
  let manual_provisions: unknown[] = []
  if (mRes.ok) manual_provisions = (await mRes.json()) as unknown[]
  const subscriptions = sRes.ok ? ((await sRes.json()) as unknown[]) : []
  const vps_instances = vRes.ok ? ((await vRes.json()) as unknown[]) : []

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    customer: customers[0],
    subscriptions,
    vps_instances,
    manual_provisions,
  })
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

  const u = new URL(req.url ?? '/', 'http://x')
  const id = (u.searchParams.get('id') ?? '').trim()
  if (id) {
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }
    await detailCustomer(id, res)
    return
  }
  await listCustomers(res)
}
