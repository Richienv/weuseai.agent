// Deno Edge Function entry — hyperframes-render.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-2, Q2=A
// Runway primary + Pika fallback).
// Pure handler: ../_shared/hyperframes-render-handler.ts
//
// Customer's Hermes (running on VPS) POSTs a HyperFrames spec + their
// BYOK render API key here; we kick off per-scene render jobs with the
// chosen provider, return the job IDs + cost estimate + stitch recipe.
// Hermes polls each job (via this function's ?poll= query, or directly
// against the provider) and stitches via the local
// `services/hyperframes-stitch/` CLI when all scenes are ready.
//
// Deploy:
//   supabase functions deploy hyperframes-render \
//     --project-ref gtjgsligllbjcisiyrah --no-verify-jwt
//
// `--no-verify-jwt` because customer's Hermes calls this directly via
// HTTP POST; the BYOK render key in the body is the auth boundary
// (provider gates access). Phase 4.5 may add tier-check via JWT-role
// pattern (mirrors invoice-generator).
//
// Env (Supabase secrets — none required for v0):
//   SUPABASE_URL                 — auto-set by Supabase
//   (No service-role key needed; we don't touch the DB in v0.)

import { handleHyperFramesRender } from '../_shared/hyperframes-render-handler.ts'
import { handleCors, withCors, webhookCorsHeaders } from '../_shared/cors.ts'
import { RunwayProvider } from '../_shared/render-providers/runway.ts'
import { PikaProvider } from '../_shared/render-providers/pika.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

// Provider instances are stateless — instantiate once per cold start.
const runway = new RunwayProvider()
const pika = new PikaProvider()

Deno.serve(async (req) => {
  // Allow CORS from our deploy hosts AND Hermes-on-VPS calls (no origin
  // header). The wildcard webhookCorsHeaders match the latter.
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight

  const res = await handleHyperFramesRender(req, {
    router: {
      providers: { runway, pika },
    },
  })
  return withCors(res, webhookCorsHeaders)
})
