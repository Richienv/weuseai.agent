/**
 * Liren LLM proxy — Cloudflare Worker
 *
 * Sit antara Hermes container dan LLM provider.
 * - Verify JWT (customer auth)
 * - Check credit balance
 * - Route ke provider berdasarkan model
 * - Forward request, calculate cost, debit credits
 */

import { PRICING, calculateCostUsdCents } from './pricing.js'

export interface Env {
  PROXY_JWT_SECRET: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ZHIPU_API_KEY: string
  ZHIPU_BASE: string
  DEEPSEEK_API_KEY: string
  DEEPSEEK_BASE: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE: string
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    // Auth — customer JWT in Bearer
    const customerId = await verifyJWT(req.headers.get('authorization') ?? '', env.PROXY_JWT_SECRET)
    if (!customerId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Routes
    if (url.pathname === '/balance' && req.method === 'GET') {
      return jsonResponse(await getBalance(customerId, env))
    }
    if (url.pathname === '/chat/completions' && req.method === 'POST') {
      return handleChatCompletion(req, env, ctx, customerId)
    }
    if (url.pathname === '/health') {
      return jsonResponse({ ok: true })
    }
    return new Response('not found', { status: 404 })
  },
}

async function handleChatCompletion(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  customerId: string,
): Promise<Response> {
  const body = (await req.json()) as { model?: string; messages?: unknown }
  const model = body.model ?? 'glm-4-flash'
  const pricing = PRICING[model]
  if (!pricing) {
    return jsonResponse({ error: 'unknown_model', model }, 400)
  }

  // Check balance — except for free models (no need to gate)
  const isFree = pricing.inputPerM === 0 && pricing.outputPerM === 0
  if (!isFree) {
    const balance = await getBalance(customerId, env)
    if (balance.balance_usd_cents <= 0) {
      return jsonResponse(
        { error: 'no_credits', message: 'Top up credits untuk lanjut.' },
        402,
      )
    }
  }

  // Route ke provider
  const { upstream, headers } = providerRoute(pricing.provider, env)
  const upstreamReq = new Request(`${upstream}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })

  const upstreamRes = await fetch(upstreamReq)
  const result = (await upstreamRes.clone().json()) as any

  // Calculate cost from usage
  if (!isFree && result.usage) {
    const cost = calculateCostUsdCents(model, result.usage)
    // Debit + log async (don't block response)
    ctx.waitUntil(
      Promise.all([
        debitCredits(customerId, cost, env),
        logUsage(customerId, model, result.usage, cost, env),
      ]),
    )
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: upstreamRes.headers,
  })
}

function providerRoute(
  provider: 'zhipu' | 'deepseek' | 'anthropic',
  env: Env,
): { upstream: string; headers: Record<string, string> } {
  switch (provider) {
    case 'zhipu':
      return { upstream: env.ZHIPU_BASE, headers: { authorization: `Bearer ${env.ZHIPU_API_KEY}` } }
    case 'deepseek':
      return { upstream: env.DEEPSEEK_BASE, headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}` } }
    case 'anthropic':
      // Anthropic uses x-api-key, not bearer. NOTE: API surface differs slightly from OpenAI;
      // for Phase 1 we expose only OpenAI-compatible models (zhipu/deepseek). Anthropic adapter
      // butuh translation layer — TODO Layer 2.
      return { upstream: env.ANTHROPIC_BASE, headers: { 'x-api-key': env.ANTHROPIC_API_KEY ?? '' } }
  }
}

// ──────── Supabase helpers ────────

async function getBalance(customerId: string, env: Env): Promise<{ balance_usd_cents: number }> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/credits?customer_id=eq.${customerId}&select=balance_usd_cents`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  const rows = (await r.json()) as Array<{ balance_usd_cents: number }>
  return { balance_usd_cents: rows[0]?.balance_usd_cents ?? 0 }
}

async function debitCredits(customerId: string, cents: number, env: Env): Promise<void> {
  // Use Supabase RPC for atomic decrement (define `decrement_credits` SQL function in Supabase)
  await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/decrement_credits`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_customer_id: customerId, p_cents: cents }),
  })
}

async function logUsage(
  customerId: string,
  model: string,
  usage: any,
  costCents: number,
  env: Env,
): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/usage_log`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      model,
      input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
      cost_usd_cents: costCents,
    }),
  })
}

// ──────── JWT verification ────────

async function verifyJWT(authHeader: string, secret: string): Promise<string | null> {
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const [headerB64, payloadB64, sig] = token.split('.')
  if (!headerB64 || !payloadB64 || !sig) return null

  const data = `${headerB64}.${payloadB64}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const expectedSig = base64UrlDecode(sig)
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, new TextEncoder().encode(data))
  if (!valid) return null

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload.sub ?? null
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
