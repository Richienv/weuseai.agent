// Deno Edge Function entry — bundle-version-bump-broadcast.
//
// D1 multi-persona webhook push (2026-05-12).
//
// Deploy:
//   supabase functions deploy bundle-version-bump-broadcast --project-ref gtjgsligllbjcisiyrah
//
// Required env (set via `supabase secrets set ...`):
//   SUPABASE_URL                — set automatically
//   SUPABASE_SERVICE_ROLE_KEY   — set automatically
//   PROVISIONING_URL            — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN     — bearer for the provisioning service
//
// Auth: caller MUST supply Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// (verify-jwt remains ON — only service-role or admin can invoke).
//
// Call from admin / CI script:
//   curl -X POST "$SUPABASE_URL/functions/v1/bundle-version-bump-broadcast" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"agent_slug": "doc-expert", "new_version": "2.0.1", "reason": "publish"}'

// @ts-ignore — Deno-only
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleBundleVersionBumpBroadcast,
  type AffectedCustomer,
  type BroadcastDeps,
} from '../_shared/bundle-version-bump-broadcast-handler.ts'
import { handleCors, withCors } from '../_shared/cors.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL')!
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const deps: BroadcastDeps = {
  async findCustomersOnLatestPolicy(): Promise<AffectedCustomer[]> {
    // Inner join between customers (bundle_update_policy='latest') and
    // subscriptions (status='active'). Return one row per customer with
    // their current tier.
    const { data, error } = await supabase
      .from('customers')
      .select('id, subscriptions!inner(tier, status)')
      .eq('bundle_update_policy', 'latest')
    if (error) throw error
    if (!data) return []
    const out: AffectedCustomer[] = []
    for (const c of data as Array<{
      id: string
      subscriptions: Array<{ tier: string; status: string }>
    }>) {
      const activeSub = c.subscriptions?.find((s) => s.status === 'active')
      if (!activeSub) continue
      if (!['starter', 'pro', 'studio'].includes(activeSub.tier)) continue
      out.push({ id: c.id, tier: activeSub.tier as 'starter' | 'pro' | 'studio' })
    }
    return out
  },
  async triggerRestart(customerId, reason) {
    try {
      const r = await fetch(`${PROVISIONING_URL}/restart-hermes`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ customer_id: customerId, reason }),
      })
      if (r.ok) return { ok: true, status: r.status }
      const body = await r.text().catch(() => '')
      return { ok: false, status: r.status, error: body.slice(0, 200) }
    } catch (e) {
      return {
        ok: false,
        status: 502,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
  async recordBroadcast(row) {
    const { error } = await supabase.from('bundle_version_broadcasts').insert(row)
    if (error) {
      // Telemetry write failure is non-fatal — log + continue.
      console.error('[broadcast] telemetry insert failed:', error.message)
    }
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }

  let body: { agent_slug?: string; new_version?: string; reason?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return withCors(
      new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }

  const result = await handleBundleVersionBumpBroadcast(
    {
      agent_slug: body.agent_slug ?? '',
      new_version: body.new_version,
      reason: body.reason,
    },
    deps,
  )

  const status = result.ok ? 200 : result.status
  return withCors(
    new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    req,
  )
})
