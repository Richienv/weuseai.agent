// Deno Edge Function entry — persona-genesis (Mission 2, 2026-06-10).
//
// Spec:      docs/specs/2026-06-10-mission2-build-spec.md
// Handler:   ../_shared/persona-genesis-handler.ts (pure, fully tested)
// Migration: ../../migrations/20260610010000_persona_genesis.sql
// Runbook:   docs/runbooks/persona-genesis.md
//
// Deploy:
//   supabase functions deploy persona-genesis --project-ref gtjgsligllbjcisiyrah
//
// Called by the customer's VPS agent (the /bikin-persona interview skill)
// with an X-CID-bound POST. Generates a bespoke persona via DeepSeek,
// validates it against the same gates as curated personas, publishes the
// bundle to Storage, swaps the customer's SOUL, and triggers the
// admin-customer-vps-refresh rail to install it.
//
// Required env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required env (manual — founder sets once):
//   DEEPSEEK_API_KEY   — the same business key the starter-credit proxy
//                        uses on Cloudflare; new LOCATION, not a new
//                        credential. Without it every generation 502s
//                        with llm_unconfigured (fail-closed, alerts).
// Optional env:
//   SUPPORT_TELEGRAM_BOT_TOKEN + RICHIE_CHAT_ID — founder DM on failures.
//   DEEPSEEK_BASE — default https://api.deepseek.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  handlePersonaGenesis,
  type PersonaGenesisDeps,
  type GenesisCustomerRow,
  type CustomPersonaRow,
} from '../_shared/persona-genesis-handler.ts'
import type { GenesisProfile } from '../_shared/persona-genesis-generator.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const DEEPSEEK_BASE = Deno.env.get('DEEPSEEK_BASE') ?? 'https://api.deepseek.com'
const FOUNDER_BOT_TOKEN = Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN') ?? ''
const FOUNDER_CHAT_ID = Deno.env.get('RICHIE_CHAT_ID') ?? ''
const BUCKET = 'workflow-templates' // same bucket bundle-fetch signs from

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── deps wiring ─────────────────────────────────────────────────────────

const deps: PersonaGenesisDeps = {
  db: {
    async getGenesisCustomer(customerId): Promise<GenesisCustomerRow | null> {
      const { data, error } = await supabase
        .from('customers')
        .select('id, display_name, email, subscriptions(tier, status)')
        .eq('id', customerId)
        .maybeSingle()
      if (error || !data) return null
      const subs = (data as { subscriptions?: Array<{ tier: string; status: string }> }).subscriptions
      const active = subs?.find((s) => s.status === 'active')
      if (!active) {
        return {
          id: customerId,
          display_name: (data as { display_name: string | null }).display_name,
          email: (data as { email: string }).email,
          tier: subs?.[0]?.tier ?? 'unknown',
          subscription_status: subs?.[0]?.status ?? 'none',
        }
      }
      return {
        id: customerId,
        display_name: (data as { display_name: string | null }).display_name,
        email: (data as { email: string }).email,
        tier: active.tier,
        subscription_status: 'active',
      }
    },
    async getCustomPersona(customerId): Promise<CustomPersonaRow | null> {
      const { data, error } = await supabase
        .from('custom_personas')
        .select('customer_id, slug, version, status, persona_name, generations_today, updated_at')
        .eq('customer_id', customerId)
        .maybeSingle()
      if (error || !data) return null
      const row = data as CustomPersonaRow & { updated_at: string }
      // Daily-cap rollover: a row last touched on a previous UTC day counts
      // as zero generations today.
      const lastDay = row.updated_at?.slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      if (lastDay !== today) {
        return { ...row, generations_today: 0 }
      }
      return row
    },
    async upsertCustomPersona(row): Promise<void> {
      // generations_today: bump only when a NEW generation starts
      // (status='generating'); status flips on the same generation keep
      // the count.
      const existing = await supabase
        .from('custom_personas')
        .select('generations_today, updated_at')
        .eq('customer_id', row.customer_id)
        .maybeSingle()
      const prev = existing.data as { generations_today: number; updated_at: string } | null
      const today = new Date().toISOString().slice(0, 10)
      const prevToday = prev?.updated_at?.slice(0, 10) === today ? prev.generations_today : 0
      const generations_today =
        row.status === 'generating' ? prevToday + 1 : Math.max(prevToday, 1)
      const { error } = await supabase.from('custom_personas').upsert({
        customer_id: row.customer_id,
        slug: row.slug,
        version: row.version,
        status: row.status,
        persona_name: row.persona_name,
        profile: row.profile,
        error_detail: row.error_detail ?? null,
        generations_today,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(`custom_personas upsert: ${error.message}`)
    },
    async updateCustomerSoul(customerId, soulMdText): Promise<void> {
      const { error } = await supabase
        .from('customers')
        .update({ soul_md_text: soulMdText })
        .eq('id', customerId)
      if (error) throw new Error(`soul update: ${error.message}`)
    },
  },

  llm: async ({ system, user, stage }) => {
    if (!DEEPSEEK_API_KEY) {
      throw new Error('llm_unconfigured: DEEPSEEK_API_KEY secret is not set')
    }
    const r = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
        temperature: 0.7,
      }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      throw new Error(`deepseek ${stage} HTTP ${r.status}: ${text.slice(0, 300)}`)
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error(`deepseek ${stage}: empty completion`)
    return content
  },

  storage: {
    async upload(path, bytes) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes.buffer as ArrayBuffer, {
          contentType: 'application/gzip',
          upsert: true,
        })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },
  },

  async vpsRefresh(customerId, reason) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-customer-vps-refresh`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ customer_id: customerId, reason }),
      })
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        return { ok: false, detail: `HTTP ${r.status} ${text.slice(0, 200)}` }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  },

  async founderAlert(text) {
    if (!FOUNDER_BOT_TOKEN || !FOUNDER_CHAT_ID) return
    await fetch(`https://api.telegram.org/bot${FOUNDER_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text }),
    })
  },
}

// Re-export for typing clarity at call sites in tests (not used here).
export type { GenesisProfile }

// ─── HTTP entry ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  const res = await handlePersonaGenesis(req, deps)
  return withCors(res, req)
})
