// Self-Improving Library — draft quality gate (Mission 3).
//
// Every DeepSeek-drafted improvement passes the SAME brand-voice bar as
// Persona Genesis (brandVoiceViolations) plus per-kind structure floors
// BEFORE it may enter the founder approval queue. Drafts that fail are
// dropped with a log — never queued, never customer-visible.

import { brandVoiceViolations } from './persona-genesis-validator.ts'

export type TemplateDraft = {
  kind: 'new_template' | 'revise_template'
  persona_slug: string
  /** Template id — a markdown filename, e.g. "surat-penawaran-harga.md". */
  template_id: string
  template_kind: string
  description_id: string
  content: string
}

export type PlaybookFixDraft = {
  kind: 'playbook_fix'
  persona_slug: string
  /** The playbook skill id whose SKILL.md is being revised. */
  skill_id: string
  /** Why the step keeps dying — shown to the founder. */
  rationale_id: string
  /** The FULL revised SKILL.md (whole-file replace — shape-independent). */
  revised_skill_md: string
}

export type LibraryDraft = TemplateDraft | PlaybookFixDraft

const TEMPLATE_ID_RE = /^[a-z][a-z0-9-]+\.md$/
const SKILL_ID_RE = /^[a-z][a-z0-9-]+$/
const MIN_TEMPLATE_CHARS = 80
const MIN_DESCRIPTION_CHARS = 10
const MAX_DESCRIPTION_CHARS = 500
const MIN_SKILL_MD_CHARS = 400

export type DraftValidation = { ok: true } | { ok: false; errors: string[] }

export function validateLibraryDraft(
  draft: LibraryDraft,
  ctx: {
    /** Existing template ids in the persona's CURRENT bundle. */
    existingTemplateIds: readonly string[]
    /** Existing skill ids (for playbook_fix targets). */
    existingSkillIds: readonly string[]
  },
): DraftValidation {
  const errors: string[] = []

  if (draft.kind === 'new_template' || draft.kind === 'revise_template') {
    if (!TEMPLATE_ID_RE.test(draft.template_id)) {
      errors.push(`template_id "${draft.template_id}" must be a kebab-case .md filename`)
    }
    if (draft.kind === 'new_template' && ctx.existingTemplateIds.includes(draft.template_id)) {
      errors.push(`template "${draft.template_id}" already exists — use revise_template`)
    }
    if (draft.kind === 'revise_template' && !ctx.existingTemplateIds.includes(draft.template_id)) {
      errors.push(`revise_template targets missing template "${draft.template_id}"`)
    }
    const desc = (draft.description_id ?? '').trim()
    if (desc.length < MIN_DESCRIPTION_CHARS || desc.length > MAX_DESCRIPTION_CHARS) {
      errors.push(`description_id length ${desc.length} outside [${MIN_DESCRIPTION_CHARS}, ${MAX_DESCRIPTION_CHARS}]`)
    }
    if ((draft.content ?? '').trim().length < MIN_TEMPLATE_CHARS) {
      errors.push(`template content too thin (<${MIN_TEMPLATE_CHARS} chars)`)
    }
    errors.push(...brandVoiceViolations(`template ${draft.template_id}`, draft.content ?? ''))
    errors.push(...brandVoiceViolations('description', draft.description_id ?? ''))
  } else if (draft.kind === 'playbook_fix') {
    if (!SKILL_ID_RE.test(draft.skill_id)) {
      errors.push(`skill_id "${draft.skill_id}" must be kebab-case`)
    }
    if (!ctx.existingSkillIds.includes(draft.skill_id)) {
      errors.push(`playbook_fix targets missing skill "${draft.skill_id}"`)
    }
    if ((draft.revised_skill_md ?? '').length < MIN_SKILL_MD_CHARS) {
      errors.push(`revised SKILL.md too thin (<${MIN_SKILL_MD_CHARS} chars)`)
    }
    if (!(draft.revised_skill_md ?? '').includes('## Langkah-langkah') &&
        !(draft.revised_skill_md ?? '').includes('## Yang dilakukan')) {
      errors.push('revised SKILL.md lost its step/action section')
    }
    if (!(draft.rationale_id ?? '').trim()) {
      errors.push('rationale_id required (founder evidence)')
    }
    errors.push(...brandVoiceViolations(`skill ${draft.skill_id}`, draft.revised_skill_md ?? ''))
  } else {
    errors.push(`unknown draft kind "${(draft as { kind: string }).kind}"`)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}
