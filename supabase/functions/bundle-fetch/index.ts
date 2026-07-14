// Deno Edge Function entry — bundle-fetch (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
// Pure handler: ../_shared/bundle-fetch-handler.ts
//
// Customer-side endpoint. Hermes' bundle-pull script POSTs here at boot.
// Returns a 5-minute signed URL pointing at the bundle tarball.
//
// Deploy:
//   supabase functions deploy bundle-fetch --project-ref gtjgsligllbjcisiyrah

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  bundleFetchHandler,
  type BundleFetchDeps,
  type CustomerInfo,
} from '../_shared/bundle-fetch-handler.ts'
import {
  verifyCustomerToken,
  extractBearerToken,
} from '../_shared/hermes-instance-auth.ts'
import type { WorkflowTier } from '../_shared/workflow-types.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'workflow-templates'
// Phase 5-3.c HMAC instance-token verification (H2/H3 hardening, 2026-06-14).
// Mirror of approval-queue: when HERMES_INSTANCE_HMAC_KEY is configured,
// bundle-fetch REQUIRES a valid per-customer token (closing the IDOR);
// when unset, the gate is skipped (fail-open, identical to prior behaviour).
const HERMES_INSTANCE_HMAC_KEY = Deno.env.get('HERMES_INSTANCE_HMAC_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }),
      req,
    )
  }

  let body: { customer_id: string; agent_slug: string }
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }),
      req,
    )
  }

  const bearer = extractBearerToken(req.headers.get('authorization'))

  const deps: BundleFetchDeps = {
    verifyToken: HERMES_INSTANCE_HMAC_KEY
      ? (customerId, token) =>
          verifyCustomerToken(customerId, token, HERMES_INSTANCE_HMAC_KEY)
      : undefined,
    customerLookup: async (customerId) => {
      const { data, error } = await supabase
        .from('customers')
        .select(
          'id, bundle_versions, bundle_update_policy, subscriptions(tier, status)',
        )
        .eq('id', customerId)
        .maybeSingle()
      if (error || !data) return null
      const subs = (data as {
        subscriptions?: Array<{ tier: WorkflowTier; status: string }>
      }).subscriptions
      const active = subs?.find((s) => s.status === 'active')
      if (!active) return null
      return {
        id: (data as { id: string }).id,
        tier: active.tier,
        bundle_versions:
          ((data as { bundle_versions?: Record<string, string> }).bundle_versions ??
            {}) as Record<string, string>,
        bundle_update_policy:
          ((data as { bundle_update_policy?: 'pin' | 'latest' | 'staged' })
            .bundle_update_policy ?? 'pin'),
      } satisfies CustomerInfo
    },
    listBundleVersions: async (agentSlug) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(`bundles/${agentSlug}`, { limit: 100 })
      if (error) throw new Error(`storage list failed: ${error.message}`)
      return (data ?? []).map((o) => o.name)
    },
    signUrl: async ({ path, expirySeconds }) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, expirySeconds)
      if (error || !data) {
        return { error: error?.message ?? 'unknown sign failure' }
      }
      const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString()
      return { url: data.signedUrl, expiresAt }
    },
    // Persona Genesis (2026-06-10): the customer's generated persona row.
    // The handler enforces ownership (slug must be custom-<this cid>) and
    // only serves status='active'.
    customPersonaLookup: async (customerId) => {
      const { data, error } = await supabase
        .from('custom_personas')
        .select('version, status')
        .eq('customer_id', customerId)
        .maybeSingle()
      if (error || !data) return null
      return data as { version: string; status: 'generating' | 'active' | 'failed' }
    },
  }

  const result = await bundleFetchHandler({ ...body, bearer_token: bearer }, deps)

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
