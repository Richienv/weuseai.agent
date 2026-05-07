// Deno Edge Function entry — workflow-list.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
// Pure handler: ../_shared/workflow-list-handler.ts
//
// Deploy:
//   supabase functions deploy workflow-list --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto-provided):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { workflowListHandler } from '../_shared/workflow-list-handler.ts'
import type { WorkflowRow } from '../_shared/workflow-types.ts'

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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  // Accept filters via query string (preferred) OR JSON body for POST.
  const url = new URL(req.url)
  let agent_slug = url.searchParams.get('agent_slug') ?? undefined
  let category = url.searchParams.get('category') ?? undefined
  let tier = url.searchParams.get('tier') ?? undefined

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body && typeof body === 'object') {
        agent_slug = (body.agent_slug as string | undefined) ?? agent_slug
        category = (body.category as string | undefined) ?? category
        tier = (body.tier as string | undefined) ?? tier
      }
    } catch {
      // Ignore body parse errors — query string still applies.
    }
  }

  const result = await workflowListHandler(
    { agent_slug, category, tier },
    async (filter) => {
      let q = supabase.from('workflows').select('*')
      if (filter.agent_slug) q = q.contains('agent_slugs', [filter.agent_slug])
      if (filter.category) q = q.eq('category', filter.category)
      if (filter.tier) q = q.eq('tier', filter.tier)
      const { data, error } = await q
      if (error) throw new Error(`workflows query failed: ${error.message}`)
      return (data as WorkflowRow[]) ?? []
    },
  )

  if (!result.ok) {
    return withCors(
      req,
      new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }

  return withCors(
    req,
    new Response(JSON.stringify({ workflows: result.workflows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})
