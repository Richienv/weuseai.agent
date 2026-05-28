/**
 * Tier catalog — Vercel-Functions-side mirror of
 *   supabase/functions/_shared/tier-personas.ts (D1 lock 2026-05-12)
 *   + CLAUDE.md "Business model" setup-fee values (v1.2 lock 2026-05-13).
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
 */

export type Tier = 'starter' | 'pro' | 'studio'

export type TierEntry = {
  label: string
  /** Setup fee in IDR (one-time). Mirrors CLAUDE.md v1.2 launch-discount values. */
  setup_fee_idr: number
  /** Locked persona composition for this tier (bundle-fetch enforces this set server-side). */
  personas: readonly string[]
}

export const TIER_CATALOG: Readonly<Record<Tier, TierEntry>> = {
  starter: {
    label: 'Starter',
    setup_fee_idr: 399_000,
    personas: ['the-pro', 'doc-expert', 'slide-master'],
  },
  pro: {
    label: 'Pro',
    setup_fee_idr: 1_290_000,
    personas: [
      'the-pro', 'doc-expert', 'slide-master',
      'deep-researcher', 'trade-pro', 'project-conductor',
      'video-producer', 'social-conductor',
    ],
  },
  studio: {
    label: 'Studio',
    setup_fee_idr: 5_900_000,
    personas: [
      'the-pro', 'doc-expert', 'slide-master',
      'deep-researcher', 'trade-pro', 'project-conductor',
      'video-producer', 'social-conductor',
      'web-app-builder', 'business-agent',
    ],
  },
}

export const TIERS: readonly Tier[] = ['starter', 'pro', 'studio']

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value)
}

export function personasForTier(tier: Tier): readonly string[] {
  return TIER_CATALOG[tier].personas
}

export function setupFeeForTier(tier: Tier): number {
  return TIER_CATALOG[tier].setup_fee_idr
}
