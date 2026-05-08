# Persona v2 rewrite — Spec (LOCKED 2026-05-09)

> **Status:** LOCKED 2026-05-09 (founder). All scope decisions captured here mirror memory `persona_v2_revision_2026_05_08.md`. Implementation in progress on `feat/persona-v2-rewrite`.
> **Branch:** `feat/persona-v2-rewrite` (off main at `ffa46bc` — Phase 2E-3 merge).
> **Ships AFTER:** Phase 2E-3 (`#6` merged 2026-05-08).

---

## Why this exists

The 10 v1 personas were locked during Phase 2C-1 — calm-premium voice, brand-aligned tone signatures, drift-tested. After running the full provisioning + onboarding stack against them through Phases 2C → 2E-3, the founder's product vision evolved:

- **Web Master's Phase 2A scope** (browser automation: scrape + form-fill + monitor) doesn't fit the rest of the agent library, which leans toward "agent that produces an artifact you can hand to a client/customer." Pivoted to **Web Creator** (websites, blogs, deploy, domain advisory).
- **Macro Strategist** as conceived ("global macro analysis") was over-scoped for our Indonesian customer base. The real demand is **Project Conductor** — multi-agent orchestration via Hermes v0.13.0 native kanban.
- **Business Director** v1 was "KPI dashboards." Founder shifted to "Indonesian-founder business enabler" — 5-stage roadmap from idea to launch, with Indonesia-specific compliance (PT/CV setup, OSS, BPJS, payment gateway).
- **Doc Expert / Slide Master / Trade Pro / Video Producer** are conceptually correct but missing capabilities that customer signal demands (academic templates, broader template library, IDR/BI rate analysis, real video rendering).
- **Social Conductor** needs database management (content calendar + engagement DB) — locked Option B (no customer scraping).
- **The Pro / Deep Researcher** are correct as-is. Skip.

Phase B locks the v2 surface so customer-facing marketing + the per-agent bundle library can be aligned to what we actually want to ship.

---

## Per-persona scope

| # | Persona (v1) | v2 action | Tier change | New tier |
|---|---|---|---|---|
| 1 | The Pro | unchanged | — | Pro+ |
| 2 | Deep Researcher | unchanged | — | Pro+ |
| 3 | Web Master | **REPLACE** → Web Creator | — | Pro+ |
| 4 | Doc Expert | **EXPAND** | — | Pro+ |
| 5 | Slide Master | **EXPAND** | Pro+ → **All tiers** | Starter+ |
| 6 | Trade Pro | **EXPAND** (+IDR/BI from Macro, +Bitget P1) | — | Pro+ |
| 7 | Macro Strategist | **REPLACE + RENAME** → Project Conductor | Studio → **Pro+** | Pro+ |
| 8 | Business Director | **REPLACE** (scoped MVP) | Pro+ → **Studio** | Studio |
| 9 | Video Producer | **EXPAND** (HyperFrames Phase 4-1 brought forward) | — | Pro+ |
| 10 | Social Conductor | **EXPAND** (+content-calendar DB + engagement DB; NO scraping) | — | Pro+ |

7 of 10 change. 2 unchanged. 1 renamed.

---

## Detailed per-persona specs

### 3. Web Master → **Web Creator** (REPLACE)

**Persona narrative:**
> "Aku bikin website komplit, dari template ke deploy. Pakai Claude design.md sebagai reference, deploy ke Vercel, sarankan domain provider Indonesia (Niagahoster, IDwebhost, Hostinger), bikin blog SEO-optimized buat traffic organik."

**Skills bundle (new):**
1. `landing-page-builder` — 5 templates (SaaS, agency, course, portfolio, e-commerce)
2. `multi-page-site-builder` — about, services, contact pages
3. `blog-post-creator` — SEO-optimized, Indonesian context
4. `vercel-deploy-orchestrator` — auto-deploy with custom domain hookup
5. `domain-advisory` — Niagahoster, IDwebhost, Hostinger price comparison + recommendation

**Templates:** 5+ Indonesian-context templates per category (UMKM, wedding, F&B menu, etc.). Reference Claude `design.md` for visual register.

**Tone signature:** practical, deploy-ready, Indonesian-context-aware. Replaces v1's "automation-focused" tone.

**Slug:** `web-master` retained (changing slug is migration cost; rename in display name only).

---

### 4. Doc Expert (EXPAND)

