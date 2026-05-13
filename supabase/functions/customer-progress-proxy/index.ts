// Deno Edge Function entry — customer-progress-proxy.
//
// Phase 2 prevention infrastructure (2026-05-13).
//
// Deploy:
//   supabase functions deploy customer-progress-proxy --project-ref gtjgsligllbjcisiyrah
//
// Required env (auto-set by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Required env (set manually):
//   PROVISIONING_URL          — https://weuseai-provisioning.fly.dev
//   PROVISIONING_AUTH_TOKEN   — bearer for the Fly /customer-progress route
//
// Welcome.html polls this with anon JWT every 5 sec during state B
// (provisioning wait). The handler validates the customer row exists,
// then forwards the request to the bearer-protected Fly endpoint.

// @ts-ignore — Deno-only
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  customerProgressProxyHandler,
  type CustomerProgressProxyDeps,
} from '../_shared/customer-progress-proxy-handler.ts'
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

const deps: CustomerProgressProxyDeps = {
  async customerExists(customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .maybeSingle()
    if (error) return false
    return data != null
  },
  async fetchProgress(customerId) {
    const url = `${PROVISIONING_URL}/customer-progress?customer_id=${encodeURIComponent(customerId)}`
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${PROVISIONING_AUTH_TOKEN}`,
      },
    })
    const bodyText = await r.text()
    return { ok: r.ok, status: r.status, bodyText }
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  // Accept POST { customer_id } AND GET ?customer_id=... so welcome.html
  // can keep its existing POST pattern AND admins can curl-test easily.
  let customerId = ''
  if (req.method === 'GET') {
    const url = new URL(req.url)
    customerId = url.searchParams.get('customer_id') ?? ''
  } else if (req.method === 'POST') {
    try {
      const body = (await req.json()) as { customer_id?: string }
      customerId = body.customer_id ?? ''
    } catch {
      // fall through to validation error
    }
  } else {
    return withCors(
      new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      }),
      req,
    )
  }

  // Sesi D pass-3 P1-2 (2026-05-13): forward X-CID header value to the
  // handler. The handler returns 403 'x_cid_mismatch' if missing or if
  // it doesn't equal customer_id. Closes the cross-customer leak path
  // where anon-JWT + any cid returned VPS IP + log tail.
  const xCid = req.headers.get('x-cid')

  const result = await customerProgressProxyHandler(
    { customer_id: customerId, x_cid: xCid },
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
