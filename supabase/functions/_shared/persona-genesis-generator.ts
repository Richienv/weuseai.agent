// Persona Genesis — generation pipeline (LLM-agnostic, dependency-injected).
//
// Spec: docs/specs/2026-06-10-mission2-build-spec.md
//
// Three sequential LLM calls turn a customer's interview profile into a
// complete bespoke persona:
//   1. PLAN + SOUL  — persona identity + a plan of skills/templates
//   2. SKILLS       — SKILL.md for every planned skill + the persona shell
//   3. TEMPLATES    — every planned template's content
//
// The LLM is injected (`complete`), so the pipeline is fully testable with
// canned outputs and the production entry wires DeepSeek (`deepseek-chat`,
// JSON mode). DeepSeek is the locked default — see the spec's COGS section
// before considering anything stronger.
//
// Output quality is NOT trusted: everything passes
// validateGeneratedPersona() (structure + Bahasa + banned words) before a
// byte reaches Storage. This module's own parsing is strict — malformed
// LLM JSON throws GenesisGenerationError with stage context.

import type { Manifest, ManifestSkill, ManifestTemplate } from './manifest-validator.ts'
import type { GeneratedPersona, GeneratedFile } from './persona-genesis-validator.ts'

// ─── input ───────────────────────────────────────────────────────────────

export type GenesisProfile = {
  /** "Marketing manager di startup F&B di Bandung" */
  role: string
  /** Free text — what their days look like. */
  daily_tasks: string
  /** Deliverables they produce (laporan, deck, konten, ...). */
  outputs: string
  /** Tools they live in (Excel, Canva, Shopee seller center, ...). */
  tools: string
  /** What eats their time / frustrates them. */
  pain_points: string
}

export type LlmComplete = (args: {
  system: string
  user: string
  /** Caller hint for logging; the injected impl may ignore it. */
  stage: 'plan' | 'skills' | 'templates'
}) => Promise<string>

export class GenesisGenerationError extends Error {
  stage: string
  constructor(stage: string, message: string) {
    super(`[${stage}] ${message}`)
    this.stage = stage
  }
}

// ─── shared prompt scaffolding ──────────────────────────────────────────

export const BRAND_RULES = `ATURAN BAHASA (WAJIB, dilanggar = output ditolak):
- Bahasa Indonesia, sapa customer dengan "kamu" (JANGAN PERNAH "Anda", jangan lo/gue).
- NOL tanda seru di semua teks.
- Kata terlarang (jangan muncul sama sekali, dalam bahasa apa pun): basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level.
- Register calm-premium: tenang, presisi, tidak hype. Satu ide per kalimat.
- Istilah teknis (npm, API, Excel) boleh bahasa Inggris.
- Jangan mengarang kemampuan: agent TIDAK punya akses kalender, email, atau aplikasi customer. Yang ada: percakapan Telegram, ingatan percakapan, web, dan template yang dibundel.`

function profileBlock(p: GenesisProfile): string {
  return `PROFIL CUSTOMER (hasil wawancara):
- Peran: ${p.role}
- Tugas harian: ${p.daily_tasks}
- Output yang dibuat: ${p.outputs}
- Tools: ${p.tools}
- Yang makan waktu / bikin frustrasi: ${p.pain_points}`
}

// ─── stage 1: plan + SOUL ────────────────────────────────────────────────

export type GenesisPlan = {
  persona_name: string
  specialty_id: string
  soul_md: string
  skill_plan: Array<{ id: string; purpose_id: string; kind: 'skill' | 'playbook' }>
  template_plan: Array<{ id: string; kind: string; purpose_id: string }>
}

