// OpenAI embedding helper for workflow registry (Phase 2E-1).
//
// Spec Q1 lock 2026-05-07: OpenAI text-embedding-3-small (1536 dim).
// Phase 3 may swap to a self-hosted provider for data residency reasons;
// at that point all existing intent_embeddings need re-computing AND
// the vector(1536) column may need to change dim.
//
// We pay this cost ourselves (~$0.02/1M tokens; <$1/month at pilot scale)
// rather than charging customers, because it's pre-deployment seeding +
// per-customer-message at runtime — the cost per call is too small to
// route through customer BYOK accounting.
//
// Pure module: imports only from URL-fetch via globalThis.fetch (works
// in both Deno + Node). The OpenAI key comes from Supabase secrets at
// runtime, NOT bundled.

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const EMBED_MODEL = 'text-embedding-3-small'
const EXPECTED_DIM = 1536

export type EmbedResult = {
  embedding: number[]
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

export type EmbedError = {
  ok: false
  reason: 'no_api_key' | 'http_error' | 'bad_response' | 'wrong_dim' | 'empty_input'
  detail?: string
  status?: number
}

export type EmbedOk = { ok: true; result: EmbedResult }

export type EmbedResponse = EmbedOk | EmbedError

/**
 * Embed a single text string with OpenAI text-embedding-3-small.
 *
 * apiKey comes from Supabase secrets (env var OPENAI_EMBED_API_KEY) in
 * production; tests inject a fixed string. Callers should NEVER hardcode
 * a key.
 *
 * Returns a tagged result: ok=true with the 1536-dim vector, or ok=false
 * with a typed reason. We never throw — the caller should always be able
 * to discriminate via the `ok` field.
 */
export async function embedText(
  text: string,
  apiKey: string,
): Promise<EmbedResponse> {
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' }
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty_input' }
  }

  let response: Response
  try {
    response = await fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: trimmed,
        encoding_format: 'float',
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
    const body = await safeReadText(response)
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

  // Shape: { data: [{ embedding: number[], ... }], model: string, usage: {...} }
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, reason: 'bad_response', detail: 'no data array' }
  }
  const first = data[0] as { embedding?: unknown }
  const embedding = first.embedding
  if (!Array.isArray(embedding)) {
    return { ok: false, reason: 'bad_response', detail: 'no embedding array' }
  }

  if (embedding.length !== EXPECTED_DIM) {
    return {
      ok: false,
      reason: 'wrong_dim',
      detail: `expected ${EXPECTED_DIM}, got ${embedding.length}`,
    }
  }

  // Validate every element is a finite number — defensive against API drift.
  for (let i = 0; i < embedding.length; i++) {
    const v = embedding[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return {
        ok: false,
        reason: 'bad_response',
        detail: `non-finite at index ${i}`,
      }
    }
  }

  const model = (json as { model?: unknown }).model
  const usage = (json as { usage?: unknown }).usage as
    | { prompt_tokens?: number; total_tokens?: number }
    | undefined

  return {
    ok: true,
    result: {
      embedding: embedding as number[],
      model: typeof model === 'string' ? model : EMBED_MODEL,
      usage: {
        prompt_tokens: usage?.prompt_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
      },
    },
  }
}

async function safeReadText(r: Response): Promise<string> {
  try {
    return await r.text()
  } catch {
    return '<read failed>'
  }
}

// ─── Cosine similarity (used in tests + sanity checks) ──────────────────
//
// Postgres pgvector handles the production search via the <=> operator.
// This helper is for local mocks + tests where we don't have pgvector.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`length mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
