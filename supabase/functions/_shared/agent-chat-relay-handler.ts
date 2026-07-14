// agent-chat-relay handler — the browser-facing edge relay (dashboard Phase 2).
//
// Pure + DI-based so it runs under tsx in tests AND Deno in production. It does
// NOT import cors.ts / the Supabase client / decryptCredential directly — the
// entry (index.ts) wires those in. Returns a Response (the stream path needs it).
//
// Control flow (fail cheapest + most opaque first; resolve crown-jewel LAST) —
// see docs/plans/2026-06-16-dashboard-build-prompt.md §3.2:
//   flag → method → parse/validate → X-CID → (meta?) → rate/budget →
//   active-sub → resolve(ip+key, late+narrow) → forward → return → meter.

import { constantTimeEqual } from './constant-time-equal.ts'
import type { AgentChatRateLimiter } from './agent-chat-rate-limiter.ts'

// ── tunables (conservative; mirror the RPC defaults) ───────────────────────
export const MAX_TOKENS_CEILING = 2048   // clamp + pre-charge worst case
const MAX_MESSAGES = 40
const MAX_CONTENT_CHARS = 8000
const MAX_TOTAL_BYTES = 24_576
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLES = new Set(['system', 'user', 'assistant'])

export type ChatMessage = { role: string; content: string }

export type FlyPayload = {
  customer_id: string
  ip_address: string
  api_server_key: string
  messages: ChatMessage[]
  stream: boolean
  max_tokens_ceiling: number
}

/** Active state of a customer's agent, for the not_ready/not_active split. */
export type CustomerState = 'running' | 'provisioning' | 'inactive'

export type AgentChatRelayDeps = {
  flag: { enabled: boolean; allowAll: boolean; allowlist: Set<string> }
  rateLimiter: AgentChatRateLimiter
  /** sub active + running VPS → 'running'; VPS still provisioning → 'provisioning'; else 'inactive'. */
  resolveCustomerState: (cid: string) => Promise<CustomerState>
  /** NEW narrow query: running VPS with api_server_key_cipher NOT NULL. null = 0 rows OR ambiguous (fail closed). */
  resolveTarget: (cid: string) => Promise<{ ip: string; cipher: unknown } | null>
  /** decryptCredential(cipher, CHAT_KEY_ENCRYPTION_KEY). Throws → caller maps to opaque 502. */
  decryptKey: (cipher: unknown) => Promise<string>
  /** edge → Fly hop. */
  callFlyRelay: (payload: FlyPayload, opts: { stream: boolean; signal: AbortSignal | null }) => Promise<Response>
  /** meta call → status only (no spend). */
  meta: (cid: string) => Promise<{ chat_enabled: boolean; persona_slug: string; remaining_pct: number }>
  /** test seam — drain a tee'd SSE branch + commit the token delta. Defaults to the real impl. */
  meterStream?: (branch: ReadableStream<Uint8Array>, cid: string, rl: AgentChatRateLimiter, signal: AbortSignal | null) => void
}

// ── responses (NO `detail` field EVER reaches the browser) ─────────────────
function err(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, error: code, ...(extra || {}) }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function mapUpstreamStatus(s: number): { code: string; status: number } {
  if (s === 429) return { code: 'rate_limited', status: 429 }
  if (s === 402) return { code: 'budget_exceeded', status: 402 }
  if (s === 503) return { code: 'agent_unavailable', status: 503 }
  return { code: 'upstream_unavailable', status: 502 }
}

/** Default stream-meter: count delta content chars on the tee'd branch, commit (≈chars/4 − pre-charge). */
function defaultMeterStream(
  branch: ReadableStream<Uint8Array>,
  cid: string,
  rl: AgentChatRateLimiter,
  signal: AbortSignal | null,
): void {
  ;(async () => {
    const reader = branch.getReader()
    const dec = new TextDecoder()
    let chars = 0, buf = ''
    try {
      for (;;) {
        if (signal && signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]' || !payload) continue
          try {
            const j = JSON.parse(payload)
            const d = j?.choices?.[0]?.delta?.content
            if (typeof d === 'string') chars += d.length
          } catch { /* partial/non-JSON frame — ignore */ }
        }
      }
    } catch { /* drop — metering is best-effort */ }
    finally {
      try { reader.releaseLock() } catch { /* noop */ }
      const actual = Math.ceil(chars / 4)
      // delta = actual − pre-charged ceiling (normally negative = refund)
      void rl.commit(cid, actual - MAX_TOKENS_CEILING)
    }
  })()
}