export function buildPlanPrompt(p: GenesisProfile): { system: string; user: string } {
  return {
    system:
      `Kamu adalah desainer persona untuk weuseai.agent — platform agent AI pribadi yang jalan di Telegram untuk profesional Indonesia. ` +
      `Tugasmu: dari profil customer, rancang SATU persona spesialis yang terasa dibuat khusus untuk pekerjaan mereka.\n\n${BRAND_RULES}\n\n` +
      `Balas HANYA dengan JSON valid (tanpa markdown fence) berbentuk:\n` +
      `{"persona_name": string (nama persona, 2-3 kata, boleh English),\n` +
      ` "specialty_id": string (1 kalimat Bahasa: spesialisasi persona),\n` +
      ` "soul_md": string (SOUL.md lengkap — lihat struktur di bawah),\n` +
      ` "skill_plan": [{"id": kebab-case, "purpose_id": 1 kalimat, "kind": "skill"|"playbook"}] (7-9 item, MINIMAL 1 playbook),\n` +
      ` "template_plan": [{"id": "nama-file.md", "kind": "document"|"checklist"|"briefing", "purpose_id": 1 kalimat}] (5-7 item)}\n\n` +
      `Struktur soul_md (markdown, pakai placeholder {customer_name}, {first_name}, {user_expectations_verbatim} apa adanya):\n` +
      `# About me — "I am <persona_name>, a specialist agent built for {customer_name} as part of weuseai.agent." lalu spesialisasi dalam Bahasa.\n` +
      `# How I communicate — Bahasa, "kamu", ringkas.\n` +
      `# Who I serve — {customer_name}, timezone Asia/Jakarta.\n` +
      `# What this customer expects from me — {user_expectations_verbatim}\n` +
      `# What I do — 4-6 bullet, SPESIFIK ke pekerjaan customer ini.\n` +
      `# How I behave — 3-5 bullet.\n` +
      `# Hard limits — minimal: tidak share API key/password/data ke pihak ketiga; tidak transaksi tanpa konfirmasi; tidak mengarang fakta.\n` +
      `# When my customer first messages me — sapaan pertama yang menyebut spesialisasi barunya.`,
    user: profileBlock(p) + '\n\nRancang personanya sekarang.',
  }
}

export function parsePlan(raw: string): GenesisPlan {
  const obj = parseJsonObject(raw, 'plan')
  const { persona_name, specialty_id, soul_md, skill_plan, template_plan } = obj as Partial<GenesisPlan>
  if (typeof persona_name !== 'string' || !persona_name.trim()) {
    throw new GenesisGenerationError('plan', 'persona_name missing')
  }
  if (typeof soul_md !== 'string' || soul_md.length < 200) {
    throw new GenesisGenerationError('plan', 'soul_md missing/too short')
  }
  if (!Array.isArray(skill_plan) || skill_plan.length < 1) {
    throw new GenesisGenerationError('plan', 'skill_plan missing')
  }
  if (!Array.isArray(template_plan) || template_plan.length < 1) {
    throw new GenesisGenerationError('plan', 'template_plan missing')
  }
  for (const s of skill_plan) {
    if (!/^[a-z][a-z0-9-]+$/.test(s?.id ?? '')) {
      throw new GenesisGenerationError('plan', `skill id "${s?.id}" not kebab-case`)
    }
  }
  return {
    persona_name: persona_name.trim(),
    specialty_id: String(specialty_id ?? '').trim(),
    soul_md,
    skill_plan: skill_plan.map((s) => ({
      id: s.id,
      purpose_id: String(s.purpose_id ?? ''),
      kind: s.kind === 'playbook' ? 'playbook' : 'skill',
    })),
    template_plan: template_plan.map((t) => ({
      id: String(t.id ?? '').trim(),
      kind: String(t.kind ?? 'document'),
      purpose_id: String(t.purpose_id ?? ''),
    })),
  }
}

// ─── stage 2: skills ─────────────────────────────────────────────────────

export type GeneratedSkills = {
  shell_skill_md: string
  skills: Array<{ id: string; description_id: string; skill_md: string; templates_used: string[] }>
}

