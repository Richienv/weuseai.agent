// Persona Genesis — orchestrating handler (pure, dependency-injected).
//
// Spec: docs/specs/2026-06-10-mission2-build-spec.md
//
// POST { customer_id, profile } (X-CID-bound at the entry AND re-checked
// here) → generate via DeepSeek → validate (same gates as curated
// personas) → package tar.gz → upload to Storage → record → swap the
// customer's SOUL → trigger the existing admin-customer-vps-refresh rail
// (SOUL push + hermes restart → bundle-pull installs the custom bundle).
//
// Failure honesty: a generation that fails validation NEVER ships. The row
// is marked failed, the founder gets a Telegram DM with the error list,
// and the customer gets an honest Bahasa message inviting a retry.

import {
  generatePersona,
  GenesisGenerationError,
  type GenesisProfile,
  type LlmComplete,
} from './persona-genesis-generator.ts'
import {
  validateGeneratedPersona,
  type GeneratedPersona,
} from './persona-genesis-validator.ts'
import { buildTarGz, type TarEntry } from './tar-gz.ts'
import { sanitizeExpectations, pickFirstName } from './soul-md-template.ts'
import { resolveTier } from './tier-personas.ts'

// ─── tier gate ───────────────────────────────────────────────────────────
//
// RECOMMENDATION shipped as default (founder can move this set without any
// pricing change — see the spec's tier-placement section): done-for-you is
// the "fine-tuned for you" promise, enterprise sells custom builds.
// library-full is the suggested future upsell.
export const GENESIS_TIERS: ReadonlySet<string> = new Set(['done-for-you', 'enterprise'])

/** Daily regeneration cap per customer (LLM cost + abuse floor). */
export const GENESIS_DAILY_LIMIT = 3

// ─── deps ────────────────────────────────────────────────────────────────

export type GenesisCustomerRow = {
  id: string
  display_name: string | null
  email: string
  /** Subscription tier slug (canonical or legacy). */
  tier: string
  subscription_status: string
}

export type CustomPersonaRow = {
  customer_id: string
  slug: string
  version: string
  status: 'generating' | 'active' | 'failed'
  persona_name: string | null
  generations_today: number
  updated_at: string
}

export type PersonaGenesisDeps = {
  db: {
    getGenesisCustomer(customerId: string): Promise<GenesisCustomerRow | null>
    getCustomPersona(customerId: string): Promise<CustomPersonaRow | null>
    upsertCustomPersona(row: {
      customer_id: string
      slug: string
      version: string
      status: 'generating' | 'active' | 'failed'
      persona_name: string | null
      profile: GenesisProfile
      error_detail?: string | null
    }): Promise<void>
    /** Swap the agent identity — sets customers.soul_md_text. */
    updateCustomerSoul(customerId: string, soulMdText: string): Promise<void>
  }
  llm: LlmComplete
  storage: {
    upload(path: string, bytes: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }>
  }
  /** The existing rescue rail: pushes soul_md_text + restarts the gateway
   *  (whose ExecStartPre bundle-pull installs the custom bundle). */
  vpsRefresh(customerId: string, reason: string): Promise<{ ok: boolean; detail?: string }>
  /** Founder Telegram DM — no-op impl allowed, never throws. */
  founderAlert(text: string): Promise<void>
  now?: () => Date
}

// ─── input/output ────────────────────────────────────────────────────────

export type PersonaGenesisInput = {
  customer_id: string
  profile: GenesisProfile
}

type JsonBody = Record<string, unknown>

