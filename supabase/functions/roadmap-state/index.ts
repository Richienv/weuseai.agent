// Phase 5-3.b: roadmap-state Deno Edge Function entry.
//
// Pure handler: ../_shared/roadmap-state-handler.ts
// State-machine source: services/business-roadmap (Phase 5-1.b)
// Schema: business_roadmap_state (Phase 5-1.a)
//
// Modes:
//   GET   /roadmap-state?customer_id=<uuid>           → get
//   POST  /roadmap-state          (mode in body OR    → init (if no row exists)
//                                  inferred default)
//   PATCH /roadmap-state                              → mark_deliverable
//   POST  /roadmap-state?action=advance               → advance stage
//
// Deploy:
//   supabase functions deploy roadmap-state \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  roadmapStateHandler,
  type HandlerInput,
  type RoadmapStateReader,
  type RoadmapStateWriter,
} from '../_shared/roadmap-state-handler.ts'
import type { RoadmapState } from '../../../services/business-roadmap/src/index.ts'

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

// ─── Injected dependencies ─────────────────────────────────────────

const reader: RoadmapStateReader = async (customer_id) => {
  const { data, error } = await supabase
    .from('business_roadmap_state')
    .select(
      'customer_id, current_stage, stage_entered_at, deliverables_completed, notes_md, updated_at',
    )
    .eq('customer_id', customer_id)
    .maybeSingle()
  if (error || !data) return null
  return data as RoadmapState
}

const writer: RoadmapStateWriter = async (state) => {
  const { data, error } = await supabase
    .from('business_roadmap_state')
    .upsert(state, { onConflict: 'customer_id' })
    .select()
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'no row returned' }
  }
  return { ok: true, state: data as RoadmapState }
}

// ─── Deno entry ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const url = new URL(req.url)
  const query = Object.fromEntries(url.searchParams.entries()) as Record<
    string,
    string | undefined
  >
  const method = req.method

  let body: Record<string, unknown> = {}
  if (method === 'POST' || method === 'PATCH') {
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }
  }

  let input: HandlerInput
  if (method === 'GET') {
    input = { method: 'GET', mode: 'get', query }
  } else if (method === 'PATCH') {
    input = { method: 'PATCH', mode: 'mark_deliverable', body }
  } else if (method === 'POST') {
    if (query.action === 'advance') {
      input = { method: 'POST', mode: 'advance', body }
    } else {
      input = { method: 'POST', mode: 'init', body }
    }
  } else {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  const result = await roadmapStateHandler(input, {
    reader,
    writer,
    now: () => new Date().toISOString(),
  })

  if (!result.ok) {
    return withCors(
      new Response(
        JSON.stringify({ error: result.error, detail: result.detail }),
        {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
      req,
    )
  }

  return withCors(
    new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    }),
    req,
  )
})
