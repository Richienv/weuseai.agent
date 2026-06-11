// Agent Mesh — orchestration contract (Mission 3, 2026-06-11).
//
// Spec: docs/specs/2026-06-11-mission3-build-spec.md
// Capability map: docs/specs/2026-06-11-upstream-capability-map.md
//
// The EXECUTION primitive is upstream (Hermes v0.13 `delegate_task` —
// agent-native, parallel batch ≤3, fresh child context). What lives at OUR
// layer is the POLICY, defined here as pure functions so it is testable
// and so the conductor SKILL.md prose is pinned to it by drift tests:
//
//   1. gateMeshPlan   — delegation may only target personas the customer's
//                       tier includes (the VPS's WEUSEAI_AGENT_SLUGS env is
//                       that list — written at provision from
//                       tier-personas.ts, the source of truth).
//   2. assembleMeshDeliverable — one coherent Bahasa deliverable: sections
//                       per sub-output, a short "siapa mengerjakan apa"
//                       summary, and HONEST notes for anything failed,
//                       timed out, or tier-blocked. Never a silent stall.
//
// The out-of-tier message is customer-facing copy — drafted here as the
// single source, FLAGGED FOR FOUNDER REVIEW (see MESH_COPY_REVIEW note).

import { PERSONA_META } from './tier-personas.ts'
import { KNOWN_PERSONA_SLUGS } from './manifest-validator.ts'

// ─── types ───────────────────────────────────────────────────────────────

export type MeshSubtask = {
  id: string
  /** Persona slug the conductor wants to delegate to. */
  persona_slug: string
  /** One-paragraph Bahasa brief for the sub-agent. */
  brief: string
}

export type MeshPlan = {
  goal: string
  subtasks: MeshSubtask[]
}

export type MeshSubResult = {
  id: string
  persona_slug: string
  status: 'ok' | 'failed' | 'timeout'
  /** The sub-agent's deliverable (markdown). Present when status==='ok'. */
  output?: string
  /** Short failure context (never raw stack traces). */
  note?: string
}

export type BlockedSubtask = {
  subtask: MeshSubtask
  /** The customer-facing line explaining the tier gap. */
  copy: string
}

// ─── copy (FOUNDER REVIEW) ───────────────────────────────────────────────

/**
 * CUSTOMER-FACING COPY — FLAGGED FOR FOUNDER REVIEW (Mission 3 brief:
 * "the exact wording of that message is customer-facing copy: draft it,
 * but flag it for founder review before it ships").
 *
 * Status: DRAFT. Shipped verbatim into the conductor SKILL.md (drift-
 * pinned) so there is exactly one place to edit after review.
 */
export function meshOutOfTierCopy(personaName: string): string {
  return (
    `Satu bagian rencana ini butuh persona ${personaName}, yang belum termasuk paket kamu. ` +
    `Bagian lain tetap aku kerjakan — hasilnya di bawah. ` +
    `Kalau bagian itu penting, persona ${personaName} tersedia di paket yang lebih lengkap.`
  )
}

/** Marker the drift test uses to assert the copy stays founder-flagged. */
export const MESH_COPY_REVIEW = 'FOUNDER REVIEW'

// ─── plan validation + tier gate ─────────────────────────────────────────

export type MeshPlanValidation = { ok: true } | { ok: false; errors: string[] }

