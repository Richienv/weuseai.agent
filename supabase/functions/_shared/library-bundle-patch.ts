// Self-Improving Library — bundle patcher (Mission 3).
//
// Applies an APPROVED library draft to a persona's current bundle tarball:
//   new/revise template → write templates/<id> + upsert the manifest entry
//                         (source: 'customer-grown' — the existing manifest
//                         enum for usage-grown content)
//   playbook_fix        → whole-file replace of skills/<id>/SKILL.md
// then bumps the manifest patch version and rebuilds the tar.gz. The
// patched manifest must still pass the SAME validateManifest gate as the
// curated library — a patch that breaks the manifest never ships.
//
// Pure: bytes in, bytes out. Storage/broadcast wiring lives in the apply
// handler.

import { parseTar, buildTarGz, gunzipBytes, type TarEntry } from './tar-gz.ts'
import { validateManifest, type Manifest } from './manifest-validator.ts'
import type { LibraryDraft } from './library-draft-validator.ts'

export type BundlePatchResult =
  | { ok: true; tarGz: Uint8Array; newVersion: string; manifest: Manifest }
  | { ok: false; errors: string[] }

export function bumpPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!m) return '1.0.1'
  return `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`
}

export async function patchBundleTarGz(
  currentTarGz: Uint8Array,
  draft: LibraryDraft,
): Promise<BundlePatchResult> {
  let entries: TarEntry[]
  try {
    entries = parseTar(await gunzipBytes(currentTarGz))
  } catch (e) {
    return { ok: false, errors: [`unreadable bundle tarball: ${e instanceof Error ? e.message : String(e)}`] }
  }

  const manifestEntry = entries.find((e) => e.path === 'manifest.json')
  if (!manifestEntry) return { ok: false, errors: ['bundle has no manifest.json'] }
  let manifest: Manifest
  try {
    manifest = JSON.parse(manifestEntry.content) as Manifest
  } catch {
    return { ok: false, errors: ['bundle manifest.json is not valid JSON'] }
  }
  if (manifest.agent_slug !== draft.persona_slug) {
    return {
      ok: false,
      errors: [`draft targets "${draft.persona_slug}" but bundle is "${manifest.agent_slug}"`],
    }
  }

  const byPath = new Map(entries.map((e) => [e.path, e]))

  if (draft.kind === 'new_template' || draft.kind === 'revise_template') {
    byPath.set(`templates/${draft.template_id}`, {
      path: `templates/${draft.template_id}`,
      content: draft.content,
    })
    const existing = manifest.templates.find((t) => t.id === draft.template_id)
    if (existing) {
      existing.description_id = draft.description_id
      existing.kind = draft.template_kind
      existing.source = 'customer-grown'
      existing.generated_at = new Date().toISOString()
    } else {
      manifest.templates.push({
        id: draft.template_id,
        kind: draft.template_kind,
        description_id: draft.description_id,
        source: 'customer-grown',
        generated_at: new Date().toISOString(),
      })
    }
  } else if (draft.kind === 'playbook_fix') {
    const path = `skills/${draft.skill_id}/SKILL.md`
    if (!byPath.has(path)) {
      return { ok: false, errors: [`bundle has no ${path} to fix`] }
    }
    byPath.set(path, { path, content: draft.revised_skill_md })
  } else {
    return { ok: false, errors: [`unknown draft kind`] }
  }

  const newVersion = bumpPatchVersion(manifest.version)
  manifest.version = newVersion

  // The patched manifest must clear the same curated-library gate.
  const mv = validateManifest(manifest)
  if (!mv.ok) {
    return { ok: false, errors: mv.errors.map((e) => `patched manifest invalid: ${e}`) }
  }

  byPath.set('manifest.json', {
    path: 'manifest.json',
    content: JSON.stringify(manifest, null, 2) + '\n',
  })

  const tarGz = await buildTarGz([...byPath.values()])
  return { ok: true, tarGz, newVersion, manifest }
}