export async function agentChatRelayHandler(req: Request, deps: AgentChatRelayDeps): Promise<Response> {
  // 2. FLAG (global) — dark = 404, indistinguishable from no route.
  if (!deps.flag.enabled) return err('feature_disabled', 404)

  // 3. METHOD — POST only (the meta call is ALSO a POST).
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // 4. PARSE + VALIDATE
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return err('invalid_json', 400) }

  const cid = typeof body.customer_id === 'string' ? body.customer_id : ''
  if (!UUID_RE.test(cid)) return err('invalid_field', 400)

  // 2b. ALLOWLIST (dark rollout) — still 404 (indistinguishable).
  if (!deps.flag.allowAll && !deps.flag.allowlist.has(cid)) return err('feature_disabled', 404)

  // 5. X-CID gate (constant-time, no UUID-probing oracle).
  const xcid = req.headers.get('x-cid') ?? ''
  if (!xcid || !constantTimeEqual(xcid, cid)) return err('x_cid_mismatch', 403)

  // meta call: status only — flag + x-cid gated, but NO spend, NO rate charge.
  if (body.meta === true) {
    try { return jsonOk(await deps.meta(cid)) } catch { return err('upstream_unavailable', 502) }
  }

  // validate messages
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return err('invalid_field', 400)
  for (const m of messages) {
    if (!m || typeof m !== 'object') return err('invalid_field', 400)
    const mm = m as Record<string, unknown>
    if (typeof mm.role !== 'string' || !ROLES.has(mm.role)) return err('invalid_field', 400)
    if (typeof mm.content !== 'string' || mm.content.length === 0 || mm.content.length > MAX_CONTENT_CHARS) return err('invalid_field', 400)
  }
  const cleanMessages: ChatMessage[] = (messages as Record<string, unknown>[]).map((m) => ({ role: m.role as string, content: m.content as string }))
  let totalBytes = 0
  try { totalBytes = new TextEncoder().encode(JSON.stringify(cleanMessages)).length } catch { return err('invalid_field', 400) }
  if (totalBytes > MAX_TOTAL_BYTES) return err('invalid_field', 400)
  const stream = body.stream !== false // default streamed

  // 6. RATE / BUDGET — BEFORE the active-sub DB read (cheap-DoS shield first).
  //    Pre-charge the clamped ceiling; refund the delta on commit.
  const verdict = await deps.rateLimiter.check(cid, MAX_TOKENS_CEILING)
  if (!verdict.allowed) {
    if (verdict.reason === 'budget_exceeded') return err('budget_exceeded', 402)
    // rate_limited OR fail-closed 'error'
    return err('rate_limited', 429, { retry_after_seconds: verdict.retryAfter || 30 })
  }

  // From here a rejection must REFUND the pre-charge (we charged the ceiling above).
  const refund = () => { void deps.rateLimiter.commit(cid, -MAX_TOKENS_CEILING) }

  // 7. ACTIVE-SUB (running vs provisioning vs inactive).
  let state: CustomerState
  try { state = await deps.resolveCustomerState(cid) } catch { refund(); return err('upstream_unavailable', 502) }
  if (state === 'provisioning') { refund(); return err('not_ready', 503) }
  if (state !== 'running') { refund(); return err('not_active', 403) }

  // 8. RESOLVE (LATE, NARROW) — ip + key cipher; decrypt. IP/key live in locals only.
  let target: { ip: string; cipher: unknown } | null
  try { target = await deps.resolveTarget(cid) } catch { refund(); return err('upstream_unavailable', 502) }
  if (!target) { refund(); return err('agent_unavailable', 503) }
  let apiKey: string
  try { apiKey = await deps.decryptKey(target.cipher) } catch { refund(); return err('upstream_unavailable', 502) }

  // 9. FORWARD — built field-by-field; `model` OMITTED (Fly force-pins it).
  const payload: FlyPayload = {
    customer_id: cid,
    ip_address: target.ip,
    api_server_key: apiKey,
    messages: cleanMessages,
    stream,
    max_tokens_ceiling: MAX_TOKENS_CEILING,
  }
  let flyRes: Response
  try {
    flyRes = await deps.callFlyRelay(payload, { stream, signal: req.signal ?? null })
  } catch { refund(); return err('upstream_unavailable', 502) }

  if (!flyRes.ok || !flyRes.body) { refund(); const m = mapUpstreamStatus(flyRes.status); return err(m.code, m.status) }

  // 10/11. RETURN + METER
  if (!stream) {
    let data: Record<string, unknown>
    try { data = (await flyRes.json()) as Record<string, unknown> } catch { refund(); return err('upstream_unavailable', 502) }
    if ('model' in data) delete (data as Record<string, unknown>).model // redact
    const usage = (data.usage as { total_tokens?: number } | undefined)
    const actual = typeof usage?.total_tokens === 'number' ? usage.total_tokens : Math.floor(MAX_TOKENS_CEILING / 2)
    void deps.rateLimiter.commit(cid, actual - MAX_TOKENS_CEILING)
    return jsonOk(data)
  }

  // streamed: tee → one to client, one to the meter (NEVER await .text() here).
  const [toClient, toMeter] = flyRes.body.tee()
  ;(deps.meterStream ?? defaultMeterStream)(toMeter, cid, deps.rateLimiter, req.signal ?? null)
  return new Response(toClient, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
