// Deno Edge Function entry — daily-briefing-handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "Pilot 2: daily-briefing-builder (The Pro) — aggregation pattern"
//
// Pure handler: ../_shared/daily-briefing-handler.ts
//
// Phase 2E-1: pulls calendar + email from MOCK fixtures stored in
// Supabase Storage at templates/mocks/{calendar,gmail}/{scenario}.json.
// News pulls from a placeholder static fixture for the pilot — Phase
// 2C-2 swaps in real MCP adapters without changing the handler shape.
//
// Deploy:
//   supabase functions deploy daily-briefing-handler --project-ref gtjgsligllbjcisiyrah
//
// Bucket setup (one-time, before first run):
//   supabase storage create workflow-templates --public false
//   # Then upload the 4 mock fixtures from agent-packs/workflow-templates/mocks/

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  buildDailyBriefing,
  todayInJakarta,
  type CalendarEvent,
  type EmailMessage,
  type NewsHeadline,
  type DailyBriefingInput,
} from '../_shared/daily-briefing-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TEMPLATES_BUCKET = 'workflow-templates'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── fixture readers (mock MCPs) ────────────────────────────────────────

async function readFixture<T>(path: string): Promise<T | null> {
  const { data, error } = await supabase.storage.from(TEMPLATES_BUCKET).download(path)
  if (error || !data) return null
  try {
    const text = await data.text()
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function readCalendarMock(_date: string): Promise<CalendarEvent[] | null> {
  // Phase 2E-1: every customer gets the typical-day fixture. Phase 2C-2
  // wires real Calendar MCP per customer.
  const fixture = await readFixture<{ events: CalendarEvent[] }>(
    'mocks/calendar/typical-day.json',
  )
  return fixture?.events ?? null
}

async function readEmailMock(_date: string): Promise<EmailMessage[] | null> {
  const fixture = await readFixture<{ emails: EmailMessage[] }>(
    'mocks/gmail/typical-day.json',
  )
  return fixture?.emails ?? null
}

async function readNewsPlaceholder(_date: string): Promise<NewsHeadline[] | null> {
  // 2E-1 placeholder. Real news source wiring is the same pattern as
  // setup-script.ts DAILY_NEWS_SKILL_MD — Hermes handles it on the VPS.
  // For the curl demo we return an empty list so the section renders
  // the "tidak ada headline" prose; founder can swap in a static fixture
  // later if the demo needs more visual content.
  return []
}

// ─── handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  let body: { customer_id: string; parameters: DailyBriefingInput }
  try {
    body = await req.json()
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }))
  }

  if (!body.customer_id || typeof body.customer_id !== 'string') {
    return withCors(req, new Response(JSON.stringify({ error: 'missing_customer_id' }), { status: 400 }))
  }

  let result
  try {
    result = await buildDailyBriefing(
      body.parameters ?? {},
      {
        readCalendar: readCalendarMock,
        readEmail: readEmailMock,
        readNews: readNewsPlaceholder,
      },
      () => todayInJakarta(),
    )
  } catch (e) {
    return withCors(req, new Response(JSON.stringify({
      error: 'briefing_build_failed',
      detail: e instanceof Error ? e.message : String(e),
    }), { status: 500 }))
  }

  return withCors(req, new Response(JSON.stringify({
    format: result.format,
    text: result.text,
    date: result.date,
    sources_loaded: result.sources_loaded,
    warnings: result.warnings,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
