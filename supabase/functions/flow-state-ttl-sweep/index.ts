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
import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// @ts-ignore — Deno-typed client
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const store: FlowStateTtlSweepStore = {
  async findExpired(now: Date): Promise<ExpiredRow[]> {
    const { data, error } = await supabase
      .from('customer_flow_state')
      .select('id, customer_id, playbook_id, status, expires_at')
      .in('status', ['awaiting_customer', 'escalated'])
      .not('expires_at', 'is', null)
      .lte('expires_at', now.toISOString())
    if (error) throw error
    return (data as ExpiredRow[]) ?? []
  },
  async markAborted(id: string): Promise<void> {
    const { error } = await supabase
      .from('customer_flow_state')
      .update({
        status: 'aborted',
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },
}

// v1: no Telegram notifier wired. The flow-state run aborts silently;
// the customer's next message to the persona will surface a "your run
// was paused for 14 days and has been closed — say `mulai lagi <playbook>`
// to restart" once persona SOUL.md / SKILL.md instructs that. Wiring a
// Telegram push-notification path is a follow-up (needs the per-customer
// bot token snapshot + handle).

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
    const result = await handleFlowStateTtlSweep({}, store)
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
