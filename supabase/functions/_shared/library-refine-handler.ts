// Self-Improving Library — refinement pipeline (Mission 3).
//
// Scheduled (weekly cron). Reads the aggregated usage signals, drafts
// concrete library improvements with DeepSeek in the curated-library
// format, runs every draft through the quality gate, and queues the
// survivors as PENDING proposals for the founder. Nothing in this pipeline
// can reach a customer bundle — only the founder's explicit approval (the
// apply handler) ships anything. Drafts that fail the gate are dropped
// with a log, never queued.

import {
  aggregateNoMatches,
  aggregateDeadEnds,
  DEFAULT_THRESHOLDS,
  type NoMatchRow,
  type AbortedFlowRow,
  type NoMatchCluster,
  type DeadEndCluster,
  type SignalThresholds,
} from './library-signals.ts'
import {
  validateLibraryDraft,
  type LibraryDraft,
  type TemplateDraft,
  type PlaybookFixDraft,
} from './library-draft-validator.ts'
import { BRAND_RULES, type LlmComplete } from './persona-genesis-generator.ts'

// ─── proposal row ────────────────────────────────────────────────────────

export type LibraryProposalInsert = {
  kind: LibraryDraft['kind']
  persona_slug: string
  /** template_id or skill_id, per kind. */
  target_id: string
  /** The validated draft, verbatim (applied later by the apply handler). */
  draft: LibraryDraft
  /** The triggering signal — the founder's evidence. */
  evidence: NoMatchCluster | DeadEndCluster
  /** Stable dedup key so one hot cluster yields one open proposal. */
  dedup_key: string
}

export type LibraryRefineDeps = {
  readNoMatches(windowDays: number): Promise<NoMatchRow[]>
  readAbortedFlows(windowDays: number): Promise<AbortedFlowRow[]>
  /** Dedup keys of proposals currently pending/approved (not rejected). */
  openProposalKeys(): Promise<Set<string>>
  /** Current bundle context for a persona (template ids, skill ids, and a
   *  skill's current SKILL.md for playbook fixes). Null = no bundle. */
  bundleContext(personaSlug: string): Promise<{
    templateIds: string[]
    skillIds: string[]
    skillMd(skillId: string): string | null
  } | null>
  /** Which persona's bundle carries this playbook skill. */
  resolvePlaybookPersona(playbookId: string): Promise<string | null>
  llm: LlmComplete
  insertProposal(p: LibraryProposalInsert): Promise<void>
  log(msg: string): void
  thresholds?: SignalThresholds
  windowDays?: number
  /** LLM-spend bound per run. */
  maxDraftsPerRun?: number
}

export type LibraryRefineResult = {
  clusters_seen: number
  skipped_open_proposal: number
  drafted: number
  queued: number
  dropped_invalid: number
}

// ─── prompts ─────────────────────────────────────────────────────────────

export function buildTemplateDraftPrompt(
  cluster: NoMatchCluster,
  existingTemplateIds: readonly string[],
): { system: string; user: string } {
  return {
    system:
      `Kamu menulis SATU template library baru untuk persona "${cluster.persona_slug}" di weuseai.agent. ` +
      `Template = kerangka dokumen markdown siap-isi dengan placeholder kurung kurawal ({tanggal}, {nama_klien}). ` +
      `Format harus sama dengan library kurasi.\n\n${BRAND_RULES}\n\n` +
      `Balas HANYA JSON valid:\n` +
      `{"template_id": "<nama-file-kebab.md, BELUM ada di daftar existing>",\n` +
      ` "template_kind": "document"|"checklist"|"briefing",\n` +
      ` "description_id": "1-2 kalimat Bahasa",\n` +
      ` "content": "<isi markdown template, substansial>"}`,
    user:
      `Sinyal dari pemakaian nyata: skill "${cluster.skill_id}" persona "${cluster.persona_slug}" ` +
      `tidak menemukan template yang cocok ${cluster.events} kali dari ${cluster.distinct_customers} customer berbeda.\n` +
      `Permintaan customer (label singkat):\n${cluster.sample_deliverables.map((s) => `- ${s}`).join('\n')}\n\n` +
      `Template yang SUDAH ada (jangan duplikasi):\n${existingTemplateIds.map((t) => `- ${t}`).join('\n') || '- (kosong)'}\n\n` +
      `Tulis SATU template yang menutup kebutuhan paling umum dari permintaan-permintaan itu.`,
  }
}

export function buildPlaybookFixPrompt(
  cluster: DeadEndCluster,
  currentSkillMd: string,
): { system: string; user: string } {
  return {
    system:
      `Kamu merevisi SKILL.md sebuah playbook di weuseai.agent. Playbook ini sering mati di satu langkah — ` +
      `perbaiki INSTRUKSI langkah itu (lebih jelas, jalan keluar saat customer diam, validasi yang tidak buntu) ` +
      `tanpa mengubah struktur playbook, jumlah langkah, format flow-state, atau bagian lain yang sudah jalan.\n\n${BRAND_RULES}\n\n` +
      `Balas HANYA JSON valid:\n` +
      `{"rationale_id": "1-3 kalimat Bahasa: apa yang diperbaiki dan kenapa",\n` +
      ` "revised_skill_md": "<SELURUH isi SKILL.md hasil revisi, utuh>"}`,
    user:
      `Sinyal: playbook "${cluster.playbook_id}" mati di langkah ${cluster.step} dari ${cluster.total_steps} ` +
      `sebanyak ${cluster.events} kali (${cluster.distinct_customers} customer berbeda).\n\n` +
      `SKILL.md saat ini:\n\n${currentSkillMd}`,
  }
}

