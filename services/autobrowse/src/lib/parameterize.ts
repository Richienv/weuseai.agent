// Parameterization — given multiple capture sessions of the same skill,
// detect inputs that differ across sessions (= variable parameters)
// vs inputs that are constant (= literal values baked into the skill).
//
// Example: Tokopedia search captures across 3 sessions:
//   session 1: type "iphone 14" into search box
//   session 2: type "macbook pro" into search box
//   session 3: type "airpods" into search box
//   → search box is a parameter named (default) "search_query": string
//
// vs:
//   session 1: type "0812345..." into phone field
//   session 2: type "0812345..." into phone field (same value)
//   → phone field is a constant. Probably the founder's own phone.
//   Don't parameterize; either bake-in (if intent) or strip (if PII slip).

import type { CaptureSession, UserAction, SkillParameter } from '../types.ts'

export type ParameterizationResult = {
  /** Parameters detected (= different across sessions). */
  parameters: SkillParameter[]
  /** Literals (= same across sessions). Reported to founder for review. */
  literals: Array<{
    actionIndex: number
    selector: string
    value: string
    occurrences: number
  }>
}

/**
 * Walk through the capture sessions in lockstep — for each action index,
 * if all sessions have a 'type' or 'select' action with the same selector,
 * compare the values. Different = parameter. Same = literal.
 *
 * Assumes all sessions have the same action sequence (in length and shape).
 * If sessions diverge, this returns the alignment up to the divergence
 * point and notes the rest.
 */
export function inferParameters(sessions: CaptureSession[]): ParameterizationResult {
  if (sessions.length < 2) {
    // With < 2 sessions there's nothing to compare; treat all type/select
    // actions as parameters (founder marks them as literal manually if
    // they prefer to bake-in).
    return parametrizeAllInputs(sessions[0]?.actions ?? [])
  }

  const minLen = Math.min(...sessions.map((s) => s.actions.length))
  const parameters: SkillParameter[] = []
  const literals: ParameterizationResult['literals'] = []

  // Used names to keep generated parameter names unique.
  const usedNames = new Set<string>()

  for (let i = 0; i < minLen; i++) {
    const refAction = sessions[0].actions[i]
    if (refAction.kind !== 'type' && refAction.kind !== 'select') continue

    const valuesAtIdx: string[] = []
    let allSameSelector = true
    for (const s of sessions) {
      const a = s.actions[i]
      if (a.kind !== refAction.kind) {
        allSameSelector = false
        break
      }
      const aVal = (a as Extract<UserAction, { kind: 'type' | 'select' }>).value
      valuesAtIdx.push(aVal)
    }
    if (!allSameSelector) continue

    const distinct = new Set(valuesAtIdx)
    const selectorRepr = describeSelector(refAction)

    if (distinct.size === 1) {
      // Constant across sessions → literal.
      literals.push({
        actionIndex: i,
        selector: selectorRepr,
        value: valuesAtIdx[0],
        occurrences: valuesAtIdx.length,
      })
      continue
    }

    // Variable → parameter.
    const baseName = inferParamName(selectorRepr)
    const name = uniqueName(baseName, usedNames)
    usedNames.add(name)
    parameters.push({
      name,
      type: inferParamType(valuesAtIdx),
      required: true,
      description: `Variable input at step ${i + 1} (${refAction.kind} on ${selectorRepr}).`,
      examples: Array.from(distinct).slice(0, 3),
    })
  }

  return { parameters, literals }
}

/**
 * Single-session fallback. All type/select inputs become parameters.
 */
function parametrizeAllInputs(actions: UserAction[]): ParameterizationResult {
  const parameters: SkillParameter[] = []
  const usedNames = new Set<string>()
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (a.kind !== 'type' && a.kind !== 'select') continue
    const baseName = inferParamName(describeSelector(a))
    const name = uniqueName(baseName, usedNames)
    usedNames.add(name)
    parameters.push({
      name,
      type: inferParamType([a.value]),
      required: true,
      description: `Input at step ${i + 1} (${a.kind}).`,
      examples: [a.value],
    })
  }
  return { parameters, literals: [] }
}

function describeSelector(action: UserAction): string {
  if (action.kind === 'type' || action.kind === 'select' || action.kind === 'click' || action.kind === 'extract' || action.kind === 'wait') {
    if ('selector' in action && action.selector) {
      const c = action.selector.primary
      switch (c.kind) {
        case 'testid':
          return c.value
        case 'role':
          return c.name ? `${c.role}:${c.name}` : c.role
        case 'label':
          return c.value
        case 'placeholder':
          return c.value
        case 'id':
          return c.value
        case 'text':
          return c.value.slice(0, 30)
        default:
          return c.value.slice(0, 30)
      }
    }
  }
  return 'unknown'
}

/**
 * Generate a snake_case parameter name from a selector identifier.
 * Stripped to alpha + underscore; falls back to "input_N".
 */
export function inferParamName(repr: string): string {
  // Common substrings that hint at the param's purpose.
  const lower = repr.toLowerCase()
  // Indonesian + English search/query keywords
  if (/search|query|cari|\bq\b/.test(lower)) return 'search_query'
  if (/email/.test(lower)) return 'email'
  if (/phone|telp|hp\b/.test(lower)) return 'phone'
  if (/name|nama/.test(lower)) return 'name'
  if (/address|alamat/.test(lower)) return 'address'
  if (/url\b/.test(lower)) return 'target_url'
  if (/code|kode/.test(lower)) return 'code'
  if (/date|tanggal/.test(lower)) return 'date'

  const cleaned = lower
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  return cleaned || 'input'
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/**
 * Best-effort type inference from observed values.
 */
export function inferParamType(
  values: string[],
): 'string' | 'number' | 'boolean' {
  if (values.length === 0) return 'string'
  if (values.every((v) => v === 'true' || v === 'false')) return 'boolean'
  if (values.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number'
  return 'string'
}
