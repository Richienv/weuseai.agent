// Selector ranking + scoring.
//
// The synthesizer's central job is "given N capture sessions, pick the
// most stable selector for each element." Stability heuristics, in
// priority order:
//
//   1. data-testid           — explicit author intent, never auto-generated
//   2. role + accessible name — semantic, survives most refactors
//   3. text (exact)          — survives styling refactors, breaks on copy edits
//   4. label / placeholder   — form-specific, survives input rearrangement
//   5. id                    — survives most refactors but often auto-generated
//   6. css                   — fragile (classes change with frameworks)
//   7. xpath                 — most fragile, only as last resort
//
// The score is 0-1; the highest-scoring candidate wins. Ties broken by
// the priority order above.

import type { SelectorCandidate } from '../types.ts'

/** Stability score per selector kind, 0-1. */
const KIND_SCORE: Record<SelectorCandidate['kind'], number> = {
  testid: 1.0,
  role: 0.9,
  text: 0.7,
  label: 0.65,
  placeholder: 0.6,
  id: 0.5,
  css: 0.25,
  xpath: 0.1,
}

/** Priority order — used to break ties. Lower index = higher priority. */
const KIND_PRIORITY: SelectorCandidate['kind'][] = [
  'testid',
  'role',
  'text',
  'label',
  'placeholder',
  'id',
  'css',
  'xpath',
]

export function scoreSelector(s: SelectorCandidate): number {
  let score = KIND_SCORE[s.kind]
  if (s.kind === 'css') {
    // Penalize selectors that look auto-generated (random suffix patterns).
    if (/_[a-zA-Z0-9]{5,}\b/.test(s.value)) score *= 0.5
    // Penalize deeply-nested CSS paths.
    const depth = (s.value.match(/[\s>]/g) || []).length
    if (depth > 4) score *= 0.6
  }
  if (s.kind === 'id') {
    // Penalize auto-generated IDs (UUID-like, hash-like, or numeric-only).
    if (/^[0-9a-f]{8,}$/i.test(s.value)) score *= 0.3
    if (/^\d+$/.test(s.value)) score *= 0.5
  }
  if (s.kind === 'role' && !s.name) {
    // role-without-name is much less useful (matches multiple).
    score *= 0.5
  }
  if (s.kind === 'text') {
    // Penalize very long text (likely transient; like a timestamp or full body).
    if (s.value.length > 80) score *= 0.5
    if (s.value.length > 200) score *= 0.2
  }
  return score
}

/**
 * Rank candidates highest-stability-first. Uses score, then KIND_PRIORITY
 * for tie-breaking.
 */
export function rankSelectors(candidates: SelectorCandidate[]): SelectorCandidate[] {
  return [...candidates].sort((a, b) => {
    const sa = scoreSelector(a)
    const sb = scoreSelector(b)
    if (sb !== sa) return sb - sa
    return KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
  })
}

/**
 * Pick the best (highest-stability) selector from a list. Returns null
 * if the list is empty.
 */
export function pickBest(candidates: SelectorCandidate[]): SelectorCandidate | null {
  if (candidates.length === 0) return null
  return rankSelectors(candidates)[0]
}

/**
 * Equality test — used by the iterate engine to detect "same element
 * still here, just different value".
 */
export function selectorsEqual(a: SelectorCandidate, b: SelectorCandidate): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'testid':
    case 'id':
    case 'css':
    case 'xpath':
      return a.value === (b as typeof a).value
    case 'role':
      return a.role === (b as typeof a).role && a.name === (b as typeof a).name
    case 'text': {
      const bb = b as typeof a
      return a.value === bb.value && (a.exact ?? false) === (bb.exact ?? false)
    }
    case 'label':
    case 'placeholder':
      return a.value === (b as typeof a).value
  }
}

/**
 * Render a selector as a Playwright `page.locator(...)` argument.
 * Used by the graduated SKILL.md's "Yang dilakukan" step descriptions
 * AND by the iterate engine when replaying.
 */
export function toPlaywrightLocator(s: SelectorCandidate): string {
  switch (s.kind) {
    case 'testid':
      return `[data-testid="${escapeAttr(s.value)}"]`
    case 'role':
      return s.name
        ? `getByRole('${s.role}', { name: ${JSON.stringify(s.name)} })`
        : `getByRole('${s.role}')`
    case 'text':
      return s.exact
        ? `getByText(${JSON.stringify(s.value)}, { exact: true })`
        : `getByText(${JSON.stringify(s.value)})`
    case 'label':
      return `getByLabel(${JSON.stringify(s.value)})`
    case 'placeholder':
      return `getByPlaceholder(${JSON.stringify(s.value)})`
    case 'id':
      return `#${s.value}`
    case 'css':
      return s.value
    case 'xpath':
      return `xpath=${s.value}`
  }
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '\\"')
}
