/**
 * Tier catalog — Vercel-Functions-side mirror of
 *   supabase/functions/_shared/tier-personas.ts (Phase A restructure 2026-05-28)
 *
 * Why duplicated:
 *   - Vercel Functions (under `api/`) can't import from `supabase/functions/_shared/`
 *     (different deno-vs-node module systems, separate tsconfig roots).
 *   - The admin form (`admin/assets/admin-shared.js`) also inlines the
 *     same data so the React-via-CDN page has no fetch dependency.
 *
 * Drift gate: `tests/admin-tier-catalog-drift.spec.ts` source-greps the
 * three locations and fails if they diverge. If you add a persona to
 * tier-personas.ts, update this file AND admin-shared.js.
 *
 * Phase A (expand-then-contract): the 4 new tiers are canonical. The old
 * count-based slugs (starter / pro / studio) are deprecated aliases that
 * still resolve via `resolveTier` for back-compat with leftover rows; new
 * producers emit only the new slugs. `enterprise` is contact-only — no
 * fixed personas + no fixed fee — and is NOT provisionable via the admin
 * form (api/admin/customer-action.ts rejects it).
 */

/** Canonical Phase A tier slugs. */
export type Tier = 'voice-starter' | 'library-full' | 'done-for-you' | 'enterprise'

/** Deprecated count-based slugs — resolve via the alias map below. */
export type LegacyTier = 'starter' | 'pro' | 'studio'

export type TierFeatures = {
  voice: boolean
  web_app: boolean
  custom_build: boolean
}

export type TierEntry = {
  label: string
  /** Setup fee in IDR (one-time). null = contact-for-quote (enterprise). */
  setup_fee_idr: number | null
  /** Monthly hosting fee in IDR. null = custom (enterprise). */
  monthly_fee_idr: number | null
  /** Locked persona composition. null = custom set (enterprise). */
  personas: readonly string[] | null
  features: TierFeatures
  contact_required: boolean
}

export const TIER_CATALOG: Readonly<Record<Tier, TierEntry>> = {
  'voice-starter': {
    label: 'Voice Starter',
    setup_fee_idr: 699_000,
    monthly_fee_idr: 99_000,
    personas: ['the-pro', 'doc-expert', 'slide-master'],
    features: { voice: true, web_app: false, custom_build: false },
    contact_required: false,
  },
  'library-full': {
    label: 'Library Lengkap',
    setup_fee_idr: 899_000,
    monthly_fee_idr: 99_000,
    personas: [
      'the-pro', 'doc-expert', 'slide-master',
      'deep-researcher', 'trade-pro', 'project-conductor',
      'video-producer', 'social-conductor',
      'web-app-builder', 'business-agent',
    ],
    features: { voice: true, web_app: false, custom_build: false },
    contact_required: false,
  },
  'done-for-you': {
    label: 'Siap Pakai',
    setup_fee_idr: 1_299_000,
    monthly_fee_idr: 99_000,
    personas: [
      'the-pro', 'doc-expert', 'slide-master',
      'deep-researcher', 'trade-pro', 'project-conductor',
      'video-producer', 'social-conductor',
    ],
    features: { voice: true, web_app: true, custom_build: false },
    contact_required: false,
  },
  enterprise: {
    label: 'Enterprise',
    setup_fee_idr: null,
    monthly_fee_idr: null,
    personas: null,
    features: { voice: true, web_app: true, custom_build: true },
    contact_required: true,
  },
}

export const TIERS: readonly Tier[] = [
  'voice-starter',
  'library-full',
  'done-for-you',
  'enterprise',
]

/** Deprecated count-based slug → canonical Phase A slug (persona-consistent). */
const LEGACY_TIER_ALIAS: Readonly<Record<LegacyTier, Tier>> = {
  starter: 'voice-starter',
  pro: 'done-for-you',
  studio: 'library-full',
}

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value)
}

function isLegacyTier(value: string): value is LegacyTier {
  return value === 'starter' || value === 'pro' || value === 'studio'
}

/** Resolve a new or deprecated slug to a canonical Tier. Throws on unknown. */
export function resolveTier(tier: string): Tier {
  if (isTier(tier)) return tier
  if (isLegacyTier(tier)) {
    const resolved = LEGACY_TIER_ALIAS[tier]
    // eslint-disable-next-line no-console
    console.warn(`[tier-compat] deprecated tier slug "${tier}" → resolving as "${resolved}"`)
    return resolved
  }
  throw new Error(`unknown tier "${tier}"`)
}

export function tierEntry(tier: string): TierEntry {
  return TIER_CATALOG[resolveTier(tier)]
}

/**
 * Personas granted at a tier. Enterprise returns the full library (most
 * permissive) since it has no fixed set; the admin form rejects enterprise
 * before this is hit, so this fallback is defensive only.
 */
export function personasForTier(tier: string): readonly string[] {
  const entry = tierEntry(tier)
  if (entry.personas) return entry.personas
  // enterprise — most-permissive fallback (full library).
  return TIER_CATALOG['library-full'].personas as readonly string[]
}

/** Setup fee for a tier. Returns null for enterprise (contact-for-quote). */
export function setupFeeForTier(tier: string): number | null {
  return tierEntry(tier).setup_fee_idr
}
