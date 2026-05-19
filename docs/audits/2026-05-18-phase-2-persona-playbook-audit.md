# Phase 2 Persona Playbook Audit — 2026-05-18

**Scope:** Read-only audit of the skill + template + playbook state of the three
Phase 2 candidate personas — `project-conductor`, `business-agent`,
`web-app-builder` — plus a Phase 2 playbook-design recommendation per persona.
No code changed. No SKILL.md authored. Upstream Hermes untouched.

**Purpose:** Phase 2 Week 1 of the playbook workstream. Phase 1 shipped the
state-machine engine + the `skill_kind: "playbook"` format + three reference
playbooks. This audit decides *which* playbooks each Phase 2 persona should
offer, the rough step shape, and where the escalation gates fall — so Week 2
authoring can start fast.

**Companion docs:**
- `docs/audits/2026-05-17-persona-template-and-playbook-inventory.md` — the
  Phase 1 Week 1 audit. This document is its structural sequel: per-persona
  sections, a cross-persona format section, a build-order list, a flagged-
  ambiguities section.
- `docs/plans/2026-05-18-phase-2-persona-prep.md` — the Phase 2 prep notes
  that scope this audit and park the open follow-ups.

**Phase 1 result this audit builds on (all PROVEN, reuse unchanged):**
- The format is real and accepted. A playbook is a `skills/<id>/SKILL.md`
  tagged `skill_kind: "playbook"` in `manifest.json`, with YAML frontmatter
  (`skill_kind`, `name`, `flow_state_playbook_id`, `total_steps`, `use_cases`,
  `prerequisites`, `escalation_to`) and a `## Langkah-langkah` section of
  `### Langkah N` steps. Each step has six bold fields — Aksi / Tautan-endpoint
  / Input yang diharapkan / Output yang diharapkan / Validasi / Gerbang
  eskalasi — plus an Error handling line. The standalone `_manifest.schema.json`
  and `manifest-validator.ts` both carry the `skill_kind` enum (`["skill",
  "playbook"]`).
- The engine is live. `customer_flow_state` table + `flow-state` Edge Function
  (`index.ts` + `_shared/flow-state-handler.ts`). Operations `start` / `get` /
  `advance` / `complete` / `abort`; parked statuses `awaiting_customer`
  (soft checkpoint) and `escalated` (hard gate). State persists between atomic
  skill invocations — a playbook is a *sequence of atomic invocations*, not a
  long-running skill. No native Hermes pause/resume dependency.
- The directory layout is fixed: `skills/<id>/SKILL.md`. Never a flat
  `.flow.md`. A playbook rides the existing `publish-persona-bundles.mjs` →
  tarball → `bundle-pull` path with zero new distribution mechanism. Bump the
  pack's `manifest.json` `version` (semver) when a playbook is added.

Phase 2 playbook work is therefore **content authoring + a manifest entry** —
no engine work — unless a playbook needs a capability the engine lacks. The
PT-registration playbook is the one place this audit found such pressure (see
§1 and §5).

---

# Persona 1 — `project-conductor` (display "Project Conductor")

Folder: `agent-packs/project-conductor/`. Manifest `version` 2.0.0. Tier:
Pro + Studio. Renamed from `macro-strategist`.

## 1. Skill inventory

Four content skills on disk + the shared `extend-capabilities`:

| Skill | Shape today | Notes |
|---|---|---|
| `kanban-orchestrator` | single-shot | One action per call — `create-board` / `add-task` / `move-task` / `view-board` / `custom-columns`. "Yang dilakukan" resolves one Hermes v0.13.0 kanban primitive call. No inter-step gate. |
| `task-decomposer` | single-shot | Project goal → 6-15 task JSON in one reasoning pass. Output is "approve plan ini, atau adjust dulu?" — a conversational checkpoint, not a state-machine park. |
| `multi-agent-router` | single-shot | Resolves a persona, spawns a child Hermes session for one `task_id`, writes result back to the kanban. One delegation per call. |
| `progress-monitor` | single-shot | Renders a dashboard HTML / weekly recap / blocker list / timeline for one board, one mode. Cron-triggerable. |

**Templates:** zero. `manifest.json` `templates: []`. Every skill's
`templates_used` is empty.