export function buildSkillsPrompt(
  p: GenesisProfile,
  plan: GenesisPlan,
): { system: string; user: string } {
  return {
    system:
      `Kamu menulis SKILL.md untuk persona "${plan.persona_name}" di weuseai.agent. ` +
      `SKILL.md adalah instruksi internal untuk agent (dibaca LLM, bukan customer) tapi tetap mengikuti aturan bahasa karena potongannya bisa muncul di balasan.\n\n${BRAND_RULES}\n\n` +
      `Setiap SKILL.md berstruktur:\n` +
      `# <id> — Hermes skill\n## Kapan dipakai — trigger phrases Bahasa yang realistis\n## Yang harus diekstrak dari pesan customer — field + default\n## Yang dilakukan — langkah konkret. Kalau skill memakai template, instruksikan: "Baca template di /var/lib/weuseai/bundle/${plan ? '' : ''}<slug>/<version>/templates/<file> kalau tersedia, lalu isi dengan data customer." Untuk playbook: bagian "## Langkah-langkah" berisi langkah bernomor dengan gerbang konfirmasi customer.\n## Contoh interaksi — 1 contoh singkat.\n\n` +
      `Balas HANYA JSON valid:\n` +
      `{"shell_skill_md": string (SKILL.md persona-shell: menjelaskan persona ini + daftar kemampuannya + cara memanggil),\n` +
      ` "skills": [{"id": <dari rencana>, "description_id": 1-2 kalimat Bahasa, "skill_md": string, "templates_used": [nama file template dari rencana yang dipakai skill ini, boleh kosong]}]}\n` +
      `Tulis SEMUA skill dari rencana, id persis sama.`,
    user:
      profileBlock(p) +
      `\n\nRENCANA SKILL:\n${plan.skill_plan.map((s) => `- ${s.id} (${s.kind}): ${s.purpose_id}`).join('\n')}` +
      `\n\nTEMPLATE TERSEDIA:\n${plan.template_plan.map((t) => `- ${t.id}: ${t.purpose_id}`).join('\n')}` +
      `\n\nTulis semua SKILL.md sekarang.`,
  }
}

export function parseSkills(raw: string, plan: GenesisPlan): GeneratedSkills {
  const obj = parseJsonObject(raw, 'skills') as Partial<GeneratedSkills>
  if (typeof obj.shell_skill_md !== 'string' || obj.shell_skill_md.length < 100) {
    throw new GenesisGenerationError('skills', 'shell_skill_md missing/too short')
  }
  if (!Array.isArray(obj.skills)) throw new GenesisGenerationError('skills', 'skills[] missing')
  const planned = new Set(plan.skill_plan.map((s) => s.id))
  const got = new Set(obj.skills.map((s) => s?.id))
  for (const id of planned) {
    if (!got.has(id)) throw new GenesisGenerationError('skills', `planned skill "${id}" not generated`)
  }
  const templateIds = new Set(plan.template_plan.map((t) => t.id))
  return {
    shell_skill_md: obj.shell_skill_md,
    skills: obj.skills
      .filter((s) => planned.has(s?.id))
      .map((s) => ({
        id: s.id,
        description_id: String(s.description_id ?? ''),
        skill_md: String(s.skill_md ?? ''),
        // Drop hallucinated template refs — manifest validation would
        // reject them; planned templates only.
        templates_used: (Array.isArray(s.templates_used) ? s.templates_used : []).filter(
          (t: string) => templateIds.has(t),
        ),
      })),
  }
}

// ─── stage 3: templates ──────────────────────────────────────────────────

export type GeneratedTemplates = {
  templates: Array<{ id: string; kind: string; description_id: string; content: string }>
}

export function buildTemplatesPrompt(
  p: GenesisProfile,
  plan: GenesisPlan,
): { system: string; user: string } {
  return {
    system:
      `Kamu menulis file template markdown untuk persona "${plan.persona_name}" di weuseai.agent. ` +
      `Template = kerangka dokumen siap-isi yang dipakai agent saat membuat deliverable untuk customer. ` +
      `Pakai placeholder kurung kurawal untuk bagian yang diisi agent, contoh: {tanggal}, {nama_klien}.\n\n${BRAND_RULES}\n\n` +
      `Balas HANYA JSON valid:\n` +
      `{"templates": [{"id": <nama file dari rencana>, "kind": <dari rencana>, "description_id": 1-2 kalimat Bahasa, "content": string (isi markdown template, substansial dan spesifik ke pekerjaan customer)}]}\n` +
      `Tulis SEMUA template dari rencana, id persis sama.`,
    user:
      profileBlock(p) +
      `\n\nRENCANA TEMPLATE:\n${plan.template_plan.map((t) => `- ${t.id} (${t.kind}): ${t.purpose_id}`).join('\n')}` +
      `\n\nTulis semua template sekarang.`,
  }
}

