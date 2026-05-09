// Graduate engine — emit final SKILL.md + manifest patch from a
// SkillSpec.
//
// Pure logic. The CLI wraps this in fs.writeFile + manifest.json patching.

import type { SkillSpec, GraduationArtifacts } from '../types.ts'
import { renderSkillMd, buildManifestEntry } from '../lib/skill-md.ts'

export type GraduateOpts = {
  /** Target agent-pack slug (e.g. 'web-master'). */
  targetBundleSlug: string
  /** Tier eligibility for the manifest entry. */
  enabledForTiers: ('starter' | 'pro' | 'studio')[]
  /** handler_ref for the manifest skill entry. */
  handlerRef?: string
  /** Repository root path — used to compute the SKILL.md target path. */
  repoRoot?: string
}

export function graduate(spec: SkillSpec, opts: GraduateOpts): GraduationArtifacts {
  const repoRoot = opts.repoRoot ?? process.cwd()
  const skillMdPath = `${stripTrailingSlash(repoRoot)}/agent-packs/${opts.targetBundleSlug}/skills/${spec.skillSlug}/SKILL.md`

  const skillMdText = renderSkillMd(spec, {
    bundleSlug: opts.targetBundleSlug,
    enabledForTiers: opts.enabledForTiers,
    handlerRef: opts.handlerRef,
  })

  const manifestSkillEntry = buildManifestEntry(spec, {
    bundleSlug: opts.targetBundleSlug,
    enabledForTiers: opts.enabledForTiers,
    handlerRef: opts.handlerRef,
  })

  return {
    skillMdPath,
    skillMdText,
    manifestSkillEntry,
    manifestTemplateEntries: [],
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '')
}
