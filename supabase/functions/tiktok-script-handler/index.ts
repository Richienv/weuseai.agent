// Deno Edge Function entry — tiktok-script-handler.
//
// Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md
//
// Pure handler: ../_shared/tiktok-script-handler.ts
//
// ARCHITECTURE PIVOT (2026-05-08): handler is a validator now, NOT a
// generator. Hermes' agent on the customer's VPS generates the script
// JSON using the customer's BYOK key and POSTs it here for validation
// against the locked schema.
//
// No LLM calls. No platform-side OpenRouter key dependency. Cost is $0
// platform-side; customer pays for their LLM via BYOK as expected.
//
// Deploy:
//   supabase functions deploy tiktok-script-handler --project-ref gtjgsligllbjcisiyrah
//
// Required env (Supabase auto):
//   SUPABASE_URL                    auto
//   SUPABASE_SERVICE_ROLE_KEY       auto

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  validateTiktokScript,
  type TiktokValidateInput,
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

  let body: { customer_id: string; parameters: TiktokValidateInput }
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

  const result = validateTiktokScript(body.parameters)
  if (!result.ok) {
    return withCors(req, new Response(JSON.stringify({
      error: result.reason,
      detail: result.detail,
      errors: result.errors,
    }), { status: 400 }))
  }

  return withCors(req, new Response(JSON.stringify({
    format: 'json',
    script: result.script,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})
