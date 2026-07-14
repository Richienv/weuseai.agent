/**
 * Vercel Cron handler — daily flow-state TTL sweep (Phase A3, 2026-05-19).
 *
 * P4G parked-run TTL (2026-05-22 consult). The flow-state handler stamps
 * `customer_flow_state.expires_at = now + 14d` when a run is parked at
 * awaiting_customer / escalated, and clears it on resume / complete /
 * abort. Without a daily sweep, abandoned PT-registration / compliance-
 * cycle / finance-cycle runs would accumulate indefinitely.
 *
 * This handler is the cron edge — it does NOT do the DB work itself. It
 * forwards to the Supabase Edge Function `flow-state-ttl-sweep` with the
 * service-role bearer, which runs the actual sweep against
 * customer_flow_state. We keep the logic in the Edge Function for two
 * reasons:
 *   1. Manual re-runs (founder triggering, post-incident) hit the Edge
 *      Function directly without going through Vercel cron.
 *   2. Service-role secret stays in Supabase land; Vercel only holds the
 *      service-role JWT needed to call the Edge Function (same secret,
 *      different surface).
 *
 * Schedule: 19:00 UTC daily = 02:00 WIB next day. WIB is UTC+7, so 19:00
 * UTC fires at 02:00 the following day in Jakarta. Off-peak by design
 * (zero customer pressure, gentle on Supabase).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every
 * scheduled invocation. We validate that header — without it, this
 * endpoint is unreachable. Same pattern as nightly-cleanup.ts.
 *
 * Required Vercel env:
 *   CRON_SECRET                       — set automatically by Vercel; we
 *                                       validate against process.env
 *   SUPABASE_URL                      — base URL for the Edge Function
 *   SUPABASE_SECRET_KEY               — service-role JWT (or
 *     SUPABASE_SERVICE_ROLE_KEY)        SUPABASE_SERVICE_ROLE_KEY
 *
 * Response (200): { ok: true, sweep: <Edge Function response body> }
 * Response (401): { error: 'unauthorized' }
 * Response (500): { error: 'misconfigured', detail: '...' }
 * Response (502): { error: 'sweep_failed', detail: '...' }
 */

import { isValidBearer } from '../_shared/timing-safe-bearer.js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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
  // ── Auth ────────────────────────────────────────────────────────────
  const auth = (req.headers.authorization ?? '') as string
  if (!isValidBearer(auth, CRON_SECRET)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res
      .status(500)
      .json({ error: 'misconfigured', detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset' })
    return
  }

  // ── Forward to Supabase Edge Function ───────────────────────────────
  const base = SUPABASE_URL.replace(/\/$/, '')
  const url = `${base}/functions/v1/flow-state-ttl-sweep`

  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch (e) {
    res.status(502).json({
      error: 'sweep_fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  if (!r.ok) {
    let detailText = ''
    try {
      detailText = (await r.text()).slice(0, 400)
    } catch {
      /* swallow */
    }
    res.status(502).json({
      error: 'sweep_http_error',
      detail: `Edge Function HTTP ${r.status}: ${detailText}`,
    })
    return
  }

  let body: unknown
  try {
    body = await r.json()
  } catch {
    body = null
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, sweep: body })
}
