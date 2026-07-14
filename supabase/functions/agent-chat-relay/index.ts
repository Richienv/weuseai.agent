// Deno Edge Function entry — agent-chat-relay (dashboard Phase 2).
//
// Browser-facing relay for the chat dashboard. Pure logic lives in
// ../_shared/agent-chat-relay-handler.ts; this is the I/O shell: env +
// service-role client + CORS + DI of the real resolvers / crypto / Fly call.
//
// Ships DARK: AGENT_CHAT_ENABLED defaults false → every request 404s. Even when
// enabled, only cids in AGENT_CHAT_CID_ALLOWLIST pass until AGENT_CHAT_ALLOW_ALL=true.
//
// Deploy: supabase functions deploy agent-chat-relay --project-ref gtjgsligllbjcisiyrah
//
// Required secrets (when enabled): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   CHAT_KEY_ENCRYPTION_KEY (64-hex, AES-256-GCM, separate from
//   INTEGRATION_ENCRYPTION_KEY), PROVISIONING_URL, PROVISIONING_AUTH_TOKEN,
//   AGENT_CHAT_ENABLED, AGENT_CHAT_CID_ALLOWLIST, AGENT_CHAT_ALLOW_ALL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { handleCors, withCors } from '../_shared/cors.ts'
import { createRateLimiter } from '../_shared/agent-chat-rate-limiter.ts'
import { resolveTier, TIERS } from '../_shared/tier-personas.ts'
import { decryptCredential, type CredentialCipher } from '../_shared/integration-credential-crypto.ts'
import { slogRedacted } from '../_shared/redact-for-log.ts'
import {
  agentChatRelayHandler,
  type AgentChatRelayDeps,
  type CustomerState,
  type FlyPayload,
} from '../_shared/agent-chat-relay-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CHAT_KEY = Deno.env.get('CHAT_KEY_ENCRYPTION_KEY') ?? ''
const PROVISIONING_URL = (Deno.env.get('PROVISIONING_URL') ?? '').replace(/\/+$/, '')
const PROVISIONING_AUTH_TOKEN = Deno.env.get('PROVISIONING_AUTH_TOKEN') ?? ''
const DAILY_TOKEN_BUDGET = 60_000 // mirror the RPC; used only for the meta remaining_pct

const FLAG = {
  enabled: (Deno.env.get('AGENT_CHAT_ENABLED') ?? 'false') === 'true',
  allowAll: (Deno.env.get('AGENT_CHAT_ALLOW_ALL') ?? 'false') === 'true',
  allowlist: new Set(
    (Deno.env.get('AGENT_CHAT_CID_ALLOWLIST') ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  ),
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// v1.4 web_app unlock — customers.tier → features.web_app (done-for-you /
// enterprise). Missing customer/tier fails closed.
const tierAllowsWebChat = async (cid: string): Promise<boolean> => {
  const { data } = await supabase.from('customers').select('tier').eq('id', cid).maybeSingle()
  const t = (data as { tier?: string | null } | null)?.tier
  if (!t) return false
  return TIERS[resolveTier(t)].features.web_app === true
}

const deps: AgentChatRelayDeps = {
  flag: FLAG,
  rateLimiter: createRateLimiter(supabase),
  tierAllowsWebChat,

  resolveCustomerState: async (cid: string): Promise<CustomerState> => {
    const { data: subs } = await supabase
      .from('subscriptions').select('status')
      .eq('customer_id', cid).in('status', ['active', 'pending_provision'])
    if (!subs || subs.length === 0) return 'inactive'
    const { data: vps } = await supabase
      .from('vps_instances').select('status')
      .eq('customer_id', cid).in('status', ['running', 'provisioning'])
    const rows = (vps ?? []) as Array<{ status: string }>
    if (rows.some((v) => v.status === 'running')) return 'running'
    if (rows.some((v) => v.status === 'provisioning')) return 'provisioning'
    return 'inactive'
  },

  resolveTarget: async (cid: string) => {
    // NEW narrow query — running VPS with a populated key cipher. NOT
    // findActiveVPSByCustomer (that matches provisioning + maybeSingle()-throws).
    const { data } = await supabase
      .from('vps_instances')
      .select('vps_id, ip_address, api_server_key_cipher')
      .eq('customer_id', cid).eq('status', 'running')
      .not('api_server_key_cipher', 'is', null)
    const rows = (data ?? []) as Array<{ vps_id: string; ip_address: string; api_server_key_cipher: unknown }>
    if (rows.length === 0) return null
    if (rows.length > 1) { slogRedacted('error', 'chat.vps_ambiguous', { cid, count: rows.length }); return null }
    return { ip: rows[0].ip_address, cipher: rows[0].api_server_key_cipher }
  },

  decryptKey: (cipher: unknown) => decryptCredential(cipher as CredentialCipher, CHAT_KEY),

  callFlyRelay: (payload: FlyPayload, opts) =>
    fetch(`${PROVISIONING_URL}/agent-chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
        'content-type': 'application/json',
        accept: opts.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(payload),
      signal: opts.signal ?? undefined,
    }),

  meta: async (cid: string) => {
    const { data: c } = await supabase.from('customers').select('agent_slug').eq('id', cid).maybeSingle()
    const { data: u } = await supabase.from('agent_chat_usage').select('tokens_today').eq('customer_id', cid).maybeSingle()
    const used = Number((u as { tokens_today?: number } | null)?.tokens_today ?? 0)
    const remaining = Math.max(0, Math.min(100, Math.round((1 - used / DAILY_TOKEN_BUDGET) * 100)))
    return {
      // Honest per-tier flag: reaching meta means flag-on + allowlisted, but
      // chat itself is the web_app unlock — the UI upsells when false.
      chat_enabled: await tierAllowsWebChat(cid),
      persona_slug: ((c as { agent_slug?: string } | null)?.agent_slug) || 'the-pro',
      remaining_pct: remaining,
    }
  },
}

Deno.serve(async (req: Request) => {
  const pre = handleCors(req)
  if (pre) return pre
  try {
    const res = await agentChatRelayHandler(req, deps)
    return withCors(res, req)
  } catch (e) {
    // Last-resort opaque failure — never leak internals.
    slogRedacted('error', 'chat.relay_unhandled', { err: e instanceof Error ? e.message : String(e) })
    return withCors(
      new Response(JSON.stringify({ ok: false, error: 'upstream_unavailable' }), {
        status: 502, headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }
})
