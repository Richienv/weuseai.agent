// Manifest validator for per-agent bundles (Phase 2E-1.5).
//
// Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md
//
// Validates agent-packs/<slug>/manifest.json against the locked schema.
// Used at:
//   1. Test time — drift check that every shipped manifest passes validation
//   2. Provisioning — setup-script.ts validates before copying to VPS
//   3. Future: customer-grown manifest updates (when extend-capabilities
//      writes new entries, validate before persisting)
//
// Pure module — no Deno-only / Node-only imports. Reuses the
// parameter-validator subset from _shared/parameter-validator.ts.

import {
  validateAgainstSchema,
  type ValidateResult,
} from './parameter-validator.ts'

// ─── manifest types ────────────────────────────────────────────────────

export type SkillTier = 'starter' | 'pro' | 'studio'

/**
 * Discriminates a single-shot skill from a multi-step playbook.
 * Absent ⇒ 'skill' (a single-shot capability — the legacy default).
 * 'playbook' ⇒ the skill's SKILL.md carries a `## Langkah-langkah`
 * section of ordered, gated steps and is driven by the flow-state
 * state-machine engine (Phase 1 Week 2, 2026-05-18 consult).
 */
export type SkillKind = 'skill' | 'playbook'

export type ManifestSkill = {
  id: string
  description_id: string
  description_en?: string
  /** Defaults to 'skill' when absent. */
  skill_kind?: SkillKind
  /**
   * P1 strict template-fetch flow (2026-05-22 consult). When true, the
   * skill's SKILL.md must instruct the agent to consult its persona's
   * template library before improvising — the body must carry a
   * `## Fetch template` section. The template-fetch-required drift gate
   * (`tests/template-fetch-required-drift.spec.ts`) enforces the
   * SKILL.md body shape. Defaults to false when absent (legacy skills
   * not yet migrated; opt-in per skill as templates land).
   */
  template_fetch_required?: boolean
  templates_used?: string[]
  execution: 'edge-function' | 'hermes-skill' | 'composite' | 'external-api'
  handler_ref: string
  /**
   * @deprecated 2026-05-08 (Phase 2E-2). Use `enabled_for_tiers` instead.
   * Translation: starter → ['starter','pro','studio']; pro → ['pro','studio'];
   * studio → ['studio']. Validator emits console.warn when only `tier` is
   * present. Phase 3 will reject manifests using legacy `tier`.
   */
  tier?: SkillTier
  /**
   * Phase 2E-2: canonical tier eligibility. Bundle-pull-script filters
   * skills by intersecting customer's tier with this array. When absent
   * AND `tier` is present, validator translates and emits a deprecation
   * warning. When BOTH present, `enabled_for_tiers` wins.
   */
  enabled_for_tiers?: SkillTier[]
}

/**
 * Translate legacy `tier` field → canonical `enabled_for_tiers` array.
 * `tier: "starter"` means "starter and above" → ['starter','pro','studio'].
 * Used by validateManifest's translation layer + bundle-pull-script at boot.
 *
 * Exported so the boot script can apply identical translation when reading
 * legacy manifests from disk (defense-in-depth — even if validator missed
 * a manifest, the runtime translation gives the same result).
 */
export function tierToEnabledForTiers(tier: SkillTier): SkillTier[] {
  switch (tier) {
    case 'starter':
      return ['starter', 'pro', 'studio']
    case 'pro':
      return ['pro', 'studio']
    case 'studio':
      return ['studio']
  }
}

/**
 * Resolve a skill's effective enabled_for_tiers, applying the legacy
 * translation when needed. Returns null if neither field is present
 * (caller treats as validation error).
 */
export function resolveEnabledForTiers(skill: ManifestSkill): SkillTier[] | null {
  if (skill.enabled_for_tiers && skill.enabled_for_tiers.length > 0) {
    return skill.enabled_for_tiers
  }
  if (skill.tier) {
    return tierToEnabledForTiers(skill.tier)
  }
  return null
}