**Existing scope (Phase 2E-1):** invoice-generator, business letter, proposal templates.

**Add:**
1. `academic-doc-builder` workflow
2. Templates: skripsi (BAB I-V structure), thesis, assignment, abstract (Indonesian + English)
3. Citation styles: APA, MLA, Chicago — with Indonesian formatting conventions

**No tone change.** Customer can ask "bikin invoice", "bikin skripsi BAB 2", "bikin proposal" — Hermes routes via SKILL.md.

**Reference Claude `design.md`** for all PDF outputs (consistent visual register; ties into Phase 2E-3 PDF rendering pipeline).

---

### 5. Slide Master (EXPAND + tier change)

**Existing scope (v1):** narrative-arc deck builder.

**Add:**
1. 10-20 template library (alternative to narrative-arc default)
2. Student-focused: presentasi tugas, defense thesis, kuliah
3. Worker-focused: weekly report, project update, training

**Customer modes:**
- "Deck dari template" (template-picker mode, NEW)
- "Deck dari awal pakai struktur narasi" (existing narrative-arc mode, PRESERVED)

**Tier change:** Pro+ → **All tiers** (Starter+). Templates simple enough for entry tier — opens upsell path.

---

### 6. Trade Pro (EXPAND)

**Existing scope (v1):** stock + crypto alerts, earnings summary.

**Add (moved from Macro Strategist):**
1. IDR/USD analysis
2. BI rate watcher

**Add (new):**
3. Bitget integration (P1 — read-only initially)
4. Polymarket data (P2 — deferred)

**Voice unchanged.** Same disclaimer ("aku bukan financial advisor"), same risk-sized recommendations.

---

### 7. Macro Strategist → **Project Conductor** (REPLACE + RENAME)

**Persona narrative:**
> "Aku jaga big picture project lo. Kanban board buat semua task. Spawn specialist agents per task. Monitor dashboard nunjukin progress. Kalau ada blocker, aku ping. Hermes native kanban yang nge-handle, aku yang orkestrasi."

**Skills bundle (new):**
1. `kanban-orchestrator` — uses Hermes v0.13.0 native kanban
2. `task-decomposer` — turns "plan product launch" into routable tasks
3. `multi-agent-router` — delegates to The Pro / Deep Researcher / etc.
4. `progress-monitor` — dashboard URL output

**Tone signature:** orchestrating, big-picture, decisive. New voice; replaces v1 "macro analyst."

**Slug rename:** `macro-strategist` → `project-conductor`. Update all references (folder, manifest entries, marketing copy, landing JS).

**Tier change:** Studio → **Pro+** (broader appeal — orchestration is useful at all paid tiers, not just Studio).

---

### 8. Business Director (REPLACE — scoped MVP)

**Persona narrative:**
> "Aku panduin lo dari 'idea' ke 'launched company.' 5 tahap: Idea → Setup → Identity → Build → Sell. Tahu konteks Indonesia: PT/CV setup, OSS, BPJS, payment gateway lokal (Xendit, Midtrans), bank Indonesia. Spawn department-specialist agents (Sales, Marketing, Engineering, Legal, Finance)."

**Skills bundle (new):**
1. `business-roadmap-tracker` — 5-stage progression tracking
2. `incorporation-advisor` — PT vs CV, OSS process, biaya estimates
3. `department-task-spawner` — delegates to Sales/Marketing/Eng skill packs (lightweight at MVP)
4. `compliance-checker` — BPJS, taxes, NPWP

**Tone signature:** experienced-cofounder, decisive, Indonesia-savvy. New voice.

**Tier change:** Pro+ → **Studio** (premium business-enabler positioning, Rp 5.9jt/bulan).

**Out of scope (Phase 6+):** full department workspaces, custom codebase integration, investor dashboard, dedicated HR agent.

---

### 9. Video Producer (EXPAND — HyperFrames Phase 4-1 brought forward)

**Existing scope (v1):** TikTok/Reels script writer, edit suggestions, hashtag research.

**Add:**
1. `tiktok-video-builder` workflow (extends current `tiktok-script-builder` with rendering)
2. HyperFrames as render backend
3. Output: actual MP4 video, not just script

**Marketing copy update:** "Bikin video TikTok lengkap — hook, body, CTA, render, semua jadi" (vs old "Bikin script TikTok").

