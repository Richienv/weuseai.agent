// Synthesize engine — turn N CaptureSession objects into a single
// SkillSpec candidate.
//
// Pipeline:
//   1. Validate N sessions all share skillSlug.
//   2. Per-action selector ranking — pick the highest-stability candidate
//      across the captures.
//   3. Parameterize variable inputs (parameterize.ts).
//   4. Detect output extraction points (founder-marked 'extract' actions).
//   5. Compute selector confidence (how many captures had this selector
//      working).
//   6. Emit ReplayStep[] in chronological order.
//
// All pure logic — no Playwright dependency. Runs in unit tests.

import type {
  CaptureSession,
  SkillSpec,
  SkillOutputField,
  ReplayStep,
  SelectorCandidate,
  SkillParameter,
} from '../types.ts'
import { rankSelectors, pickBest } from '../lib/selector-rank.ts'
import { inferParameters } from '../lib/parameterize.ts'

export type SynthesizeOpts = {
  /** Display name for the skill (defaults to slug). */
  displayName?: string
  /** Founder-authored trigger phrases (from notes). */
  triggerPhrases?: string[]
}

export function synthesize(
  sessions: CaptureSession[],
  opts: SynthesizeOpts = {},
): SkillSpec {
  if (sessions.length === 0) {
    throw new Error('synthesize: at least one capture session required')
  }
  const slug = sessions[0].skillSlug
  for (const s of sessions) {
    if (s.skillSlug !== slug) {
      throw new Error(
        `synthesize: all sessions must share skillSlug, got "${s.skillSlug}" vs "${slug}"`,
      )
    }
  }

  const params = inferParameters(sessions)
  const refActions = sessions[0].actions
  const minLen = Math.min(...sessions.map((s) => s.actions.length))

  const steps: ReplayStep[] = []
  const selectorConfidence: Record<string, number> = {}
  const outputs: SkillOutputField[] = []

  // Track parameter index by action index so we can reference params in steps.
  const paramByActionIdx = new Map<number, SkillParameter>()
  let paramCursor = 0
  for (let i = 0; i < refActions.length; i++) {
    if (refActions[i].kind !== 'type' && refActions[i].kind !== 'select') continue
    const isLiteral = params.literals.find((l) => l.actionIndex === i)
    if (isLiteral) continue
    if (paramCursor < params.parameters.length) {
      paramByActionIdx.set(i, params.parameters[paramCursor])
      paramCursor++
    }
  }

  // Walk reference session actions in order; pull the best selector across
  // all sessions for each action.
  for (let i = 0; i < refActions.length; i++) {
    const ref = refActions[i]

    // Aggregate all candidate selectors from all sessions for this action.
    // Skip sessions that don't have this action (= shorter capture).
    const allCandidates: SelectorCandidate[] = []
    let presentInSessions = 0
    for (const s of sessions) {
      if (i >= s.actions.length) continue
      const a = s.actions[i]
      if (a.kind !== ref.kind) continue
      presentInSessions++
      if ('selector' in a && a.selector) {
        allCandidates.push(...a.selector.candidates)
      }
    }

    const confidence = presentInSessions / sessions.length

    switch (ref.kind) {
      case 'navigate': {
        // Navigate URLs are usually the same across sessions; the first
        // session's URL wins.
        const url = ref.url
        steps.push({ kind: 'navigate', url })
        break
      }
      case 'click': {
        const best = pickBest(allCandidates) ?? ref.selector.primary
        const key = `step_${i}_click`
        selectorConfidence[key] = confidence
        steps.push({
          kind: 'click',
          selector: best,
          description: `Click step ${i + 1} (${ref.text ? `text="${ref.text.slice(0, 40)}"` : 'unlabeled'})`,
        })
        break
      }
      case 'type': {
        const best = pickBest(allCandidates) ?? ref.selector.primary
        const key = `step_${i}_type`
        selectorConfidence[key] = confidence
        const isLiteral = params.literals.find((l) => l.actionIndex === i)
        const param = paramByActionIdx.get(i)
        const value: ReplayStep['kind'] extends 'type' ? never : never =
          undefined as never
        // TS narrowing; just assign within the push.
        if (isLiteral) {
          steps.push({
            kind: 'type',
            selector: best,
            value: { literal: isLiteral.value },
            description: `Type literal value at step ${i + 1}`,
          })
        } else if (param) {
          steps.push({
            kind: 'type',
            selector: best,
            value: { paramName: param.name },
            description: `Type parameter "${param.name}" at step ${i + 1}`,
          })
        } else {
          // Single session fallback — treat as literal.
          steps.push({
            kind: 'type',
            selector: best,
            value: { literal: ref.value },
            description: `Type at step ${i + 1}`,
          })
        }
        // suppress unused-variable warning in narrow path
        void value
        break
      }
      case 'select': {
        const best = pickBest(allCandidates) ?? ref.selector.primary
        const key = `step_${i}_select`
        selectorConfidence[key] = confidence
        const param = paramByActionIdx.get(i)
        if (param) {
          steps.push({
            kind: 'type',
            selector: best,
            value: { paramName: param.name },
            description: `Select option for "${param.name}" at step ${i + 1}`,
          })
        } else {
          steps.push({
            kind: 'type',
            selector: best,
            value: { literal: ref.value },
            description: `Select option at step ${i + 1}`,
          })
        }
        break
      }
      case 'wait': {
        steps.push({
          kind: 'wait',
          reason: ref.reason === 'timeout' ? 'network-idle' : ref.reason,
          selector: ref.selector ? pickBest(ref.selector.candidates) ?? undefined : undefined,
          description: `Wait at step ${i + 1} (${ref.reason})`,
        })
        break
      }
      case 'extract': {
        const best = pickBest(allCandidates) ?? ref.selector.primary
        const key = `step_${i}_extract_${ref.label}`
        selectorConfidence[key] = confidence
        // Detect output type from the captured value.
        const sampleValues = sessions
          .filter((s) => i < s.actions.length && s.actions[i].kind === 'extract')
          .map((s) => (s.actions[i] as Extract<typeof ref, { kind: 'extract' }>).value)
        const fieldType = inferOutputType(sampleValues)
        const alwaysPresent = presentInSessions === sessions.length
        const out: SkillOutputField = {
          name: snakeify(ref.label),
          type: fieldType,
          selector: best,
          description: ref.label,
          always_present: alwaysPresent,
        }
        outputs.push(out)
        steps.push({
          kind: 'extract',
          output: out,
          description: `Extract "${ref.label}"`,
        })
        break
      }
    }
  }

  return {
    version: 'autobrowse/skill-spec/v1',
    skillSlug: slug,
    displayName: opts.displayName ?? slug,
    sourceSessionCount: sessions.length,
    triggerPhrases: opts.triggerPhrases ?? [],
    parameters: params.parameters,
    output: outputs,
    steps,
    selectorConfidence,
    notes: [
      `Synthesized from ${sessions.length} session(s).`,
      ...(params.literals.length > 0
        ? [`Detected ${params.literals.length} literal value(s); review notes file for details.`]
        : []),
      ...(refActions.length > minLen
        ? [`Sessions diverge after action ${minLen}; truncated.`]
        : []),
    ],
  }
}

function inferOutputType(values: string[]): 'string' | 'number' | 'boolean' | 'string[]' {
  if (values.length === 0) return 'string'
  if (values.every((v) => v === 'true' || v === 'false')) return 'boolean'
  if (values.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number'
  // Heuristic: if any value contains newlines or commas, treat as string[]
  // (one extract action covering a list of items, like search results).
  if (values.some((v) => v.includes('\n') || v.split(',').length > 3)) return 'string[]'
  return 'string'
}

function snakeify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'output'
}
