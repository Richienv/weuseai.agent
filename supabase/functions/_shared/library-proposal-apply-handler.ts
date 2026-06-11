// Self-Improving Library — founder decision handler (Mission 3).
//
// approve → patch the persona's CURRENT bundle tarball with the draft,
//           upload the bumped version to Storage, mark the proposal
//           applied, and trigger the existing bundle-version-bump-broadcast
//           rail (latest-policy customers restart + pull).
// reject  → mark rejected. Nothing else happens.
//
// Auth is the caller's job (the Vercel admin proxy authenticates the
// founder cookie, then calls the Edge Function service-role-to-service-
// role). This handler trusts its caller.

import { patchBundleTarGz } from './library-bundle-patch.ts'
import { pickLatestSemver } from './bundle-fetch-handler.ts'
import type { LibraryDraft } from './library-draft-validator.ts'

export type LibraryProposalRow = {
  id: string
  kind: LibraryDraft['kind']
  persona_slug: string
  target_id: string
  draft: LibraryDraft
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'apply_failed'
}

export type ApplyDeps = {
  getProposal(id: string): Promise<LibraryProposalRow | null>
  setProposalStatus(
    id: string,
    status: LibraryProposalRow['status'],
    extra?: { applied_version?: string; error_detail?: string },
  ): Promise<void>
  /** Storage object names under bundles/<slug>/ (e.g. ['2.5.0.tar.gz']). */
  listBundleVersions(personaSlug: string): Promise<string[]>
  downloadBundle(personaSlug: string, version: string): Promise<Uint8Array | null>
  uploadBundle(personaSlug: string, version: string, tarGz: Uint8Array): Promise<{ ok: boolean; error?: string }>
  /** The existing broadcast rail (restart latest-policy customers). */
  broadcast(personaSlug: string, newVersion: string): Promise<{ ok: boolean; detail?: string }>
}

export type ApplyResult =
  | { ok: true; status: 200; body: { id: string; decision: 'approved'; applied_version: string; broadcast_ok: boolean } }
  | { ok: true; status: 200; body: { id: string; decision: 'rejected' } }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; detail?: string }

export async function libraryProposalApply(
  input: { id: string; decision: 'approve' | 'reject' },
  deps: ApplyDeps,
): Promise<ApplyResult> {
  if (!input.id || (input.decision !== 'approve' && input.decision !== 'reject')) {
    return { ok: false, status: 400, error: 'invalid_input' }
  }
  const proposal = await deps.getProposal(input.id)
  if (!proposal) return { ok: false, status: 404, error: 'proposal_not_found' }
  if (proposal.status !== 'pending') {
    return { ok: false, status: 409, error: 'already_decided', detail: proposal.status }
  }

  if (input.decision === 'reject') {
    await deps.setProposalStatus(input.id, 'rejected')
    return { ok: true, status: 200, body: { id: input.id, decision: 'rejected' } }
  }

  // ── approve → ship ──────────────────────────────────────────────────
  const versions = await deps.listBundleVersions(proposal.persona_slug)
  const current = pickLatestSemver(versions)
  if (!current) {
    await deps.setProposalStatus(input.id, 'apply_failed', { error_detail: 'no published bundle' })
    return { ok: false, status: 500, error: 'no_published_bundle' }
  }
  const tarGz = await deps.downloadBundle(proposal.persona_slug, current)
  if (!tarGz) {
    await deps.setProposalStatus(input.id, 'apply_failed', { error_detail: `download ${current} failed` })
    return { ok: false, status: 500, error: 'bundle_download_failed' }
  }

  const patched = await patchBundleTarGz(tarGz, proposal.draft)
  if (!patched.ok) {
    await deps.setProposalStatus(input.id, 'apply_failed', {
      error_detail: patched.errors.join(' | ').slice(0, 2000),
    })
    return { ok: false, status: 500, error: 'patch_failed', detail: patched.errors.join(' | ') }
  }

  const uploaded = await deps.uploadBundle(proposal.persona_slug, patched.newVersion, patched.tarGz)
  if (!uploaded.ok) {
    await deps.setProposalStatus(input.id, 'apply_failed', { error_detail: uploaded.error })
    return { ok: false, status: 500, error: 'upload_failed', detail: uploaded.error }
  }

  await deps.setProposalStatus(input.id, 'applied', { applied_version: patched.newVersion })
  const b = await deps.broadcast(proposal.persona_slug, patched.newVersion)

  return {
    ok: true,
    status: 200,
    body: {
      id: input.id,
      decision: 'approved',
      applied_version: patched.newVersion,
      broadcast_ok: b.ok,
    },
  }
}
