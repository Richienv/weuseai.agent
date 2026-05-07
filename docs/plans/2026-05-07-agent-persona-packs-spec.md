# Agent Persona Packs — Architecture Spec (2026-05-07)

> **Status:** APPROVED 2026-05-07 (founder), Day 1 implementation in progress on `feat/agent-persona-packs`.
> **Goal:** ship 10 agent-specific SOUL.md personas, with The Pro as the default companion. Replaces the agent-agnostic SCAFFOLD that shipped with onboarding (2026-05-06).

---

## Why this exists

The carousel at `index.html:3434` advertises 10 specialist agents — The Pro, Deep Researcher, Web Master, Doc Expert, Slide Master, Trade Pro, Macro Strategist, Business Director, Video Producer, Social Conductor. Each has a distinct seed description on the landing page. Until today, the actual agent provisioned for every customer was a single agent-agnostic persona ("I am an AI agent built for {customer_name}…") shipped with the onboarding flow (`docs/plans/2026-05-06-onboarding-page-spec.md`, edit H).

This spec adds the missing piece: 10 agent-specific SOUL.md scaffolds, selected per customer at onboarding, defaulting to The Pro when nothing is picked.

---

## Architecture

### Two write paths, same content

```
                 ┌──────────────────────────────────┐
                 │ FIRST VPS BOOT (setup-script.ts) │
                 │  ─ writes SOUL.md = THE_PRO_SCAF │
                 │  ─ variables left as {tokens}    │
                 │  ─ purely cosmetic; customer is  │
                 │    on welcome.html polling state │
                 └─────────────┬────────────────────┘
                               │ ~5–7 min
                               ▼
                 ┌──────────────────────────────────┐
                 │ POST-ONBOARDING (Edge Function)  │
                 │  ─ renderSoulMd({ customerName,  │
                 │      expectationsClean,          │
                 │      personaSlug }) →            │
                 │    overwrites SOUL.md on VPS     │
                 │  ─ {customer_name}, {first_name},│
                 │    {user_expectations_verbatim}, │
                 │    {connected_apps_list} all     │
                 │    substituted                   │
                 └──────────────────────────────────┘
```

The first write (provisioning) is a "pre-personalized" placeholder — the customer never sees it, because they're on `welcome.html` polling for `status='active'` while the VPS spins. Once active, they go through `onboarding.html`, which kicks the Edge Function that overwrites SOUL.md with their real name + expectations + chosen persona.

Idempotent flow: if a customer picks Deep Researcher (Day 2+), the first write is The Pro (default), the second write replaces it with Deep Researcher. No race, no leakage — the second write is the source of truth.

### Persona registry

```ts
// supabase/functions/_shared/soul-md-template.ts

const PERSONAS: Record<string, string> = {
  'the-pro': THE_PRO_SCAFFOLD,  // Day 1 (this PR)
  // 'deep-researcher': DEEP_RESEARCHER_SCAFFOLD,  // Day 2
  // 'web-master': WEB_MASTER_SCAFFOLD,            // Day 2
  // ... 7 more, see "Tone signatures" below
}

const DEFAULT_PERSONA_SLUG = 'the-pro'
```

`renderSoulMd({ ..., personaSlug })` looks up the slug; unknown slugs fall back to The Pro with a `console.warn`. Customers never get a blank SOUL.md.

### Source-of-truth: markdown files, mirrored TS constants

Each persona has TWO copies:

1. **Canonical:** `/agent-packs/<slug>/SOUL.md` — human-readable, edited by founder/copy reviewers.
2. **Inlined TS constant** in `supabase/functions/_shared/soul-md-template.ts` — used at runtime in the Edge Function. Mirrors the .md file byte-for-byte.

A drift-detection test in `tests/soul-md-template.spec.ts` reads the .md file at test time and asserts equality with the TS constant. Edit the .md first, then sync the constant. CI catches the drift.

`services/provisioning/src/setup-script.ts` ALSO has The Pro inlined (third copy). This one isn't drift-checked — it's a write-once first-boot value that gets overwritten anyway. Manual review is enough.

---

## Slug systems (carousel vs. folder)

Two parallel slug systems exist by design — DO NOT sync them:

