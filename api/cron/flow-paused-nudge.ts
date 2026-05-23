/**
 * Vercel Cron handler — daily flow-paused 7-day nudge (Phase A2 PR 2).
 *
 * Companion to flow-state-ttl-sweep. The TTL sweep fires AT/AFTER the
 * 14-day expiry; this nudge fires HALFWAY (>= 7 days parked) so the
 * customer has a chance to resume before the auto-close. The Edge
 * Function dedupes via customer_flow_state.paused_email_sent_at.
 *
 * Schedule: 20:00 UTC daily = 03:00 WIB next day. One hour AFTER the
 * TTL sweep (19:00 UTC / 02:00 WIB) so the two crons don't pile on each
 * other in the Supabase log stream.
 *
 * Auth: same CRON_SECRET pattern as flow-state-ttl-sweep.ts +
 * nightly-cleanup.ts.
 *
 * Required Vercel env:
 *   CRON_SECRET                       — set automatically by Vercel
 *   SUPABASE_URL                      — base URL for the Edge Function
 *   SUPABASE_SECRET_KEY               — service-role JWT (or
 *     SUPABASE_SERVICE_ROLE_KEY        SUPABASE_SERVICE_ROLE_KEY)
 *
 * Response (200): { ok: true, nudge: <Edge Function response body> }
 * Response (401): { error: 'unauthorized' }
 * Response (500): { error: 'misconfigured', detail: '...' }
 * Response (502): { error: 'nudge_http_error' | 'nudge_fetch_failed', detail: '...' }
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
    res.status(500).json({
      error: 'misconfigured',
      detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY unset',
    })
    return
  }

  // ── Forward to Supabase Edge Function ───────────────────────────────
  const base = SUPABASE_URL.replace(/\/$/, '')
  const url = `${base}/functions/v1/flow-paused-nudge`

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
      error: 'nudge_fetch_failed',
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
      error: 'nudge_http_error',
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
  res.status(200).json({ ok: true, nudge: body })
}
