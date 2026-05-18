// Deno Edge Function entry — flow-state.
//
// The state-machine-between-skill-invocations engine for persona
// playbooks (Phase 1 Week 2, 2026-05-18 consult). A playbook skill on
// the customer's VPS calls this on every customer message to read /
// advance / terminate its run. State persists in customer_flow_state so
// a playbook survives message gaps and VPS restarts.
//
// Pure handler: ../_shared/flow-state-handler.ts
//
// Deploy:
//   supabase functions deploy flow-state --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto-provided):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Auth: the request must carry an X-CID header equal to the body's
// customer_id (the handler enforces this — same cross-customer-leak gate
// as customer-progress-proxy). Customer-callable indirectly: the agent
// runs on the customer's own VPS and signs requests for its own CID.

// @ts-ignore — Deno-only import; not resolved during Node typecheck.
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleFlowState,
  type FlowStateInput,
  type FlowStateRow,
  type FlowStateStore,
} from '../_shared/flow-state-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// @ts-ignore — Deno-typed client
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const COLS =
  'id, customer_id, playbook_id, current_step, total_steps, status, state_data, created_at, updated_at'

const store: FlowStateStore = {
  async get(customerId, playbookId) {
    const { data } = await supabase
      .from('customer_flow_state')
      .select(COLS)
      .eq('customer_id', customerId)
      .eq('playbook_id', playbookId)
      .maybeSingle()
    return (data as FlowStateRow | null) ?? null
  },

  async start(input) {
    // Upsert on (customer_id, playbook_id): a fresh start resets a
    // stale/completed run back to step 1 with empty state.
    const { data, error } = await supabase
      .from('customer_flow_state')
      .upsert(
        {
          customer_id: input.customer_id,
          playbook_id: input.playbook_id,
          current_step: 1,
          total_steps: input.total_steps,
          status: 'in_progress',
          state_data: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'customer_id,playbook_id' },
      )
      .select(COLS)
      .single()
    if (error) throw error
    return data as FlowStateRow
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('customer_flow_state')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLS)
      .single()
    if (error) throw error
    return data as FlowStateRow
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

  let body: Partial<FlowStateInput> = {}
  try {
    body = (await req.json()) as Partial<FlowStateInput>
  } catch {
    return withCors(
      new Response(
        JSON.stringify({ ok: false, status: 400, error: 'bad_json' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
      req,
    )
  }

  const input: FlowStateInput = {
    customer_id: body.customer_id ?? '',
    x_cid: req.headers.get('x-cid'),
    playbook_id: body.playbook_id ?? '',
    operation: body.operation ?? ('get' as FlowStateInput['operation']),
    total_steps: body.total_steps,
    step_output: body.step_output,
    set_status: body.set_status,
  }

  let result
  try {
    result = await handleFlowState(input, store)
  } catch (e) {
    result = {
      ok: false as const,
      status: 400 as const,
      error: 'flow_state_error',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const status = result.ok ? 200 : result.status
  return withCors(
    new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    req,
  )
})
