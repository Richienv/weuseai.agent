// Deno Edge Function entry — workflow-discover.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
// Pure handler: ../_shared/workflow-discover-handler.ts
//
// Deploy:
//   supabase functions deploy workflow-discover --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto-provided + secrets):
//   SUPABASE_URL                       auto
//   SUPABASE_SERVICE_ROLE_KEY          auto
//   OPENAI_EMBED_API_KEY               secret (sk-..., embedding only)
//   OPENROUTER_ORCHESTRATION_KEY       secret (sk-or-v1-..., parameter
//                                              extraction only — distinct
//                                              from OPENROUTER_PROVISIONING_KEY)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { embedText } from '../_shared/embedding.ts'
import { getOrchestrationKey } from '../_shared/llm-client.ts'
import {
  extractParametersFromMessage,
  type ExtractionFailureReason,
} from '../_shared/parameter-extraction.ts'
import {
  workflowDiscoverHandler,
  type CustomerInfo,
} from '../_shared/workflow-discover-handler.ts'
import { TIER_ORDINAL, type WorkflowRow, type WorkflowTier } from '../_shared/workflow-types.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_EMBED_API_KEY = Deno.env.get('OPENAI_EMBED_API_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  let input: { customer_id: string; agent_slug: string; message_text: string }
  try {
    input = await req.json()
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }))
  }

  const result = await workflowDiscoverHandler(input, {
    customerLookup: async (id) => {
      // Look up customer + their active subscription tier.
      const { data, error } = await supabase
        .from('customers')
        .select('id, subscriptions(tier, status)')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      const subs = (data as { subscriptions?: Array<{ tier: WorkflowTier; status: string }> }).subscriptions
      const active = subs?.find((s) => s.status === 'active')
      if (!active) return null
      return { id: data.id as string, tier: active.tier } satisfies CustomerInfo
    },
    embedFn: async (text) => {
      const r = await embedText(text, OPENAI_EMBED_API_KEY)
      if (!r.ok) {
        console.warn('workflow-discover: embed failed', r.reason, r.detail)
        return null
      }
      return r.result.embedding
    },
    vectorSearchFn: async ({ embedding, agentSlug, customerTierOrd, limit }) => {
      // pgvector cosine distance: <=> returns 0..2; cosine similarity = 1 - distance/2.
      // We materialize the SQL via .rpc() with a stored function for clarity OR
      // inline as a SELECT with vector literal. Inline is simpler for the pilot.
      const allowedTiers = (Object.entries(TIER_ORDINAL) as Array<[WorkflowTier, number]>)
        .filter(([, ord]) => ord <= customerTierOrd)
        .map(([t]) => t)

      // Build vector literal: '[0.123,0.456,...]'.
      const vectorLiteral = '[' + embedding.join(',') + ']'

      const { data, error } = await supabase
        .rpc('workflow_vector_search', {
          query_embedding: vectorLiteral,
          agent_slug: agentSlug,
          allowed_tiers: allowedTiers,
          match_limit: limit,
        })
      if (error) {
        // Fallback path if the RPC isn't installed: do a non-vector
        // lookup by agent_slug + tier and return uniform low confidence.
        // This keeps the demo flowing while staging migrations finish.
        console.warn('workflow-discover: vector RPC failed, falling back', error.message)
        const { data: fallback, error: fbErr } = await supabase
          .from('workflows')
          .select('*')
          .contains('agent_slugs', [agentSlug])
          .in('tier', allowedTiers)
          .limit(limit)
        if (fbErr) throw new Error(`fallback query failed: ${fbErr.message}`)
        return (fallback ?? []).map((row) => ({
          row: row as WorkflowRow,
          confidence: 0.5,  // unknown — let agent decide
        }))
      }
      return (data as Array<{ workflow: WorkflowRow; confidence: number }>).map((r) => ({
        row: r.workflow,
        confidence: r.confidence,
      }))
    },
    llmExtractFn: async ({ messageText, parametersSchema, workflowSlug }) => {
      // Phase 2E-1 Q3a (option b): platform-orchestration key for
      // extraction. Cost lands on us, not the customer (~$0.0002/call).
      // Handler only invokes us when shouldAutoExecute → ambiguous matches
      // don't waste budget.
      const orchestrationKey = getOrchestrationKey()
      if (!orchestrationKey) {
        console.warn(
          'workflow-discover: OPENROUTER_ORCHESTRATION_KEY not configured. ' +
            'Extraction skipped; missing_parameters will list every required field.',
        )
        return {}
      }

      // Look up workflow_id from the customer's request scope (we don't
      // have it here — this dep only sees prompt-shaped inputs). Telemetry
      // logs the workflow slug + reason; the row links back to workflow
      // via slug lookup if needed for analysis.
      const result = await extractParametersFromMessage({
        apiKey: orchestrationKey,
        messageText,
        parametersSchema,
        workflowSlug,
        onFailure: async (reason: ExtractionFailureReason, rawExcerpt?: string) => {
          // Best-effort telemetry insert. Failure here is silently
          // dropped — extraction-failure logging shouldn't compound a
          // user-facing failure.
          try {
            const { data: workflowRow } = await supabase
              .from('workflows')
              .select('id')
              .eq('slug', workflowSlug)
              .maybeSingle()
            const { error } = await supabase.from('extraction_failures').insert({
              workflow_id: (workflowRow as { id?: string } | null)?.id ?? null,
              customer_id: input.customer_id,
              message_excerpt: messageText.slice(0, 500),
              reason,
              raw_excerpt: rawExcerpt ?? null,
            })
            if (error) {
              console.warn('extraction_failures insert error:', error.message)
            }
          } catch (e) {
            console.warn(
              'extraction_failures telemetry hook threw:',
              e instanceof Error ? e.message : String(e),
            )
          }
        },
      })

      return result.extracted
    },
  })

  if (!result.ok) {
    return withCors(req, new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    }))
  }

  return withCors(req, new Response(JSON.stringify(result.body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