**Note:** HyperFrames integration is rough — full Phase 4 work captured in `video_producer_capabilities_2026.md`. v2 ships the wrapper skill + a script→render pipeline that calls a stub renderer (returns placeholder MP4) until HyperFrames lands. Mirrors the Resend stub pattern from Phase 2E-3.

---

### 10. Social Conductor (EXPAND — Option B)

**Founder lock (2026-05-08):** content calendar DB + engagement DB. **NO customer scraping.**

**Existing scope (v1):** trending topics, best-time posting, brand-voice DM auto-reply.

**Add:**
1. `content-calendar-db` — drafts, scheduled, published posts with metadata (platform, hook, CTA, tags, scheduled_at)
2. `engagement-db` — replies, mentions, DMs tracked (platform, sender, content, sentiment, action_taken)

**Explicit non-goals:**
- ❌ Customer scraping (privacy concern)
- ❌ Engagement automation that pretends to be the customer (brand-voice draft only; customer approves before send)

**Tone signature:** unchanged.

---

### 1, 2. The Pro + Deep Researcher (UNCHANGED)

Skip. Existing SOUL.md + manifest stay as-is.

---

## File-level breakdown

For each agent with REPLACE/EXPAND, the deliverable set:

| Item | Web Creator | Doc Expert | Slide Master | Trade Pro | Project Conductor | Business Director | Video Producer | Social Conductor |
|---|---|---|---|---|---|---|---|---|
| `agent-packs/<slug>/SOUL.md` rewrite | ✅ full | partial | partial | partial | ✅ full | ✅ full | partial | partial |
| `agent-packs/<slug>/manifest.json` | ✅ new | ✅ update | ✅ new | ✅ new | ✅ new | ✅ new | ✅ update | ✅ new |
| `agent-packs/<slug>/skills/*/SKILL.md` | ✅ 5 new | ✅ 1 new | ✅ 10-20 new templates | ✅ 4 new | ✅ 4 new | ✅ 4 new | ✅ 1 new wrapper | ✅ 2 new |
| `agent-packs/<slug>/templates/` | ✅ 25+ files | ✅ 5+ academic | ✅ 10-20 templates | ⛔ data-only | ⛔ orchestration-only | ⛔ data-only | ✅ stub MP4 fixture | ⛔ DB-only |
| Slug rename | — | — | — | — | ✅ macro→project-conductor | — | — | — |
| Drift tests | ✅ new | ✅ extend | ✅ new | ✅ new | ✅ new + remove macro tests | ✅ new | ✅ extend | ✅ new |
| Manifest version bump | — (new) | 2.0 | — (new) | — (new) | — (new) | — (new) | 2.0 | — (new) |
| index.html `AGENTS` array desc update | ✅ | ✅ | ✅ | ✅ | ✅ + name rename | ✅ | ✅ | ✅ |
| Tier-change SQL migration | — | — | ✅ Slide → Starter | — | ✅ Project → Pro | ✅ Business → Studio | — | — |

---

## Memory bumps

After implementation:

1. `weuseai_active_dev_state.md` — record v2 active, list all 10 agent statuses + tier mapping.
2. `persona_v2_revision_2026_05_08.md` — append "shipped 2026-05-XX" + commit ref.

---

## Acceptance criteria (checkbox-ready)

### Per-persona content

- [ ] **Web Master folder retained but renamed display label to "Web Creator"** — SOUL.md rewritten, manifest.json + 5 skills shipped, 25+ Indonesian templates in `templates/`.
- [ ] **Doc Expert** — `skills/academic-doc-builder/SKILL.md` exists, 5 academic templates (skripsi BAB I-V, thesis, assignment, abstract ID, abstract EN) under `templates/academic/`.
- [ ] **Slide Master** — `skills/template-deck-builder/SKILL.md` (template-picker mode), 10-20 templates split student/worker, narrative-arc mode preserved.
- [ ] **Trade Pro** — `skills/idr-bi-rate-watcher/SKILL.md`, `skills/bitget-readonly/SKILL.md` (Polymarket deferred to P2 placeholder), no skill bundle for "macro" anymore (moved here).
- [ ] **Project Conductor** — folder renamed `agent-packs/macro-strategist/` → `agent-packs/project-conductor/`, SOUL.md fully rewritten, 4 skills shipped (kanban-orchestrator, task-decomposer, multi-agent-router, progress-monitor).
- [ ] **Business Director** — SOUL.md rewritten, 4 skills shipped (business-roadmap-tracker, incorporation-advisor, department-task-spawner, compliance-checker).
- [ ] **Video Producer** — `skills/tiktok-video-builder/SKILL.md` exists alongside existing `tiktok-script-builder`, render returns stub MP4 path with status='hyperframes_stub' (mirrors Resend stub pattern).
- [ ] **Social Conductor** — `skills/content-calendar-db/SKILL.md`, `skills/engagement-db/SKILL.md`, both gated on customer-side schema (DB tables documented in spec; migrations ship with bundle).

