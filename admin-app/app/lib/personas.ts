/**
 * Persona slug list for the manual-provision dropdown.
 *
 * Mirrors the 10-persona library locked in
 * supabase/functions/_shared/tier-personas.ts (D1 lock 2026-05-12). The
 * Studio tier == this full list. Lower tiers are subsets:
 *   - starter: the-pro, doc-expert, slide-master
 *   - pro:     starter + deep-researcher, trade-pro, project-conductor,
 *              video-producer, social-conductor
 *   - studio:  pro + web-app-builder, business-agent
 *
 * Inferring tier from persona slug for the manual-provision form: we pick
 * the LOWEST tier that grants the chosen persona. That matches what a
 * paying customer would actually receive — Starter buyer who picks
 * "doc-expert" gets a Starter subscription, not Pro.
 *
 * If the tier-personas.ts library changes, update both arrays here.
 */

export type Tier = 'starter' | 'pro' | 'studio';

export type PersonaOption = {
  slug: string;
  name: string;
  tier: Tier;
};

const STARTER_SLUGS = ['the-pro', 'doc-expert', 'slide-master'] as const;

const PRO_ONLY_SLUGS = [
  'deep-researcher',
  'trade-pro',
  'project-conductor',
  'video-producer',
  'social-conductor',
] as const;

const STUDIO_ONLY_SLUGS = ['web-app-builder', 'business-agent'] as const;

export const PERSONA_OPTIONS: readonly PersonaOption[] = [
  { slug: 'the-pro', name: 'The Pro', tier: 'starter' },
  { slug: 'doc-expert', name: 'Doc Expert', tier: 'starter' },
  { slug: 'slide-master', name: 'Slide Master', tier: 'starter' },
  { slug: 'deep-researcher', name: 'Deep Researcher', tier: 'pro' },
  { slug: 'trade-pro', name: 'Trade Pro', tier: 'pro' },
  { slug: 'project-conductor', name: 'Project Conductor', tier: 'pro' },
  { slug: 'video-producer', name: 'Video Producer', tier: 'pro' },
  { slug: 'social-conductor', name: 'Social Conductor', tier: 'pro' },
  { slug: 'web-app-builder', name: 'Web Creator', tier: 'studio' },
  { slug: 'business-agent', name: 'Business Director', tier: 'studio' },
];

export const PERSONA_SLUGS: ReadonlySet<string> = new Set(
  PERSONA_OPTIONS.map((p) => p.slug),
);

export function tierForPersonaSlug(slug: string): Tier | null {
  const match = PERSONA_OPTIONS.find((p) => p.slug === slug);
  return match ? match.tier : null;
}

// Drift-check: at module load, assert that STARTER_SLUGS + PRO_ONLY_SLUGS
// + STUDIO_ONLY_SLUGS equals the master PERSONA_OPTIONS list. If a future
// PR adds a persona to one set but forgets the other, this fails fast.
const _allSetSlugs = new Set<string>([
  ...STARTER_SLUGS,
  ...PRO_ONLY_SLUGS,
  ...STUDIO_ONLY_SLUGS,
]);
const _optionSlugs = new Set(PERSONA_OPTIONS.map((p) => p.slug));
if (_allSetSlugs.size !== _optionSlugs.size) {
  throw new Error('persona slug drift: STARTER+PRO+STUDIO sets do not match PERSONA_OPTIONS');
}
for (const s of _allSetSlugs) {
  if (!_optionSlugs.has(s)) {
    throw new Error(`persona slug drift: ${s} in tier sets but not in PERSONA_OPTIONS`);
  }
}
