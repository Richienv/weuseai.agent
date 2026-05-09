// Phase 5-1.b: 5-stage roadmap definition + per-stage deliverables.
//
// Stage names locked Q1=A: idea → setup → identity → build → sell. They
// match the CHECK constraint in business_roadmap_state and the existing
// Persona v2 BD enum. Drift tested in
// tests/business-roadmap-state-machine.spec.ts.
//
// Deliverable IDs are stable identifiers — they're keys in the
// business_roadmap_state.deliverables_completed jsonb column AND
// referenced by department-pack SKILL.md routing in 5-2.a/b. Renaming
// requires a coordinated migration + drift sweep. See
// agent-packs/business-director/templates/roadmap/5-stage-checklist.md
// (introduced in 5-2.a) for the customer-facing names matched to these.
//
// Naming convention: `<stage>_<short_snake_case>` — the stage prefix is
// enforced by tests so a typo can't quietly promote a wrong-stage
// deliverable.

export const STAGES = ['idea', 'setup', 'identity', 'build', 'sell'] as const
export type StageKind = (typeof STAGES)[number]

export const STAGE_DELIVERABLES: { readonly [K in StageKind]: readonly string[] } = {
  // ── Stage 1: idea — validate the business concept ─────────────────
  idea: [
    'idea_problem_articulated',      // Founder has written the problem in 1 paragraph
    'idea_target_customer_defined',  // Segment + pain point identified
    'idea_competitor_scan_done',     // ≥3 competitors mapped (positioning, pricing, gaps)
    'idea_pricing_hypothesis',       // Initial pricing model hypothesized
  ],
  // ── Stage 2: setup — legal entity + tax foundation ───────────────
  setup: [
    'setup_entity_chosen',           // PT vs CV vs Personal decision made
    'setup_pt_incorporated',         // Akta notaris signed; NIB obtained via OSS
    'setup_npwp_acquired',           // Corporate NPWP obtained from DJP
    'setup_bpjs_registered',         // BPJS Ketenagakerjaan + Kesehatan registered (PT-only; safely skipped for CV/Personal)
  ],
  // ── Stage 3: identity — brand + presence ─────────────────────────
  identity: [
    'identity_brand_defined',        // Name, logo, brand voice locked
    'identity_landing_live',         // Landing page deployed + reachable
    'identity_socials_claimed',      // IG/TikTok/LinkedIn handles registered
    'identity_legal_pages_published',// Privacy policy + ToS published
  ],
  // ── Stage 4: build — product + ops ───────────────────────────────
  build: [
    'build_mvp_shipped',             // First sellable product/service usable
    'build_first_payment_flow',      // Payment provider integrated + tested (Xendit / direct transfer / e-wallet)
    'build_customer_support_channel',// Telegram/email support live
    'build_unit_economics_modeled',  // CAC + margin per unit known
  ],
  // ── Stage 5: sell — revenue + growth ─────────────────────────────
  sell: [
    'sell_first_paying_customer',    // First real customer money received
    'sell_10_paying_customers',      // 10 paying customers achieved
    'sell_referral_loop_active',     // Referral mechanism in place
    'sell_recurring_revenue_stable', // MRR positive for 3+ consecutive months
  ],
} as const

/** Flat deduplicated set of every deliverable id across all 5 stages. */
export const ALL_DELIVERABLES: readonly string[] = STAGES.flatMap(
  (s) => STAGE_DELIVERABLES[s] as readonly string[],
)