### Cross-cutting

- [ ] All v2 manifests pass `tests/manifest-validator.spec.ts` (drift caught).
- [ ] `tests/persona-pack-drift.spec.ts` (or equivalent) updated for v2 SOUL.md content.
- [ ] `tests/soul-md-template.spec.ts` continues to pass for The Pro (the Phase 2C-1 baseline persona scaffold).
- [ ] `index.html` `AGENTS` array reflects v2 descriptions; carousel commentary blocks updated for renamed agents.
- [ ] `weuseai_active_dev_state.md` reflects v2 state.
- [ ] Migration: `customers` row's tier defaults still match v1 (no auto-migration needed — customers keep their current tier; new sign-ups land per the new tier mapping).
- [ ] PR description includes before/after marketing copy diffs + 1 screenshot per persona card (carousel).

### Out of scope (deferred)

- ❌ Customer-side dashboard for switching personas (Phase 3-lite).
- ❌ Per-persona pricing display on landing (Phase 4 marketing pass).
- ❌ Real HyperFrames render integration (Phase 4-1 — stub for now).
- ❌ Real Bitget OAuth (P1 read-only via API key only; OAuth in Phase 4).
- ❌ Polymarket integration (P2 — placeholder skill returns "coming soon").
- ❌ Department workspaces for Business Director (Phase 6+).

---

## Estimated work breakdown (day-by-day)

**Day 1 — spec + scaffolding** (TODAY)
- This doc.
- Folder rename `macro-strategist/` → `project-conductor/` + reference grep.
- Stub manifest.json files for 7 personas that need them.
- Drift test scaffolding.

**Day 2 — Web Creator + Doc Expert v2**
- Web Master SOUL.md rewrite + 5 skills + 25 templates (heaviest persona; ~half a day).
- Doc Expert academic-doc-builder skill + 5 templates.
- Drift tests for both.

**Day 3 — Project Conductor + Business Director v2**
- Project Conductor SOUL.md (full rewrite from Macro Strategist) + 4 skills.
- Business Director SOUL.md (full rewrite) + 4 skills.
- Drift tests + folder-rename test.

**Day 4 — Trade Pro + Slide Master + Video Producer + Social Conductor v2**
- Smaller per-persona delta (mostly skill additions + manifest bumps).
- Trade Pro: IDR/BI + Bitget skills.
- Slide Master: 10-20 templates + template-picker SKILL.md.
- Video Producer: tiktok-video-builder wrapper + stub renderer.
- Social Conductor: content-calendar-db + engagement-db skills.

**Day 5 — Marketing copy + tier-change SQL + memory bumps**
- `index.html` AGENTS array updates.
- Tier-change migration (Slide → Starter, Project → Pro+, Business → Studio).
- `weuseai_active_dev_state.md` bump.
- Final test sweep.

**Day 6 — PR + review**
- PR open with diff summary + before/after copy + per-persona acceptance.

**Total: 6 days end-to-end.**

---

## What's NOT in this PR

- Per-persona dashboard UI (Phase 3-lite).
- Persona switching mid-conversation (Phase 3-lite).
- Real HyperFrames + Bitget integrations (Phase 4).
- Department-specialist agent packs for Business Director (Phase 6+).
- Cofounder-clone full Business Director scope (Phase 6+).

---

## Reference memory files

- `persona_v2_revision_2026_05_08.md` — the v2 source of truth.
- `weuseai_active_dev_state.md` — to be bumped post-merge.
- `hermes_v0_13_0_strategic_shifts.md` — Hermes v0.13.0 native kanban (powers Project Conductor).
- `autobrowse_phase4_potential.md` — Web Creator multipliers for Phase 4.
- `video_producer_capabilities_2026.md` — HyperFrames roadmap (Phase 4-1).
