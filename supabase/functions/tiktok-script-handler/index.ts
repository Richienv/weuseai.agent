// Deno Edge Function entry — tiktok-script-handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "Pilot 3: tiktok-script-builder (Video Producer) — structured generation"
//
// Pure handler: ../_shared/tiktok-script-handler.ts
//
// Calls claude-3.5-haiku via OpenRouter using the platform's
// OPENROUTER_ORCHESTRATION_KEY (same key used for parameter extraction).
// Cost: ~$0.0003-0.0005 per call (longer output than param extraction).
//
// Deploy:
//   supabase functions deploy tiktok-script-handler --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto + secrets):
//   SUPABASE_URL                    auto
//   SUPABASE_SERVICE_ROLE_KEY       auto
//   OPENROUTER_ORCHESTRATION_KEY    secret (sk-or-v1-...)

import { handleCors, withCors } from '../_shared/cors.ts'
import { getOrchestrationKey } from '../_shared/llm-client.ts'
import {
  generateTiktokScript,
  type TiktokScriptInput,
} from '../_shared/tiktok-script-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(req, new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }))
  }

  let body: { customer_id: string; parameters: TiktokScriptInput }
  try {
    body = await req.json()
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }))
  }

  if (!body.customer_id || typeof body.customer_id !== 'string') {
    return withCors(req, new Response(JSON.stringify({ error: 'missing_customer_id' }), { status: 400 }))
  }
  if (!body.parameters || typeof body.parameters !== 'object') {
    return withCors(req, new Response(JSON.stringify({ error: 'missing_parameters' }), { status: 400 }))
  }

  const orchestrationKey = getOrchestrationKey()
  if (!orchestrationKey) {
    return withCors(req, new Response(JSON.stringify({
      error: 'orchestration_key_not_configured',
      detail: 'OPENROUTER_ORCHESTRATION_KEY secret missing',
    }), { status: 500 }))
  }

  const result = await generateTiktokScript({
    apiKey: orchestrationKey,
    input: body.parameters,
  })

  if (!result.ok) {
    return withCors(req, new Response(JSON.stringify({
      error: result.reason,
      detail: result.detail,
    }), { status: 500 }))
  }

  return withCors(req, new Response(JSON.stringify({
    format: 'json',
    script: result.script,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
