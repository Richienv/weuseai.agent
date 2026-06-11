/**
 * Self-Improving Library — signal aggregation, draft quality gate,
 * bundle patcher, refinement pipeline, and the founder apply path.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  aggregateNoMatches,
  aggregateDeadEnds,
  type NoMatchRow,
  type AbortedFlowRow,
} from '../supabase/functions/_shared/library-signals.ts'
import {
  validateLibraryDraft,
  type TemplateDraft,
  type PlaybookFixDraft,
} from '../supabase/functions/_shared/library-draft-validator.ts'
import {
  patchBundleTarGz,
  bumpPatchVersion,
} from '../supabase/functions/_shared/library-bundle-patch.ts'
import {
  libraryRefineHandler,
  noMatchDedupKey,
  type LibraryRefineDeps,
  type LibraryProposalInsert,
} from '../supabase/functions/_shared/library-refine-handler.ts'
import {
  libraryProposalApply,
  type ApplyDeps,
  type LibraryProposalRow,
} from '../supabase/functions/_shared/library-proposal-apply-handler.ts'
import { buildTarGz, parseTar, gunzipBytes } from '../supabase/functions/_shared/tar-gz.ts'
import { validateManifest } from '../supabase/functions/_shared/manifest-validator.ts'

// ─── fixtures ────────────────────────────────────────────────────────────

function noMatch(over: Partial<NoMatchRow> = {}): NoMatchRow {
  return {
    customer_id: 'cust-1',
    persona_slug: 'doc-expert',
    skill_id: 'surat-bisnis',
    requested_deliverable: 'surat penawaran harga untuk klien korporat',
    created_at: '2026-06-01T10:00:00Z',
    ...over,
  }
}

function aborted(over: Partial<AbortedFlowRow> = {}): AbortedFlowRow {
  return {
    customer_id: 'cust-1',
    playbook_id: 'project-orchestration',
    current_step: 4,
    total_steps: 6,
    updated_at: '2026-06-02T10:00:00Z',
    ...over,
  }
}

const GOOD_TEMPLATE_CONTENT = `# Surat Penawaran Harga — {nama_klien}

Tanggal: {tanggal}

Kepada {nama_klien},

| Item | Qty | Harga satuan | Subtotal |
|---|---|---|---|
| {item_1} | {qty_1} | {harga_1} | {subtotal_1} |

Total: {total}
Berlaku sampai: {masa_berlaku}

Hormat kami,
{nama_pengirim}
`

const CURATED_MANIFEST = {
  agent_slug: 'doc-expert',
  version: '2.2.0',
  description_id: 'Bundle skill + template Doc Expert untuk test.',
  self_extend: false,
  extension_dir: '/var/lib/weuseai/extensions',
  skills: [
    {
      id: 'surat-bisnis',
      description_id: 'Draft surat bisnis formal dalam Bahasa Indonesia.',
      execution: 'hermes-skill',
      handler_ref: 'hermes-skill:surat-bisnis',
      enabled_for_tiers: ['starter', 'pro', 'studio'],
      templates_used: ['surat-resmi.md'],
    },
  ],
  templates: [
    { id: 'surat-resmi.md', kind: 'document', description_id: 'Kerangka surat resmi siap isi.' },
  ],
}

async function curatedTarGz(): Promise<Uint8Array> {
  return await buildTarGz([
    { path: 'manifest.json', content: JSON.stringify(CURATED_MANIFEST, null, 2) + '\n' },
    { path: 'SKILL.md', content: '# Doc Expert — persona shell untuk test, isi cukup panjang di sini.' },
    { path: 'skills/surat-bisnis/SKILL.md', content: '# surat-bisnis\n\n## Yang dilakukan\n\nDraft surat bisnis dengan template yang tersedia, dalam Bahasa Indonesia, ringkas dan sopan untuk kamu.\n'.repeat(3) },
    { path: 'templates/surat-resmi.md', content: '# Surat Resmi\n\n{tanggal}\n{isi}\n{penutup}\n — kerangka surat resmi.' },
  ])
}

// ─── signal aggregation ──────────────────────────────────────────────────

test('no-match aggregation: clusters by persona+skill, counts distinct customers, dedupes samples', () => {
  const rows = [
    noMatch(),
    noMatch({ customer_id: 'cust-2', requested_deliverable: 'penawaran harga jasa desain' }),
    noMatch({ customer_id: 'cust-2', requested_deliverable: 'penawaran harga jasa desain' }),
    noMatch({ persona_slug: 'slide-master', skill_id: 'deck', customer_id: 'cust-9' }),
  ]
  const clusters = aggregateNoMatches(rows)
  assert.equal(clusters.length, 1, 'slide-master single event stays under both floors')
  assert.equal(clusters[0].persona_slug, 'doc-expert')
  assert.equal(clusters[0].events, 3)
  assert.equal(clusters[0].distinct_customers, 2)
  assert.equal(clusters[0].sample_deliverables.length, 2, 'duplicate labels deduped')
})

test('dead-end aggregation: clusters by playbook+step', () => {
  const rows = [
    aborted(),
    aborted({ customer_id: 'cust-2' }),
    aborted({ customer_id: 'cust-3', current_step: 2 }),
  ]
  const clusters = aggregateDeadEnds(rows)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].step, 4)
  assert.equal(clusters[0].distinct_customers, 2)
})

test('PRIVACY: aggregates carry only ids/counts/labels — no state_data, no message bodies', () => {
  const cluster = aggregateNoMatches([noMatch(), noMatch({ customer_id: 'cust-2' })])[0]
  const keys = Object.keys(cluster).sort()
  assert.deepEqual(keys, [
    'distinct_customers', 'events', 'first_seen', 'kind', 'last_seen',
    'persona_slug', 'sample_deliverables', 'skill_id',
  ])
  // And the dead-end row type structurally cannot carry state_data: the
  // reader selects only the five aggregate columns (pinned in the entry).
  const deadKeys = Object.keys(aggregateDeadEnds([aborted(), aborted({ customer_id: 'c2' })])[0]).sort()
  assert.ok(!deadKeys.includes('state_data'))
})

// ─── draft gate ──────────────────────────────────────────────────────────

const CTX = { existingTemplateIds: ['surat-resmi.md'], existingSkillIds: ['surat-bisnis'] }

test('gate: a clean template draft passes', () => {
  const draft: TemplateDraft = {
    kind: 'new_template',
    persona_slug: 'doc-expert',
    template_id: 'surat-penawaran-harga.md',
    template_kind: 'document',
    description_id: 'Kerangka surat penawaran harga siap isi untuk klien.',
    content: GOOD_TEMPLATE_CONTENT,
  }
  assert.deepEqual(validateLibraryDraft(draft, CTX), { ok: true })
})

test('gate: banned word, exclamation, Anda, thin content, duplicate id — all rejected', () => {
  const base: TemplateDraft = {
    kind: 'new_template',
    persona_slug: 'doc-expert',
    template_id: 'surat-penawaran-harga.md',
    template_kind: 'document',
    description_id: 'Kerangka surat penawaran harga siap isi.',
    content: GOOD_TEMPLATE_CONTENT,
  }
  const cases: Array<[string, TemplateDraft]> = [
    ['banned word', { ...base, content: base.content + '\nIni template yang revolutionary.' }],
    ['exclamation', { ...base, content: base.content + '\nSemangat!' }],
    ['Anda', { ...base, content: base.content + '\nTerima kasih atas perhatian Anda.' }],
    ['thin', { ...base, content: 'pendek' }],
    ['duplicate id', { ...base, template_id: 'surat-resmi.md' }],
  ]
  for (const [label, draft] of cases) {
    assert.equal(validateLibraryDraft(draft, CTX).ok, false, `${label} must be rejected`)
  }
})

test('gate: playbook fix must keep its step section and target a real skill', () => {
  const good: PlaybookFixDraft = {
    kind: 'playbook_fix',
    persona_slug: 'doc-expert',
    skill_id: 'surat-bisnis',
    rationale_id: 'Langkah 2 sering buntu saat customer tidak menjawab; tambah jalan keluar.',
    revised_skill_md: '# surat-bisnis\n\n## Yang dilakukan\n\nLangkah yang lebih jelas dengan jalan keluar saat customer diam, dalam Bahasa Indonesia untuk kamu.\n'.repeat(5),
  }
  assert.deepEqual(validateLibraryDraft(good, CTX), { ok: true })
  assert.equal(
    validateLibraryDraft({ ...good, skill_id: 'tidak-ada' }, CTX).ok,
    false,
    'missing target rejected',
  )
  assert.equal(
    validateLibraryDraft({ ...good, revised_skill_md: 'tipis sekali '.repeat(40) }, CTX).ok,
    false,
    'lost step section rejected',
  )
})

// ─── bundle patcher ──────────────────────────────────────────────────────

test('patch: new template lands in tarball + manifest, version bumps, manifest stays valid', async () => {
  const draft: TemplateDraft = {
    kind: 'new_template',
    persona_slug: 'doc-expert',
    template_id: 'surat-penawaran-harga.md',
    template_kind: 'document',
    description_id: 'Kerangka surat penawaran harga siap isi untuk klien.',
    content: GOOD_TEMPLATE_CONTENT,
  }
  const result = await patchBundleTarGz(await curatedTarGz(), draft)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.newVersion, '2.2.1')
  const entries = parseTar(await gunzipBytes(result.tarGz))
  const byPath = new Map(entries.map((e) => [e.path, e.content]))
  assert.equal(byPath.get('templates/surat-penawaran-harga.md'), GOOD_TEMPLATE_CONTENT)
  const manifest = JSON.parse(byPath.get('manifest.json')!)
  assert.equal(manifest.version, '2.2.1')
  const entry = manifest.templates.find((t: { id: string }) => t.id === 'surat-penawaran-harga.md')
  assert.equal(entry.source, 'customer-grown')
  assert.equal(validateManifest(manifest).ok, true, 'patched manifest passes the curated gate')
  // Untouched files survive byte-for-byte.
  assert.ok(byPath.get('templates/surat-resmi.md')!.includes('kerangka surat resmi'))
})

test('patch: playbook fix replaces the SKILL.md whole-file', async () => {
  const draft: PlaybookFixDraft = {
    kind: 'playbook_fix',
    persona_slug: 'doc-expert',
    skill_id: 'surat-bisnis',
    rationale_id: 'Perjelas langkah.',
    revised_skill_md: '# surat-bisnis (revisi)\n\n## Yang dilakukan\n\nVersi revisi.\n',
  }
  const result = await patchBundleTarGz(await curatedTarGz(), draft)
  assert.equal(result.ok, true)
  if (!result.ok) return
  const entries = parseTar(await gunzipBytes(result.tarGz))
  const skill = entries.find((e) => e.path === 'skills/surat-bisnis/SKILL.md')!
  assert.match(skill.content, /revisi/)
})

test('patch: wrong-persona draft refused (tenant/bundle mismatch)', async () => {
  const draft: TemplateDraft = {
    kind: 'new_template',
    persona_slug: 'slide-master',
    template_id: 'x.md',
    template_kind: 'document',
    description_id: 'Deskripsi cukup panjang di sini.',
    content: GOOD_TEMPLATE_CONTENT,
  }
  const result = await patchBundleTarGz(await curatedTarGz(), draft)
  assert.equal(result.ok, false)
})

test('bumpPatchVersion: 2.2.0→2.2.1, garbage→1.0.1', () => {
  assert.equal(bumpPatchVersion('2.2.0'), '2.2.1')
  assert.equal(bumpPatchVersion('weird'), '1.0.1')
})

// ─── refinement pipeline ─────────────────────────────────────────────────

function refineDeps(opts: {
  llmResponse?: string
  openKeys?: string[]
  rows?: NoMatchRow[]
}): { deps: LibraryRefineDeps; inserted: LibraryProposalInsert[]; logs: string[] } {
  const inserted: LibraryProposalInsert[] = []
  const logs: string[] = []
  const deps: LibraryRefineDeps = {
    readNoMatches: async () =>
      opts.rows ?? [noMatch(), noMatch({ customer_id: 'cust-2' }), noMatch({ customer_id: 'cust-3' })],
    readAbortedFlows: async () => [],
    openProposalKeys: async () => new Set(opts.openKeys ?? []),
    bundleContext: async () => ({
      templateIds: ['surat-resmi.md'],
      skillIds: ['surat-bisnis'],
      skillMd: () => null,
    }),
    resolvePlaybookPersona: async () => null,
    llm: async () =>
      opts.llmResponse ??
      JSON.stringify({
        template_id: 'surat-penawaran-harga.md',
        template_kind: 'document',
        description_id: 'Kerangka surat penawaran harga siap isi untuk klien.',
        content: GOOD_TEMPLATE_CONTENT,
      }),
    insertProposal: async (p) => { inserted.push(p) },
    log: (m) => logs.push(m),
  }
  return { deps, inserted, logs }
}

test('refine: hot cluster → validated draft → queued proposal with evidence', async () => {
  const { deps, inserted } = refineDeps({})
  const result = await libraryRefineHandler(deps)
  assert.equal(result.queued, 1)
  assert.equal(result.dropped_invalid, 0)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].kind, 'new_template')
  assert.equal(inserted[0].persona_slug, 'doc-expert')
  const ev = inserted[0].evidence as { events: number; distinct_customers: number }
  assert.equal(ev.events, 3)
  assert.equal(ev.distinct_customers, 3)
})

test('refine: gate failure is DROPPED with a log, never queued', async () => {
  const { deps, inserted, logs } = refineDeps({
    llmResponse: JSON.stringify({
      template_id: 'surat-penawaran-harga.md',
      template_kind: 'document',
      description_id: 'Kerangka surat penawaran harga siap isi.',
      content: 'Template revolutionary yang game-changer banget untuk Anda!',
    }),
  })
  const result = await libraryRefineHandler(deps)
  assert.equal(result.queued, 0)
  assert.equal(result.dropped_invalid, 1)
  assert.equal(inserted.length, 0)
  assert.ok(logs.some((l) => l.includes('DROPPED (gate)')))
})

test('refine: existing open proposal dedupes the cluster (no second LLM call)', async () => {
  const key = noMatchDedupKey({
    kind: 'template_no_match',
    persona_slug: 'doc-expert',
    skill_id: 'surat-bisnis',
    events: 3,
    distinct_customers: 3,
    sample_deliverables: [],
    first_seen: '',
    last_seen: '',
  })
  const { deps, inserted } = refineDeps({ openKeys: [key] })
  const result = await libraryRefineHandler(deps)
  assert.equal(result.skipped_open_proposal, 1)
  assert.equal(result.drafted, 0)
  assert.equal(inserted.length, 0)
})

test('refine: under-threshold signals produce nothing', async () => {
  const { deps, inserted } = refineDeps({ rows: [noMatch()] })
  const result = await libraryRefineHandler(deps)
  assert.equal(result.clusters_seen, 0)
  assert.equal(inserted.length, 0)
})

// ─── apply (founder decision) ────────────────────────────────────────────

function applyDeps(opts: { uploadFails?: boolean } = {}) {
  const uploads = new Map<string, Uint8Array>()
  const statuses: Array<{ status: string; extra?: unknown }> = []
  const broadcasts: Array<{ slug: string; version: string }> = []
  let proposal: LibraryProposalRow = {
    id: 'prop-1',
    kind: 'new_template',
    persona_slug: 'doc-expert',
    target_id: 'surat-penawaran-harga.md',
    draft: {
      kind: 'new_template',
      persona_slug: 'doc-expert',
      template_id: 'surat-penawaran-harga.md',
      template_kind: 'document',
      description_id: 'Kerangka surat penawaran harga siap isi untuk klien.',
      content: GOOD_TEMPLATE_CONTENT,
    },
    status: 'pending',
  }
  const deps: ApplyDeps = {
    getProposal: async (id) => (id === 'prop-1' ? proposal : null),
    setProposalStatus: async (_id, status, extra) => {
      statuses.push({ status, extra })
      proposal = { ...proposal, status }
    },
    listBundleVersions: async () => ['2.1.0.tar.gz', '2.2.0.tar.gz'],
    downloadBundle: async (_slug, version) =>
      version === '2.2.0' ? await curatedTarGz() : null,
    uploadBundle: async (slug, version, tarGz) => {
      if (opts.uploadFails) return { ok: false, error: 'storage down' }
      uploads.set(`${slug}/${version}`, tarGz)
      return { ok: true }
    },
    broadcast: async (slug, version) => {
      broadcasts.push({ slug, version })
      return { ok: true }
    },
  }
  return { deps, uploads, statuses, broadcasts }
}

test('approve: patches LATEST version, uploads bump, marks applied, broadcasts', async () => {
  const { deps, uploads, statuses, broadcasts } = applyDeps()
  const result = await libraryProposalApply({ id: 'prop-1', decision: 'approve' }, deps)
  assert.equal(result.ok, true)
  if (!result.ok) return
  const body = result.body as { applied_version: string; broadcast_ok: boolean }
  assert.equal(body.applied_version, '2.2.1')
  assert.equal(body.broadcast_ok, true)
  assert.ok(uploads.has('doc-expert/2.2.1'))
  assert.deepEqual(broadcasts, [{ slug: 'doc-expert', version: '2.2.1' }])
  assert.equal(statuses.at(-1)?.status, 'applied')
})

test('reject: marks rejected, nothing uploaded, nothing broadcast', async () => {
  const { deps, uploads, broadcasts, statuses } = applyDeps()
  const result = await libraryProposalApply({ id: 'prop-1', decision: 'reject' }, deps)
  assert.equal(result.ok, true)
  assert.equal(uploads.size, 0)
  assert.equal(broadcasts.length, 0)
  assert.equal(statuses.at(-1)?.status, 'rejected')
})

test('approve is idempotent-safe: an already-decided proposal returns 409', async () => {
  const { deps } = applyDeps()
  await libraryProposalApply({ id: 'prop-1', decision: 'reject' }, deps)
  const second = await libraryProposalApply({ id: 'prop-1', decision: 'approve' }, deps)
  assert.equal(second.ok, false)
  if (second.ok) return
  assert.equal(second.status, 409)
})

test('approve: upload failure → apply_failed, no broadcast', async () => {
  const { deps, broadcasts, statuses } = applyDeps({ uploadFails: true })
  const result = await libraryProposalApply({ id: 'prop-1', decision: 'approve' }, deps)
  assert.equal(result.ok, false)
  assert.equal(broadcasts.length, 0)
  assert.equal(statuses.at(-1)?.status, 'apply_failed')
})
