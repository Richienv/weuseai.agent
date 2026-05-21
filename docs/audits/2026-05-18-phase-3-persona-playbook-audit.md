# Phase 3 Persona Playbook Audit — 2026-05-18

**Scope:** Read-only audit of the skill + template + playbook state of the
four Phase 3 candidate personas — `social-conductor`, `trade-pro`,
`project-conductor` (second playbook beyond `project-orchestration`),
`business-agent` (second playbook beyond `compliance-cycle`) — plus a Phase 3
playbook-design recommendation per persona. No code changed. No SKILL.md
authored. Upstream Hermes untouched.

**Purpose:** Phase 3 Week 1 of the playbook workstream. Phase 1 shipped the
state-machine engine + the `skill_kind: "playbook"` format + three reference
playbooks. Phase 2 is mid-flight — PRs #151 / #152 / #153 are open
(`site-launch`, `project-orchestration`, `compliance-cycle`) and PR #154
(`pt-perorangan-registration`) is in flight. This audit decides which
playbooks each Phase 3 persona should offer, the rough step shape, and where
the escalation gates fall — so Week 2 authoring can start as soon as Phase 2
clears.

**Companion docs:**

- `docs/audits/2026-05-17-persona-template-and-playbook-inventory.md` — the
  Phase 1 Week 1 audit; established the playbook format.
- `docs/audits/2026-05-18-phase-2-persona-playbook-audit.md` — the Phase 2
  Week 1 audit; this document is its structural sequel and reuses the same
  per-persona / cross-persona / build-order / ambiguities layout.
- `docs/research/xendit-activation-action-plan.md` — relevant to the §7
  dependency graph note.

**Settled from Phase 1 + Phase 2 — reuse, do not re-derive:**

- **Proven Phase 1 format** — `skills/<id>/SKILL.md` tagged
  `skill_kind: "playbook"`, six-field per-step shape (Aksi /
  Tautan-endpoint / Input / Output / Validasi / Gerbang eskalasi) + Error
  handling. Reference implementations:
  `agent-packs/{deep-researcher/skills/market-research,slide-master/skills/pitch-deck,the-pro/skills/customer-reply}/SKILL.md`.
