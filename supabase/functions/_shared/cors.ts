// CORS helpers for Edge Functions.
//
// Browser-callable functions (create-invoice, complete-onboarding,
// rotate-pairing-code) need to accept calls from:
//   - production: https://weuseai-agent.vercel.app
//   - preview deploys: https://weuseai-agent-<hash>-richies-projects-6f212435.vercel.app
//   - localhost during dev (optional, gated by NODE_ENV-style toggle later)
//
// We DON'T wildcard the origin because XHR-with-credentials still requires
// an explicit echo. Instead we match the request's Origin against a tight
// regex of our deploy hosts and echo only when it passes.
//
// Server-to-server functions (xendit-webhook, telegram-bot-webhook) use
// the wildcard helper since the caller's IP/host rotates and CORS doesn't
// apply to non-browser callers anyway.

const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-callback-token, x-telegram-bot-api-secret-token'
const ALLOWED_METHODS = 'POST, OPTIONS'
const MAX_AGE = '86400'

// Tight pattern: only our Vercel project hosts are allowed.
// Examples that match:
//   https://weuseai-agent.vercel.app
//   https://weuseai-agent-ibbxfduv4-richies-projects-6f212435.vercel.app
const PROJECT_ORIGIN_RE =
  /^https:\/\/weuseai-agent(?:-[a-z0-9]+(?:-[a-z0-9-]+)?)?\.vercel\.app$/i

function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (PROJECT_ORIGIN_RE.test(origin)) return origin
  // Fallback to the canonical production origin. Browsers will reject
  // the response if their actual origin doesn't match, which is the
  // safe behavior — better to fail closed than silently allow.
  return 'https://weuseai-agent.vercel.app'
}

function browserCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': pickAllowedOrigin(req),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': MAX_AGE,
  }
}

// Static dictionary kept for back-compat with callers that import it
// directly. New entry-point code should call browserCorsHeaders(req)
// (via handleCors / withCors) so the origin echo is dynamic.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://weuseai-agent.vercel.app',
  'Vary': 'Origin',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': ALLOWED_HEADERS,
  'Access-Control-Max-Age': MAX_AGE,
}

export const webhookCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': ALLOWED_HEADERS,
  'Access-Control-Max-Age': MAX_AGE,
}

export function handleCors(
  req: Request,
  headers?: Record<string, string>,
): Response | null {
  if (req.method !== 'OPTIONS') return null
  // If caller passed explicit headers (e.g. webhook wildcards), use them.
  // Otherwise compute browser-CORS headers based on this request's origin.
  const out = headers ?? browserCorsHeaders(req)
  return new Response('ok', { status: 200, headers: out })
}

// Wraps any Response so it carries CORS headers. Lets the pure handler
// stay CORS-agnostic — tests call it without browser-context concerns.
//
// Argument tolerance: the canonical call form is `withCors(res, req)`,
// but historical callers (the workflow library entrypoints landed via
// PR #2/#3) were written as `withCors(req, res)`. We auto-detect a
// swapped first arg and recover; the alternative was rewriting 25
// call-sites across 5 entrypoint files.
export function withCors(
  resOrReq: Response | Request,
  headersOrReqOrRes?: Record<string, string> | Request | Response,
): Response {
  let res: Response
  let headersOrReq: Record<string, string> | Request | undefined
  if (resOrReq instanceof Request) {
    // Caller passed (req, res) — swap them so the rest of the function
    // can assume the canonical (res, req|headers) shape.
    res = headersOrReqOrRes as Response
    headersOrReq = resOrReq
  } else {
    res = resOrReq
    headersOrReq = headersOrReqOrRes as
      | Record<string, string>
      | Request
      | undefined
  }

  let headers: Record<string, string>
  if (headersOrReq instanceof Request) {
    headers = browserCorsHeaders(headersOrReq)
  } else if (headersOrReq) {
    headers = headersOrReq
  } else {
    // No context — fall back to the canonical static dict (production-only
    // origin). Avoid this path for browser-callable functions; pass the
    // Request instead.
    headers = corsHeaders
  }
  const merged = new Headers(res.headers)
  for (const [k, v] of Object.entries(headers)) merged.set(k, v)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: merged,
  })
}