export function parseTemplates(raw: string, plan: GenesisPlan): GeneratedTemplates {
  const obj = parseJsonObject(raw, 'templates') as Partial<GeneratedTemplates>
  if (!Array.isArray(obj.templates)) {
    throw new GenesisGenerationError('templates', 'templates[] missing')
  }
  const planned = new Set(plan.template_plan.map((t) => t.id))
  const got = new Set(obj.templates.map((t) => t?.id))
  for (const id of planned) {
    if (!got.has(id)) throw new GenesisGenerationError('templates', `planned template "${id}" not generated`)
  }
  return {
    templates: obj.templates
      .filter((t) => planned.has(t?.id))
      .map((t) => ({
        id: t.id,
        kind: String(t.kind ?? 'document'),
        description_id: String(t.description_id ?? ''),
        content: String(t.content ?? ''),
      })),
  }
}

// ─── assembly ────────────────────────────────────────────────────────────

export function assemblePersona(args: {
  customerId: string
  plan: GenesisPlan
  skills: GeneratedSkills
  templates: GeneratedTemplates
}): GeneratedPersona {
  const slug = `custom-${args.customerId}`
  const manifestSkills: ManifestSkill[] = args.skills.skills.map((s) => {
    const planned = args.plan.skill_plan.find((ps) => ps.id === s.id)
    return {
      id: s.id,
      description_id: padDescription(s.description_id),
      ...(planned?.kind === 'playbook' ? { skill_kind: 'playbook' as const } : {}),
      templates_used: s.templates_used,
      execution: 'hermes-skill' as const,
      handler_ref: `hermes-skill:${s.id}`,
      // Custom personas are tier-gated at GENERATION time (the handler's
      // GENESIS_TIERS gate) and at FETCH time (bundle-fetch ownership +
      // feature gate). Inside the bundle every skill is enabled for all
      // spec-classes so the pull-script filter never drops them.
      enabled_for_tiers: ['starter', 'pro', 'studio'] as Array<'starter' | 'pro' | 'studio'>,
    }
  })
  const manifestTemplates: ManifestTemplate[] = args.templates.templates.map((t) => ({
    id: t.id,
    kind: t.kind,
    description_id: padDescription(t.description_id),
    source: 'customer-grown' as const,
    generated_at: new Date().toISOString(),
  }))
  const manifest: Manifest = {
    agent_slug: slug,
    version: '1.0.0',
    description_id: padDescription(
      `Persona khusus hasil Persona Genesis: ${args.plan.persona_name}. ${args.plan.specialty_id}`,
    ),
    skills: manifestSkills,
    templates: manifestTemplates,
    self_extend: false,
    extension_dir: '/var/lib/weuseai/extensions',
  }
  const files: GeneratedFile[] = [
    ...args.skills.skills.map((s) => ({
      path: `skills/${s.id}/SKILL.md`,
      content: s.skill_md,
    })),
    ...args.templates.templates.map((t) => ({
      path: `templates/${t.id}`,
      content: t.content,
    })),
  ]
  return {
    slug,
    soul_md: args.plan.soul_md,
    shell_skill_md: args.skills.shell_skill_md,
    manifest,
    files,
  }
}

/** End-to-end pipeline: profile → GeneratedPersona (unvalidated). */
export async function generatePersona(
  customerId: string,
  profile: GenesisProfile,
  complete: LlmComplete,
): Promise<GeneratedPersona> {
  const planPrompt = buildPlanPrompt(profile)
  const plan = parsePlan(await complete({ ...planPrompt, stage: 'plan' }))

  const skillsPrompt = buildSkillsPrompt(profile, plan)
  const skills = parseSkills(await complete({ ...skillsPrompt, stage: 'skills' }), plan)

  const templatesPrompt = buildTemplatesPrompt(profile, plan)
  const templates = parseTemplates(await complete({ ...templatesPrompt, stage: 'templates' }), plan)

  return assemblePersona({ customerId, plan, skills, templates })
}

// ─── shared parsing helpers ─────────────────────────────────────────────

function parseJsonObject(raw: string, stage: string): Record<string, unknown> {
  // Tolerate a markdown fence despite the instruction — models slip.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch (e) {
    throw new GenesisGenerationError(stage, `LLM output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new GenesisGenerationError(stage, 'LLM output is not a JSON object')
  }
  return obj as Record<string, unknown>
}

/** Manifest schema requires description_id 10..500 chars — pad/trim safely. */
function padDescription(s: string): string {
  const t = (s ?? '').trim()
  const padded = t.length >= 10 ? t : `${t} (persona khusus)`.trim()
  return padded.slice(0, 500)
}