export type ManifestTemplate = {
  id: string
  kind: string
  description_id: string
  best_for?: string
  source?: 'bundled' | 'customer-grown'
  generated_at?: string
}

export type Manifest = {
  agent_slug: string
  version: string
  description_id: string
  skills: ManifestSkill[]
  templates: ManifestTemplate[]
  self_extend: boolean
  extension_dir: string
}

// ─── known persona slugs (must match soul-md-template.ts) ──────────────

export const KNOWN_PERSONA_SLUGS = [
  'the-pro',
  'deep-researcher',
  'web-app-builder',          // display name "Web Creator" in v2; slug retained
  'doc-expert',
  'slide-master',
  'trade-pro',
  'project-conductor',   // v2 — renamed from 'macro-strategist'
  'business-agent',
  'video-producer',
  'social-conductor',
] as const

// ─── inline schema (mirrors agent-packs/_manifest.schema.json) ─────────
//
// Inlined so the validator works without disk reads. A drift test in
// tests/manifest-validator.spec.ts asserts equality with the .json file.

export const MANIFEST_SCHEMA = {
  type: 'object',
  required: [
    'agent_slug',
    'version',
    'description_id',
    'skills',
    'templates',
    'self_extend',
    'extension_dir',
  ],
  properties: {
    agent_slug: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    description_id: { type: 'string', minLength: 10, maxLength: 500 },
    skills: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        // `tier` and `enabled_for_tiers` BOTH optional at the schema layer.
        // Cross-field invariant in validateManifest enforces "at least one
        // present"; translation layer converts legacy `tier` → array.
        // Phase 2E-2 deprecates `tier`; Phase 3 will remove the legacy
        // schema acceptance entirely.
        required: ['id', 'description_id', 'execution', 'handler_ref'],
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9-]+$' },
          description_id: { type: 'string', minLength: 10, maxLength: 500 },
          description_en: { type: 'string', minLength: 10, maxLength: 500 },
          skill_kind: { type: 'string', enum: ['skill', 'playbook'] },
          template_fetch_required: { type: 'boolean' },
          templates_used: { type: 'array', items: { type: 'string' } },
          execution: {
            type: 'string',
            enum: ['edge-function', 'hermes-skill', 'composite', 'external-api'],
          },
          handler_ref: {
            type: 'string',
            pattern: '^(edge-fn|hermes-skill|external|composite):[a-z0-9-]+$',
          },
          tier: { type: 'string', enum: ['starter', 'pro', 'studio'] },
          enabled_for_tiers: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: ['starter', 'pro', 'studio'] },
          },
        },
      },
    },
    templates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kind', 'description_id'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          description_id: { type: 'string', minLength: 10, maxLength: 500 },
          best_for: { type: 'string' },
          source: { type: 'string', enum: ['bundled', 'customer-grown'] },
          generated_at: { type: 'string' },
        },
      },
    },
    self_extend: { type: 'boolean' },
    extension_dir: { type: 'string', pattern: '^/' },
  },
} as const

// ─── validator ─────────────────────────────────────────────────────────

export type ManifestValidateOk = { ok: true; manifest: Manifest }
export type ManifestValidateErr = { ok: false; errors: string[] }
export type ManifestValidateResult = ManifestValidateOk | ManifestValidateErr

export type ValidateManifestOpts = {
  /**
   * Persona Genesis (2026-06-10): per-customer generated personas carry a
   * `custom-<customer_id>` slug that is intentionally NOT in
   * KNOWN_PERSONA_SLUGS. Callers validating a GENERATED manifest pass the
   * exact slug(s) they minted here; every other caller gets the unchanged
   * known-slug gate. This is an explicit opt-in, never a default — the
   * curated-persona gate stays intact.
   */
  allowAgentSlugs?: readonly string[]
}

/**
 * Validate a parsed manifest object. Performs schema validation +
 * cross-field invariants:
 *   - agent_slug must be a known persona slug (or explicitly allow-listed)
 *   - every skill.templates_used reference must exist in templates[]
 *   - extension_dir must be absolute path
 */