function json(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// ─── handler ────────────────────────────────────────────────────────────

export async function handlePersonaGenesis(
  req: Request,
  deps: PersonaGenesisDeps,
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Partial<PersonaGenesisInput>
  try {
    body = (await req.json()) as Partial<PersonaGenesisInput>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const customerId = body.customer_id
  if (!customerId || typeof customerId !== 'string') {
    return json({ error: 'invalid_customer_id' }, 400)
  }

  // Tenant binding — same X-CID convention as customer-progress-proxy
  // (PR #93): the caller must present the customer id it claims to be.
  const headerCid = req.headers.get('x-cid')
  if (!headerCid || headerCid !== customerId) {
    return json({ error: 'x_cid_mismatch' }, 403)
  }

  const profile = body.profile
  const profileErr = validateProfile(profile)
  if (profileErr) return json({ error: 'invalid_profile', detail: profileErr }, 400)

  // ── eligibility ──────────────────────────────────────────────────────
  const customer = await deps.db.getGenesisCustomer(customerId)
  if (!customer) return json({ error: 'customer_not_found' }, 404)
  if (customer.subscription_status !== 'active') {
    return json({ error: 'subscription_not_active' }, 403)
  }
  let canonicalTier: string
  try {
    canonicalTier = resolveTier(customer.tier)
  } catch {
    return json({ error: 'invalid_customer_tier' }, 403)
  }
  if (!GENESIS_TIERS.has(canonicalTier)) {
    return json(
      {
        error: 'tier_does_not_grant_genesis',
        message_bahasa:
          'Persona khusus tersedia di paket Siap Pakai. Kamu bisa upgrade kapan saja.',
      },
      403,
    )
  }

  // ── rate gates ───────────────────────────────────────────────────────
  const existing = await deps.db.getCustomPersona(customerId)
  const now = deps.now?.() ?? new Date()
  if (existing?.status === 'generating') {
    // A second request while one is in flight — unless the row is stale
    // (crashed run >15 min ago), refuse politely.
    const ageMs = now.getTime() - Date.parse(existing.updated_at)
    if (Number.isFinite(ageMs) && ageMs < 15 * 60_000) {
      return json(
        {
          error: 'generation_in_progress',
          message_bahasa: 'Persona kamu sedang dibuat. Tunggu sebentar ya.',
        },
        409,
      )
    }
  }
  if ((existing?.generations_today ?? 0) >= GENESIS_DAILY_LIMIT) {
    return json(
      {
        error: 'daily_limit_reached',
        message_bahasa:
          'Batas pembuatan persona hari ini sudah tercapai. Coba lagi besok.',
      },
      429,
    )
  }

  const slug = `custom-${customerId}`
  const version = nextVersion(existing)

  await deps.db.upsertCustomPersona({
    customer_id: customerId,
    slug,
    version,
    status: 'generating',
    persona_name: null,
    profile: profile as GenesisProfile,
  })

  // ── generate ─────────────────────────────────────────────────────────
  let persona: GeneratedPersona
  try {
    persona = await generatePersona(customerId, profile as GenesisProfile, deps.llm)
  } catch (e) {
    const detail =
      e instanceof GenesisGenerationError ? e.message : e instanceof Error ? e.message : String(e)
    return await failGeneration(deps, customerId, slug, version, profile as GenesisProfile, [
      `generation: ${detail}`,
    ])
  }

  // ── quality gate (same bar as curated personas) ──────────────────────
  const validation = validateGeneratedPersona(persona)
  if (!validation.ok) {
    return await failGeneration(
      deps, customerId, slug, version, profile as GenesisProfile, validation.errors,
    )
  }

  // ── package + upload ─────────────────────────────────────────────────
  const entries: TarEntry[] = [
    { path: 'manifest.json', content: JSON.stringify({ ...persona.manifest, version }, null, 2) + '\n' },
    { path: 'SKILL.md', content: persona.shell_skill_md },
    { path: 'SOUL.md', content: persona.soul_md },
    ...persona.files.map((f) => ({ path: f.path, content: f.content })),
  ]
  let tarball: Uint8Array
  try {
    tarball = await buildTarGz(entries)
  } catch (e) {
    return await failGeneration(deps, customerId, slug, version, profile as GenesisProfile, [
      `packaging: ${e instanceof Error ? e.message : String(e)}`,
    ])
  }
  const storagePath = `bundles/${slug}/${version}.tar.gz`
  const uploaded = await deps.storage.upload(storagePath, tarball)
  if (!uploaded.ok) {
    return await failGeneration(deps, customerId, slug, version, profile as GenesisProfile, [
      `storage upload: ${uploaded.error}`,
    ])
  }

  // ── activate: record + SOUL swap + VPS refresh ──────────────────────
  const personaName = extractPersonaName(persona.soul_md)
  await deps.db.upsertCustomPersona({
    customer_id: customerId,
    slug,
    version,
    status: 'active',
    persona_name: personaName,
    profile: profile as GenesisProfile,
  })

  const customerName = (customer.display_name ?? '').trim() || customer.email
  const renderedSoul = renderCustomSoul(persona.soul_md, customerName, profile as GenesisProfile)
  await deps.db.updateCustomerSoul(customerId, renderedSoul)

  // The rescue rail pushes the new SOUL + restarts hermes; ExecStartPre's
  // bundle-pull then installs the custom bundle. Best-effort: if it fails
  // the persona is still published — the next boot/refresh picks it up —
  // but we tell the founder.
  const refresh = await deps.vpsRefresh(customerId, `persona-genesis:${slug}@${version}`)
  if (!refresh.ok) {
    await safeAlert(
      deps,
      `⚠️ Persona Genesis: bundle for ${customerId} published (${slug}@${version}) but the VPS refresh failed: ${refresh.detail ?? 'unknown'}. The persona installs on next restart — or rerun admin-customer-vps-refresh.`,
    )
  }

  return json({
    ok: true,
    slug,
    version,
    persona_name: personaName,
    skills: persona.manifest.skills.map((s) => s.id),
    templates: persona.manifest.templates.map((t) => t.id),
    vps_refreshed: refresh.ok,
    message_bahasa:
      `Persona ${personaName ?? 'baru'} kamu sudah jadi dan sedang dipasang. ` +
      `Dalam satu dua menit agent kamu bangun dengan kemampuan barunya. Coba sapa dia.`,
  })
}

// ─── helpers ─────────────────────────────────────────────────────────────

function validateProfile(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'profile must be an object'
  const fields: Array<keyof GenesisProfile> = [
    'role', 'daily_tasks', 'outputs', 'tools', 'pain_points',
  ]
  for (const f of fields) {
    const v = (p as Record<string, unknown>)[f]
    if (typeof v !== 'string' || v.trim().length < 3) {
      return `profile.${f} missing or too short`
    }
    if (v.length > 2000) return `profile.${f} too long (>2000 chars)`
  }
  return null
}

function nextVersion(existing: CustomPersonaRow | null): string {
  if (!existing) return '1.0.0'
  const m = /^1\.0\.(\d+)$/.exec(existing.version)
  const patch = m ? parseInt(m[1], 10) + 1 : 1
  return `1.0.${patch}`
}

function extractPersonaName(soulMd: string): string | null {
  const m = /I am ([^,]{2,60}),/.exec(soulMd)
  return m ? m[1].trim() : null
}

/**
 * Render the generated SOUL scaffold with the customer's real values.
 * Expectations text is composed from the interview profile and passed
 * through the SAME sanitizer as onboarding (scaffold-breakout defense).
 */
export function renderCustomSoul(
  scaffold: string,
  customerName: string,
  profile: GenesisProfile,
): string {
  const expectationsRaw =
    `${profile.role}. Fokus harian: ${profile.daily_tasks}. Output utama: ${profile.outputs}.`
  const sanitized = sanitizeExpectations(expectationsRaw.slice(0, 590))
  const expectations = sanitized.ok ? sanitized.clean : profile.role.slice(0, 200)
  return scaffold
    .replaceAll('{customer_name}', customerName)
    .replaceAll('{first_name}', pickFirstName(customerName))
    .replaceAll('{user_expectations_verbatim}', expectations)
}

async function failGeneration(
  deps: PersonaGenesisDeps,
  customerId: string,
  slug: string,
  version: string,
  profile: GenesisProfile,
  errors: string[],
): Promise<Response> {
  await deps.db.upsertCustomPersona({
    customer_id: customerId,
    slug,
    version,
    status: 'failed',
    persona_name: null,
    profile,
    error_detail: errors.slice(0, 20).join(' | ').slice(0, 4000),
  })
  await safeAlert(
    deps,
    `🧬 Persona Genesis FAILED for customer ${customerId} (${errors.length} error(s)):\n` +
      errors.slice(0, 10).map((e) => `• ${e}`).join('\n'),
  )
  return json(
    {
      error: 'generation_failed',
      message_bahasa:
        'Persona kamu belum berhasil dibuat — hasilnya belum memenuhi standar kualitas kami. ' +
        'Coba sekali lagi dengan cerita yang sedikit lebih detail tentang pekerjaan kamu.',
    },
    502,
  )
}

async function safeAlert(deps: PersonaGenesisDeps, text: string): Promise<void> {
  try {
    await deps.founderAlert(text)
  } catch {
    // Alert delivery must never break the customer path.
  }
}
