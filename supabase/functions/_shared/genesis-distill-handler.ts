// Genesis Onboarding — the "reads your world" distill brain (pure, DI'd).
//
// Spec: docs/plans/2026-06-13-genesis-onboarding.md
//
// POST { customer_id, tier, samples } (X-CID-bound) → one LLM extraction
// call → a DRAFT the customer confirms before anything provisions:
//   • a GenesisProfile inferred from the forwarded/pasted samples
//   • a recommended persona ∈ personasForTier(tier) (falls back to the-pro)
//   • a sanitized expectations paragraph ready for complete-onboarding
//   • an honest Bahasa "here's what I learned about you" summary
//
// This handler has NO side effects: no DB writes, no VPS calls. It returns
// a draft. The only write is the customer's later complete-onboarding POST —
// so a distill call can never half-provision or mutate a customer. That
// keeps the wow ("it already gets me") honest: nothing ships until they
// confirm what we inferred.

import { BRAND_RULES, type GenesisProfile } from './persona-genesis-generator.ts'
import { sanitizeExpectations } from './soul-md-template.ts'
import { personasForTier, resolveTier, PERSONA_META, DEFAULT_PERSONA } from './tier-personas.ts'

// ─── deps ────────────────────────────────────────────────────────────────

/** Single-shot JSON-mode completion (the prod entry wires deepseek-chat). */
export type GenesisDistillLlm = (args: { system: string; user: string }) => Promise<string>

export type GenesisDistillDeps = {
  distill: GenesisDistillLlm
}

// ─── input / output ────────────────────────────────────────────────────────

export type GenesisDistillInput = {
  customer_id: string
  tier: string
  /** Raw forwarded/pasted artifacts the customer handed us. */
  samples: string
}

export type GenesisDistillResult = {
  ok: true
  /** Curated persona slug, or null for the persona-free `bare` tier. */
  recommended_persona: string | null
  persona_name: string | null
  /** Sanitized, ≤600 chars — drops straight into complete-onboarding. */
  expectations_paragraph: string
  /** For the top-tier persona-genesis hand-off. */
  profile: GenesisProfile
  summary_bahasa: string
  confirmation_prompt: string
}

const SAMPLES_MIN = 40
const SAMPLES_MAX = 8000

// ─── helpers ─────────────────────────────────────────────────────────────

type JsonBody = Record<string, unknown>

