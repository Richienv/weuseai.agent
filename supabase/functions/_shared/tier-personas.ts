// tier-personas.ts — Tier → personas single source of truth.
//
// Phase A restructure (2026-05-28): the count-based 3-tier ladder
// (starter / pro / studio) is replaced by a 4-tier FEATURE-BUNDLE model
// (voice-starter / library-full / done-for-you / enterprise). The new
// slugs are CANONICAL; the old 3 slugs are DEPRECATED ALIASES that still
// resolve (expand-then-contract — the destructive removal of old slugs
// is a separate later cleanup PR, NOT this one). ~70 old-slug references
// across the live provisioning chain + xendit-webhook keep working via
// the alias resolver below; only the new producers (admin form, landing,
// checkout) emit new slugs.
//
// Customer at each tier receives the listed personas as slash commands
// on their Telegram bot (Hermes auto-exposes every installed SKILL.md
// under ~/.hermes/skills/<slug>/SKILL.md as /<slug> — verified on
// Renita's Vultr VPS 2026-05-12, "R1 verification PASS").
//
// Invariants pinned by tests/tier-personas.spec.ts:
//   1. DEFAULT_PERSONA (the-pro) appears at index 0 in every non-null
//      persona list (first-of-list invariant — bundle-pull installs the
//      default before any add-on persona, so a customer always has The
//      Pro available even if a downstream pull fails).
//   2. Every listed slug appears in KNOWN_PERSONA_SLUGS (drift gate).
//   3. library-full == KNOWN_PERSONA_SLUGS (full library).
//   4. done-for-you == the 8-persona Pro set; voice-starter == the 3-set.
//   5. enterprise has no fixed persona set (custom — personas is null).
//
// NOTE: the old "each tier is a superset of the lower tier" linear-ladder
// invariant NO LONGER HOLDS. This is a feature matrix, not a price ladder
// — library-full (10 personas, Rp 899rb) carries MORE personas than the
// pricier done-for-you (8 personas, Rp 1.299jt) because done-for-you
// trades persona breadth for the web_app feature unlock.
//
// Consumers:
//   - services/provisioning/src/customer-flow.ts — derives agentSlugs
//     from subscription.tier when calling setup-script.
//   - services/provisioning/src/setup-script.ts — emits
//     WEUSEAI_AGENT_SLUGS=<csv> into /home/weuseai/.hermes/.env.
//   - services/provisioning/src/bundle-pull-script.ts — iterates the
//     CSV list at every Hermes boot.
//   - supabase/functions/bundle-version-bump-broadcast — filters which
//     customer VPSes get pinged on a persona version bump.

import { KNOWN_PERSONA_SLUGS } from './manifest-validator.ts'

/**
 * Canonical tier slugs (feature-bundle model).
 * v1.4 (2026-06-09) added two cheaper entry tiers: `bare` (vanilla Hermes,
 * no personas, no voice) and `solo` (3 personas, TEXT only).
 */
export type Tier = 'bare' | 'solo' | 'voice-starter' | 'library-full' | 'done-for-you' | 'enterprise'

/** Deprecated count-based slugs — still resolve via the alias map below. */
export type LegacyTier = 'starter' | 'pro' | 'studio'

/** Any slug a resolver may receive (new canonical OR deprecated alias). */
export type AnyTier = Tier | LegacyTier

/** D2 lock 2026-05-12: bare-message default persona. */
export const DEFAULT_PERSONA = 'the-pro' as const

// ─── persona sets (re-used by TIERS + TIER_PERSONAS) ────────────────────

const VOICE_STARTER_PERSONAS = [
  'the-pro',
  'doc-expert',
  'slide-master',
] as const

/** The 8-persona "Pro" set — the-pro FIRST (default-at-index-0 invariant). */
const PRO_SET_PERSONAS = [
  'the-pro',
  'doc-expert',
  'slide-master',
  'deep-researcher',
  'trade-pro',
  'project-conductor',
  'video-producer',
  'social-conductor',
] as const

/** The full 10-persona library — the-pro FIRST, then add-ons. */
const FULL_LIBRARY_PERSONAS = [
  'the-pro',
  'doc-expert',
  'slide-master',
  'deep-researcher',
  'trade-pro',
  'project-conductor',
  'video-producer',
  'social-conductor',
  'web-app-builder',
  'business-agent',
] as const

// ─── tier feature config (single source of truth) ───────────────────────

export type TierFeatures = {
  readonly voice: boolean
  readonly web_app: boolean
  readonly custom_build: boolean
}