| Layer | Style | Location | Owner |
|---|---|---|---|
| Carousel slug | Short, single-word | `index.html` `AGENTS` array (line ~3434) | Sesi A (UI) |
| Folder slug | Long, descriptive | `/agent-packs/<slug>/`, `PERSONAS` map | This spec |

The carousel slugs are baked into shipped HTML (and into landing page state); changing them risks regression. Folder slugs are spec-locked here. The mapping lives in provisioning code:

```ts
// services/provisioning/src/persona-slug-map.ts (Day 2+)
export const AGENT_SLUG_MAP: Record<string, string> = {
  pro:        'the-pro',
  researcher: 'deep-researcher',
  web:        'web-master',
  doc:        'doc-expert',
  slide:      'slide-master',
  trade:      'trade-pro',
  macro:      'macro-strategist',
  business:   'business-director',
  video:      'video-producer',
  social:     'social-conductor',
}
```

When the onboarding form sends a chosen persona, the dashboard/onboarding code sends the FOLDER slug. Carousel slugs are display-layer only.

Documenting here so Sesi B (UI work) doesn't try to "fix" the divergence.

---

## Phase boundaries (what ships when)

| Phase | Scope | Status |
|---|---|---|
| **2C-1** (this PR) | The Pro persona content + persona-routing infra (PERSONAS map, personaSlug parameter, fallback, drift test). Default = The Pro. | In progress |
| **2C-2** (Day 2) | 9 remaining personas: Deep Researcher, Web Master, Doc Expert, Slide Master, Trade Pro, Macro Strategist, Business Director, Video Producer, Social Conductor. Two batches of 5. | Pending |
| **2C-3** | Onboarding form persona picker UI + `AGENT_SLUG_MAP` translation + dashboard persona switch + per-persona connected-apps lists (replacing the Phase 1 hard-coded `- Telegram (chat dengan @weuseaibot)`). | Pending |
| **2C-4** | Per-persona skill bundles (Day-2 personas may need skill files in `/home/weuseai/.hermes/skills/<skill-name>/`). Shipped separately as each persona's domain becomes well-defined. | Backlog |

This PR (Day 1, 2C-1) ONLY ships The Pro infrastructure. Day 2 (2C-2) is the parallel-batch work after this lands and you've validated the test surface.

---

## Tone signatures (per persona)

Each persona's calm-premium voice modulates within a 3-word tone signature. The first one (The Pro) is locked; the other 9 are TODO for Day 2.

| Persona | Tone signature | Status |
|---|---|---|
| The Pro | calm, observasional, anticipatory | LOCKED 2026-05-07 (Day 1) |
| Deep Researcher | analytical, source-anchored, structured | LOCKED 2026-05-07 (Day 2 Batch A) |
| Web Master | precise, instrumental, defensive | LOCKED 2026-05-07 (Day 2 Batch A) |
| Doc Expert | composed, register-aware, draft-ready | LOCKED 2026-05-07 (Day 2 Batch A) |
| Slide Master | narrative, visual-first, deck-ready | LOCKED 2026-05-07 (Day 2 Batch A) |
| Trade Pro | decisive, market-aware, risk-conscious | LOCKED 2026-05-07 (Day 2 Batch A) |
| Macro Strategist | systemic, news-anchored, scenario-led | TODO Day 2 Batch B |
| Business Director | metric-driven, anomaly-sensitive, brief | TODO Day 2 Batch B |
| Video Producer | trend-fluent, hook-first, shipping-tempo | TODO Day 2 Batch B |
| Social Conductor | brand-aware, timing-aware, tone-matched | TODO Day 2 Batch B |

Day 2 drafts will validate or replace the TODO signatures. The 3-word descriptors are the differentiation primitive — every persona's content section ("How I communicate" → Tone) starts from this signature.

---

## Voice rules (universal across all 10 personas)

Same rules as `welcome.html` and the rest of the customer-facing surface. Per `CLAUDE.md`:

- `kamu` form, never `lo/gue`, never `Anda`.
- Zero exclamation marks in body copy.
- Zero emoji.
- Banned words: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Calm-premium register.
- Indonesian primary; English meta-directives (`Language:`, `Tone:`, `Style:`) and section headers stay in English (matches Sesi B's onboarding scaffold convention — those are LLM-facing config, not customer-facing copy).
- One idea per sentence, two-sentence paragraphs preferred.
- Tool language stays capability-level ("aku punya akses ke web search, scraping situs"), NOT tool-name-level ("Firecrawl, Playwright"). Tool wiring is a 2C-2 concern; persona prose stays accurate regardless of which adapter ships.

---

## File layout shipped this PR

```
agent-packs/
└── the-pro/
    └── SOUL.md                    NEW   ← canonical persona content
docs/
└── plans/
    └── 2026-05-07-agent-persona-packs-spec.md   NEW (this file)
supabase/functions/_shared/
└── soul-md-template.ts            MOD   ← THE_PRO_SCAFFOLD const + PERSONAS map
                                          + personaSlug parameter on renderSoulMd
                                          + EMPTY_EXPECTATIONS_FALLBACK
                                          + __INTERNAL_THE_PRO_SCAFFOLD export (test only)
services/provisioning/src/
└── setup-script.ts                MOD   ← SOUL_MD const replaced with The Pro content
tests/
└── soul-md-template.spec.ts       MOD   ← 24 existing tests pass, +5 new tests:
                                          • explicit personaSlug='the-pro' routes correctly
                                          • unknown slug falls back + warns
                                          • empty expectations triggers fallback string
                                          • non-empty expectations substitutes verbatim
                                          • drift check: agent-packs/the-pro/SOUL.md ≡ THE_PRO_SCAFFOLD
```

---

## Test coverage

`npm run test:onboarding` runs the persona-routing tests (24 existing + 5 new = 29 total in `soul-md-template.spec.ts`). The drift test is the single guarantee preventing the .md and the TS constant from diverging silently.

Day 2 personas each ADD:
- 1 entry to `PERSONAS` map
- 1 file in `/agent-packs/<slug>/SOUL.md`
- 1 entry in this spec's "Tone signatures" table
- 1 drift test (extending the same pattern as The Pro's)
- 1 routing test asserting the persona's signature line

Estimated: +20 tests by end of Day 2 (10 personas × 2 tests each).

---

## Out of scope (explicit deferrals)

- **`services/provisioning/src/cloud-init.ts`** — still has the lo/gue 2-line SOUL_MD. Dead code per the 2026-05-04 pivot to SSH-based provisioning, but `tests/cloud-init.spec.ts:35` still asserts against `/asisten AI berbahasa Indonesia/`. Updating cloud-init.ts to The Pro would force test changes that aren't in this PR's scope. **If cloud-init is ever resurrected, the SOUL_MD constant must be synced to The Pro before shipping**, and the test regex updated.
- **Day 2 personas (9 specialists).** Drafted in batch after The Pro voice is locked.
- **`AGENT_SLUG_MAP`** translation table at the dashboard/onboarding boundary. Ships in 2C-3 alongside the persona picker UI.
- **Per-persona skill bundles.** Each agent may need different skills installed (Deep Researcher → web search heavy; Trade Pro → market data API; etc). Skill files (`/home/weuseai/.hermes/skills/<name>/`) are 2C-4 work, decoupled from persona prose.
- **Connected-apps list per persona.** Phase 1 hard-codes `- Telegram (chat dengan @weuseaibot)` for everyone. Phase 2C-3 will compute it from the customer's actual integration list (post-OAuth).
- **Signed-JWT polling auth on welcome page.** Tracked separately in `NEXT.md` Phase 2B revisit list.

---

## Open questions for Day 2

1. **Tool wiring per persona.** When does Phase 2C-2 land? Persona prose stays capability-level on purpose (resilient to wiring shifts), but eventually the 9 specialists need actual tool access — Deep Researcher without web search isn't useful. Track in NEXT.md.
2. **Persona switch mid-relationship.** If a customer is provisioned with The Pro and later wants to switch to Trade Pro from the dashboard, do we re-write SOUL.md on the VPS, or spawn a second agent context? Current architecture supports re-write (Edge Function can re-call `renderSoulMd` with a new slug). Decision deferred until 2C-3 dashboard work.
3. **Multi-persona households.** Studio tier promises "10 agents" — does that mean 10 distinct VPS instances each with one persona, or 1 VPS running multiple Hermes processes each pinned to a different SOUL.md? Architecturally simpler is 10 VPS; cost-wise a single VPS with N agent processes is better. Out of scope here, flagged for product/infra review.

---

*Last updated: 2026-05-07 by Claude (Day 1 — The Pro infrastructure)*
