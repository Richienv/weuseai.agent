// Iterate engine — pure-logic diff between two SkillSpecs.
//
// Used by the iterate CLI to show the founder what changed after a
// re-synthesize round (e.g. a selector got upgraded from CSS to data-testid
// because new captures revealed a stable testid).
//
// The replay-against-live-page logic lives in iterate/replay.ts (Playwright
// dependent). The diff is pure logic for unit-testability.

import type { SkillSpec, SkillSpecDiff, SkillParameter, SkillOutputField, SelectorCandidate } from '../types.ts'
import { selectorsEqual } from '../lib/selector-rank.ts'

export function diffSpecs(before: SkillSpec, after: SkillSpec): SkillSpecDiff {
  const selectorChanges: SkillSpecDiff['selectorChanges'] = []

  // Output selectors — compare by field name.
  const beforeOutputByName = new Map(before.output.map((o) => [o.name, o]))
  const afterOutputByName = new Map(after.output.map((o) => [o.name, o]))

  for (const [name, ao] of afterOutputByName) {
    const bo = beforeOutputByName.get(name)
    if (!bo) continue
    if (!selectorsEqual(bo.selector, ao.selector)) {
      selectorChanges.push({
        field: name,
        before: bo.selector,
        after: ao.selector,
        reason: `Output selector for "${name}" changed kind/value across iterate round`,
      })
    }
  }

  // Step-level selector changes (clicks + types). Compare positionally
  // since steps are ordered.
  const minSteps = Math.min(before.steps.length, after.steps.length)
  for (let i = 0; i < minSteps; i++) {
    const bs = before.steps[i]
    const as = after.steps[i]
    if (bs.kind !== as.kind) continue
    if (bs.kind !== 'click' && bs.kind !== 'type') continue
    const bSel = (bs as Extract<typeof bs, { selector: SelectorCandidate }>).selector
    const aSel = (as as Extract<typeof as, { selector: SelectorCandidate }>).selector
    if (!selectorsEqual(bSel, aSel)) {
      selectorChanges.push({
        field: `step_${i}_${bs.kind}`,
        before: bSel,
        after: aSel,
        reason: `Step ${i} ${bs.kind} selector changed across iterate round`,
      })
    }
  }

  return {
    selectorChanges,
    parametersAdded: setDiff(after.parameters, before.parameters, paramKey),
    parametersRemoved: setDiff(before.parameters, after.parameters, paramKey),
    outputAdded: setDiff(after.output, before.output, outputKey),
    outputRemoved: setDiff(before.output, after.output, outputKey),
  }
}

function paramKey(p: SkillParameter): string {
  return `${p.name}|${p.type}`
}

function outputKey(o: SkillOutputField): string {
  return `${o.name}|${o.type}`
}

/**
 * Items in `a` not in `b`, by key function.
 */
function setDiff<T>(a: T[], b: T[], key: (t: T) => string): T[] {
  const bKeys = new Set(b.map(key))
  return a.filter((x) => !bKeys.has(key(x)))
}