export type TierConfig = {
  readonly label_id: string
  /** null = custom/no-fixed-set (enterprise); [] = persona-free (bare). */
  readonly personas: readonly string[] | null
  /** null = contact-for-quote (enterprise). */
  readonly setup_fee_idr: number | null
  /**
   * Strikethrough "harga normal" anchor. For library-full this is the REAL
   * post-batch price (2.2jt): shown struck-through today, and GENUINELY charged
   * once paid_customers >= LIBRARY_FULL_BATCH_LIMIT — create-invoice flips the
   * charge from setup_fee_idr (799k) to this value (see create-invoice-handler,
   * types.ts setupOldIdr). NOT a display-only figure: editing it changes what
   * post-batch customers pay. Absent on other tiers. (Founder 2026-07-16,
   * raised from the old 999k display anchor.)
   */
  readonly setup_fee_anchor_idr?: number
  readonly monthly_fee_idr: number | null
  readonly features: TierFeatures
  readonly contact_required: boolean
}

/**
 * Canonical tier catalog. The admin form, landing, checkout, and the
 * api/_shared/tier-catalog.ts mirror all read from this shape.
 *
 * Phase B (voice middleware) + Phase C (web app integration) are NOT
 * wired this PR — `features.voice` / `features.web_app` are FLAGS only;
 * the middleware ships later within these existing tier slugs (no future
 * slug rename needed).
 */
export const TIERS: { readonly [T in Tier]: TierConfig } = {
  bare: {
    label_id: 'Bare Agent',
    // Vanilla Hermes — DeepSeek chat in Bahasa via Telegram. No persona,
    // no template library, no playbook, no voice.
    personas: [],
    setup_fee_idr: 99_000,
    monthly_fee_idr: 99_000,
    features: { voice: false, web_app: false, custom_build: false },
    contact_required: false,
  },
  solo: {
    label_id: 'Solo Starter',
    // Same 3 personas as Voice Starter, but TEXT only (voice OFF).
    personas: VOICE_STARTER_PERSONAS,
    setup_fee_idr: 399_000,
    monthly_fee_idr: 99_000,
    features: { voice: false, web_app: false, custom_build: false },
    contact_required: false,
  },
  'voice-starter': {
    label_id: 'Voice Starter',
    personas: VOICE_STARTER_PERSONAS,
    setup_fee_idr: 599_000, // v1.4: reduced from 699_000
    monthly_fee_idr: 99_000,
    features: { voice: true, web_app: false, custom_build: false },
    contact_required: false,
  },
  'library-full': {
    label_id: 'Library Lengkap',
    personas: FULL_LIBRARY_PERSONAS,
    setup_fee_idr: 799_000, // v1.4: reduced from 899_000
    setup_fee_anchor_idr: 2_200_000, // REAL post-batch price (founder 2026-07-16): create-invoice charges this once paid_customers >= 1000
    monthly_fee_idr: 99_000,
    features: { voice: true, web_app: false, custom_build: false },
    contact_required: false,
  },
  'done-for-you': {
    label_id: 'Siap Pakai',
    personas: PRO_SET_PERSONAS,
    setup_fee_idr: 1_299_000,
    monthly_fee_idr: 99_000,
    features: { voice: true, web_app: true, custom_build: false },
    contact_required: false,
  },
  enterprise: {
    label_id: 'Enterprise',
    personas: null,
    setup_fee_idr: null,
    monthly_fee_idr: null,
    features: { voice: true, web_app: true, custom_build: true },
    contact_required: true,
  },
}

/**
 * Tier → persona-list map for the non-custom tiers. `enterprise` is
 * omitted (no fixed set — see personasForTier for the most-permissive
 * fallback). Kept as a named export for callers + tests that want the
 * direct map without going through the resolver.
 */
export const TIER_PERSONAS: { readonly [T in Exclude<Tier, 'enterprise'>]: readonly string[] } = {
  bare: [],
  solo: VOICE_STARTER_PERSONAS,
  'voice-starter': VOICE_STARTER_PERSONAS,
  'library-full': FULL_LIBRARY_PERSONAS,
  'done-for-you': PRO_SET_PERSONAS,
}

// ─── deprecated-slug alias resolver (expand-then-contract) ───────────────
//
// CORRECTED mapping (the consult's stated pro→library-full / studio→
// done-for-you was persona-INCONSISTENT and would mis-grant personas).
// The persona-set-consistent mapping is:
//   starter (3 personas)  → voice-starter (same 3-set)
//   pro     (8 Pro-set)    → done-for-you  (same 8 Pro-set)
//   studio  (10 full)      → library-full  (same 10 full library)
//
// No real paying customers exist (test rows wiped) — this is purely
// defensive for leftover test rows + the live provisioning chain that
// still passes old slugs.
const LEGACY_TIER_ALIAS: { readonly [L in LegacyTier]: Tier } = {
  starter: 'voice-starter',
  pro: 'done-for-you',
  studio: 'library-full',
}