// ─── pipeline ────────────────────────────────────────────────────────────

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const obj = JSON.parse(trimmed)
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function noMatchDedupKey(c: NoMatchCluster): string {
  return `template_no_match ${c.persona_slug} ${c.skill_id}`
}
export function deadEndDedupKey(c: DeadEndCluster): string {
  return `playbook_dead_end ${c.playbook_id} ${c.step}`
}

export async function libraryRefineHandler(deps: LibraryRefineDeps): Promise<LibraryRefineResult> {
  const windowDays = deps.windowDays ?? 30
  const maxDrafts = deps.maxDraftsPerRun ?? 5
  const thresholds = deps.thresholds ?? DEFAULT_THRESHOLDS

  const [noMatches, aborted, openKeys] = await Promise.all([
    deps.readNoMatches(windowDays),
    deps.readAbortedFlows(windowDays),
    deps.openProposalKeys(),
  ])
  const noMatchClusters = aggregateNoMatches(noMatches, thresholds)
  const deadEndClusters = aggregateDeadEnds(aborted, thresholds)

  const result: LibraryRefineResult = {
    clusters_seen: noMatchClusters.length + deadEndClusters.length,
    skipped_open_proposal: 0,
    drafted: 0,
    queued: 0,
    dropped_invalid: 0,
  }

  // No-match clusters → new-template drafts.
  for (const cluster of noMatchClusters) {
    if (result.drafted >= maxDrafts) break
    const key = noMatchDedupKey(cluster)
    if (openKeys.has(key)) {
      result.skipped_open_proposal++
      continue
    }
    const ctx = await deps.bundleContext(cluster.persona_slug)
    if (!ctx) {
      deps.log(`[library-refine] no bundle for ${cluster.persona_slug}; skipping cluster`)
      continue
    }
    const prompt = buildTemplateDraftPrompt(cluster, ctx.templateIds)
    result.drafted++
    let raw: string
    try {
      raw = await deps.llm({ ...prompt, stage: 'templates' })
    } catch (e) {
      deps.log(`[library-refine] LLM failed for ${key}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const obj = parseJson(raw)
    if (!obj) {
      result.dropped_invalid++
      deps.log(`[library-refine] DROPPED (not JSON) ${key}`)
      continue
    }
    const draft: TemplateDraft = {
      kind: 'new_template',
      persona_slug: cluster.persona_slug,
      template_id: String(obj.template_id ?? ''),
      template_kind: String(obj.template_kind ?? 'document'),
      description_id: String(obj.description_id ?? ''),
      content: String(obj.content ?? ''),
    }
    const v = validateLibraryDraft(draft, {
      existingTemplateIds: ctx.templateIds,
      existingSkillIds: ctx.skillIds,
    })
    if (!v.ok) {
      result.dropped_invalid++
      deps.log(`[library-refine] DROPPED (gate) ${key}: ${v.errors.join(' | ')}`)
      continue
    }
    await deps.insertProposal({
      kind: draft.kind,
      persona_slug: draft.persona_slug,
      target_id: draft.template_id,
      draft,
      evidence: cluster,
      dedup_key: key,
    })
    result.queued++
  }

  // Dead-end clusters → playbook-fix drafts.
  for (const cluster of deadEndClusters) {
    if (result.drafted >= maxDrafts) break
    const key = deadEndDedupKey(cluster)
    if (openKeys.has(key)) {
      result.skipped_open_proposal++
      continue
    }
    const personaSlug = await deps.resolvePlaybookPersona(cluster.playbook_id)
    if (!personaSlug) {
      deps.log(`[library-refine] playbook ${cluster.playbook_id} maps to no persona; skipping`)
      continue
    }
    const ctx = await deps.bundleContext(personaSlug)
    const currentMd = ctx?.skillMd(cluster.playbook_id) ?? null
    if (!ctx || !currentMd) {
      deps.log(`[library-refine] no SKILL.md for ${cluster.playbook_id}; skipping`)
      continue
    }
    const prompt = buildPlaybookFixPrompt(cluster, currentMd)
    result.drafted++
    let raw: string
    try {
      raw = await deps.llm({ ...prompt, stage: 'skills' })
    } catch (e) {
      deps.log(`[library-refine] LLM failed for ${key}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const obj = parseJson(raw)
    if (!obj) {
      result.dropped_invalid++
      deps.log(`[library-refine] DROPPED (not JSON) ${key}`)
      continue
    }
    const draft: PlaybookFixDraft = {
      kind: 'playbook_fix',
      persona_slug: personaSlug,
      skill_id: cluster.playbook_id,
      rationale_id: String(obj.rationale_id ?? ''),
      revised_skill_md: String(obj.revised_skill_md ?? ''),
    }
    const v = validateLibraryDraft(draft, {
      existingTemplateIds: ctx.templateIds,
      existingSkillIds: ctx.skillIds,
    })
    if (!v.ok) {
      result.dropped_invalid++
      deps.log(`[library-refine] DROPPED (gate) ${key}: ${v.errors.join(' | ')}`)
      continue
    }
    await deps.insertProposal({
      kind: draft.kind,
      persona_slug: personaSlug,
      target_id: cluster.playbook_id,
      draft,
      evidence: cluster,
      dedup_key: key,
    })
    result.queued++
  }

  return result
}