function json(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** What the LLM is asked to return, parsed strictly. */
type DistillRaw = {
  role?: unknown
  daily_tasks?: unknown
  outputs?: unknown
  tools?: unknown
  pain_points?: unknown
  recommended_persona?: unknown
  expectations_paragraph?: unknown
  summary_bahasa?: unknown
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback
}

/** Compose a safe expectations paragraph from profile fields (mirrors
 *  renderCustomSoul's fallback) when the LLM's paragraph is unusable. */
function composeExpectations(p: GenesisProfile): string {
  return `${p.role}. Fokus harian: ${p.daily_tasks}. Output utama: ${p.outputs}.`.slice(0, 590)
}

/** Sanitize the LLM paragraph; on rejection recompose from the profile;
 *  final fallback is a minimal safe default. Never throws. */
function safeExpectations(rawParagraph: string, profile: GenesisProfile): string {
  const first = sanitizeExpectations(rawParagraph.slice(0, 600))
  if (first.ok) return first.clean
  const composed = sanitizeExpectations(composeExpectations(profile))
  if (composed.ok) return composed.clean
  const minimal = sanitizeExpectations(profile.role.slice(0, 200))
  return minimal.ok ? minimal.clean : 'Bantu pekerjaan harian kamu.'
}

export const SYSTEM_PROMPT = `Kamu adalah asisten onboarding untuk weuseai.agent. Dari contoh kerja yang ditempel customer (proposal, chat bisnis, caption, daftar klien), simpulkan profil kerja mereka — JANGAN mengarang detail yang tidak ada di contoh.

${BRAND_RULES}

Keluarkan HANYA JSON valid dengan field berikut:
{
  "role": "peran/pekerjaan customer, satu kalimat",
  "daily_tasks": "tugas harian yang kelihatan dari contoh",
  "outputs": "deliverable yang mereka hasilkan",
  "tools": "tools yang kelihatan dipakai (kalau tidak ada, tulis: belum kelihatan)",
  "pain_points": "yang kemungkinan makan waktu mereka",
  "recommended_persona": "satu slug dari daftar persona yang diizinkan",
  "expectations_paragraph": "1-3 kalimat, sudut pandang customer, apa yang mereka mau agent kerjakan. Maksimal 500 karakter. Tanpa tanda seru.",
  "summary_bahasa": "2-4 kalimat ramah: 'Ini yang aku tangkap soal kamu: ...'. Deskripsikan CUSTOMER, jangan janjikan fitur agent yang tidak ada (email/kalender/auto-post)."
}`

function buildUserPrompt(samples: string, allowed: readonly string[]): string {
  const personaList =
    allowed.length === 0
      ? '(paket dasar — tidak ada persona; set recommended_persona ke null)'
      : allowed
          .map((slug) => `- ${slug}: ${PERSONA_META[slug]?.name ?? slug} — ${PERSONA_META[slug]?.blurb ?? ''}`)
          .join('\n')
  return `DAFTAR PERSONA YANG DIIZINKAN (pilih recommended_persona dari sini saja):
${personaList}

CONTOH KERJA DARI CUSTOMER:
"""
${samples}
"""`
}

// ─── handler ────────────────────────────────────────────────────────────

export async function handleGenesisDistill(
  req: Request,
  deps: GenesisDistillDeps,
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Partial<GenesisDistillInput>
  try {
    body = (await req.json()) as Partial<GenesisDistillInput>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const customerId = body.customer_id
  if (!customerId || typeof customerId !== 'string') {
    return json({ error: 'invalid_customer_id' }, 400)
  }

  // Tenant binding — same X-CID convention as persona-genesis (PR #93).
  const headerCid = req.headers.get('x-cid')
  if (!headerCid || headerCid !== customerId) {
    return json({ error: 'x_cid_mismatch' }, 403)
  }

  const samples = typeof body.samples === 'string' ? body.samples : ''
  if (samples.trim().length < SAMPLES_MIN) {
    return json(
      {
        error: 'samples_too_short',
        message_bahasa:
          'Kasih sedikit lebih banyak contoh kerja kamu — satu proposal atau beberapa chat sudah cukup.',
      },
      400,
    )
  }
  if (samples.length > SAMPLES_MAX) {
    return json({ error: 'samples_too_long', detail: `max ${SAMPLES_MAX} chars` }, 400)
  }

  let canonicalTier: string
  try {
    canonicalTier = resolveTier(typeof body.tier === 'string' ? body.tier : '')
  } catch {
    return json({ error: 'invalid_tier' }, 400)
  }
  const allowed = personasForTier(canonicalTier)

  // ── extract ──────────────────────────────────────────────────────────
  let raw: DistillRaw
  try {
    const completion = await deps.distill({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(samples.trim(), allowed),
    })
    raw = JSON.parse(completion) as DistillRaw
  } catch (e) {
    return json(
      {
        error: 'distill_failed',
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
        message_bahasa:
          'Aku belum berhasil menyusun profil kamu. Coba tempel contoh kerja yang sedikit lebih banyak.',
      },
      502,
    )
  }

  const profile: GenesisProfile = {
    role: str(raw.role, 'Profesional'),
    daily_tasks: str(raw.daily_tasks, 'Pekerjaan harian yang beragam'),
    outputs: str(raw.outputs, 'Dokumen dan komunikasi kerja'),
    tools: str(raw.tools, 'belum kelihatan'),
    pain_points: str(raw.pain_points, 'Pekerjaan berulang yang makan waktu'),
  }

  // ── persona recommendation (validated against the tier) ───────────────
  const personaFree = allowed.length === 0
  let recommendedPersona: string | null = null
  let personaName: string | null = null
  if (!personaFree) {
    const suggested = str(raw.recommended_persona)
    recommendedPersona = allowed.includes(suggested) ? suggested : DEFAULT_PERSONA
    personaName = PERSONA_META[recommendedPersona]?.name ?? null
  }

  // ── expectations (sanitized, never throws) ────────────────────────────
  const expectations = safeExpectations(str(raw.expectations_paragraph), profile)

  // ── confirmation copy ─────────────────────────────────────────────────
  const summary = str(
    raw.summary_bahasa,
    `Ini yang aku tangkap soal kamu: ${profile.role}. Fokus harian kamu di ${profile.daily_tasks}.`,
  )

  return json({
    ok: true,
    recommended_persona: recommendedPersona,
    persona_name: personaName,
    expectations_paragraph: expectations,
    profile,
    summary_bahasa: summary,
    confirmation_prompt: 'Betul begini, atau mau kamu sesuaikan?',
  } satisfies GenesisDistillResult as unknown as JsonBody)
}
