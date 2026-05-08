// Deno Edge Function entry — bundle-publish (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
// Pure handler: ../_shared/bundle-publish-handler.ts
//
// Admin-only endpoint. Caller MUST present a valid service-role JWT in
// the Authorization header. This is a server-to-server endpoint (called
// from customer-flow.ts at provisioning + from CI/CD on bundle release).
//
// Deploy:
//   supabase functions deploy bundle-publish --project-ref gtjgsligllbjcisiyrah

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  bundlePublishHandler,
  type StorageUploader,
} from '../_shared/bundle-publish-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'workflow-templates'  // bundles live alongside template fixtures

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── admin auth check ─────────────────────────────────────────────────
//
// Caller must send a Bearer token that resolves to role=service_role at
// the gateway. With verify_jwt=false in config.toml the gateway doesn't
// REJECT unauth requests, but it still authenticates whatever bearer
// IS provided and synthesises a signed JWT with the matching role claim
// (legacy JWT → forwarded untouched; sb_secret_* → rewritten into a
// fresh service_role JWT; sb_publishable_* / anon → anon JWT). We decode
// the forwarded JWT's payload and require role=service_role.
//
// We do NOT compare the bearer string against env. Doing so breaks the
// moment a project enables the new sb_secret_*/sb_publishable_* key
// system, because the gateway rewrites the bearer en-route.
//
// This is intentionally simple: the bundle-publish endpoint is called
// only from server-side (customer-flow.ts in the provisioning service +
// CI/CD), both of which can present the service key.

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    // base64url-decode middle segment.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isAdminCaller(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  if (!token) return false
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  return payload.role === 'service_role'
}

// ─── handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }),
      req,
    )
  }

  if (!isAdminCaller(req)) {
    return withCors(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      req,
    )
  }

  let body: { agent_slug: string; version: string; bundle_tar_base64: string }
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }),
      req,
    )
  }

  const uploader: StorageUploader = async ({ path, bytes, contentType }) => {
    const blob = new Blob([bytes as BlobPart], { type: contentType })
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType,
      upsert: true,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, size: bytes.length }
  }

  const result = await bundlePublishHandler(body, uploader)

  if (!result.ok) {
    return withCors(
      new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  }

  return withCors(
    new Response(JSON.stringify(result.body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    req,
  )
})
