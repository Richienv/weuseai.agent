// Autobrowse harness — shared types.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-1).
//
// Pure TypeScript. No Playwright imports here so the synthesize / iterate /
// graduate pure-logic modules can be unit-tested without spinning up a
// browser. Capture-stage types describe the *output* of the Playwright
// session, not Playwright internals.

// ─── Capture stage ────────────────────────────────────────────────────

/** A single user interaction recorded during capture. */
export type UserAction =
  | { kind: 'navigate'; t: number; url: string }
  | { kind: 'click'; t: number; selector: RawSelector; text?: string }
  | { kind: 'type'; t: number; selector: RawSelector; value: string; valueIsSecret?: boolean }
  | { kind: 'select'; t: number; selector: RawSelector; value: string }
  | { kind: 'wait'; t: number; reason: 'network-idle' | 'selector-visible' | 'timeout'; selector?: RawSelector; ms?: number }
  | {
      kind: 'extract'
      t: number
      /** Founder-marked extraction point — what the customer cared about
       *  reading off the page. Synthesizer treats these as the skill's
       *  output schema. */
      label: string
      selector: RawSelector
      value: string
    }

/** A selector candidate captured at action time. We store ALL the
 *  candidates Playwright's locator inference produced; synthesize ranks
 *  them later. */
export type RawSelector = {
  /** Stable IDs in priority order: data-testid, role+name, text, id, classes, css path. */
  candidates: SelectorCandidate[]
  /** The exact element identifier Playwright actually used at capture time. */
  primary: SelectorCandidate
  /** Optional: nth-of-type index if the selector is non-unique. */
  nth?: number
}

export type SelectorCandidate =
  | { kind: 'testid'; value: string }
  | { kind: 'role'; role: string; name?: string }
  | { kind: 'text'; value: string; exact?: boolean }
  | { kind: 'label'; value: string }
  | { kind: 'placeholder'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'css'; value: string }
  | { kind: 'xpath'; value: string }

/** Output of a single capture session (one customer interaction flow). */
export type CaptureSession = {
  /** Session UUID. */
  sessionId: string
  /** Skill slug being captured (e.g. 'tokopedia-product'). */
  skillSlug: string
  /** ISO 8601 timestamp of capture start. */
  startedAt: string
  /** ISO 8601 timestamp of capture end. */
  endedAt: string
  /** Initial URL the founder navigated to. */
  startUrl: string
  /** All user interactions recorded. */
  actions: UserAction[]
  /** Path to the Playwright tracing.zip artifact relative to the captures dir. */
  traceZipPath: string
  /** Brief notes from the founder about this session. */
  notes?: string
}

// ─── Synthesize stage ─────────────────────────────────────────────────

/** Parameter inferred from variable inputs across multiple captures. */
export type SkillParameter = {
  /** Field name (lowercase, snake_case). */
  name: string
  /** TypeScript type — kept narrow for now. */
  type: 'string' | 'number' | 'boolean'
  /** Whether the field is required. Inferred from "missing in some sessions" → optional. */
  required: boolean
  /** Free-form description for SKILL.md "Yang harus diekstrak" table. */
  description: string
  /** Example value(s) seen during capture, for the SKILL.md doc. */
  examples: string[]
}

/** Output schema — what the skill returns when run. */
export type SkillOutputField = {
  /** Field name on the output object. */
  name: string
  /** TypeScript type. */
  type: 'string' | 'number' | 'boolean' | 'string[]'
  /** Selector used to extract this field. */
  selector: SelectorCandidate
  /** Free-form description. */
  description: string
  /** Whether the field is always present (vs sometimes-missing across captures). */
  always_present: boolean
}

/** A single replay step — one mechanical action the skill performs. */
export type ReplayStep =
  | { kind: 'navigate'; url: string | { template: string } }
  | { kind: 'click'; selector: SelectorCandidate; description: string }
  | {
      kind: 'type'
      selector: SelectorCandidate
      /** Either a literal value or a parameter reference. */
      value: { literal: string } | { paramName: string }
      description: string
    }
  | { kind: 'wait'; reason: 'network-idle' | 'selector-visible'; selector?: SelectorCandidate; description: string }
  | { kind: 'extract'; output: SkillOutputField; description: string }

/** Synthesized skill candidate. The product of running synthesize over
 *  N capture sessions. */
export type SkillSpec = {
  version: 'autobrowse/skill-spec/v1'
  skillSlug: string
  /** Display name for SKILL.md heading. */
  displayName: string
  /** Source: number of captures synthesized into this spec. */
  sourceSessionCount: number
  /** Scope hint for SKILL.md "Kapan dipakai" — derived from action patterns. */
  triggerPhrases: string[]
  /** Input parameters the skill accepts. */
  parameters: SkillParameter[]
  /** Output fields the skill returns. */
  output: SkillOutputField[]
  /** Mechanical replay sequence. */
  steps: ReplayStep[]
  /** Confidence score per selector (0-1). Used by iterate to flag low-conf
   *  selectors for repair. */
  selectorConfidence: Record<string, number>
  /** Free-form notes — provenance, edge cases observed, founder annotations. */
  notes: string[]
}

// ─── Iterate stage ────────────────────────────────────────────────────

/** Result of running an iterate replay against a fresh page load. */
export type IterateRunResult = {
  /** Was the replay deterministic (same outputs as captures)? */
  deterministic: boolean
  /** Per-step pass/fail. */
  steps: Array<{ idx: number; ok: boolean; note?: string }>
  /** Per-output field captured value vs expected pattern. */
  outputs: Array<{
    field: string
    captured: string | null
    matchedPattern: boolean
    note?: string
  }>
  /** Selectors that failed to match — candidates for repair. */
  brokenSelectors: SelectorCandidate[]
}

/** Diff between two SkillSpecs — pre-iterate vs post-iterate. */
export type SkillSpecDiff = {
  selectorChanges: Array<{
    field: string
    before: SelectorCandidate
    after: SelectorCandidate
    reason: string
  }>
  parametersAdded: SkillParameter[]
  parametersRemoved: SkillParameter[]
  outputAdded: SkillOutputField[]
  outputRemoved: SkillOutputField[]
}

// ─── Graduate stage ───────────────────────────────────────────────────

/** Final emitted artifacts. */
export type GraduationArtifacts = {
  /** Path (relative to monorepo root) where SKILL.md was written. */
  skillMdPath: string
  /** SKILL.md text content. */
  skillMdText: string
  /** Patch to add to manifest.json's skills[] array. */
  manifestSkillEntry: ManifestSkillEntry
  /** Patch to add to manifest.json's templates[] array (if any templates). */
  manifestTemplateEntries: ManifestTemplateEntry[]
}

/** Mirrors the agent-pack manifest skill entry shape. */
export type ManifestSkillEntry = {
  id: string
  description_id: string
  description_en?: string
  templates_used: string[]
  execution: 'edge-function' | 'hermes-skill' | 'composite' | 'external'
  handler_ref: string
  enabled_for_tiers: ('starter' | 'pro' | 'studio')[]
}

export type ManifestTemplateEntry = {
  id: string
  kind: string
  description_id: string
  best_for: string
}
