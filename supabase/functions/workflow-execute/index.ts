// Deno Edge Function entry — workflow-execute.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
// Pure handler: ../_shared/workflow-execute-handler.ts
//
// Deploy:
//   supabase functions deploy workflow-execute --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto-provided):
//   SUPABASE_URL                    auto
//   SUPABASE_SERVICE_ROLE_KEY       auto

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  workflowExecuteHandler,
  type CallHandlerResult,
} from '../_shared/workflow-execute-handler.ts'
import type { WorkflowRow, WorkflowTier } from '../_shared/workflow-types.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  let input: { customer_id: string; workflow_id: string; parameters: Record<string, unknown> }
  try {
    input = await req.json()
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }))
  }

  const result = await workflowExecuteHandler(input, {
    customerLookup: async (id) => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, subscriptions(tier, status)')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      const subs = (data as { subscriptions?: Array<{ tier: WorkflowTier; status: string }> }).subscriptions
      const active = subs?.find((s) => s.status === 'active')
      if (!active) return null
      return { id: data.id as string, tier: active.tier }
    },
    workflowLookup: async (workflowId) => {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .maybeSingle()
      if (error || !data) return null
      return data as WorkflowRow
    },
    insertRun: async ({ workflowId, customerId, agentSlug, parameters }) => {
      const { data, error } = await supabase
        .from('workflow_runs')
        .insert({
          workflow_id: workflowId,
          customer_id: customerId,
          agent_slug: agentSlug,
          parameters,
          status: 'running',
        })
        .select('id')
        .single()
      if (error || !data) {
        throw new Error(`workflow_runs insert failed: ${error?.message ?? 'no row returned'}`)
      }
      return data.id as string
    },
    updateRun: async ({ runId, status, output, error: errorText, durationMs }) => {
      const { error } = await supabase
        .from('workflow_runs')
        .update({
          status,
          output,
          error: errorText,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
      if (error) {
        // Don't throw — caller's failsafe handles it.
        console.warn(`workflow_runs update failed for ${runId}:`, error.message)
      }
    },
    callEdgeFnHandler: async ({ handlerName, parameters, customerId }) => {
      // Fan-out HTTP call to a sibling Edge Function.
      const url = `${SUPABASE_URL}/functions/v1/${handlerName}`
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ customer_id: customerId, parameters }),
        })
      } catch (e) {
        return {
          ok: false,
          error: `handler fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        } satisfies CallHandlerResult
      }
      if (!response.ok) {
        const body = await safeText(response)
        return {
          ok: false,
          error: `handler returned ${response.status}: ${body.slice(0, 300)}`,
        } satisfies CallHandlerResult
      }
      try {
        const json = await response.json()
        return { ok: true, output: json as Record<string, unknown> } satisfies CallHandlerResult
      } catch (e) {
        return {
          ok: false,
          error: `handler returned non-JSON: ${e instanceof Error ? e.message : String(e)}`,
        } satisfies CallHandlerResult
      }
    },
    now: () => Date.now(),
  })

  if (!result.ok) {
    return withCors(req, new Response(JSON.stringify({
      error: result.error,
      detail: result.detail,
      run_id: result.run_id,
    }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    }))
  }

  return withCors(req, new Response(JSON.stringify(result.body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text()
  } catch {
    return '<read failed>'
  }
}
