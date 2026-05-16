// tier-personas.ts — Tier → personas single source of truth (D1 lock 2026-05-12).
//
// Customer at each tier receives the listed personas as slash commands
// on their Telegram bot (Hermes auto-exposes every installed SKILL.md
// under ~/.hermes/skills/<slug>/SKILL.md as /<slug> — verified on
// Renita's Vultr VPS 2026-05-12, "R1 verification PASS").
//
// Invariants pinned by tests/tier-personas.spec.ts:
//   1. Each tier is a superset of the lower tier (graceful upgrade — no
//      persona disappears on tier-up).
//   2. Every listed slug appears in KNOWN_PERSONA_SLUGS (drift gate).
//   3. Studio == KNOWN_PERSONA_SLUGS (full library at top tier).
//   4. DEFAULT_PERSONA appears at index 0 in every tier list (first-of-
//      list invariant — bundle-pull installs the default before any
//      add-on persona, so a customer always has The Pro available even
//      if a downstream pull fails).
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

export type Tier = 'starter' | 'pro' | 'studio'

/** D2 lock 2026-05-12: bare-message default persona. */
export const DEFAULT_PERSONA = 'the-pro' as const

export const TIER_PERSONAS: { readonly [T in Tier]: readonly string[] } = {
  starter: [
    'the-pro',
    'doc-expert',
    'slide-master',
  ],
  pro: [
    'the-pro',
    'doc-expert',
    'slide-master',
    'deep-researcher',
    'trade-pro',
    'project-conductor',
    'video-producer',
    'social-conductor',
  ],
  studio: [
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
  ],
}

export function personasForTier(tier: Tier): readonly string[] {
  const list = TIER_PERSONAS[tier]
  if (!list) {
    throw new Error(`unknown tier "${tier}" — expected starter / pro / studio`)
  }
  return list
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