export function validateManifest(
  input: unknown,
  opts: ValidateManifestOpts = {},
): ManifestValidateResult {
  // Discard $schema field if present (it's reference metadata, not part
  // of the runtime manifest contract).
  const stripped = stripSchemaField(input)

  const schemaResult: ValidateResult = validateAgainstSchema(
    stripped,
    MANIFEST_SCHEMA as Record<string, unknown>,
  )
  if (!schemaResult.ok) {
    return { ok: false, errors: schemaResult.errors }
  }

  const m = schemaResult.value as Manifest

  // Cross-field invariants
  const errors: string[] = []

  const allowedSlugs = opts.allowAgentSlugs ?? []
  if (
    !(KNOWN_PERSONA_SLUGS as readonly string[]).includes(m.agent_slug) &&
    !allowedSlugs.includes(m.agent_slug)
  ) {
    errors.push(
      `agent_slug "${m.agent_slug}" is not a known persona — must be one of ${KNOWN_PERSONA_SLUGS.join(', ')}`,
    )
  }

  // templates_used must reference real template ids
  const templateIds = new Set(m.templates.map((t) => t.id))
  for (let i = 0; i < m.skills.length; i++) {
    const skill = m.skills[i]
    for (const used of skill.templates_used ?? []) {
      if (!templateIds.has(used)) {
        errors.push(
          `skills[${i}] (${skill.id}) references unknown template "${used}". Templates available: ${[...templateIds].join(', ') || '(none)'}`,
        )
      }
    }
  }

  // skill.id must be unique within skills[]
  const skillIds = new Set<string>()
  for (let i = 0; i < m.skills.length; i++) {
    if (skillIds.has(m.skills[i].id)) {
      errors.push(`skills[${i}] duplicate id "${m.skills[i].id}"`)
    }
    skillIds.add(m.skills[i].id)
  }

  // Cross-field tier check: each skill must declare tier eligibility via
  // either `tier` (legacy) or `enabled_for_tiers` (canonical). Translation
  // layer + deprecation warning emitted for legacy callers.
  for (let i = 0; i < m.skills.length; i++) {
    const skill = m.skills[i]
    const hasNew = Array.isArray(skill.enabled_for_tiers) && skill.enabled_for_tiers.length > 0
    const hasLegacy = typeof skill.tier === 'string' && skill.tier.length > 0
    if (!hasNew && !hasLegacy) {
      errors.push(
        `skills[${i}] (${skill.id}): must declare tier eligibility via "enabled_for_tiers" (canonical) or "tier" (legacy, deprecated)`,
      )
      continue
    }
    if (hasLegacy && !hasNew) {
      console.warn(
        `[manifest-validator] DEPRECATED: skills[${i}] (${skill.id}) uses legacy "tier" field. ` +
          `Migrate to "enabled_for_tiers": ${JSON.stringify(tierToEnabledForTiers(skill.tier as SkillTier))}. ` +
          `Phase 3 will remove translation support.`,
      )
    } else if (hasLegacy && hasNew) {
      console.warn(
        `[manifest-validator] skills[${i}] (${skill.id}) has BOTH "tier" and "enabled_for_tiers". ` +
          `"enabled_for_tiers" wins; remove the legacy "tier" field to silence this warning.`,
      )
    }
  }

  // template.id must be unique within templates[]
  const tIds = new Set<string>()
  for (let i = 0; i < m.templates.length; i++) {
    if (tIds.has(m.templates[i].id)) {
      errors.push(`templates[${i}] duplicate id "${m.templates[i].id}"`)
    }
    tIds.add(m.templates[i].id)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, manifest: m }
}

function stripSchemaField(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input
  }
  const obj = input as Record<string, unknown>
  if (!('$schema' in obj)) return obj
  const { $schema: _ignored, ...rest } = obj
  void _ignored
  return rest
}
