/**
 * Vercel Function: /api/admin/observability
 *
 * Function-count consolidation (2026-06-11): the Vercel Hobby plan caps a
 * deployment at 12 serverless functions; production froze at #228 the
 * moment we crossed it. The four observability reports are now ONE
 * function dispatching on the report name — their handlers moved verbatim
 * to api/_shared/observability/ (underscore dirs are not built as
 * functions). All original URLs keep working via vercel.json rewrites:
 *
 *   /api/admin/observability/cost              → ?report=cost
 *   /api/admin/observability/customer          → ?report=customer
 *   /api/admin/observability/fleet-summary     → ?report=fleet-summary
 *   /api/admin/observability/template-no-match → ?report=template-no-match
 *
 * Auth lives unchanged inside each handler (bearer/cookie, fail-closed) —
 * this dispatcher adds no surface.
 */

import costHandler from '../_shared/observability/cost.js'
import customerHandler from '../_shared/observability/customer.js'
import fleetSummaryHandler from '../_shared/observability/fleet-summary.js'
import templateNoMatchHandler from '../_shared/observability/template-no-match.js'

type VercelRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  setHeader: (name: string, value: string) => void
}

const HANDLERS: Record<string, (req: never, res: never) => Promise<void>> = {
  'cost': costHandler as never,
  'customer': customerHandler as never,
  'fleet-summary': fleetSummaryHandler as never,
  'template-no-match': templateNoMatchHandler as never,
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'https://x')
  // Rewrites supply ?report=…; also accept a path suffix for robustness.
  const report =
    url.searchParams.get('report') ??
    url.pathname.split('/observability/')[1]?.split('?')[0] ??
    ''
  const target = HANDLERS[report]
  if (!target) {
    res.status(404).json({
      error: 'unknown_report',
      detail: `report must be one of ${Object.keys(HANDLERS).join(', ')}`,
    })
    return
  }
  await target(req as never, res as never)
}
