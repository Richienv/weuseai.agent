// The Opus force-pin guardrail (dashboard Phase 3) — the single highest cost
// risk in the build. The Hermes API server accepts a request-body `model` that
// OVERRIDES config.yaml model.default; if a client's model (e.g. claude-opus)
// reached the VPS it would bill the customer's OpenRouter key at ~5x. So the
// upstream body is BUILT FRESH with explicit field assignment — never spread,
// never delete — and `model` is ALWAYS the pinned DeepSeek model. The client's
// `model` (and every cost-bearing alias: provider/route/transforms/models/…)
// is simply never read.
//
// Pure + dependency-light so the full test matrix runs in CI without a VPS.

// Imported, NOT re-typed — a drift-gate test asserts PINNED_MODEL === the
// provisioned model.default so the chat path can never diverge.
import { OPENROUTER_DEFAULT_MODEL } from '../setup-script.js'

export const PINNED_MODEL = OPENROUTER_DEFAULT_MODEL

export const MAX_TOKENS_CAP = 2048
const DEFAULT_TEMPERATURE = 0.7

// The EXACT key set the upstream body may contain. A future passthrough
// regression (a spread sneaking a key in) fails the defense-in-depth assert.
export const UPSTREAM_BODY_KEYS = ['model', 'messages', 'stream', 'max_tokens', 'temperature'] as const

export type UpstreamMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type UpstreamBody = {
  model: string
  messages: UpstreamMessage[]
  stream: boolean
  max_tokens: number
  temperature: number
}

const ROLES = new Set(['system', 'user', 'assistant'])

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : dflt
  return Math.max(lo, Math.min(hi, n))
}
function clampFloat(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt
  return Math.max(lo, Math.min(hi, n))
}

/** Keep ONLY role+content; drop any nested model/tool/function fields a client
 *  tries to smuggle inside a message object. */
export function sanitizeMessages(raw: unknown): UpstreamMessage[] {
  if (!Array.isArray(raw)) return []
  const out: UpstreamMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const mm = m as Record<string, unknown>
    if (typeof mm.role !== 'string' || !ROLES.has(mm.role)) continue
    if (typeof mm.content !== 'string') continue
    out.push({ role: mm.role as UpstreamMessage['role'], content: mm.content })
  }
  return out
}

/**
 * Build the VPS-bound body from arbitrary client input. `model` is ALWAYS
 * PINNED_MODEL; the client's model is never read. Explicit assignment only.
 */
export function buildUpstreamBody(client: Record<string, unknown>): UpstreamBody {
  const ceiling = clampInt(client.max_tokens_ceiling, 1, MAX_TOKENS_CAP, MAX_TOKENS_CAP)
  return {
    model: PINNED_MODEL, // never client.model
    messages: sanitizeMessages(client.messages),
    stream: client.stream !== false,
    max_tokens: clampInt(client.max_tokens, 1, ceiling, ceiling),
    temperature: clampFloat(client.temperature, 0, 2, DEFAULT_TEMPERATURE),
  }
}

/**
 * Defense-in-depth guard run BEFORE the body leaves the relay. Returns null if
 * safe, or an error code if a regression slipped a non-pinned model or an
 * unexpected key in — caller fails closed (500). Never trust buildUpstreamBody
 * alone; this catches a future edit that reintroduces a spread.
 */
export function assertPinned(body: Record<string, unknown>): null | string {
  if (body.model !== PINNED_MODEL) return 'model_not_pinned'
  for (const k of Object.keys(body)) {
    if (!(UPSTREAM_BODY_KEYS as readonly string[]).includes(k)) return 'unexpected_key'
  }
  return null
}

/**
 * Response-side verification: the model id reported by the upstream (first SSE
 * chunk, or the buffered response) MUST be a deepseek model. A non-deepseek id
 * means the pin was bypassed somewhere — abort + 502 pin_violation.
 */
export function upstreamModelOk(model: unknown): boolean {
  return typeof model === 'string' && model.toLowerCase().startsWith('deepseek/')
}

/**
 * Detect an upstream OpenRouter/Hermes error object in a parsed frame/response.
 * Such frames leak provider/config/model slugs — the caller must replace them
 * with an opaque error, never pass them through.
 */
export function isUpstreamErrorFrame(parsed: unknown): boolean {
  return !!parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
}
