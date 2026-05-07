// tiktok-script-builder handler — Phase 2E-1 pilot 3.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "Pilot 3: tiktok-script-builder (Video Producer) — structured generation"
//
// Calls a small LLM (claude-3.5-haiku via OpenRouter) with a strict
// response schema. Validates output against schema; reject malformed
// LLM responses up to caller (returns ok=false). Output is structured
// JSON the agent can render however the customer prefers.

import { llmJsonCompletion, type ChatMessage } from './llm-client.ts'
import { validateAgainstSchema } from './parameter-validator.ts'

// ─── input + output shapes ──────────────────────────────────────────────

export const TIKTOK_LENGTHS = [15, 30, 60, 90] as const
export type TiktokLength = typeof TIKTOK_LENGTHS[number]

export const TIKTOK_AUDIENCES = ['gen-z', 'millennial', 'general'] as const
export type TiktokAudience = typeof TIKTOK_AUDIENCES[number]

export const TIKTOK_PLATFORMS = ['tiktok', 'reels', 'shorts'] as const
export type TiktokPlatform = typeof TIKTOK_PLATFORMS[number]

export type TiktokScriptInput = {
  topic: string
  length?: TiktokLength
  audience?: TiktokAudience
  platform?: TiktokPlatform
}

export type VisualScene = {
  timestamp: string  // mm:ss
  description: string
}

export type TiktokScript = {
  hook: string
  body: string
  cta: string
  visual_scenes: VisualScene[]
  sound_suggestion: string
  hashtags: string[]
}

export type TiktokScriptOk = { ok: true; script: TiktokScript }
export type TiktokScriptErr = {
  ok: false
  reason:
    | 'no_api_key'
    | 'http_error'
    | 'json_parse_failed'
    | 'schema_validation_failed'
    | 'bad_response'
  detail?: string
}
export type TiktokScriptResult = TiktokScriptOk | TiktokScriptErr

// ─── response schema (validated against LLM output) ────────────────────

export const TIKTOK_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['hook', 'body', 'cta', 'visual_scenes', 'sound_suggestion', 'hashtags'],
  properties: {
    hook: { type: 'string', minLength: 1, maxLength: 200 },
    body: { type: 'string', minLength: 1, maxLength: 1500 },
    cta: { type: 'string', minLength: 1, maxLength: 200 },
    visual_scenes: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        required: ['timestamp', 'description'],
        properties: {
          timestamp: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$' },
          description: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
    sound_suggestion: { type: 'string', minLength: 1, maxLength: 200 },
    hashtags: {
      type: 'array',
      minItems: 3,
      maxItems: 10,
      items: { type: 'string', pattern: '^#[a-zA-Z0-9_]+$' },
    },
  },
} as const

// ─── prompt builder ────────────────────────────────────────────────────

export function buildTiktokScriptPrompt(input: {
  topic: string
  length: TiktokLength
  audience: TiktokAudience
  platform: TiktokPlatform
}): { system: string; user: string } {
  const system =
    `Kamu adalah penulis script untuk ${input.platform === 'tiktok' ? 'TikTok' : input.platform === 'reels' ? 'Instagram Reels' : 'YouTube Shorts'}.\n\n` +
    `Format video: ${input.length} detik, target audience ${input.audience}.\n\n` +
    `Struktur script wajib:\n` +
    `  - hook: 3 detik pertama (paling penting). Maksimal ~30 karakter agar bisa di-read aloud dalam ${input.length === 15 ? '~1.5' : '~3'} detik.\n` +
    `  - body: konten utama. Tone Bahasa Indonesia kasual.\n` +
    `  - cta: 3-5 detik terakhir. Action concrete (follow, comment, share, link in bio).\n` +
    `  - visual_scenes: array dengan timestamp (format mm:ss) dan deskripsi visual per beat.\n` +
    `  - sound_suggestion: nama trending sound atau genre yang fit.\n` +
    `  - hashtags: 3-10 hashtag relevan, format ^#[a-zA-Z0-9_]+$ (no spaces, no special chars).\n\n` +
    `Output: JSON object SAJA. Tidak ada prosa, tidak ada markdown, tidak ada code fences. Mulai dengan { dan akhir dengan }.`

  const user = `Topic: ${input.topic}\n\nGenerate script JSON:`

  return { system, user }
}

// ─── handler ────────────────────────────────────────────────────────────

const DEFAULT_LENGTH: TiktokLength = 30
const DEFAULT_AUDIENCE: TiktokAudience = 'general'
const DEFAULT_PLATFORM: TiktokPlatform = 'tiktok'
const TIKTOK_MAX_OUTPUT_TOKENS = 800  // larger than param-extract; visual_scenes is verbose

export async function generateTiktokScript(opts: {
  apiKey: string
  input: TiktokScriptInput
  /** Override for tests — defaults to llmJsonCompletion. */
  llmCallFn?: typeof llmJsonCompletion
}): Promise<TiktokScriptResult> {
  if (!opts.apiKey) {
    return { ok: false, reason: 'no_api_key' }
  }

  const length = opts.input.length ?? DEFAULT_LENGTH
  const audience = opts.input.audience ?? DEFAULT_AUDIENCE
  const platform = opts.input.platform ?? DEFAULT_PLATFORM

  const { system, user } = buildTiktokScriptPrompt({
    topic: opts.input.topic,
    length,
    audience,
    platform,
  })

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  const llmCall = opts.llmCallFn ?? llmJsonCompletion
  const response = await llmCall<unknown>({
    apiKey: opts.apiKey,
    messages,
    temperature: 0.7,  // creative output, not deterministic extraction
    maxTokens: TIKTOK_MAX_OUTPUT_TOKENS,
  })

  if (!response.ok) {
    if (response.reason === 'json_parse_failed') {
      return { ok: false, reason: 'json_parse_failed', detail: response.detail }
    }
    if (response.reason === 'http_error') {
      return { ok: false, reason: 'http_error', detail: response.detail }
    }
    return { ok: false, reason: 'bad_response', detail: response.detail }
  }

  // Validate against the response schema. Strict — every required field
  // must be present and valid; type/range/pattern enforced.
  const validation = validateAgainstSchema(response.result, TIKTOK_RESPONSE_SCHEMA)
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'schema_validation_failed',
      detail: validation.errors.join('; '),
    }
  }

  return { ok: true, script: validation.value as TiktokScript }
}