- **flow-state engine** is live (PR #141, deployed). `start` / `get` /
  `advance` / `complete` / `abort`; parked statuses `awaiting_customer` and
  `escalated`. Engine unchanged.
- **Distribution** rides existing `publish-persona-bundles.mjs` → tarball →
  `bundle-pull`. Bump pack `manifest.json` `version` (semver) per playbook
  added.
- **Phase 2 patterns reused intact:** (1) **loop-inside-a-step** —
  `project-orchestration` step 5 models fan-out as one flow-state step,
  internal iteration is the agent's job, engine `advance`s once. (2)
  **`hard-gate` + `approval_requests` composition** — `compliance-cycle`'s
  pattern: `hard-gate` opens an `approval_requests` row + parks `escalated`,
  resumes on `approved_at`. The two layers compose; they do not replace each
  other.

Phase 3 playbook work is **content authoring + a manifest entry** — no
engine work. Three of four Phase 3 candidates resemble Phase 2
`project-conductor` (meta-playbook persona, emergent prose pipelines made
explicit). The fourth (`trade-pro`) is more like Phase 1 `the-pro` —
single-shot skills with one procedure hiding inside.

---

# Persona 1 — `social-conductor` (display "Social Conductor")

Folder: `agent-packs/social-conductor/`. Manifest `version` 2.0.0. Tier:
Pro + Studio. Founder lock 2026-05-08 Option B: NO scraping, NO auto-post —
agent drafts, customer submits.

## 1. Skill inventory

Six content skills + the shared `extend-capabilities`:

| Skill | Shape today | Notes |
|---|---|---|
| `voice-locker` | single-shot with internal modes | One pass per call across three modes (`lock-new` / `iterate-existing` / `validate`). `lock-new` reads ≥20 samples, extracts seven voice dimensions, writes `voice-profile.json`, then "Generate 5 test drafts, ask customer fit-check" — a conversational checkpoint, not a state-machine park. |
| `content-calendar-builder` | single-shot with internal modes | Three modes (`build-new` / `extend-existing` / `weekly-review`). One mode per call. Persists to `content-calendar.sqlite`. |
| `post-drafter` | single-shot | Per-platform draft + voice-fit score + slot reference. One draft per call. Already loads `voice-locker` output as a precondition. |
| `engagement-log-tracker` | single-shot with four modes | `log-new` / `draft-reply` / `daily-digest` / `mark-replied`. Each mode is one DB op per call. Already enforces "Auto-send reply — Tidak" (every send is customer-submitted). |
| `voice-consistency-checker` | single-shot with two modes | `score-draft` (per-call rubric scoring) and `weekly-drift-check` (cron-triggerable batch). |
| `campaign-planner` | single-shot, internally pipelined | Resolves a campaign into 4 standard phases (Tease / Reveal / Reinforce / Close), pre-stages calendar entries via `content-calendar-builder`, pre-generates drafts via `post-drafter`. Output is the whole multi-week plan as one returned blob, no inter-step gate. Ends with "Mau adjust phase split, atau lanjut?" — conversational checkpoint, not state-machine park. |

**Templates:** eight, all real, file-backed, and manifest-registered:
`voice-profile-template.md` (schema), `calendar-schema.md` (schema),
`weekly-cadence-presets.md` (reference), `platform-length-rules.md`
(reference), `engagement-schema.md` (schema), `reply-pattern-library.md`
(reference), `voice-fit-rubric.md` (rubric), `campaign-template.md`
(reference). This is — with `business-agent` — one of only two personas in
the audit set with a populated, manifest-registered template library, and
every skill's `templates_used` already names its backing files.

**Playbook-shaped today:** none — but Social Conductor is *structurally a
meta-playbook persona*, the same situation Phase 2's `project-conductor` was
in. Two emergent pipelines are visible in SOUL.md + manifest prose:

1. **Voice onboarding** — `voice-locker` (lock-new) → 5 test-draft fit check
   → conditional re-lock → `post-drafter` activation. SOUL.md "How I behave":
   *"Aku lock brand voice dari minimum 20 sample writing dulu sebelum mulai
   draft. Kalau sample insufficient, aku stay outline-only mode."* This is a
   gated multi-step procedure — but it is described as one skill's "fit-check
   conversational followup".
2. **Campaign execution** — `campaign-planner` → multi-week calendar slots →
   per-slot draft via `post-drafter` → fit-check via
   `voice-consistency-checker` → customer submit → log via
   `engagement-log-tracker`. Sequenced across four skills, no pinned ordering
   or checkpoint convention.

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`voice-onboarding`** — formalise the voice-lock → fit-check → activate flow | 1 intake (count samples customer has, set expectations) → 2 collect samples (loop-inside-a-step: agent surfaces what's still missing until ≥20 reached) → 3 lock profile (`voice-locker` lock-new) → 4 generate 5 test drafts (`post-drafter` x5, loop-inside-a-step) → **5 checkpoint: customer rates fit-check** → 6 either activate or re-lock per scores → `complete` | Step 5 = `checkpoint`. One soft checkpoint. No `hard-gate` — locking a voice profile spends no real money, sends nothing public. Two loop-inside-a-step uses (sample collection, test-draft fan-out) directly mirror `project-orchestration` step 5's pattern. |
| **`campaign-execution`** — the four-skill pipeline made explicit | 1 intake (campaign type, duration, objective, platforms, key dates) → 2 generate plan (`campaign-planner`) → **3 checkpoint: customer approves phase split + KPI hooks** → 4 stage calendar slots (`content-calendar-builder`, loop-inside-a-step across N slots) → 5 pre-draft per slot (`post-drafter`, loop-inside-a-step) + score (`voice-consistency-checker`, loop) → **6 checkpoint per slot at H-2: customer reviews each draft before copy-paste** → 7 customer marks posted, agent waits for engagement → 8 daily engagement digest (`engagement-log-tracker`, recurring) | Step 3 = `checkpoint` (plan approval). Step 6 = recurring `checkpoint` per slot at H-2 (the SOUL.md "Aku kasih reminder H-2 untuk draft setiap slot" promise made first-class). No `hard-gate` — every customer-facing send is customer-submitted under Option B, the agent itself crosses no irreversible line. |
| **`engagement-cycle`** (optional, lower priority) | 1 ingest customer-dropped engagement batch → 2 auto-classify priority (`engagement-log-tracker` log-new, loop) → 3 daily-digest surface (`engagement-log-tracker` daily-digest) → **4 checkpoint per high-priority: customer approves draft reply** → 5 customer marks replied | Step 4 = `checkpoint` per high-priority item. Lighter playbook; candidate only if a third is wanted. |

The two playbooks to actually build for this persona are
`voice-onboarding` and `campaign-execution`. `voice-onboarding` is the
warm-up (one persona, one checkpoint, no fan-out across skills); 
`campaign-execution` is the headline (multi-week, multi-skill, recurring
checkpoints).

## 3. Gaps

- **Sample-count accumulates across turns in `state_data`.**
  `voice-onboarding` step 2 (collect-until-20) needs `state_data` to carry
  `{ "samples": [...], "count": N, "still_needed": 20-N }` across turns —
  `voice-locker` today is single-shot, all-or-decline. Engine supports it
  (JSON column); design must be deliberate. **PII:** samples are
  customer-authored content, not third-party PII; RLS-locked
  `customer_flow_state` row is correct posture; SKILL.md should state
  explicitly the row is purged on `complete`.
- **`campaign-execution` parks for weeks.** Same multi-day-parking
  concern as PT-registration (Phase 2 §5/§6 — no engine TTL on parked
  runs). Less risky because gates are `checkpoint` not `hard-gate` (no
  money at stake if the customer drops). Per Phase 2 recommendation:
  surface an "open campaign run" nudge from the playbook itself.
- **`start` is destructive** (Phase 2 lesson). Sample-accumulation
  `state_data` is exactly what an accidental re-`start` wipes. Langkah 1
  must `get` first and only `start` if no advanceable run exists.
- **`campaign-execution` cron handoff.** The H-2-per-slot `checkpoint`
  must fire from cron, not customer poll. Authorable today (cron is just
  another `get` / `advance` caller using the calendar's next-slot
  timestamp) but pin the resume pattern in step 6 Aksi.
- **PII is moderate.** Engagement log entries carry third-party
  handles + comment text. `state_data` accumulates handles + snippets
  across turns. Per `compliance-cycle` PII note: redact in surfaced
  summaries; only final per-reply drafts carry the handle/quote in full.

## 4. Lessons applied

- **`project-orchestration`'s loop-inside-a-step** models
  `voice-onboarding` steps 2 + 4 (sample collection, 5-draft fan-out) and
  `campaign-execution` steps 4-5 (slot-staging + per-slot drafting). No
  new engine capability.
- **Phase 1 directory-form** — `agent-packs/social-conductor/skills/{voice-onboarding,campaign-execution}/SKILL.md`.
- **`compliance-cycle`'s `hard-gate` + `approval_requests` pattern NOT
  needed here.** Under Option B every send is customer-submitted; neither
  playbook crosses an irreversible line. Pure flow-state `checkpoint`
  gates throughout.

---

# Persona 2 — `trade-pro` (display "Trade Pro")

Folder: `agent-packs/trade-pro/`. Manifest `version` 2.1.0. Tier:
Pro + Studio. Renamed from Macro Strategist (which contributed
`idr-bi-rate-watcher`). Founder-locked: no auto-trade, no execution, every
take carries "ini bukan financial advice" disclaim.

## 1. Skill inventory

Five content skills + shared `extend-capabilities`:

| Skill | Shape today | Notes |
|---|---|---|
| `market-briefing` | single-shot, cron-triggerable | Pull IDX top movers + US/EU overnight + crypto top 10 + event calendar → 5-8 bullet briefing. One pass. Cron 08:00 WIB if customer enabled. |
| `alert-watcher` | single-shot with three actions | `set` / `list` / `cancel` per call. Cron job (1-min interval) polls market data + fires Telegram one-liner on threshold. Already enforces "Auto-trade trigger — Aku fire alert, tidak execute trade." |
| `earnings-summarizer` | single-shot, internally pipelined | Pull filing PDF → extract metrics → compare to prior-year + consensus → flag notable items → 4-section markdown. One returned blob. |
| `idr-bi-rate-watcher` | single-shot with four kinds | `spot-rate` / `level-break` / `bi-decision` / `explainer`. One mode per call. Frames per customer's `context` (import / export / usd-debt / portfolio). |
| `bitget-readonly` | single-shot with five views (P1) | `balance` / `open-positions` / `pnl-today` / `funding-rate` / `order-history-recent`. One view per call. Step 1 validates API-key scope is read-only ONLY before any call (declines if writes/withdrawals enabled). External-API execution (calls Bitget REST). |

**Templates:** four, all real, file-backed, manifest-registered:
`market-briefing-format.md` (reference output skeleton),
`alert-rule-schema.md` (schema for alerts.jsonl),
`earnings-summary-format.md` (reference output skeleton),
`rate-watch-reference.md` (reference for psychological levels + framing per
context). Strong template coverage; every content skill except
`bitget-readonly` names its backing template.

**Playbook-shaped today:** none — and unlike the other three Phase 3
personas, trade-pro is **NOT structurally a meta-playbook persona**. Its
five skills do not form an implicit pipeline; they are five independent
information surfaces. There is no "today I did A then B then C" prose in
SOUL.md analogous to Project Conductor's task-decompose→spawn→monitor flow.

What *does* hide inside the persona is **one gated procedure**:
`bitget-readonly`'s API-key onboarding. That procedure is genuinely
multi-step (key generation → scope validation → IP whitelist → env paste →
permission probe), it crosses an identity-key-handling line, and it is
*already* described step-by-step in the `bitget-readonly` SKILL.md
"Operational" section (founder-prep runbook, Phase 2E-3+) — but as prose
inside a single-shot skill that fires on every `cek portfolio Bitget` call.
The runbook prose is the closest thing trade-pro has to a sequenced gated
procedure; it is not surfaced as a playbook the agent can drive the
customer through.

The other candidate is **`morning-routine`** — composing `market-briefing`
+ `idr-bi-rate-watcher` + `alert-watcher` review into one cron-fired daily
sequence. Today the SOUL.md mentions only `market-briefing` as the 08:00
push; the rate-watcher and alert-list-check are not chained in. This is a
real composition opportunity but it is light on gates — every step is
auto-advance because everything is read-only / informational.

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`bitget-onboarding`** — turn the SKILL.md "Operational" runbook prose into a customer-driven playbook | 1 intake (confirm customer has Bitget account, explain read-only-scope guarantee, surface the API-Management URL) → **2 checkpoint: customer confirms they've generated the key with read-only scope only** → 3 IP-whitelist advisory (offer customer's VPS IP) → 4 customer pastes API Key + Secret + Passphrase in dashboard → 5 platform encrypts to `.env` → 6 agent calls Bitget permissions endpoint to verify scope → **7 hard-gate: if scope contains writes/withdrawals, decline + ask customer to regenerate; only on read-only-confirmed does agent unlock the `bitget-readonly` views** → 8 first portfolio snapshot delivery, run `complete` | Step 2 = `checkpoint` (acknowledgement). Step 7 = **`hard-gate`** — the only `hard-gate` in trade-pro, and the persona's defining customer-protection moment. This gate does NOT need an `approval_requests` row (no expiring approval, no money flowing — it is an immediate inline reject + retry), so it is a *pure flow-state* `escalated` park, distinct from the `compliance-cycle` composition pattern. A useful contrast case for the format. |
| **`morning-routine`** — chain the cron-fired daily surfaces into one sequence | 1 cron 08:00 WIB fires playbook `start` → 2 `market-briefing` (IDX + global + crypto) → 3 `idr-bi-rate-watcher` spot-rate (only if customer flagged a `context` other than `general`) → 4 `alert-watcher` list mode (surface any alerts fired overnight that customer hasn't acknowledged) → 5 compose unified morning post → 6 Telegram delivery, run `complete` | All steps `none` (auto-advance). No checkpoints — every surface is read-only / informational, the customer either reads or doesn't. The play here is *composition + ordering* not *gating*. Light playbook; first build mostly to give the cron-resume pattern a smaller test surface than `campaign-execution`. |

The playbook to definitely build is `bitget-onboarding` — it surfaces the
only real procedure hiding in the persona, and the `hard-gate`-without-
`approval_requests` form is a useful pattern distinct from
`compliance-cycle`. `morning-routine` is optional and lighter; build it if
trade-pro warrants two playbooks for parity with the other personas,
otherwise defer.

## 3. Gaps

- **Step 4 is a platform-UI handoff, not an agent action.** "Customer
  pastes in dashboard" happens outside the Telegram chat. Step 4's
  `step_output` is "customer confirmed paste done"; the actual paste is
  customer-side. Same pattern as PT-registration step 6 (customer visits
  bank branch). Pin in Aksi that the agent waits for confirmation message
  and does not poll the dashboard.
- **Step 6 permissions-endpoint call must be blocking.** Validation
  gates step 7's hard-gate; playbook must not advance to step 8 without a
  verified permissions response — that is the persona's "aku read-only"
  guarantee.
- **No template for the onboarding flow itself.** The runbook prose lives
  inside `bitget-readonly` SKILL.md; per Phase 1 (no template loader),
  pin inline in playbook step Aksi rather than extract a template file.
- **`morning-routine` cron-resume.** Daily fire-and-forget batch — cron
  caller invokes `start` (fresh run) not `get` + `advance` (parked run).
  Pin in step 1.
- **External-API failure modes.** Step 7 Error handling must distinguish
  "wrong key, re-paste" / "API rate-limited, retry once" / "scope
  contains writes, hard-gate triggered" — three different recovery paths.

## 4. Lessons applied

- **`compliance-cycle`'s `hard-gate`, *adapted*.** Step 7 is `hard-gate`
  but does NOT open an `approval_requests` row — the gate is inline
  platform-side reject ("scope wrong, regenerate"), not pending-customer-
  decision. flow-state `escalated` parks alone until customer re-pastes,
  then step 6 re-fires. **Useful complement to Phase 2:** `hard-gate`
  does not always mean `approval_requests` (see §"Format" cross-cutting).
- **`project-orchestration` loop-inside-a-step** does not apply — no
  fan-out in either trade-pro playbook.
- **Manifest version bump** — trade-pro 2.1.0 → 2.2.0 for
  `bitget-onboarding`; 3.0.0 only if `morning-routine` ships too (semver-
  major: changes the cron delivery surface customers may rely on).

---

# Persona 3 — `project-conductor` second playbook (beyond `project-orchestration`)

Folder: `agent-packs/project-conductor/`. Manifest `version` 2.0.0. Tier:
Pro + Studio. First playbook `project-orchestration` covered in Phase 2
audit §1.

## 1. Skill inventory (re-statement)

Same four content skills as the Phase 2 audit:
`kanban-orchestrator`, `task-decomposer`, `multi-agent-router`,
`progress-monitor` + shared `extend-capabilities`. **Templates: zero.**
`manifest.json` `templates: []`. (Same as Phase 2.)

The Phase 2 audit recommended `project-orchestration` as the formalisation
of the four-skill pipeline (Phase 2 PR #152). The question for Phase 3 is
**what other multi-step flow this persona should formalise**, given the
same primitives.

## 2. Playbook candidates

Three flows in the persona's existing skills + SOUL.md are sequenced enough
to be playbook material, in roughly increasing engine-stress order:

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`weekly-recap-cycle`** — recurring stakeholder/manager reporting flow | 1 cron Friday 16:00 WIB (or trigger-phrase) fires playbook `start` → 2 aggregate 7-day kanban activity (`progress-monitor` weekly-recap mode) → 3 surface blocker list (`progress-monitor` blocker-list mode) → 4 detect any task-decomposer scope-creep within the week → 5 compose recap per `audience` (self / stakeholder / 1on1-manager) → **6 checkpoint: customer reviews before it goes to stakeholders** (skipped if `audience: self`) → 7 deliver, run `complete` | Step 6 = `checkpoint`, *conditional* on `audience != self`. No `hard-gate` — a recap is reversible (customer can re-edit). The conditional-checkpoint shape is **new** for the playbook format — Phase 1 + Phase 2 playbooks all have static gate placement; this one varies based on `state_data.audience`. Useful for the format. |
| **`blocker-resolution`** — interrupt flow when a task stalls | 1 cron or manual trigger detects task at `Blocked` status > N days (`progress-monitor` blocker-list) → 2 classify blocker (waiting-on-customer / waiting-on-external / waiting-on-other-task / waiting-on-decision) → 3 if `waiting-on-decision`, surface decision to customer → **4 checkpoint: customer makes decision** → 5 unblock action (re-spawn via `multi-agent-router`, or move task to alternate owner via `kanban-orchestrator`) → 6 verify unblock, run `complete` | Step 4 = `checkpoint`. Tight playbook (5-6 steps). The classifying-then-routing shape is similar to `compliance-cycle`'s filter-then-gate. No `hard-gate` — same reason as `weekly-recap-cycle`. |
| **`milestone-handoff`** — formalise the moment a milestone completes and the next phase begins | 1 detect milestone reached (last task in a milestone moves Done) → 2 aggregate milestone deliverables (`progress-monitor` blocker-list + Done snapshot) → 3 surface to customer for sign-off → **4 hard-gate: customer signs off the milestone** → 5 trigger next-milestone task generation (`task-decomposer` re-run scoped to next milestone) → 6 spawn next-milestone owners (`multi-agent-router`, loop-inside-a-step) → 7 update kanban (`kanban-orchestrator`), run `complete` | Step 4 = **`hard-gate`** — signs off completed work, gates next-phase spawn. The `hard-gate` here protects against accidental scope-creep into next phase before the customer agrees the previous is done. Composes with `approval_requests` (`action_kind: 'milestone_signoff'`, expiry ~7 days — long enough that a customer on vacation doesn't lose the queue). Note: `milestone_signoff` is a **new** approval action kind not in business-agent's existing four (`incorporate` / `contract_sign` / `public_emission` / `regulatory_filing`); see §6 ambiguity. |

**Recommended Phase 3 second playbook: `weekly-recap-cycle`.** Reasons:
(1) it directly extends an existing skill (`progress-monitor`
weekly-recap mode) the same way `project-orchestration` formalised the
existing four-skill pipeline — formalisation, not new capability;
(2) it is light (5-7 steps, one `checkpoint`, no `hard-gate`), so it is
authorable in Week 2 alongside other Phase 3 work; (3) the
conditional-checkpoint pattern is a useful format extension to surface
before Phase 4; (4) it gives the persona a *recurring* playbook to pair
with `project-orchestration`'s one-shot, the same way `compliance-cycle`
pairs with the future PT-registration playbook on the business-agent side.

`blocker-resolution` is the second-choice candidate — also light, but
narrower in scope (one blocker at a time) and overlaps semantically with
the inside-`project-orchestration` blocker-surface behaviour already
covered by step 6 of Phase 2's `project-orchestration`.

`milestone-handoff` is intentionally **deferred to Phase 4+**. It is the
most ambitious of the three, it introduces a new `approval_requests`
action kind which requires a separate migration + handler update, and it
fans out into next-phase task generation which composes
`project-orchestration` *inside* `milestone-handoff` — exactly the
playbook-calling-playbook question Phase 2 audit §6 ambiguity #4 left open.
Once that question is decided, `milestone-handoff` is the natural test.

## 3. Gaps

- **`progress-monitor` weekly-recap output shape unpinned.** Pin step 2
  "Output yang diharapkan" — e.g.
  `{ "highlights":[...], "in_progress":[...], "blockers":[...], "next_priorities":[...], "milestones_reached":[...] }`.
- **Audience-conditional gating is a new format pattern.** Phase 1+2
  playbooks have `Gerbang eskalasi` as a per-step constant. Step 6 fires
  only when `state_data.audience != 'self'`. Authorable today (agent
  reads `state_data` and chooses whether to `advance` with
  `set_status: 'awaiting_customer'`), but the convention deserves to be
  documented. Recommendation: permit `Gerbang eskalasi:
  checkpoint (conditional on <field>)` with read-and-decide pinned in
  Aksi. No engine change.
- **Cron-resume.** Friday 16:00 trigger re-runs `start` weekly (each week
  its own run) rather than parking one multi-week run. Pin in step 1
  Aksi.
- **No templates.** Audience-tone signals (self / stakeholder /
  1on1-manager) pin inline per Phase 1 lesson; persona is already
  templates: [], no drift introduced.

## 4. Lessons applied

- **`project-orchestration` loop-inside-a-step** does not apply directly
  — `weekly-recap-cycle` has no fan-out — but carries over to
  `milestone-handoff` step 6 if/when built.
- **`compliance-cycle` `hard-gate` + `approval_requests`** not used
  here (no irreversible action), but IS the pattern for
  `milestone-handoff` step 4 when built.
- **Phase 1 directory-form** — `agent-packs/project-conductor/skills/weekly-recap-cycle/SKILL.md`,
  pack version 2.1.0 (Phase 2) → 2.2.0.
- **Conditional-checkpoint** is a Phase 3 format extension worth noting
  in §"Format" when Phase 4 audits start citing it.

---

# Persona 4 — `business-agent` second playbook (beyond `compliance-cycle`)

Folder: `agent-packs/business-agent/`. Manifest `version` 3.0.0. Tier:
Studio only (`phase_5_enabled` gate). Already the richest pack in the
product. First playbook `compliance-cycle` covered in Phase 2 audit §2.

## 1. Skill inventory (re-statement)

Same eight content skills + shared `extend-capabilities` as the Phase 2
audit: three first-party advisors (`business-roadmap-tracker`,
`incorporation-advisor`, `compliance-checker`) and five dispatch facades
(`sales-dispatch`, `marketing-dispatch`, `engineering-dispatch`,
`legal-dispatch`, `finance-dispatch`). **Templates: eight, file-backed,
manifest-registered.** Phase 2 audit §1a flagged the two-state-machine
finding (`business_roadmap_state` + `approval_requests` already exist
independent of flow-state) — resolved by the
`compliance-cycle` pattern (flow-state for sequencing, `approval_requests`
for durable approvals).

The Phase 2 audit recommended `compliance-cycle` as the second-priority
playbook and noted `incorporation-walkthrough` as either folding into
PT-registration (project-conductor's playbook) OR being its business-
agent-side sub-playbook.

The Cowork hint for Phase 3 suggests: *"maybe an incorporation-walkthrough
that pairs with compliance-cycle, or a finance-cycle, or a sales-cycle."*
This audit examines all three plus a fourth Cowork did not name
(`hire-first-employee`).

## 2. Playbook candidates

| Playbook | Rough step shape | Gate profile |
|---|---|---|
| **`finance-cycle`** — recurring DJP filing flow per period | 1 cron monthly on day-3 (or trigger phrase) fires playbook `start` → 2 enumerate active obligations for the period (`compliance-checker` upcoming-due, scoped to month) → 3 per-obligation: dispatch via `finance-dispatch` (`pph-calc` / `ppn-filing` / `spt-tahunan`) → 4 specialist drafts (Trade Pro `pph-calculator` / `ppn-prep` / `spt-tahunan-prep` + Doc Expert templates), loop-inside-a-step across N obligations → 5 PII redact in summaries (NPWP visible in final PDF only) → **6 hard-gate per filing: customer confirms before SPT/PPN submission** → 7 customer submits to DJP via official channels, marks complete → 8 update `bd_decisions_log`, run `complete` | Step 6 = **`hard-gate` per filing**, identical pattern to `compliance-cycle`'s `regulatory_filing` (`approval_requests` 48h expiry). The difference: `compliance-cycle` is *advisory-with-filing-gates*; `finance-cycle` is *production-of-the-filing-itself*, composing `finance-dispatch` → Trade Pro / Doc Expert specialists. Heavier than `compliance-cycle` (more specialist composition, more PII to redact) but the gate semantics are identical. |
| **`sales-cycle`** — recurring lead-to-proposal flow | 1 intake (target segment, urgency, ICP) → 2 dispatch lead-gen via `sales-dispatch` (`lead-gen` → Deep Researcher `market-segment-research`) → **3 checkpoint: customer prioritises leads** → 4 dispatch outreach (`sales-dispatch` `outreach` → Social Conductor `outreach-sequence-builder`) → **5 checkpoint per lead: customer reviews + sends manual** → 6 customer logs reply, classify → 7 if proposal-stage, dispatch (`sales-dispatch` `proposal` → Doc Expert `contract-template-generator`) → **8 hard-gate: `contract_sign` approval** (Doc Expert side, 14d expiry) → 9 customer signs offline, marks complete | Step 3 = `checkpoint`. Step 5 = recurring `checkpoint` per lead (Option B style — drafts not auto-sent). Step 8 = **`hard-gate`** (`contract_sign`, 14d). Mixed gate profile. Most multi-skill of any business-agent playbook. |
| **`incorporation-walkthrough`** — Phase 2 audit alternative if PT-registration is owned by project-conductor | (see Phase 2 audit §2 row 1 — same shape, restated here) 1 intake → 2 pt-vs-cv decision surface → **3 checkpoint: customer picks entity** → 4 cost estimate + document checklist → 5 OSS walkthrough (using `oss-checklist.md`) → **6 hard-gate: `incorporate` approval, 14d expiry** → 7 NIB-issued confirmation + 90-day verification reminder | Step 6 = **`hard-gate`**. The dependency-graph collision with PT-registration is the §7 dependency question. |
| **`hire-first-employee`** (Cowork did not name; surfaced by audit) | 1 intake (hire role, salary, location) → 2 dispatch legal (`legal-dispatch` `employment-agreement` → Doc Expert) → **3 hard-gate: `contract_sign` approval (14d expiry)** → 4 dispatch finance (`finance-dispatch` `pph-calc` → Trade Pro for PPh 21 setup) → 5 surface BPJS registration paths (using `finance/bpjs-registration-paths.md`) → 6 reminder schedule for monthly BPJS + PPh 21 (`compliance-checker` enrol) → 7 run `complete` | Step 3 = **`hard-gate`**. Lighter than `finance-cycle` / `sales-cycle` but introduces three new compliance items (BPJS Kesehatan + BPJS Ketenagakerjaan + PPh 21) into `compliance-cycle`'s recurring loop. Strong dependency on `compliance-cycle` being merged. |

**Recommended Phase 3 second playbook: `finance-cycle`.** Reasons:
(1) it is the direct production-side counterpart to `compliance-cycle`'s
*advisory* posture — `compliance-cycle` surfaces "PPN due Nov 15";
`finance-cycle` produces the actual filing draft. The two playbooks
*compose* naturally: `compliance-cycle` is the calendar, `finance-cycle`
is the executor;
(2) its gate semantics are identical to `compliance-cycle` — same
`hard-gate` + `regulatory_filing` `approval_requests` composition pattern,
no new approval action kind required;
(3) it exercises the dispatch facades (`finance-dispatch` → Trade Pro +
Doc Expert) inside a playbook, which Phase 2 did not — `compliance-cycle`
only invokes `compliance-checker` directly. This is the first playbook to
test the dispatch-inside-playbook pattern, a known-unknown for the format;
(4) the PII redaction pattern (NPWP/account numbers redacted in summaries,
full in final PDF) is the most rigorous in any playbook to date and is
the right exercise of business-agent's PII allowlist.

`sales-cycle` is second-choice — more multi-skill but lighter on gates,
and its `contract_sign` gate already gets exercised by the standalone
Doc Expert path on its own. Defer to Phase 4.

`incorporation-walkthrough` ownership is the §6 ambiguity carried from
Phase 2 — if Phase 2 PR #154 (PT-registration) lands as a flat
project-conductor playbook, `incorporation-walkthrough` is partial
duplication and should be skipped or built as a thin sibling that
delegates step 4-6 to PT-registration. If PT-registration is redesigned
as composition (Phase 2 §5 option B), `incorporation-walkthrough` becomes
its business-agent-side sub-playbook. Either way, this is downstream of
Phase 2 PR #154 closure.

`hire-first-employee` is intentionally **deferred to Phase 4+** because
it materially extends `compliance-checker`'s recurring item set (adds
BPJS Kesehatan + Ketenagakerjaan + PPh 21 to the cron) and that extension
should land cleanly before being wrapped in another playbook.

## 3. Gaps

- **Dispatch-inside-playbook is a new composition.** Phase 2
  `compliance-cycle` calls `compliance-checker` directly; `finance-cycle`
  step 4 composes `finance-dispatch` → Trade Pro / Doc Expert *as a
  playbook step* — same loop-inside-a-step + child-Hermes-session pattern
  as `project-orchestration` step 5, with one extra facade hop.
  Authorable today (Aksi names `hermes-skill:finance-dispatch`), but pin
  that the dispatch's `department_threads` row opens for THIS step and
  the dispatch output is captured into `step_output` for the next step.
  Same compose-don't-replace posture as Phase 2 §1a, extended one layer.
- **PII handling is the strictest in any playbook.** 8 steps
  accumulating NPWP + account numbers + tax totals in `state_data`. Per
  `finance-dispatch`'s allowlist (PII pass-through to `incorporation-
  advisor` + `compliance-checker` only; redacted elsewhere): the playbook
  stores **redacted summaries** in `state_data` plus a **reference to a
  separate per-run encrypted-PDF location** for the final filing
  document, rather than raw NPWP in `state_data`. Worth documenting as a
  SKILL.md convention.
- **Multi-month parking.** SPT Tahunan run parks for the four-month
  filing window. `approval_requests` 48h expiry covers each gate but the
  whole run sits at `awaiting_customer` between gate fires. Surface an
  "open finance-cycle run" nudge from business-agent's SOUL.md
  returning-session greeting (which already prepends
  `bd_decisions_log` — same surface).
- **Cross-run state via `bd_decisions_log`.** `compliance-cycle`
  writes filing-completed events; `finance-cycle` reads them at step 1
  to avoid recomputing an already-filed obligation. Deliberate
  composition story; pin in step 1 Aksi.
- **`phase_5_enabled` tier-gate** — identical prereq to
  `compliance-cycle`; state in `prerequisites` frontmatter.

## 4. Lessons applied

- **`compliance-cycle` `hard-gate` + `approval_requests`** applies
  verbatim to step 6 — same `regulatory_filing` kind, 48h expiry,
  Telegram inline keyboard. Pure reuse.
- **`project-orchestration` loop-inside-a-step** applies to step 4
  (loop across N obligations, fan-out via `finance-dispatch`, collect,
  advance cursor once).
- **`project-orchestration` dispatch-via-`multi-agent-router`**
  generalises to dispatch-via-`finance-dispatch` — same parent-spawn-
  child-collect with one extra facade hop.
- **Phase 1 directory-form** —
  `agent-packs/business-agent/skills/finance-cycle/SKILL.md`. Pack
  version 3.1.0 (Phase 2) → 3.2.0.
- **Phase 2 §1a two-state-machines finding** is the posture
  `finance-cycle` adopts: flow-state for per-period sequencing,
  `approval_requests` for per-filing gate, `bd_decisions_log` for
  cross-period memory. Three composing layers, no fork.

---

# Cross-persona findings + Phase 3 format recommendation

## Headline

Three of the four Phase 3 personas (`social-conductor`,
`project-conductor`, `business-agent`) are in the same state Phase 2's
personas were in — implicit pipelines described in SOUL.md prose, no
real playbooks today, formalisation-not-authoring work. The fourth
(`trade-pro`) is more like Phase 1's `the-pro` — single-shot skills with
one tightly-scoped procedure (Bitget onboarding) hiding inside them.
Phase 3 playbook work is again **content authoring + manifest entry**,
no engine work — with two narrow format extensions surfaced (see below).

## Format — reuse Phase 1 + Phase 2 with two narrow additions

Reuse the proven Phase 1 + Phase 2 format unchanged:

- A playbook is a `skills/<id>/SKILL.md` tagged `skill_kind: "playbook"`
  in `manifest.json`. Six-field per-step shape (Aksi / Tautan-endpoint /
  Input yang diharapkan / Output yang diharapkan / Validasi / Gerbang
  eskalasi) plus an Error handling line. Engine contract unchanged.
- Phase 2's two patterns reused verbatim: **loop-inside-a-step** and
  **`hard-gate` + `approval_requests` composition**.

Two narrow Phase-3-specific *usage* notes (not format changes):

1. **`hard-gate` does NOT always compose with `approval_requests`.**
   `bitget-onboarding` step 7 (trade-pro) is a `hard-gate` with no
   durable approval — the gate is an inline platform-side reject, not a
   pending-customer-decision. The playbook parks at flow-state
   `escalated` until the customer regenerates and re-pastes, then the
   validation step re-fires. **This is a useful complement to the
   Phase 2 lesson** — `compliance-cycle` proved `hard-gate` *can*
   compose with `approval_requests`, but `bitget-onboarding` proves it
   need not. The right composition is gate-by-gate, decided by whether
   the gate guards a pending-customer-decision (compose) or an inline
   platform-rejection (do not compose).
2. **Conditional `Gerbang eskalasi` is permitted, documented inline.**
   `weekly-recap-cycle` step 6 (project-conductor's Phase 3 playbook)
   gates only if `state_data.audience != 'self'`. The SKILL.md may
   declare `Gerbang eskalasi: checkpoint (conditional on audience)` and
   pin the read-and-decide logic in the step's Aksi. No engine change
   — the agent reads `state_data` and chooses whether to `advance` with
   `set_status: 'awaiting_customer'` or just `advance`. Document the
   convention in the cross-cutting format prose when the first Phase 3
   playbook uses it.

## Recommended Phase 3 build order

Build in this order — lowest-risk-and-highest-leverage first, headlines
last, same pattern as Phase 2:

| # | Persona | Playbook | Steps | Gate profile | Key risk |
|---|---|---|---|---|---|
| 1 | `trade-pro` | `bitget-onboarding` | ~8 | 1 × `checkpoint`, 1 × `hard-gate` (no `approval_requests`) | External-API failure-mode breadth; agent-↔-dashboard handoff (step 4 customer pastes in platform UI) |
| 2 | `project-conductor` | `weekly-recap-cycle` | 6–7 | 1 × `checkpoint` (conditional) | Cron-resume; conditional-gate format pattern (new) |
| 3 | `social-conductor` | `voice-onboarding` | ~6 | 1 × `checkpoint` | Sample-collection loop-inside-a-step; `state_data` accumulates customer writing samples (privacy-low but author-owned content) |
| 4 | `business-agent` | `finance-cycle` | ~8 | 1+ × `hard-gate` per filing (`regulatory_filing`, 48h) | Multi-month parking; PII redaction inside `state_data`; dispatch-facade-inside-playbook (new composition layer) |
| 5 | `social-conductor` | `campaign-execution` | ~8 | 2 × `checkpoint` (one recurring per slot at H-2) | Multi-week parking; cron-resume per slot; recurring checkpoint pattern; most multi-skill of any Phase 3 playbook |

**Rationale for ordering:**

1. `bitget-onboarding` first — smallest in steps (~8 but tight), zero
   multi-day parking, and the `hard-gate`-without-`approval_requests`
   form complements Phase 2's pattern without re-stressing the
   `approval_requests` infrastructure. Excellent warm-up.
2. `weekly-recap-cycle` next — formalises an existing single-shot skill
   (`progress-monitor` weekly-recap mode), introduces the conditional-
   gate format extension on a contained surface, exercises cron-resume
   for the first time at low stakes (a recap re-fires next week if it
   fails).
3. `voice-onboarding` mid-pack — formalises the SOUL.md "lock voice
   before draft" prose; one checkpoint; introduces sample-collection
   loop-inside-a-step. Builds on Phase 2 `project-orchestration`'s
   loop pattern.
4. `finance-cycle` second-to-last — the heaviest playbook of Phase 3.
   Pure reuse of `compliance-cycle`'s `hard-gate` + `approval_requests`
   pattern means the engine surface is already proven; the new stress
   is dispatch-facade-inside-playbook + the strictest PII redaction
   shape. Sequence it after `weekly-recap-cycle` proves cron-resume
   and after `voice-onboarding` proves accumulating-`state_data`.
5. `campaign-execution` last — the most ambitious. Multi-week parking,
   per-slot recurring checkpoints, four skills composed. Sequenced
   last on purpose: it stresses every Phase 3 pattern (loop, cron-
   resume, accumulating `state_data`, recurring checkpoint) in a single
   playbook, and should be authored only after the four smaller
   playbooks have shaken each pattern out individually.

Optional `morning-routine` (trade-pro), `engagement-cycle` (social-
conductor), `blocker-resolution` (project-conductor), `sales-cycle`
(business-agent), `hire-first-employee` (business-agent),
`incorporation-walkthrough` (business-agent) are intentionally deferred
unless founder asks for breadth over depth.

---

# §6 — Flagged ambiguities (not guessed)

None are blocking. All are author-time defensible if the founder is
hands-off.

1. **`bd_decisions_log` cross-playbook read pattern.** Phase 2 §1a
   recommended composing flow-state + `approval_requests`;
   `compliance-cycle` ships that pattern, `finance-cycle` reuses it.
   Still open: read-shape (query by customer_id + action_kind + period)
   and ownership (who writes when). Defensible default for hands-off
   authoring: `compliance-cycle` writes `filed_acknowledged` events;
   `finance-cycle` writes `filing_drafted` + `filing_submitted` events.
2. **PT-registration ownership** (carried from Phase 2 §6 #3) gates
   Phase 3 `incorporation-walkthrough` only — NOT any other Phase 3
   playbook. If PR #154 ships PT-registration as flat project-conductor
   playbook, `incorporation-walkthrough` is duplication and is skipped
   (this audit recommends so). `finance-cycle` does not move on this
   outcome.
3. **Conditional `Gerbang eskalasi` format pattern.**
   `weekly-recap-cycle` step 6. Recommendation: permit
   `checkpoint (conditional on <field>)` value-string + Aksi-pinned
   read-and-decide logic. No engine / schema / validator change. Ship
   in `weekly-recap-cycle`'s SKILL.md; Phase 4 audit reviews post-fact.
4. **`bitget-onboarding` step 4 platform-UI handoff.** Same shape as
   PT-registration step 6 (customer-side action). Aksi pins agent
   waits for confirmation message, does not poll dashboard. Ship as-is.
5. **`milestone_signoff` approval action kind** is needed only for the
   future `milestone-handoff` playbook (deferred to Phase 4+). Phase 3
   builds four playbooks; none need a new approval action kind. Flagged
   so it does not surprise a later reader.

---

# §7 — Dependency graph note

One hard dependency, one soft, no engine dependency.

- **Hard: `finance-cycle` ⇒ `compliance-cycle` merged first (PR #153).**
  Step 2 reads `compliance-checker` upcoming-due output; step 1 reads
  `bd_decisions_log` events `compliance-cycle` writes. Mitigated by
  build-order position #4: PR #153 has Weeks 2-4 to land. If PR #153
  stalls during hands-off window, build positions #1-#3
  (`bitget-onboarding`, `weekly-recap-cycle`, `voice-onboarding`) in any
  order — none depend on Phase 2.
- **Soft: `weekly-recap-cycle` ⇒ `project-orchestration` merged first
  (PR #152).** Authorable before, easier to test after. Re-order to #4
  or #5 if PR #152 stalls; cost is one extra week of
  `project-conductor` having only `project-orchestration`.
- **No Phase 3 playbook depends on PT-registration (PR #154).**
  `finance-cycle` shares `bd_decisions_log` with PT-registration but
  reads only `filed_acknowledged` events (`compliance-cycle` side), not
  `incorporate` events (PT-registration side). Only the deferred
  `incorporation-walkthrough` slot moves on PR #154 outcome.
- **No Phase 3 playbook depends on engine changes.** Phase 1's
  flow-state engine + `skill_kind` enum covers every Phase 3 gate,
  loop, cron-resume, and manifest entry. Phase 3 is pure content +
  version bumps:
  - `social-conductor` 2.0.0 → 2.1.0 (`voice-onboarding`) → 2.2.0 (`campaign-execution`)
  - `trade-pro` 2.1.0 → 2.2.0 (`bitget-onboarding`)
  - `project-conductor` 2.1.0 (Phase 2) → 2.2.0 (`weekly-recap-cycle`)
  - `business-agent` 3.1.0 (Phase 2) → 3.2.0 (`finance-cycle`)

---

# §8 — Cowork persona-set adjustment

**Adjusted: none.** The Cowork-pre-resolved set (`social-conductor`,
`trade-pro`, `project-conductor` 2nd, `business-agent` 2nd) is the
right Phase 3 set on dependency + risk analysis. Two non-obvious
within-the-set calls:

1. **`weekly-recap-cycle` over `milestone-handoff`** for
   project-conductor's 2nd. `milestone-handoff` is architecturally
   richer but introduces a new `approval_requests` action kind
   (`milestone_signoff`), composes playbook-inside-playbook (Phase 2
   §6 #4 open question), and stresses three new surfaces at once.
   `weekly-recap-cycle` is the formalisation-of-existing pattern this
   persona has proven works at Phase 2 scope.
2. **`finance-cycle` over `incorporation-walkthrough` /
   `sales-cycle` / `hire-first-employee`** for business-agent's 2nd.
   `incorporation-walkthrough` collides with PR #154; `sales-cycle`
   is multi-skill but gate-light; `hire-first-employee` needs
   `compliance-checker` extension first. `finance-cycle` is the
   production-side counterpart to `compliance-cycle`'s advisory-side
   — the natural Phase 3 pair.

If founder strategic preference on return is to widen
business-agent (more flows, lighter gates) rather than deepen it,
`sales-cycle` is the swap. Strategic call the audit does not make.
