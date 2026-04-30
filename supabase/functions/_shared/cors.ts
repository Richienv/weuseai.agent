// CORS helpers for Edge Functions.
//
// `corsHeaders` — for browser-callable functions (create-invoice). Locked to
// the production checkout origin so a malicious site can't call our function
// from a different host.
//
// `webhookCorsHeaders` — for server-to-server callbacks (xendit-webhook).
// Origin is '*' because Xendit fires from a rotating IP/host pool.

const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-callback-token'
const ALLOWED_METHODS = 'POST, OPTIONS'
const MAX_AGE = '86400'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://weuseai-agent.vercel.app',
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
  headers: Record<string, string> = corsHeaders,
): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers })
  }
  return null
}

// Wraps any Response so it carries CORS headers. Lets the pure handler
// stay CORS-agnostic — tests call it without browser-context concerns.
export function withCors(
  res: Response,
  headers: Record<string, string> = corsHeaders,
): Response {
  const merged = new Headers(res.headers)
  for (const [k, v] of Object.entries(headers)) merged.set(k, v)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: merged,
  })
}
