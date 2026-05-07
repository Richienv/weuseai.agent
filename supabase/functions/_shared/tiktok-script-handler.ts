// tiktok-script-builder handler — Phase 2E-1.5 (Hermes-native).
//
// Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md
//
// ARCHITECTURE PIVOT (2026-05-08): this handler no longer calls an LLM.
// Hermes' agent on the customer's VPS generates the script JSON using
// the customer's BYOK key (matches the "Hermes does the LLM heavy lifting"
// principle). This handler now PURELY VALIDATES the LLM-generated script
// against a strict schema and returns either the canonicalized script or
// a typed error pointing the agent at what to fix.
//
// Why server-side validation when the LLM could self-validate locally:
//   1. Single source of truth for the schema (here, in TS) — Hermes
//      skill instructions reference this Edge Function; we can evolve the
//      schema without redeploying every customer's VPS.
//   2. Defensive — Hermes' LLM may drift; the handler enforces the
//      contract regardless of model version.
//   3. Telemetry — workflow_runs records validation failures for tuning.

import { validateAgainstSchema } from './parameter-validator.ts'

// ─── input + output shapes ──────────────────────────────────────────────

export const TIKTOK_LENGTHS = [15, 30, 60, 90] as const
export type TiktokLength = typeof TIKTOK_LENGTHS[number]

export const TIKTOK_AUDIENCES = ['gen-z', 'millennial', 'general'] as const
export type TiktokAudience = typeof TIKTOK_AUDIENCES[number]

export const TIKTOK_PLATFORMS = ['tiktok', 'reels', 'shorts'] as const
export type TiktokPlatform = typeof TIKTOK_PLATFORMS[number]

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

/**
 * Input from the workflow-execute Edge Function. The Hermes agent's
 * skill SHOULD send the LLM-generated script via the `script` field;
 * the handler validates + canonicalizes. Optional `topic`, `length`,
 * `audience`, `platform` are accepted for context (logged in
 * workflow_runs but otherwise unused).
 */
export type TiktokValidateInput = {
  script: unknown
  topic?: string
  length?: TiktokLength
  audience?: TiktokAudience
  platform?: TiktokPlatform
}

export type TiktokValidateOk = { ok: true; script: TiktokScript }
export type TiktokValidateErr = {
  ok: false
  reason: 'missing_script' | 'schema_validation_failed'
  detail?: string
  errors?: string[]
}
export type TiktokValidateResult = TiktokValidateOk | TiktokValidateErr

// ─── response schema (validated against agent's output) ────────────────

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

// ─── handler ────────────────────────────────────────────────────────────

export function validateTiktokScript(input: TiktokValidateInput): TiktokValidateResult {
  if (input.script === undefined || input.script === null) {
    return { ok: false, reason: 'missing_script', detail: 'script field required in parameters' }
  }

  const validation = validateAgainstSchema(input.script, TIKTOK_RESPONSE_SCHEMA)
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'schema_validation_failed',
      detail: validation.errors.join('; '),
      errors: validation.errors,
    }
  }

  return { ok: true, script: validation.value as TiktokScript }
}
