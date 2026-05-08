// Deno Edge Function entry — customer-tier-bump (Phase 2E-3).
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md
// Pure handler: ../_shared/customer-tier-bump-handler.ts
// Auth helper:  ../_shared/admin-auth.ts
//
// Triggered by xendit-webhook on invoice.paid with metadata.tier_upgrade.
// Resolves customer → updates tier in DB → calls provisioning service
// /tier-bump (SSH .env edit + systemctl restart) → audits + nudges.
//
// Required env (set via `supabase secrets set`):
//   - SUPABASE_URL                 (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY    (auto-injected)
//   - PROVISIONING_URL             (existing; e.g. https://weuseai-provisioning.fly.dev)
//   - PROVISIONING_AUTH_TOKEN      (existing; bearer for the provisioning HTTP API)
//   - SUPPORT_TELEGRAM_BOT_TOKEN   (existing; for the customer nudge)
//
// Deploy:
//   supabase functions deploy customer-tier-bump --project-ref gtjgsligllbjcisiyrah

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
import {
  customerTierBumpHandler,
  type TierBumpDeps,
  type TierBumpInput,
} from '../_shared/customer-tier-bump-handler.ts'
import type { WorkflowTier } from '../_shared/workflow-types.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVISIONING_URL = Deno.env.get('PROVISIONING_URL') ?? ''
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN') ?? ''
const TELEGRAM_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── deps wiring ────────────────────────────────────────────────────────

const deps: TierBumpDeps = {
  async lookupCustomer(customer_id) {
    const { data, error } = await supabase
      .from('customers')
      .select(
        `
          tier,
          vps_instances!inner(ip_address, status)
        `,
      )
      .eq('id', customer_id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: `no customer with id ${customer_id}` }

    // Pick the most recent running VPS (a customer normally has 1; on
    // re-provisioning there may be a stale 'terminated' row left).
    const vpsRow =
      Array.isArray((data as { vps_instances?: unknown }).vps_instances)
        ? ((data as { vps_instances: Array<{ ip_address: string | null; status: string }> }).vps_instances)
            .find((v) => v.status === 'running')
        : null
    return {
      ok: true,
      current_tier: data.tier as WorkflowTier,
      vps_host: vpsRow?.ip_address ?? null,
    }
  },

  async updateCustomerTier(customer_id, target_tier) {
    const { error } = await supabase
      .from('customers')
      .update({ tier: target_tier })
      .eq('id', customer_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  async insertAuditRow(row) {
    const { data, error } = await supabase
      .from('tier_change_events')
      .insert(row)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'no row returned' }
    return { ok: true, event_id: (data as { id: string }).id }
  },

  async markAuditComplete(event_id, completion) {
    const update = 'completed_at' in completion
      ? { completed_at: completion.completed_at }
      : { error_detail: completion.error_detail }
    const { error } = await supabase
      .from('tier_change_events')
      .update(update)
      .eq('id', event_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  async callProvisioningTierBump({ customer_id, target_tier, vps_host }) {
    if (!PROVISIONING_URL || !PROVISIONING_AUTH_TOKEN) {
      return {
        ok: false,
        error:
          'PROVISIONING_URL or PROVISIONING_AUTH_TOKEN not set in Edge Function env',
      }
    }
    let r: Response
    try {
      r = await fetch(`${PROVISIONING_URL}/tier-bump`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customer_id, target_tier, vps_host }),
      })
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    if (!r.ok) {
      const body = await r.text()
      return { ok: false, error: `HTTP ${r.status}: ${body.slice(0, 200)}` }
    }
    const json = (await r.json()) as { ok?: boolean; restarted_at?: string; error?: string }
    if (!json.ok || !json.restarted_at) {
      return { ok: false, error: json.error ?? 'provisioning returned ok=false' }
    }
    return { ok: true, restarted_at: json.restarted_at }
  },

  async notifyCustomer({ customer_id, target_tier }) {
    if (!TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no bot token' }

    // Look up the customer's chat_id from telegram_pairings.
    const { data, error } = await supabase
      .from('telegram_pairings')
      .select('telegram_chat_id')
      .eq('customer_id', customer_id)
      .eq('status', 'paired')
      .maybeSingle()
    if (error || !data) return { ok: false, error: error?.message ?? 'no paired chat' }

    const chatId = (data as { telegram_chat_id: number | string }).telegram_chat_id
    const text = `Tier kamu udah ${target_tier.charAt(0).toUpperCase() + target_tier.slice(1)}. Skill baru bakal aktif dalam ~30 detik.`
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      )
      if (!r.ok) return { ok: false, error: `telegram HTTP ${r.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ─── handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 }),
      req,
    )
  }

  if (!isServiceRoleCaller(req)) {
    return withCors(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      req,
    )
  }

  let body: TierBumpInput
  try {
    body = await req.json()
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }),
      req,
    )
  }

  const result = await customerTierBumpHandler(body, deps)

  if (!result.ok) {
    return withCors(
      new Response(
        JSON.stringify({
          error: result.error,
          detail: result.detail,
          event_id: result.event_id,
        }),
        { status: result.status, headers: { 'Content-Type': 'application/json' } },
      ),
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
