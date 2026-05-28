/**
 * Vercel Function: POST /api/admin/customer-mark-refunded
 *
 * STUB. Will eventually: (1) UPDATE subscriptions.status='refunded',
 * (2) call admin-send-refund-email Edge Function, (3) trigger VPS
 * deprovision. Not implemented yet — scope is structural refactor only.
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
    todo: 'mark-refunded chain',
    message:
      'TODO — wire 3 langkah: (1) UPDATE subscriptions.status=refunded, ' +
      '(2) call admin-send-refund-email, (3) trigger VPS deprovision.',
  })
}