export function validateMeshPlan(plan: MeshPlan): MeshPlanValidation {
  const errors: string[] = []
  if (!plan.goal || plan.goal.trim().length < 5) errors.push('goal missing/too short')
  if (!Array.isArray(plan.subtasks) || plan.subtasks.length === 0) {
    errors.push('subtasks empty')
  } else {
    const ids = new Set<string>()
    for (const st of plan.subtasks) {
      if (!st.id || ids.has(st.id)) errors.push(`subtask id missing/duplicate: "${st.id}"`)
      ids.add(st.id)
      if (!(KNOWN_PERSONA_SLUGS as readonly string[]).includes(st.persona_slug)) {
        errors.push(`subtask "${st.id}": unknown persona slug "${st.persona_slug}"`)
      }
      if (st.persona_slug === 'project-conductor') {
        // No self-delegation — the conductor never spawns itself (loop guard,
        // same rule the router prose has always had).
        errors.push(`subtask "${st.id}": conductor must not delegate to itself`)
      }
      if (!st.brief || st.brief.trim().length < 10) {
        errors.push(`subtask "${st.id}": brief missing/too thin`)
      }
    }
    if (plan.subtasks.length > 8) errors.push('more than 8 subtasks — split the project')
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}

export type GatedMeshPlan = {
  runnable: MeshSubtask[]
  blocked: BlockedSubtask[]
}

/**
 * The delegation tier gate. `allowedSlugs` is the customer's tier persona
 * list — on a VPS that is exactly the WEUSEAI_AGENT_SLUGS env (CSV),
 * provisioned from tier-personas.ts. Anything outside it is BLOCKED with
 * the customer-facing copy; the mesh runs what it can.
 */
export function gateMeshPlan(plan: MeshPlan, allowedSlugs: readonly string[]): GatedMeshPlan {
  const allowed = new Set(allowedSlugs)
  const runnable: MeshSubtask[] = []
  const blocked: BlockedSubtask[] = []
  for (const st of plan.subtasks) {
    if (allowed.has(st.persona_slug)) {
      runnable.push(st)
    } else {
      const name = PERSONA_META[st.persona_slug]?.name ?? st.persona_slug
      blocked.push({ subtask: st, copy: meshOutOfTierCopy(name) })
    }
  }
  return { runnable, blocked }
}

// ─── assembly ────────────────────────────────────────────────────────────

function personaName(slug: string): string {
  return PERSONA_META[slug]?.name ?? slug
}

/**
 * Assemble sub-results into ONE coherent Bahasa deliverable:
 *   - a section per successful sub-output,
 *   - "Siapa mengerjakan apa" (the who-did-what summary),
 *   - honest notes for failures/timeouts (partial deliverable, never a
 *     silent stall) and tier-blocked steps (the flagged copy).
 *
 * Brand rules hold (kamu register comes from the surrounding agent voice;
 * this scaffold itself carries zero exclamation marks and no banned words —
 * pinned by tests via brandVoiceViolations).
 */
export function assembleMeshDeliverable(
  goal: string,
  results: MeshSubResult[],
  blocked: BlockedSubtask[],
): string {
  const ok = results.filter((r) => r.status === 'ok')
  const failed = results.filter((r) => r.status !== 'ok')

  const parts: string[] = []
  parts.push(`# ${goal.trim()}`)
  parts.push('')

  for (const r of ok) {
    parts.push(`## ${personaName(r.persona_slug)} — ${r.id}`)
    parts.push('')
    parts.push((r.output ?? '').trim())
    parts.push('')
  }

  parts.push('## Siapa mengerjakan apa')
  parts.push('')
  for (const r of ok) {
    parts.push(`- ${personaName(r.persona_slug)}: ${r.id} — selesai.`)
  }
  for (const r of failed) {
    const why = r.status === 'timeout' ? 'kehabisan waktu' : 'belum berhasil'
    parts.push(`- ${personaName(r.persona_slug)}: ${r.id} — ${why}${r.note ? ` (${r.note})` : ''}.`)
  }
  for (const b of blocked) {
    parts.push(`- ${personaName(b.subtask.persona_slug)}: ${b.subtask.id} — tidak termasuk paket kamu.`)
  }
  parts.push('')

  if (failed.length > 0 || blocked.length > 0) {
    parts.push('## Catatan jujur')
    parts.push('')
    for (const r of failed) {
      const why = r.status === 'timeout' ? 'kehabisan waktu' : 'gagal di tengah jalan'
      parts.push(
        `- Bagian "${r.id}" ${why}. Hasil di atas tetap bisa dipakai; bilang saja kalau mau aku coba ulang bagian itu.`,
      )
    }
    for (const b of blocked) {
      parts.push(`- ${b.copy}`)
    }
    parts.push('')
  }

  return parts.join('\n')
}
