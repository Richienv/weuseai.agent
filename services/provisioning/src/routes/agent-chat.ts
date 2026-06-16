// Fly tunnel relay — POST /agent-chat (dashboard Phase 3). Hop 2→3 of the chat
// transport: the edge relay calls this with {ip_address, api_server_key,
// messages, …}; this force-pins the model, opens an SSH local-forward to the
// VPS loopback :8642, and (Phase 3) returns a BUFFERED completion. Streaming +
// the tunnel pool are Phase 5.
//
// SECURITY: opaque errors only (NO `detail` — the IP is in scope here, where
// the leak would originate). Never log req.body (it holds the plaintext
// api_server_key + IP). The pure handler below is DI-tested against a mock
// API server; the real SSH call is exercised live in Phase 6.

import {
  buildUpstreamBody,
  assertPinned,
  upstreamModelOk,
  isUpstreamErrorFrame,
  type UpstreamBody,
} from './agent-chat-model-guard.js'

export type ApiServerTarget = { ip: string; key: string }

export type ApiServerResult = {
  ok: boolean
  status: number
  /** parsed completion JSON on success */
  json?: Record<string, unknown>
}

export type AgentChatDeps = {
  /** AGENT_CHAT_ENABLED — dark by default. */
  enabled: boolean
  /** opens the tunnel + POSTs the pinned body to 127.0.0.1:<port>/v1/chat/completions. */
  callApiServer: (
    target: ApiServerTarget,
    body: UpstreamBody,
    signal: AbortSignal | null,
  ) => Promise<ApiServerResult>
}

export type AgentChatResponse = { status: number; body: Record<string, unknown> }

function deny(status: number, error: string): AgentChatResponse {
  return { status, body: { ok: false, error } }
}

function mapUpstream(status: number): AgentChatResponse {
  if (status === 429) return deny(429, 'rate_limited')
  if (status === 402) return deny(402, 'budget_exceeded')
  if (status === 503) return deny(503, 'agent_unavailable')
  return deny(502, 'upstream_unavailable')
}

/**
 * Pure, buffered handler. Returns {status, body}; the Express wrapper adapts to
 * res.json(). Phase 5 adds a res-based streaming sibling.
 */
export async function handleAgentChat(
  input: Record<string, unknown>,
  deps: AgentChatDeps,
  signal: AbortSignal | null = null,
): Promise<AgentChatResponse> {
  if (!deps.enabled) return deny(404, 'feature_disabled')

  // Defense-in-depth re-validation (the edge already validated; this hop must
  // never trust that blindly — it's the one that reaches the customer's box).
  const ip = input.ip_address
  const key = input.api_server_key
  if (typeof ip !== 'string' || !ip || typeof key !== 'string' || !key) return deny(400, 'invalid_field')
  if (!Array.isArray(input.messages) || input.messages.length === 0) return deny(400, 'invalid_field')

  // FORCE-PIN. Phase 3 is buffered → force stream:false to the VPS.
  const body = buildUpstreamBody({ ...input, stream: false })
  if (body.messages.length === 0) return deny(400, 'invalid_field')

  // Belt-and-suspenders: never let a non-pinned / extra-keyed body leave.
  const guardErr = assertPinned(body as unknown as Record<string, unknown>)
  if (guardErr) return deny(500, 'pin_guard') // fail closed on a regression

  let r: ApiServerResult
  try {
    r = await deps.callApiServer({ ip, key }, body, signal)
  } catch {
    return deny(502, 'upstream_unavailable')
  }
  if (!r.ok || !r.json) return mapUpstream(r.status)

  // Per-frame error interception: an upstream error object leaks provider/model
  // slugs — replace with an opaque code, never pass it through.
  if (isUpstreamErrorFrame(r.json)) return deny(502, 'upstream_unavailable')

  // Response-side pin verification — the upstream MUST report a deepseek model.
  // A non-deepseek id means the pin was bypassed somewhere → fail closed.
  if (!upstreamModelOk(r.json.model)) return deny(502, 'pin_violation')

  return { status: 200, body: r.json }
}
