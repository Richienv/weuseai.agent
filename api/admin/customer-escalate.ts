/**
 * Vercel Function: POST /api/admin/customer-escalate
 *
 * STUB. Will eventually flag the customer for founder priority view —
 * needs a new column customers.escalated_at + filter in Tab 2.
 */

import { requireAdminCookie } from '../_shared/admin-cookie-auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (n: number) => Res; json: (b: unknown) => Res; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!requireAdminCookie(req, res)) return

  let body: Record<string, unknown> = {}
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body) as Record<string, unknown>
    else if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_json' })
    return
  }
  const customerId = String(body.customerId ?? '').trim()
  if (!customerId || !UUID_RE.test(customerId)) {
    res.status(400).json({ ok: false, error: 'Customer ID tidak valid.' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: false,
    todo: 'escalate flag',
    message:
      'TODO — perlu kolom baru customers.escalated_at + filter di Tab 2. ' +
      'Belum di-implementasi (akan butuh Supabase migration).',
  })
}