**Playbook-shaped today:** none — but Project Conductor is *structurally a
meta-playbook persona*. Its `SKILL.md` shell explicitly sequences
task-decomposer → kanban-orchestrator → multi-agent-router → progress-monitor,
and the SOUL.md "How I behave" already names a checkpoint ("Sebelum spawn
task, aku tunjukkan plan dulu... Mau diteruskan, atau adjust dulu?"). The
sequencing is emergent prose across four files — same situation deep-researcher
was in before Phase 1 formalised its pipeline.

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`project-orchestration`** — the four-skill pipeline made explicit | 1 intake project goal/timeline/team → 2 decompose to tasks (`task-decomposer`) → **3 checkpoint: customer approves plan + owners** → 4 create kanban board (`kanban-orchestrator`) → 5 spawn tasks per owner (`multi-agent-router`, loops) → 6 monitor + weekly recap (`progress-monitor`) | Step 3 = `checkpoint`. Spawning specialist agents burns the customer's BYOK tokens, so the agent stops for plan approval before any spawn — directly mirrors SOUL.md "Spawn = approved by you". No `hard-gate` — orchestration touches no money/legal line itself. |
| **`pt-perorangan-registration`** — the headline Phase 2 deliverable, see §5 | ~7 steps: AHU registration → Coretax NPWP → NIB on OSS → domicile → bank account → Xendit activation, plus an intake step | Heaviest `hard-gate` load of any playbook in the product. Every money/legal-identity/irreversible step is a `hard-gate`. Designed in detail in §5. |
| **`weekly-recap-cycle`** (optional, lower priority) | 1 aggregate 7-day kanban activity → 2 compose recap per audience → **3 checkpoint: customer reviews before it goes to stakeholders** → 4 deliver | Step 3 = `checkpoint` if `audience != self`. Light playbook; mostly a formalisation of `progress-monitor` weekly-recap mode. Candidate only if the persona needs a third playbook. |

The two playbooks to actually build for this persona are
`project-orchestration` and `pt-perorangan-registration`.

## 3. Gaps

- **No templates.** `project-orchestration` needs a pinned task-list schema
  (the hand-off payload between `task-decomposer` and `kanban-orchestrator` —
  `{ id, title, suggested_owner_persona, dependencies[], estimated_hours,
  milestone_tag }`). Phase 1's lesson: a playbook step's hand-off shape must be
  pinned, and any template file a step references must be named by its exact
  resolved path inside "Input yang diharapkan" (there is still no template
  loader). Either add a `templates/schema/task-list.md` or pin the shape inline
  in the step's "Output yang diharapkan" field.
- **`multi-agent-router` is a loop inside one playbook step.** Step 5 spawns N
  child agents. The flow-state engine has no loop primitive — `advance` moves
  the cursor +1, once. The playbook must model the whole spawn-and-collect
  fan-out as a single step whose internal looping is the agent's own
  responsibility, recording the aggregate result in one `step_output`. This is
  authorable with the current engine but should be a deliberate design note
  in the SKILL.md.
- **Recursion guard.** `multi-agent-router` already declines spawning
  project-conductor into project-conductor. If `pt-perorangan-registration`
  ends up *invoked as a step* of `project-orchestration` (the open design
  question, §6), that guard's scope needs re-confirming — a playbook-calling-
  playbook is a new edge the current guard was not written for.

---

# Persona 2 — `business-agent` (display "Business Director")

Folder: `agent-packs/business-agent/`. Manifest `version` 3.0.0. Tier: Studio
only (`phase_5_enabled` gate). The richest pack audited.

## 1. Skill inventory

Eight content skills + shared `extend-capabilities`:

| Skill | Shape today | Notes |
|---|---|---|
| `business-roadmap-tracker` | single-shot | Resolves one stage, loads the 5-stage checklist template, surfaces 5-7 deliverables. State persisted in `business_roadmap_state` — but the *skill* is one pass. |
| `incorporation-advisor` | single-shot | Three modes (`pt-vs-cv` / `oss-walkthrough` / `cost-estimate`), one mode per call. `oss-walkthrough` mode internally lists a 7-step recipe — an ordered recipe for one atomic call, **not** a gated playbook. |
| `compliance-checker` | single-shot | Filters Indonesian due-dates, surfaces 3-5 imminent items. Cron-triggerable. |
| `sales-dispatch` / `marketing-dispatch` / `engineering-dispatch` / `legal-dispatch` / `finance-dispatch` | single-shot facades | Pure intent → specialist-persona routing. `legal-dispatch` + `finance-dispatch` + `marketing-dispatch` surface `approval_requests` rows (`contract_sign` / `regulatory_filing` / `public_emission`) — a *separate* approval system from the flow-state engine (see Gaps). |

**Templates:** eight, all real and file-backed — `roadmap/5-stage-checklist.md`,
`incorporation/pt-vs-cv-comparison.md`, `incorporation/oss-checklist.md`,
`compliance/indonesian-due-dates.md`, `finance/bpjs-registration-paths.md`,
`finance/djp-tax-filing-cycle.md`, `finance/bank-account-checklist.md`,
`legal/uu-pdp-basic-compliance.md`. This is the only Phase 2 persona with a
populated, manifest-registered template library — and `oss-checklist.md` and
`bank-account-checklist.md` are *already step-sequenced procedure documents*
(numbered steps, gotchas, timeline), so they are near-ready playbook source
material.

**Playbook-shaped today:** none. The 5-stage roadmap (Idea → Setup → Identity →
Build → Sell) is a strict ordered progression with decision points and
approval gates — conceptually the largest playbook in the product — but it is
tracked by `business_roadmap_state` + `services/business-roadmap/src/stages.ts`,
a *bespoke* state machine that predates and is independent of the flow-state
engine. `incorporation-advisor`'s `oss-walkthrough` mode is the closest thing
to a real step sequence but it is single-shot, ungated, advisory-only.

## 1a. Important architectural finding — two state machines

business-agent already has its OWN state + approval infrastructure:
`business_roadmap_state` (5-stage progression), `approval_requests` (per-action
expiry: `incorporate` 14d, `contract_sign` 14d, `public_emission` 24h,
`regulatory_filing` 48h), `department_threads`, `bd_decisions_log`, and the
`approval-queue-handler` Edge Function. This is Phase 5 work that shipped
before the playbook engine existed.

This is a real overlap with the flow-state engine and the single biggest
design question for this persona. A Phase 2 business-agent playbook must NOT
silently fork a third state model. Recommendation: business-agent playbooks
use the flow-state engine for *step sequencing within one procedure* (the
"how do I do this multi-step thing" layer) and continue to use
`approval_requests` for *durable, expiring, Telegram-surfaced approvals* (the
"this needs your sign-off and can sit for 14 days" layer). The flow-state
`escalated` status is a *parked-run* state, not a durable approval ledger —
mapping a 14-day `incorporate` approval onto `escalated` would lose the
expiry semantics. So a business-agent playbook's `hard-gate` step should
*open an `approval_requests` row* and park the flow-state run at `escalated`,
and resume only when the approval handler flips `approved_at`. The audit
flags this as a confirm-before-authoring item (§6).

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`incorporation-walkthrough`** | 1 intake (entity type, KBLI/business kind, modal readiness) → 2 PT-vs-CV decision surface (`incorporation-advisor` pt-vs-cv) → **3 checkpoint: customer picks entity** → 4 cost estimate + document checklist → 5 OSS walkthrough (`incorporation-advisor` oss-walkthrough, using `oss-checklist.md`) → **6 hard-gate: customer confirms before any filing** → 7 NIB-issued confirmation + 90-day verification reminder set | Step 3 = `checkpoint` (entity choice). Step 6 = `hard-gate` — incorporation is irreversible and costs real money (notary Rp 2-3jt, modal Rp 50jt for PT); opens an `incorporate` `approval_requests` row. Note this overlaps heavily with the PT-registration playbook (§5) — see §6 ambiguity on whether they are one playbook or two. |
| **`compliance-cycle`** | 1 intake (business status, has-employees) → 2 enumerate active obligations (`compliance-checker`, using `indonesian-due-dates.md`) → 3 surface imminent items + reminder schedule → **4 hard-gate per filing: customer confirms before any SPT/PPN submission** → 5 deliver filing-ready draft | Step 4 = `hard-gate` for every filing intent (`ppn-filing`, `spt-tahunan`) — government filing, real money, `regulatory_filing` `approval_requests` row, 48h expiry. Advisory-only items (`pricing-review` etc.) auto-advance. |
| **`five-stage-roadmap`** (optional, large) | 5 macro-steps, one per stage, each with a checkpoint between stages and `hard-gate`s at the four approval-gated deliverables (`setup_pt_incorporated`, `identity_legal_pages_published`, `build_first_payment_flow`, `sell_first_paying_customer`) | The most ambitious playbook in the product. NOT recommended for Phase 2 Week 2 — it would mean re-platforming the existing `business_roadmap_state` machine onto flow-state, which is out of scope and risky. Note it as a Phase 3+ candidate. |

The two playbooks to build for this persona are `incorporation-walkthrough`
and `compliance-cycle` — and `incorporation-walkthrough` likely *merges with*
or *is the business-agent half of* the PT-registration playbook (see §6).

## 3. Gaps

- **State-machine overlap (the §1a finding)** — must be resolved before
  authoring. The recommended split (flow-state for sequencing,
  `approval_requests` for durable approvals) needs founder/engineering
  confirmation. The SKILL.md `hard-gate` step needs a documented pattern for
  "open approval row + park `escalated` + resume on `approved_at`".
- **No procedure templates for `compliance-cycle`'s output shape** — the
  due-date reference exists, but the playbook's per-filing hand-off payload
  (which obligation, computed amount, draft document path) is unpinned.
- **PII handling crosses playbook steps.** `finance-dispatch` /
  `legal-dispatch` already document a PII-redaction allowlist (NPWP/KTP pass
  through only for `incorporation-advisor` + `compliance-checker`). A playbook
  that accumulates state across steps in `state_data` will carry NPWP/KTP in
  `state_data` — the `customer_flow_state` row. That row is RLS-locked and
  X-CID-gated, which is the right posture, but the playbook author must be
  explicit that surfaced summaries redact and only final printable documents
  carry full PII, consistent with the existing dispatch-skill rule.
- **Tier gate.** business-agent is Studio-only with a `phase_5_enabled` flag.
  Playbook `prerequisites` frontmatter must state this so the playbook does
  not advertise itself to a Pro customer.

---

# Persona 3 — `web-app-builder` (display "Web Creator")

Folder: `agent-packs/web-app-builder/`. Manifest `version` 2.1.0. Tier: Pro +
Studio (the six site-extractor seed skills are Studio-only).

## 1. Skill inventory

Eleven content skills + shared `extend-capabilities`:

| Skill | Shape today | Notes |
|---|---|---|
| `landing-page-builder` | single-shot | Extract fields → fill one template → write HTML → offer deploy. One pass. |
| `multi-page-site-builder` | single-shot | Same, for a 4-page bundle. |
| `blog-post-creator` | single-shot | One SEO post from one template. |
| `vercel-deploy-orchestrator` | single-shot | One Vercel deployment per call (`external:vercel-deploy`). `target` field already distinguishes `preview` vs `production`. |
| `domain-advisory` | single-shot | One comparison + recommendation from the quarterly snapshot. |
| `tokopedia-product-page`, `shopee-storefront`, `glints-job-post`, `kompas-article`, `olx-listing`, `lamudi-rental` | single-shot, DRAFT | Phase 4-3 Autobrowse seed skills; placeholder selectors, not graduated to production. Data-extraction, not procedures — irrelevant to playbook design. |

**Templates:** ten real, file-backed — five `landing/*` HTML, one
`multipage/umkm-default` site bundle, three `blog/*` markdown, one
`domain-comparison` JSON snapshot. Good template coverage; the builder skills
all name their template paths.

**Playbook-shaped today:** none — but the build → preview → approve → deploy
flow is *de facto* a two-step playbook split across `landing-page-builder` (or
`multi-page-site-builder`) and `vercel-deploy-orchestrator`, with the
SOUL.md-mandated "Sebelum deploy ke production, aku tunjukkan preview dulu.
Kamu approve baru aku promote" as the gate. Same pattern as the deep-researcher
implicit pipeline before Phase 1 formalised it.

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`site-launch`** — the build→ship pipeline made explicit | 1 intake (business name, value prop, template kind, contact method) → 2 build (`landing-page-builder` or `multi-page-site-builder`) → **3 checkpoint: customer reviews local preview copy** → 4 deploy to preview (`vercel-deploy-orchestrator` `target=preview`) → **5 checkpoint: customer approves the live preview URL** → 6 promote to production (`vercel-deploy-orchestrator` `target=production`) | Two `checkpoint` gates — copy review (step 3) and preview-URL approval (step 5). No `hard-gate`: deploying a site is reversible and spends no customer money. The promote-to-production step is gated by a `checkpoint` because SOUL.md mandates preview-before-promote, but it is not money/legal-irreversible. |
| **`domain-and-launch`** — `site-launch` with a domain step | `site-launch` steps 1-5, then 6 domain advisory (`domain-advisory`) → **7 checkpoint: customer confirms they bought the domain** → 8 production deploy with custom-domain DNS hookup | Same gate profile as `site-launch` plus a checkpoint at step 7. The domain *purchase* is real money — but SOUL.md hard-limits the agent from buying domains; the customer buys it themselves. So the playbook's gate is a `checkpoint` ("confirm you've bought it"), not a `hard-gate` the agent itself crosses. |
| **`blog-content-cycle`** (optional, lower priority) | 1 intake topic/audience → 2 keyword research → **3 checkpoint: customer approves angle/outline** → 4 draft (`blog-post-creator`) → 5 deliver publish-ready post | One `checkpoint` at step 3. Light playbook; candidate only if a third is wanted. |

The playbook to build for this persona is `site-launch` — and
`domain-and-launch` is best treated as `site-launch` with two optional tail
steps rather than a separate playbook, to avoid two near-identical SKILL.md
files.

## 3. Gaps

- **`VERCEL_TOKEN` precondition.** `vercel-deploy-orchestrator` declines
  without the customer's `VERCEL_TOKEN` env. In a playbook, that decline lands
  mid-run at step 4. The playbook needs an explicit early validation — either
  a step-1 precondition check or a `prerequisites` frontmatter entry — so the
  customer is told to set the token *before* the build, not after, otherwise
  the run parks awkwardly with a finished site and no way to ship it.
- **DRAFT seed skills are not playbook material.** The six site-extractor
  skills are Phase 4-3 DRAFT scaffolding pending Autobrowse graduation. They
  are data extractors, not procedures. Exclude them from Phase 2 playbook
  scope entirely.
- **Hand-off path shape.** `landing-page-builder` writes to
  `/tmp/web-creator-out/landing-<slug>-<timestamp>.html`;
  `vercel-deploy-orchestrator` reads `source_path`. The playbook must pin that
  the build step records its exact output path into `step_output` so the
  deploy step reads it from `state_data` — same hand-off-pinning lesson as
  Phase 1.

---

# Cross-persona findings + Phase 2 format recommendation

## Headline

All three Phase 2 personas are in the same state Phase 1's personas were:
**zero real playbooks today, every skill single-shot, but each persona has an
implicit pipeline its SOUL.md already describes in prose.** Phase 2 playbook
work is formalising and gating existing capability, not authoring from
scratch — the lowest-risk kind of build. The format is settled; this section
does not re-derive it.

## Format — reuse Phase 1 exactly

Reuse the proven Phase 1 format with no changes:

- A playbook is a `skills/<id>/SKILL.md` tagged `skill_kind: "playbook"` in
  `manifest.json`. Never a flat `.flow.md`.
- YAML frontmatter: `skill_kind`, `name`, `bundle`, `flow_state_playbook_id`,
  `total_steps`, `use_cases`, `prerequisites`, `escalation_to`.
- A `## Langkah-langkah` section of `### Langkah N — <title>` steps, each with
  the six bold fields (Aksi / Tautan-endpoint / Input yang diharapkan / Output
  yang diharapkan / Validasi / Gerbang eskalasi) + an Error handling line.
- `Gerbang eskalasi` values: `none` (auto-advance), `checkpoint` (park
  `awaiting_customer`, show progress, ask "lanjut?"), `hard-gate` (park
  `escalated`, no advance without explicit yes — every money/legal-identity/
  irreversible step).
- The engine contract is unchanged: `start` / `get` / `advance` / `complete` /
  `abort` against `{WEUSEAI_FLOW_STATE_URL}` with the X-CID header.
- Bump the pack `manifest.json` `version` when a playbook is added.

Two Phase-2-specific format notes, both *usage* notes not format changes:

1. **Loop-inside-a-step.** `project-orchestration` step 5 (spawn N agents) and
   any fan-out step must be modelled as one flow-state step whose internal
   iteration is the agent's responsibility — the engine `advance`s the cursor
   once. Document this in the step's Aksi field.
2. **`hard-gate` + durable approval.** For business-agent, a `hard-gate` step
   should open an `approval_requests` row (durable, expiring, Telegram-
   surfaced) AND park the flow-state run at `escalated`, resuming when the
   approval handler flips `approved_at`. flow-state `escalated` is a parked-run
   state, not an approval ledger — the two layers compose, they do not
   replace each other. The PT-registration playbook (§5) is the main consumer
   of this pattern.

## Recommended Phase 2 build order

Build in this order — lowest-risk-and-highest-leverage first, the headline
deliverable timed so its research dependency can land:

1. **`web-app-builder` / `site-launch`** — gate profile: **2 × `checkpoint`,
   0 × `hard-gate`**. Lowest risk: two existing skills, no money/legal line,
   the build→preview→approve→deploy flow is already prose-described in SOUL.md.
   Good warm-up that re-validates the Phase 1 format on a fresh persona.
2. **`project-conductor` / `project-orchestration`** — gate profile:
   **1 × `checkpoint`, 0 × `hard-gate`**. Formalises the four-skill pipeline.
   Introduces the loop-inside-a-step pattern. Medium risk.
3. **`business-agent` / `compliance-cycle`** — gate profile:
   **0–1 × `checkpoint`, 1 × `hard-gate` per filing**. First playbook to
   exercise the `hard-gate` + `approval_requests` composition on a smaller,
   contained surface than PT-registration — a deliberate dress rehearsal.
4. **`project-conductor` / `pt-perorangan-registration`** — gate profile:
   **~7 steps, 4–6 × `hard-gate`** (see §5). The headline Phase 2 deliverable.
   Sequenced last on purpose: it depends on the xendit research doc (§5/§6),
   it stresses the engine hardest, and it should be authored only after
   `compliance-cycle` has shaken out the `hard-gate` + approval pattern.

`incorporation-walkthrough` (business-agent) is intentionally not a separate
line item — it is either folded into `pt-perorangan-registration` or is its
business-agent-side sub-playbook; see §6. Optional third playbooks
(`weekly-recap-cycle`, `blog-content-cycle`, `domain-and-launch`,
`five-stage-roadmap`) are deferred unless founder asks for breadth over depth.

---

# §5 — Project Conductor PT-registration playbook (special attention)

This is the founder pain point that motivated the whole playbook workstream:
a playbook walking an Indonesian customer through registering a **PT
Perorangan** — a one-person limited company. Real money, government/legal
processes, multi-day timelines.

## Research-doc dependency — NOT FOUND

The founder-commissioned research doc was expected at
`docs/research/xendit-activation-action-plan.md`. **It does not exist.** There
is no `docs/research/` directory at all. The closest existing artifact is
`docs/consulting/2026-05-15-xendit-test-mode-signature.md`, which covers
Xendit *webhook signature* fidelity for the weuseai.agent platform's own
payment handler — a completely different topic from a customer-facing
PT-registration / Xendit-merchant-activation action plan.

**Consequence:** the detailed 7-step flow (exact platforms, URLs, per-step
costs, timelines, gotchas) is a **hard dependency for Week 2 authoring**. This
playbook cannot be authored to a customer-shippable standard without it. The
design below is therefore **structural only** — step skeleton and gate
placement — pending the research doc. Building it: the research doc must land
first.

What the repo *does* already supply, and the research doc must reconcile with,
is solid scaffolding: `incorporation/oss-checklist.md` (a real 7-step OSS-RBA
procedure with KBLI codes, risk tiers, document lists, a day-by-day timeline,
and a "common gotchas" section) and `finance/bank-account-checklist.md`
(per-entity document matrix, bank comparison). The OSS checklist's timeline
("Day 0 akta → Day 90 verifikasi") is the closest thing the repo has to the
multi-day shape this playbook needs.

## Structural design (pending research doc)

A ~7-step playbook. Every step that crosses a money or legal-identity line is
a `hard-gate`. Proposed skeleton:

| Step | Aksi (structural) | Gerbang eskalasi |
|---|---|---|
| 1 — Intake & readiness | Confirm the customer wants a PT Perorangan specifically (vs PT biasa / CV), collect founder identity readiness (KTP, NPWP pribadi, modal plan), set expectations on the multi-day timeline. Call `start`, `total_steps: 7`. | `none` — opening clarification, not a park. |
| 2 — AHU registration | Walk the customer through the PT Perorangan registration on the AHU portal (`ahu.go.id`) → produces the registration certificate. | **`hard-gate`** — legal-identity creation, a real legal entity comes into being. Opens an `incorporate`-class approval. |
| 3 — Coretax NPWP (badan) | Register the new entity's NPWP via Coretax. | **`hard-gate`** — tax-identity creation tied to the legal entity. |
| 4 — NIB on OSS | KBLI selection + NIB issuance on `oss.go.id` (reuse `oss-checklist.md` as the step's reference template). | **`hard-gate`** — government business-licence issuance; KBLI choice has downstream legal consequences. |
| 5 — Domicile (domisili) | Domicile letter / address arrangement (region-dependent — some Jakarta regions need RT/RW approval per `oss-checklist.md` gotchas). | `checkpoint` if advisory-only; **`hard-gate`** if it involves a paid/binding arrangement — research doc decides. |
| 6 — Business bank account | Open the entity bank account (reuse `bank-account-checklist.md` — document matrix, bank comparison). | **`hard-gate`** — opening a financial account in the entity's legal name; the customer physically visits a branch. |
| 7 — Xendit activation | Activate the Xendit merchant account against the new PT — the payment-acceptance endpoint. Call `complete`. | **`hard-gate`** — connects real money flow; the research doc's core subject. |

So **5–6 of 7 steps are `hard-gate`s** — by far the heaviest gate load of any
playbook in the product, and the validating case for the `hard-gate` tier.
Each `hard-gate` opens an `approval_requests`-style durable approval (the
business-agent pattern from §1a), because these gates can sit unanswered for
days while the customer waits on a government portal.

## Engine-stress notes

This playbook stresses the flow-state engine harder than any Phase 1 playbook,
in three specific ways the author must verify against the live engine:

- **Multi-day persistence.** Phase 1 playbooks park for minutes-to-hours; this
  one parks for *days* between steps (government processing times). The
  `customer_flow_state` row must survive that — it should, the row is durable
  and `updated_at`-stamped, but a stale-run / abandoned-run consideration
  appears for the first time. There is no TTL on a parked run today; a
  half-finished PT registration could sit `escalated` indefinitely. Flag for
  the author: decide whether the playbook surfaces a "you still have an open
  PT-registration run" nudge, since the engine itself will not.
- **`start` is destructive.** The `flow-state` store `start` upserts on
  `(customer_id, playbook_id)` and *resets the run to step 1 with empty
  `state_data`*. For a 7-step multi-day legal procedure, an accidental re-issue
  of `start` (e.g. the customer re-sends a trigger phrase mid-run) wipes
  accumulated state. The playbook's Langkah 1 must `get` first and only `start`
  if no advanceable run exists — Phase 1 playbooks already follow this loop,
  but the stakes are far higher here. Flag explicitly in the SKILL.md.
- **State payload size.** Seven steps of accumulated portal references,
  certificate numbers, and entity identifiers in `state_data` — larger than
  any Phase 1 run. `state_data` is a JSON column with no documented size cap;
  not expected to be a problem, but worth a sanity check during authoring.

## One flat playbook vs a project-conductor composition

The Phase 1 Week 1 audit flagged "playbooks machine-callable as
project-conductor steps" as an open design question. PT-registration forces
the answer. Two options:

- **(A) One flat 7-step playbook** owned by project-conductor. Simplest, ships
  on the proven Phase 1 format with zero new engine capability. The whole
  procedure is one `flow_state_playbook_id`. Recommended for Phase 2.
- **(B) A project-conductor composition** — `pt-perorangan-registration`
  becomes a kanban "project" whose tasks are sub-playbooks (`incorporation-
  walkthrough` and a Xendit-activation playbook owned by business-agent,
  spawned via `multi-agent-router`). More architecturally elegant and reuses
  business-agent's incorporation work — but it requires a playbook to be
  *machine-callable as a project-conductor task*, which is exactly the
  unresolved Phase 1 design question, and it would mean a playbook step
  spawning a child playbook run — a new engine edge (nested flow-state runs,
  recursion-guard scope) that does not exist today.

**Recommendation: ship (A) for Phase 2.** A flat 7-step playbook is
authorable on the current engine with no new capability and is the fastest
path to the headline deliverable. Treat (B) as the Phase 3 evolution once the
machine-callable-playbook question is formally decided. The cost of (A) is
some duplication with business-agent's `incorporation-walkthrough` — accept
it for Phase 2, or (cleaner) make `incorporation-walkthrough` the
business-agent-tier name for the *same* SKILL.md content and have
project-conductor's playbook reference it, deciding ownership with the founder
(§6).

---

# §6 — Flagged ambiguities (not guessed)

1. **The xendit research doc does not exist.** Expected at
   `docs/research/xendit-activation-action-plan.md`; there is no
   `docs/research/` directory. The PT-registration playbook's detailed
   7-step content (URLs, costs, timelines, gotchas) is a hard dependency on
   that doc. Week 2 authoring of `pt-perorangan-registration` is blocked on
   it. The structural design in §5 is the most that can be produced now.

2. **Two state machines in business-agent.** business-agent already owns
   `business_roadmap_state` + `approval_requests` + `approval-queue-handler`
   (Phase 5), independent of the flow-state engine. A Phase 2 business-agent
   playbook must not fork a third state model. The audit *recommends* — but
   cannot unilaterally decide — that playbooks use flow-state for step
   sequencing and `approval_requests` for durable expiring approvals, with a
   `hard-gate` step opening an approval row + parking `escalated`. This needs
   founder/engineering confirmation before authoring `compliance-cycle` or
   `incorporation-walkthrough`.

3. **PT-registration ownership: project-conductor vs business-agent.** The
   incorporation steps (AHU, NPWP, NIB, domicile, bank) are squarely
   business-agent's domain (`incorporation-advisor`, the incorporation/finance
   templates). But the prep notes and this task assign the PT-registration
   playbook to project-conductor. Either project-conductor owns a flat
   playbook that *duplicates* business-agent incorporation knowledge, or the
   playbook lives in business-agent and project-conductor references it, or
   the §5(B) composition is adopted. This is a founder ownership call. The
   audit recommends a flat playbook for Phase 2 (§5) but does not assume which
   pack it ships in.

4. **Playbooks machine-callable as project-conductor steps** — the Phase 1
   Week 1 open question, still open. §5 addresses it pragmatically for
   PT-registration (ship flat, defer composition to Phase 3) but the general
   question — whether the playbook step-format must be machine-callable, not
   just agent-readable — remains a founder design decision. It materially
   shapes whether `project-orchestration` can ever have a playbook as a task
   owner.

5. **No TTL on parked runs.** The flow-state engine has no expiry on a run
   parked at `escalated` / `awaiting_customer`. Fine for Phase 1's minutes-to-
   hours playbooks; a real consideration for PT-registration's multi-day
   parks. Not an engine bug, but the PT-registration playbook author needs a
   decision: does the playbook itself surface an "open run" nudge, since the
   engine will not. business-agent's `approval_requests` *does* have per-action
   expiry — another reason the §1a recommendation (compose flow-state with
   `approval_requests`) is the right pattern for the multi-day gates.

6. **`_manifest.schema.json` / template drift (carried from Phase 1).** The
   Phase 2 prep notes still list two open housekeeping items — the
   `tier` vs `enabled_for_tiers` schema drift in the standalone
   `_manifest.schema.json`, and the the-pro `templates/mocks/.../empty.json`
   manifest/disk drift. Not in scope for this audit, but any Phase 2 manifest
   edit (every new playbook adds a `skills[]` entry) should ride the same
   housekeeping PR the prep notes recommend doing first.
