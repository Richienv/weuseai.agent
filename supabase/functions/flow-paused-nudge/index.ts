// Deno Edge Function entry — flow-paused-nudge (Phase A2 PR 2).
//
// Companion to flow-state-ttl-sweep. The TTL sweep aborts rows AT the
// 14-day expiry; this nudge fires HALFWAY (>= 7 days parked) so the
// customer has a chance to resume before the run auto-closes. Per-row
// dedup via customer_flow_state.paused_email_sent_at.
//
// Pure handler: ../_shared/flow-paused-nudge-handler.ts
// Email body:   ../_shared/lifecycle-email-bodies.ts (flow-paused.md)
//
// Deploy:
//   supabase functions deploy flow-paused-nudge \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Auth: service-role JWT (isServiceRoleCaller). Vercel cron forwards.
// Schedule: daily; see api/cron/flow-paused-nudge.ts for the timing.

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleFlowPausedNudge,
  playbookLabelFromId,
  daysRemainingUntil,
  type FlowPausedEligibleRow,
  type FlowPausedNudgeStore,
  type FlowPausedNudgeNotifier,
} from '../_shared/flow-paused-nudge-handler.ts'
import { buildFlowPausedEmailBody } from '../_shared/lifecycle-email-bodies.ts'
import { sendEmail } from '../_shared/email-delivery.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DASHBOARD_BASE =
  Deno.env.get('PUBLIC_DASHBOARD_BASE') ?? 'https://weuseai-agent.vercel.app'

// @ts-ignore — Deno-typed client
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Store: query for parked-7d rows joined with customers ──────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const store: FlowPausedNudgeStore = {
  async findEligible(now: Date): Promise<FlowPausedEligibleRow[]> {
    // Eligibility window: status in parked, paused_email_sent_at IS NULL,
    // expires_at IS NOT NULL, AND parked >= 7 days. Since the
    // flow-state handler sets expires_at = park_time + 14d, "parked >= 7d"
    // is equivalent to "expires_at <= now + 7d".
    const cutoff = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString()
    const { data, error } = await supabase
      .from('customer_flow_state')
      .select(`
        id,
        customer_id,
        playbook_id,
        status,
        expires_at,
        paused_email_sent_at,
        state_data,
        customer:customers!inner ( email, display_name )
      `)
      .in('status', ['awaiting_customer', 'escalated'])
      .not('expires_at', 'is', null)
      .lte('expires_at', cutoff)
      .is('paused_email_sent_at', null)
    if (error) throw error
    const rows = (data ?? []) as Array<{
      id: string
      customer_id: string
      playbook_id: string
      status: string
      expires_at: string
      paused_email_sent_at: string | null
      state_data: Record<string, unknown> | null
      customer: { email: string; display_name: string | null } | null
    }>
    return rows
      .filter((r) => !!r.customer?.email)
      .map((r) => ({
        id: r.id,
        customer_id: r.customer_id,
        customer_email: r.customer!.email,
        customer_display_name: r.customer!.display_name,
        playbook_id: r.playbook_id,
        status: r.status as FlowPausedEligibleRow['status'],
        expires_at: r.expires_at,
        paused_email_sent_at: r.paused_email_sent_at,
        state_data: r.state_data ?? {},
      }))
  },

  async markEmailSent(id: string, at: Date): Promise<void> {
    const { error } = await supabase
      .from('customer_flow_state')
      .update({
        paused_email_sent_at: at.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },
}

// ── Notifier: render flow-paused.md + sendEmail via Resend ─────────────

const notifier: FlowPausedNudgeNotifier = {
  async notifyPaused(row) {
    // Pull parked_reason + playbook_label from state_data if the playbook
    // stashed them; fall back to derived defaults so the email is still
    // sendable for older runs that didn't snapshot the metadata.
    const parkedReason =
      typeof row.state_data?.parked_reason === 'string'
        ? row.state_data.parked_reason
        : 'menunggu langkah berikutnya dari kamu'
    const playbookName =
      typeof row.state_data?.playbook_label === 'string'
        ? row.state_data.playbook_label
        : playbookLabelFromId(row.playbook_id)
    const displayName =
      row.customer_display_name && row.customer_display_name.trim().length > 0
        ? row.customer_display_name
        : 'pelanggan'
    const daysRemaining = daysRemainingUntil(row.expires_at, new Date())
    const resumeUrl =
      `${DASHBOARD_BASE}/dashboard/flow/${encodeURIComponent(row.id)}` +
      `?cid=${encodeURIComponent(row.customer_id)}`

    const { subject, text } = buildFlowPausedEmailBody({
      display_name: displayName,
      playbook_name: playbookName,
      parked_reason: parkedReason,
      days_remaining: daysRemaining,
      resume_url: resumeUrl,
    })

    const r = await sendEmail({ to: row.customer_email, subject, text })
    if (!r.ok) {
      return { ok: false, detail: r.error + (r.detail ? ': ' + r.detail : '') }
    }
    return { ok: true }
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 405, error: 'method_not_allowed' }),
        { status: 405, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  if (!isServiceRoleCaller(req)) {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 401, error: 'unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  try {
    const result = await handleFlowPausedNudge({}, store, notifier)
    return withCors(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  } catch (e) {
    return withCors(
      new Response(
        JSON.stringify({
          ok: false,
          status: 500,
          error: 'nudge_failed',
          detail: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }
})
