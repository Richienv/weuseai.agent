// Deno Edge Function entry — flow-state-ttl-sweep.
//
// P4G parked-run TTL (2026-05-22 consult). Daily sweep that aborts
// customer_flow_state rows whose `expires_at` has passed. The flow-state
// handler stamps `expires_at = now + 14d` when a run is parked at
// awaiting_customer / escalated, and clears it on resume / complete /
// abort. Without this sweep, abandoned PT-registration / compliance-
// cycle / finance-cycle runs would accumulate indefinitely.
//
// Pure handler: ../_shared/flow-state-ttl-sweep-handler.ts
//
// Deploy:
//   supabase functions deploy flow-state-ttl-sweep \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Auth: service-role JWT (isServiceRoleCaller) — admin-only. Cron caller
// must present the service-role bearer.
//
// Schedule: external trigger (Vercel cron or a Supabase scheduled task)
// hits this once daily. Body is empty; POST is enough. See follow-up note
// in docs/post-cascade-followups.md for cron wiring options.

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleFlowStateTtlSweep,
  type ExpiredRow,
  type FlowStateTtlSweepStore,
} from '../_shared/flow-state-ttl-sweep-handler.ts'
import {
  makeFlowExpiredEmailNotifier,
  type FlowExpiredEmailRow,
} from '../_shared/flow-expired-email-notifier.ts'
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

const store: FlowStateTtlSweepStore = {
  async findExpired(now: Date): Promise<ExpiredRow[]> {
    // Phase A2 PR 3: JOIN customers so the email notifier can render
    // flow-expired.md without a per-row roundtrip. We also pull
    // state_data so playbook_label + parked_at_label can override the
    // slug-derived defaults when the playbook stashed them at park time.
    const { data, error } = await supabase
      .from('customer_flow_state')
      .select(`
        id,
        customer_id,
        playbook_id,
        status,
        expires_at,
        state_data,
        customer:customers!inner ( email, display_name )
      `)
      .in('status', ['awaiting_customer', 'escalated'])
      .not('expires_at', 'is', null)
      .lte('expires_at', now.toISOString())
    if (error) throw error
    const rows = (data ?? []) as Array<{
      id: string
      customer_id: string
      playbook_id: string
      status: string
      expires_at: string
      state_data: Record<string, unknown> | null
      customer: { email: string; display_name: string | null } | null
    }>
    return rows.map((r) => ({
      id: r.id,
      customer_id: r.customer_id,
      playbook_id: r.playbook_id,
      status: r.status as ExpiredRow['status'],
      expires_at: r.expires_at,
      // Extra fields the email notifier uses. Base ExpiredRow doesn't
      // declare them but they're harmless to carry — the handler just
      // forwards the row to the notifier opaquely.
      customer_email: r.customer?.email ?? '',
      customer_display_name: r.customer?.display_name ?? null,
      state_data: r.state_data ?? {},
    } as ExpiredRow & Partial<FlowExpiredEmailRow>))
  },
  async markAborted(id: string): Promise<void> {
    const { error } = await supabase
      .from('customer_flow_state')
      .update({
        status: 'aborted',
        expires_at: null,
        // Phase A2 PR 2: clear paused_email_sent_at on abort so a
        // future re-start gets a fresh nudge cycle (defensive — the
        // flow-state handler also does this on abort).
        paused_email_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },
}

// Phase A2 PR 3: wire the flow-expired.md email notifier. Resend stub-
// tolerant — when RESEND_API_KEY is unset the send is a no-op and the
// sweep records ok:true (so we don't pollute notify_failures with
// "stub" entries in pre-Resend deployments).
const notifier = makeFlowExpiredEmailNotifier({
  sendEmail,
  dashboardBase: DASHBOARD_BASE,
})

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
      new Response(JSON.stringify({ ok: false, status: 401, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }

  try {
    const result = await handleFlowStateTtlSweep({}, store, notifier)
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
          error: 'sweep_failed',
          detail: e instanceof Error ? e.message : String(e),
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }
})