function isLegacyTier(tier: string): tier is LegacyTier {
  return tier === 'starter' || tier === 'pro' || tier === 'studio'
}

/**
 * Resolve any tier slug (new canonical OR deprecated alias) to a canonical
 * Tier slug. Logs a one-line warning when an old slug is encountered.
 * Throws on a genuinely-unknown slug.
 */
export function resolveTier(tier: string): Tier {
  if (tier in TIERS) return tier as Tier
  if (isLegacyTier(tier)) {
    const resolved = LEGACY_TIER_ALIAS[tier]
    console.warn(`[tier-compat] deprecated tier slug "${tier}" → resolving as "${resolved}"`)
    return resolved
  }
  throw new Error(
    `unknown tier "${tier}" — expected voice-starter / library-full / done-for-you / enterprise ` +
      `(or deprecated starter / pro / studio)`,
  )
}

/**
 * Personas granted at a tier. Accepts both the new canonical slugs and
 * the deprecated count-based slugs (resolved via the alias map).
 *
 * `enterprise` has no fixed persona set; this returns the FULL 10-persona
 * library (most permissive) so callers that must enumerate personas have
 * a safe default. The bundle-fetch security gate special-cases enterprise
 * separately (custom personas allowed) — see bundle-fetch-handler.ts.
 */
export function personasForTier(tier: string): readonly string[] {
  const canonical = resolveTier(tier)
  if (canonical === 'enterprise') return FULL_LIBRARY_PERSONAS
  return TIERS[canonical].personas as readonly string[]
}

/**
 * Persona-selection support (2026-05-17): display metadata for the
 * onboarding persona picker. Keyed by the same slugs as TIER_PERSONAS so
 * the UI never has to duplicate the list. `name` is the v2 display name
 * (manifest-validator.ts §rename notes); `blurb` is a one-line Bahasa
 * description for the picker card — calm-premium register, "kamu", no
 * exclamation marks, no banned words.
 *
 * onboarding.html mirrors this object (static page can't import TS); the
 * drift test tier-personas.spec.ts pins both directions.
 */
export const PERSONA_META: {
  readonly [slug: string]: { readonly name: string; readonly blurb: string }
} = {
  'the-pro': {
    name: 'The Pro',
    blurb: 'Pendamping kerja harian. Briefing pagi, ingatan lintas sesi, bantu apa pun.',
  },
  'doc-expert': {
    name: 'Doc Expert',
    blurb: 'Draft laporan, proposal, dan email yang sesuai gaya kamu.',
  },
  'slide-master': {
    name: 'Slide Master',
    blurb: 'Susun deck presentasi dari poin mentah jadi slide rapi.',
  },
  'deep-researcher': {
    name: 'Deep Researcher',
    blurb: 'Riset mendalam, banding sumber, dan rangkum temuan jadi ringkas.',
  },
  'trade-pro': {
    name: 'Trade Pro',
    blurb: 'Analisis pasar dan rangkuman data trading. Bukan saran finansial.',
  },
  'project-conductor': {
    name: 'Project Conductor',
    blurb: 'Jaga big picture project — bagi task, monitor progres, ingatkan blocker.',
  },
  'video-producer': {
    name: 'Video Producer',
    blurb: 'Bantu konsep, script, dan alur produksi video dari ide sampai jadi.',
  },
  'social-conductor': {
    name: 'Social Conductor',
    blurb: 'Rencanakan konten sosial, susun kalender, dan draft caption.',
  },
  'web-app-builder': {
    name: 'Web Creator',
    blurb: 'Bangun landing page dan web app sederhana dari brief kamu.',
  },
  'business-agent': {
    name: 'Business Director',
    blurb: 'Orkestrasi lintas departemen — operasi, marketing, sampai keuangan.',
  },
}

// Drift gate: keep the test+code in sync by asserting at module-load time.
// If a future migration adds a persona slug, this file must be updated
// too — otherwise the test will fail and bundle-pull will silently miss
// the new persona on Studio VPSes.
//
// (Compile-time check only; not a runtime throw.)
const _drift_check: typeof KNOWN_PERSONA_SLUGS extends readonly string[]
  ? true
  : never = true
void _drift_check
