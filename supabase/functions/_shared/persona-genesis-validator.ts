// Persona Genesis — generation quality gate.
//
// Spec: docs/specs/2026-06-10-mission2-build-spec.md
//
// A GENERATED persona must clear the same bar as the 10 curated ones before
// it reaches a customer VPS: manifest schema + cross-field invariants (via
// the existing validateManifest, with the custom slug explicitly
// allow-listed), plus the CLAUDE.md brand-voice floor — Bahasa "kamu"
// register, zero banned words, zero exclamation marks in body copy — plus
// structural substance minimums so DeepSeek can't ship an empty shell.
//
// Failures are returned as a full list (not first-error) so the founder
// alert carries everything wrong with a rejected generation.

import { validateManifest, type Manifest } from './manifest-validator.ts'

// CLAUDE.md brand voice rules — banned outright in customer-facing copy.
export const BANNED_WORDS = [
  'basically',
  'just',
  'literally',
  'honestly',
  'kind of',
  'pretty much',
  'revolutionary',
  'disrupt',
  '10x',
  'game-changer',
  'next-level',
] as const

export type GeneratedFile = {
  /** Path inside the bundle, e.g. "skills/<id>/SKILL.md". */
  path: string
  content: string
}

export type GeneratedPersona = {
  /** Always `custom-<customer_id>`. */
  slug: string
  /** The persona identity — becomes the customer's SOUL.md. */
  soul_md: string
  /** Persona-shell SKILL.md (top-level — exposes /<slug>). */
  shell_skill_md: string
  manifest: Manifest
  /** Bundle files: skills/<id>/SKILL.md + templates/<id>. */
  files: GeneratedFile[]
}

export type GenesisValidation =
  | { ok: true }
  | { ok: false; errors: string[] }

// ─── helpers ─────────────────────────────────────────────────────────────

function bannedWordHits(text: string): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const w of BANNED_WORDS) {
    // Word-boundary match; multiword entries matched as phrases.
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9-])`, 'i')
    if (re.test(lower)) hits.push(w)
  }
  return hits
}

function exclamationCount(text: string): number {
  return (text.match(/!/g) ?? []).length
}

/** "Anda" used as an address (capital-A, word-boundary). */
function usesAnda(text: string): boolean {
  return /\bAnda\b/.test(text)
}

// ─── the gate ────────────────────────────────────────────────────────────

const MIN_SOUL_CHARS = 400
const MIN_SKILL_CHARS = 200
const MIN_TEMPLATE_CHARS = 80
const MIN_SKILLS = 6
const MAX_SKILLS = 15
const MIN_TEMPLATES = 4
const MAX_TEMPLATES = 12

export function validateGeneratedPersona(p: GeneratedPersona): GenesisValidation {
  const errors: string[] = []

  // 1. Slug shape — tenant-bound custom slug only.
  if (!/^custom-[0-9a-f-]{8,}$/i.test(p.slug)) {
    errors.push(`slug "${p.slug}" must be custom-<customer_id>`)
  }
  if (p.manifest?.agent_slug !== p.slug) {
    errors.push(`manifest.agent_slug "${p.manifest?.agent_slug}" != persona slug "${p.slug}"`)
  }

  // 2. Manifest — SAME validator as curated personas, custom slug
  // explicitly allow-listed (never widened globally).
  const mv = validateManifest(p.manifest, { allowAgentSlugs: [p.slug] })
  if (!mv.ok) {
    errors.push(...mv.errors.map((e) => `manifest: ${e}`))
  }

  // 3. Substance floors.
  if ((p.soul_md ?? '').length < MIN_SOUL_CHARS) {
    errors.push(`SOUL.md too thin (<${MIN_SOUL_CHARS} chars)`)
  }
  if ((p.shell_skill_md ?? '').length < MIN_SKILL_CHARS) {
    errors.push(`persona-shell SKILL.md too thin (<${MIN_SKILL_CHARS} chars)`)
  }
  const skillCount = p.manifest?.skills?.length ?? 0
  if (skillCount < MIN_SKILLS || skillCount > MAX_SKILLS) {
    errors.push(`skill count ${skillCount} outside [${MIN_SKILLS}, ${MAX_SKILLS}]`)
  }
  const templateCount = p.manifest?.templates?.length ?? 0
  if (templateCount < MIN_TEMPLATES || templateCount > MAX_TEMPLATES) {
    errors.push(`template count ${templateCount} outside [${MIN_TEMPLATES}, ${MAX_TEMPLATES}]`)
  }

  // 4. File integrity: every manifest skill has a SKILL.md file; every
  // manifest template has a file; no stray paths.
  const filesByPath = new Map(p.files.map((f) => [f.path, f]))
  for (const s of p.manifest?.skills ?? []) {
    const path = `skills/${s.id}/SKILL.md`
    const f = filesByPath.get(path)
    if (!f) {
      errors.push(`missing file for skill "${s.id}" (${path})`)
    } else if (f.content.length < MIN_SKILL_CHARS) {
      errors.push(`skill "${s.id}" SKILL.md too thin (<${MIN_SKILL_CHARS} chars)`)
    }
  }
  for (const t of p.manifest?.templates ?? []) {
    const path = `templates/${t.id}`
    const f = filesByPath.get(path)
    if (!f) {
      errors.push(`missing file for template "${t.id}" (${path})`)
    } else if (f.content.length < MIN_TEMPLATE_CHARS) {
      errors.push(`template "${t.id}" too thin (<${MIN_TEMPLATE_CHARS} chars)`)
    }
  }
  for (const f of p.files) {
    const isSkill = /^skills\/[a-z][a-z0-9-]+\/SKILL\.md$/.test(f.path)
    const isTemplate = f.path.startsWith('templates/') && !f.path.includes('..')
    if (!isSkill && !isTemplate) {
      errors.push(`unexpected file path in bundle: "${f.path}"`)
    }
  }

  // 5. Brand voice — every customer-facing artifact.
  const artifacts: Array<[string, string]> = [
    ['SOUL.md', p.soul_md ?? ''],
    ['shell SKILL.md', p.shell_skill_md ?? ''],
    ...p.files.map((f) => [f.path, f.content] as [string, string]),
    ['manifest descriptions', [
      p.manifest?.description_id ?? '',
      ...(p.manifest?.skills ?? []).map((s) => s.description_id),
      ...(p.manifest?.templates ?? []).map((t) => t.description_id),
    ].join('\n')],
  ]
  for (const [label, text] of artifacts) {
    const hits = bannedWordHits(text)
    if (hits.length > 0) {
      errors.push(`${label}: banned word(s) ${hits.join(', ')}`)
    }
    const bangs = exclamationCount(text)
    if (bangs > 0) {
      errors.push(`${label}: ${bangs} exclamation mark(s) — body copy must have zero`)
    }
    if (usesAnda(text)) {
      errors.push(`${label}: uses "Anda" — register is "kamu"`)
    }
  }

  // 6. Bahasa register present in the identity: SOUL must address "kamu".
  if (!/\bkamu\b/i.test(p.soul_md ?? '')) {
    errors.push('SOUL.md: missing "kamu" register — identity must address the customer')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}
