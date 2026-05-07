// Small-LLM client for parameter extraction + structured generation.
//
// Spec Q6 lock 2026-05-07: anthropic/claude-3.5-haiku via OpenRouter.
// Model is pinned. Future upgrade path: claude-haiku-4.5 once stable.
//
// Cost stays on the customer (BYOK) — the handler caller passes the
// customer's OpenRouter key (from customer_openrouter_keys, Phase 2A)
// rather than a service-side key. We never bundle keys.
//
// JSON mode: OpenRouter forwards the OpenAI-compatible response_format
// field; claude-3.5-haiku honors `{ type: "json_object" }`. We additionally
// validate that the response parses to JSON and matches a caller-supplied
// JSON Schema (via parameter-validator).

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const PARAM_EXTRACTION_MODEL = 'anthropic/claude-3.5-haiku'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LlmJsonOk<T> = { ok: true; result: T; raw: string }
export type LlmJsonErr = {
  ok: false
  reason:
    | 'no_api_key'
    | 'http_error'
    | 'bad_response'
    | 'json_parse_failed'
  detail?: string
  status?: number
  raw?: string
}
export type LlmJsonResponse<T> = LlmJsonOk<T> | LlmJsonErr

/**
 * Call the LLM with JSON-mode response and return the parsed object.
 *
 * apiKey = customer's OpenRouter key. Caller is responsible for fetching
 * it from customer_openrouter_keys before invoking.
 *
 * The function does NOT validate the parsed object against a schema —
 * call parameter-validator after this returns ok if you need that.
 *
 * On any failure (network, HTTP non-2xx, malformed JSON), returns ok=false
 * with a typed reason. Never throws.
 */
export async function llmJsonCompletion<T = unknown>(opts: {
  apiKey: string
  model?: string
  messages: ChatMessage[]
  /** OpenAI-compatible temperature; default 0 for deterministic extraction. */
  temperature?: number
  /** Max output tokens; default 1024. */
  maxTokens?: number
}): Promise<LlmJsonResponse<T>> {
  if (!opts.apiKey) {
    return { ok: false, reason: 'no_api_key' }
  }

  let response: Response
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        // OpenRouter recommends including HTTP-Referer + X-Title for
        // attribution. We're a server-to-server caller; these are optional
        // but useful in OpenRouter's dashboards.
        'HTTP-Referer': 'https://weuseai-agent.vercel.app',
        'X-Title': 'weuseai.agent workflow registry',
      },
      body: JSON.stringify({
        model: opts.model ?? PARAM_EXTRACTION_MODEL,
        messages: opts.messages,
        response_format: { type: 'json_object' },
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    })
  } catch (e) {
    return {
      ok: false,
      reason: 'http_error',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  if (!response.ok) {
    const body = await safeText(response)
    return {
      ok: false,
      reason: 'http_error',
      status: response.status,
      detail: body.slice(0, 500),
    }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (e) {
    return {
      ok: false,
      reason: 'bad_response',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  // Shape: { choices: [{ message: { content: "..." } }] }
  const choices = (json as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, reason: 'bad_response', detail: 'no choices array' }
  }
  const message = (choices[0] as { message?: unknown }).message
  if (!message || typeof message !== 'object') {
    return { ok: false, reason: 'bad_response', detail: 'no message in first choice' }
  }
  const content = (message as { content?: unknown }).content
  if (typeof content !== 'string') {
    return { ok: false, reason: 'bad_response', detail: 'no content in message' }
  }

  let parsed: T
  try {
    parsed = JSON.parse(content) as T
  } catch (e) {
    return {
      ok: false,
      reason: 'json_parse_failed',
      detail: e instanceof Error ? e.message : String(e),
      raw: content,
    }
  }

  return { ok: true, result: parsed, raw: content }
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text()
  } catch {
    return '<read failed>'
  }
}
