/**
 * Phase F harness — Self-Improving Library full local chain.
 *
 * One continuous run over shared in-memory state: real no-match signal
 * rows → refinement pipeline (canned DeepSeek draft) → quality gate →
 * PENDING proposal with evidence → founder APPROVE → bundle patched +
 * version-bumped in storage → the new version is exactly what the
 * existing bundle-fetch/broadcast rail serves to customer VPSes.
 *
 * HONESTY NOTE: this is the local-first verification (no secrets in this
 * session). The live run — real cron, real DeepSeek, one throwaway VPS
 * pulling the approved version — is the founder procedure in
 * docs/runbooks/self-improving-library.md.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  libraryRefineHandler,
  type LibraryRefineDeps,
  type LibraryProposalInsert,
} from '../supabase/functions/_shared/library-refine-handler.ts'
import {
  libraryProposalApply,
  type ApplyDeps,
  type LibraryProposalRow,
} from '../supabase/functions/_shared/library-proposal-apply-handler.ts'
import { pickLatestSemver } from '../supabase/functions/_shared/bundle-fetch-handler.ts'
import { buildTarGz, parseTar, gunzipBytes } from '../supabase/functions/_shared/tar-gz.ts'
import { validateManifest } from '../supabase/functions/_shared/manifest-validator.ts'
import { brandVoiceViolations } from '../supabase/functions/_shared/persona-genesis-validator.ts'
import type { NoMatchRow } from '../supabase/functions/_shared/library-signals.ts'

const PERSONA = 'doc-expert'

const TEMPLATE_CONTENT = `# Surat Penawaran Harga — {nama_klien}

Tanggal: {tanggal}

| Item | Qty | Harga | Subtotal |
|---|---|---|---|
| {item_1} | {qty_1} | {harga_1} | {subtotal_1} |

Total: {total} — berlaku sampai {masa_berlaku}.

Hormat kami,
{nama_pengirim}
`

test('SELF-IMPROVING LIBRARY CHAIN: signal → draft → gate → queue → approve → shipped version', async (t) => {
  // ── shared in-memory infra ───────────────────────────────────────────
  const storage = new Map<string, Uint8Array>()
  const proposals = new Map<string, LibraryProposalRow>()
  const broadcasts: Array<{ slug: string; version: string }> = []
  let idCounter = 0

  // Seed storage with the persona's current curated bundle (v2.2.0).
  const manifest = {
    agent_slug: PERSONA,
    version: '2.2.0',
    description_id: 'Bundle Doc Expert untuk chain test.',
    self_extend: false,
    extension_dir: '/var/lib/weuseai/extensions',
    skills: [{
      id: 'surat-bisnis',
      description_id: 'Draft surat bisnis formal dalam Bahasa Indonesia.',
      execution: 'hermes-skill',
      handler_ref: 'hermes-skill:surat-bisnis',
      enabled_for_tiers: ['starter', 'pro', 'studio'],
      templates_used: ['surat-resmi.md'],
    }],
    templates: [
      { id: 'surat-resmi.md', kind: 'document', description_id: 'Kerangka surat resmi siap isi.' },
    ],
  }
  storage.set(
    `bundles/${PERSONA}/2.2.0.tar.gz`,
    await buildTarGz([
      { path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' },
      { path: 'SKILL.md', content: '# Doc Expert — shell untuk chain test, cukup panjang.' },
      { path: 'skills/surat-bisnis/SKILL.md', content: '# surat-bisnis\n\n## Yang dilakukan\n\nDraft surat untuk kamu.\n' },
      { path: 'templates/surat-resmi.md', content: '# Surat Resmi\n\n{tanggal} {isi} — kerangka surat resmi siap isi.' },
    ]),
  )

  // ── stage 1: real usage signals (3 customers can't get a quote letter) ─
  const signals: NoMatchRow[] = ['cust-a', 'cust-b', 'cust-c'].map((cid, i) => ({
    customer_id: cid,
    persona_slug: PERSONA,
    skill_id: 'surat-bisnis',
    requested_deliverable: i === 0 ? 'surat penawaran harga proyek renovasi' : 'penawaran harga untuk klien korporat',
    created_at: `2026-06-0${i + 1}T10:00:00Z`,
  }))

  // ── stage 2: refinement pipeline (canned DeepSeek output) ────────────
  const refineDeps: LibraryRefineDeps = {
    readNoMatches: async () => signals,
    readAbortedFlows: async () => [],
    openProposalKeys: async () =>
      new Set([...proposals.values()]
        .filter((p) => p.status !== 'rejected' && p.status !== 'apply_failed')
        .map(() => 'occupied-key-not-matching')),
    bundleContext: async (slug) => {
      const tarGz = storage.get(`bundles/${slug}/2.2.0.tar.gz`)
      if (!tarGz) return null
      const entries = parseTar(await gunzipBytes(tarGz))
      const m = JSON.parse(entries.find((e) => e.path === 'manifest.json')!.content)
      return {
        templateIds: m.templates.map((x: { id: string }) => x.id),
        skillIds: m.skills.map((x: { id: string }) => x.id),
        skillMd: (id: string) => entries.find((e) => e.path === `skills/${id}/SKILL.md`)?.content ?? null,
      }
    },
    resolvePlaybookPersona: async () => null,
    llm: async () =>
      JSON.stringify({
        template_id: 'surat-penawaran-harga.md',
        template_kind: 'document',
        description_id: 'Kerangka surat penawaran harga siap isi untuk klien kamu.',
        content: TEMPLATE_CONTENT,
      }),
    insertProposal: async (p: LibraryProposalInsert) => {
      const id = `prop-${++idCounter}`
      proposals.set(id, {
        id,
        kind: p.kind,
        persona_slug: p.persona_slug,
        target_id: p.target_id,
        draft: p.draft,
        status: 'pending',
      })
    },
    log: () => {},
  }

  let proposalId = ''
  await t.test('refine queues ONE gated proposal with customer-count evidence', async () => {
    const result = await libraryRefineHandler(refineDeps)
    assert.equal(result.queued, 1)
    assert.equal(result.dropped_invalid, 0)
    assert.equal(proposals.size, 1)
    proposalId = [...proposals.keys()][0]
    const p = proposals.get(proposalId)!
    assert.equal(p.status, 'pending', 'nothing ships without the founder')
    assert.equal(p.target_id, 'surat-penawaran-harga.md')
    // Nothing has touched storage yet.
    assert.equal(storage.size, 1)
  })

  // ── stage 3: founder approves in the admin tab ───────────────────────
  const applyDeps: ApplyDeps = {
    getProposal: async (id) => proposals.get(id) ?? null,
    setProposalStatus: async (id, status, extra) => {
      const p = proposals.get(id)!
      proposals.set(id, { ...p, status })
      if (extra?.applied_version) (p as { applied_version?: string }).applied_version = extra.applied_version
    },
    listBundleVersions: async (slug) =>
      [...storage.keys()]
        .filter((k) => k.startsWith(`bundles/${slug}/`))
        .map((k) => k.split('/').pop()!),
    downloadBundle: async (slug, version) => storage.get(`bundles/${slug}/${version}.tar.gz`) ?? null,
    uploadBundle: async (slug, version, tarGz) => {
      const key = `bundles/${slug}/${version}.tar.gz`
      if (storage.has(key)) return { ok: false, error: 'version exists (immutable)' }
      storage.set(key, tarGz)
      return { ok: true }
    },
    broadcast: async (slug, version) => {
      broadcasts.push({ slug, version })
      return { ok: true }
    },
  }

  await t.test('approve patches the bundle, bumps version, broadcasts', async () => {
    const result = await libraryProposalApply({ id: proposalId, decision: 'approve' }, applyDeps)
    assert.equal(result.ok, true)
    if (!result.ok) return
    const body = result.body as { applied_version: string }
    assert.equal(body.applied_version, '2.2.1')
    assert.deepEqual(broadcasts, [{ slug: PERSONA, version: '2.2.1' }])
    assert.equal(proposals.get(proposalId)!.status, 'applied')
  })

  // ── stage 4: the shipped version is what customers now pull ──────────
  await t.test('the new version is latest-resolvable and carries the improvement, gate-clean', async () => {
    const versions = [...storage.keys()]
      .filter((k) => k.startsWith(`bundles/${PERSONA}/`))
      .map((k) => k.split('/').pop()!)
    assert.equal(pickLatestSemver(versions), '2.2.1', 'bundle-fetch latest policy resolves the patch')

    const entries = parseTar(await gunzipBytes(storage.get(`bundles/${PERSONA}/2.2.1.tar.gz`)!))
    const byPath = new Map(entries.map((e) => [e.path, e.content]))
    assert.equal(byPath.get('templates/surat-penawaran-harga.md'), TEMPLATE_CONTENT)
    const newManifest = JSON.parse(byPath.get('manifest.json')!)
    assert.equal(validateManifest(newManifest).ok, true)
    assert.deepEqual(brandVoiceViolations('shipped template', TEMPLATE_CONTENT), [])
    // The original curated template survives untouched.
    assert.match(byPath.get('templates/surat-resmi.md')!, /kerangka surat resmi/)
  })

  // ── stage 5: the loop closes — the same cluster no longer re-drafts ──
  await t.test('a second refine run dedupes against the applied proposal', async () => {
    const dedupedDeps: LibraryRefineDeps = {
      ...refineDeps,
      openProposalKeys: async () => new Set([`template_no_match ${PERSONA} surat-bisnis`]),
    }
    const result = await libraryRefineHandler(dedupedDeps)
    assert.equal(result.skipped_open_proposal, 1)
    assert.equal(result.queued, 0)
  })
})
