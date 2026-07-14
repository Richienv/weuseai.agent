// Hermes-shaped SKILL.md emitter. Produces the markdown text that
// graduate writes to agent-packs/<persona>/skills/<id>/SKILL.md.
//
// Mirrors the SKILL.md pattern from Persona v2 (see e.g.
// agent-packs/web-app-builder/skills/landing-page-builder/SKILL.md).

import type { SkillSpec, ManifestSkillEntry, SkillParameter, ReplayStep } from '../types.ts'
import { toPlaywrightLocator } from './selector-rank.ts'

export type SkillMdRenderOpts = {
  /** Bundle slug (e.g. 'web-creator'). */
  bundleSlug: string
  /** Tier eligibility — emitted as the "Tier:" line. Accepts readonly
   *  arrays so callers can pass `as const` literals. */
  enabledForTiers: readonly ('starter' | 'pro' | 'studio')[]
  /** handler_ref for the manifest entry. The graduated skill executes
   *  via a Hermes-side replay handler (Phase 4-3+ scope) OR an
   *  edge-function (rare). Defaults to hermes-skill:autobrowse-replay. */
  handlerRef?: string
}

export function renderSkillMd(spec: SkillSpec, opts: SkillMdRenderOpts): string {
  const handlerRef = opts.handlerRef ?? `hermes-skill:autobrowse-replay`
  const tierLabel = formatTierLabel(opts.enabledForTiers)
  const lines: string[] = []

  // Heading + bundle metadata.
  lines.push(`# ${spec.skillSlug} — Hermes skill`)
  lines.push('')
  lines.push(`Bundle: ${opts.bundleSlug} (Phase 4 graduated via Autobrowse)`)
  lines.push(`Tier: ${tierLabel}`)
  lines.push(`Handler: \`${handlerRef}\``)
  lines.push('')
  lines.push(`> Display name: ${spec.displayName}`)
  lines.push(`> Synthesized from ${spec.sourceSessionCount} capture session(s).`)
  lines.push('')

  // ─── Kapan dipakai ─────────────────────────────────────────
  lines.push('## Kapan dipakai')
  lines.push('')
  if (spec.triggerPhrases.length > 0) {
    for (const tp of spec.triggerPhrases) lines.push(`- "${tp}"`)
  } else {
    lines.push('- _(trigger phrases not yet authored — founder edit before merge)_')
  }
  lines.push('')

  // ─── Yang harus diekstrak ─────────────────────────────────
  lines.push('## Yang harus diekstrak')
  lines.push('')
  if (spec.parameters.length === 0) {
    lines.push('_(skill takes no parameters)_')
  } else {
    lines.push('| Field | Type | Wajib | Catatan |')
    lines.push('|---|---|---|---|')
    for (const p of spec.parameters) {
      const examples = p.examples.length > 0 ? ` Contoh: ${p.examples.map((e) => `\`${e}\``).join(', ')}.` : ''
      lines.push(`| \`${p.name}\` | ${p.type} | ${p.required ? 'ya' : 'tidak'} | ${escapeTableCell(p.description)}${escapeTableCell(examples)} |`)
    }
  }
  lines.push('')

  // ─── Yang dilakukan ───────────────────────────────────────
  lines.push('## Yang dilakukan')
  lines.push('')
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i]
    lines.push(`${i + 1}. ${formatReplayStep(step)}`)
  }
  lines.push('')

  // ─── Output ───────────────────────────────────────────────
  lines.push('## Output')
  lines.push('')
  if (spec.output.length === 0) {
    lines.push('_(skill returns ack only)_')
  } else {
    lines.push('Persona-voice wrapper, with extracted fields:')
    lines.push('')
    lines.push('| Field | Type | Always present | Description |')
    lines.push('|---|---|---|---|')
    for (const o of spec.output) {
      lines.push(`| \`${o.name}\` | ${o.type} | ${o.always_present ? 'ya' : 'tidak'} | ${escapeTableCell(o.description)} |`)
    }
  }
  lines.push('')

  // ─── Decline ──────────────────────────────────────────────
  lines.push('## Decline')
  lines.push('')
  lines.push('- **Pages with auth-walls / captcha** — Autobrowse-graduated skills run on public pages only. Surface a message + link to the page; customer logs in manually.')
  lines.push('- **Sites that have changed structure** — if the iterate replay flags `brokenSelectors`, skill returns the partial extraction + a "structure changed" note. Founder re-runs Autobrowse to repair.')
  lines.push('- **Bulk scraping** — single-page extraction only. Pagination loops live in a separate `*-paginated` skill (Phase 4.5+).')
  lines.push('')

  // ─── Failure handling ─────────────────────────────────────
  lines.push('## Failure handling')
  lines.push('')
  lines.push('- Selector miss on any non-optional field → return what was captured + flag `partial: true` in the response. Customer decides whether to retry.')
  lines.push('- Network timeout → 1 retry with exponential backoff (3s, 6s); then fail with `network_timeout`.')
  lines.push('- Page schema drift detected by iterate diff → flag for re-graduation, surface partial extraction.')
  lines.push('')

  // ─── Provenance footer ────────────────────────────────────
  if (spec.notes.length > 0) {
    lines.push('## Provenance')
    lines.push('')
    for (const n of spec.notes) lines.push(`- ${n}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build the manifest.json `skills[]` entry for this skill.
 */
export function buildManifestEntry(
  spec: SkillSpec,
  opts: SkillMdRenderOpts,
): ManifestSkillEntry {
  const handlerRef = opts.handlerRef ?? `hermes-skill:autobrowse-replay`
  const [kind] = handlerRef.split(':')
  const execution: ManifestSkillEntry['execution'] =
    kind === 'edge-fn' ? 'edge-function' :
    kind === 'hermes-skill' ? 'hermes-skill' :
    kind === 'composite' ? 'composite' :
    kind === 'external' ? 'external' :
    'hermes-skill'
  return {
    id: spec.skillSlug,
    description_id: shortDescription(spec, 'id'),
    description_en: shortDescription(spec, 'en'),
    templates_used: [],
    execution,
    handler_ref: handlerRef,
    // Copy to a fresh mutable array so the manifest entry isn't typed
    // readonly downstream.
    enabled_for_tiers: [...opts.enabledForTiers],
  }
}

function formatReplayStep(step: ReplayStep): string {
  switch (step.kind) {
    case 'navigate':
      if (typeof step.url === 'string') return `Buka URL: \`${step.url}\``
      return `Buka URL (template): \`${step.url.template}\``
    case 'click':
      return `Klik elemen \`${toPlaywrightLocator(step.selector)}\` — ${step.description}`
    case 'type': {
      const valueRepr =
        'literal' in step.value
          ? `\`${step.value.literal}\``
          : `nilai parameter \`${step.value.paramName}\``
      return `Ketik ${valueRepr} ke field \`${toPlaywrightLocator(step.selector)}\` — ${step.description}`
    }
    case 'wait':
      if (step.reason === 'selector-visible' && step.selector) {
        return `Tunggu \`${toPlaywrightLocator(step.selector)}\` muncul — ${step.description}`
      }
      return `Tunggu ${step.reason} — ${step.description}`
    case 'extract':
      return `Ekstrak \`${step.output.name}\` (${step.output.type}) dari \`${toPlaywrightLocator(step.output.selector)}\` — ${step.description}`
  }
}

function formatTierLabel(tiers: readonly ('starter' | 'pro' | 'studio')[]): string {
  if (tiers.includes('starter')) return 'starter+'
  if (tiers.includes('pro')) return 'pro+'
  if (tiers.includes('studio')) return 'studio'
  return tiers.join(' / ')
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function shortDescription(spec: SkillSpec, lang: 'id' | 'en'): string {
  const params = spec.parameters.length
  const outputs = spec.output.length
  if (lang === 'id') {
    return `Skill ${spec.displayName} — ${spec.steps.length} langkah, ${params} parameter, ${outputs} output. Graduated via Autobrowse.`
  }
  return `${spec.displayName} skill — ${spec.steps.length} steps, ${params} params, ${outputs} outputs. Autobrowse-graduated.`
}
