# Persona Template + Playbook Inventory — 2026-05-17

**Scope:** Read-only audit of BOTH document templates AND process playbooks for three personas — `the-pro`, `slide-master`, `deep-researcher`. No code changed. Upstream Hermes untouched.
**Worktree:** `.worktrees/waitpage-fix` @ branch `harness/model-assertion`.
**Purpose:** Phase 2 of the prebuilt-asset workstream. Founder goal: every persona should work from PREBUILT assets, not improvise. Two asset classes — **document templates** (output structures to fill) and **process playbooks** (multi-step orchestrated procedures: visit URL X → input Y → click Z → wait → validate → next step).

**Companion docs:**
- `docs/audits/2026-05-16-persona-system-audit.md` — persona-delivery audit (selection/bundle-publish gaps).
- `docs/audits/2026-05-17-persona-template-inventory.md` — the prior **templates-only** audit. This document **extends** it: §1 of each persona section summarises that audit's template findings rather than re-deriving them; §2-§4 are new playbook analysis.

---

## Terminology used in this audit

- **Document template** — a structured content artifact the agent *fills*: a deck skeleton, a rubric, a JSON fixture, a report skeleton. Lives (or should live) as a file under `agent-packs/<slug>/templates/`.
- **Process playbook** — a *sequenced procedure*: an ordered list of steps, each with an action, often an external link/endpoint, an expected input, an expected output, an error/validation branch, and (where the step crosses a money/identity/irreversibility line) an escalation gate where the agent stops and asks the customer. A playbook is what makes "bantu saya buka PT" execute as one orchestrated flow instead of a Q&A.
- **Single-shot capability** — a skill that takes inputs and produces one output in one pass, with no inter-step ordering, no wait-and-validate, no surfaced checkpoints. Most of today's skills are this.

The distinction that matters: a playbook has **steps that depend on each other and gate on each other's output**. A single-shot skill that happens to list "1. … 2. … 3. …" internal sub-actions is *not* a playbook — those are just an ordered recipe for one atomic call, with no pause point and no customer-visible checkpoint between them.

---

# Persona 1 — `the-pro`

Folder: `agent-packs/the-pro/`. Manifest `version` 1.0.0. The default persona (index 0 of every tier).
Skills on disk: `skills/daily-briefing/SKILL.md` only. Manifest also advertises `extend-capabilities` (shared skill, `agent-packs/_shared/skills/extend-capabilities/`).

## 1. Document templates — state (summary of 05-17 audit)

**0 real customer-output templates.** What exists under `agent-packs/the-pro/templates/`:
- `templates/mocks/calendar/typical-day.json`, `templates/mocks/gmail/typical-day.json` — manifest-registered, `kind: "fixture"`. **Demo/test fixtures**, not customer-facing templates — consumed *server-side* by `daily-briefing-handler.ts` (Edge Function), never enter the agent's LLM context.
- `templates/mocks/calendar/empty.json`, `templates/mocks/gmail/empty.json` — exist on disk, **absent from `manifest.json` `templates[]`** (manifest/disk drift, flagged in the 05-17 audit, not in scope to fix).
- `skills/daily-briefing/SKILL.md` lines 59-98 embed a fully worked **briefing output shape** (Kalender / Email [Penting/Follow-up/Noise] / Berita / closing summary) — an inline output template as prose, not a parameterised file.

**Common output-types with NO template:** email reply drafts (formal/casual/decline/follow-up), meeting → action-item document, weekly recap, commitment/follow-up tracker, prioritisation/trade-off summary. ~5 uncovered. The Pro is the fuzziest persona, so its "templates" naturally look more like output-shape playbooks than fillable forms.

## 2. Process playbooks — state

**Zero process playbooks exist today.** The Pro has exactly one skill, `daily-briefing`, and it is a **single-shot capability**: extract `date`/`sources` → one `workflow-execute` POST → wrap returned markdown in a greeting → done. Its "Yang dilakukan" is a 6-item recipe for one atomic Edge-Function call — no inter-step gate, no wait-and-validate, no customer checkpoint between steps. `extend-capabilities` is a runtime skill-generator, also single-shot.

**Playbooks that SHOULD exist for the-pro:**

| Playbook | Shape | Why it is a playbook (not single-shot) |
|---|---|---|
| **Daily briefing** | gather calendar → gather email → gather news → triage/prioritise → format → deliver | Today it is server-side single-shot. As a *real* playbook (post Phase 2C-2, when real Gmail/Calendar MCP lands) it becomes: fetch each source, validate each fetch succeeded, branch on connector-not-connected, surface a checkpoint if a source is empty. |
| **Customer reply** | classify incoming message → recall prior thread context → draft in customer's learned voice → **surface draft for approval (escalation gate)** → send only on explicit approval | Has a hard gate — SOUL.md "Tidak meniru kamu di pesan yang belum kamu approve." Send is irreversible; the approval checkpoint is the defining playbook feature. |
| **Meeting prep** | pull meeting from calendar → recall prior commitments tied to attendees → assemble talking points + open action items → deliver brief, optionally schedule a follow-up reminder (gate: SOUL.md says The Pro flags, customer approves calendar writes) | Multi-source gather + a write-gate. |

All three are described *narratively* in `SOUL.md` "# What I do" / "# When my customer first messages me" but exist as **no sequenced artifact** — the agent reconstructs the flow from prose each time.

## 3. Step-format gap

No SKILL.md in `the-pro` expresses a sequenced gated step. `daily-briefing/SKILL.md` "Yang dilakukan" is a numbered list, but the numbers are sub-actions of one call, not checkpointed steps. The Pro needs the new playbook sub-format (see cross-persona section). The customer-reply playbook in particular needs the **escalation-gate** field — that is the single most important format element for this persona.

## 4. Building blocks

From `agent-packs/the-pro/SOUL.md` "# Connected tools": Hermes built-ins available are **web search, calendar reading, email digest, cross-session memory**. A the-pro playbook would compose: calendar-read + email-digest (gather steps) + web-search (news step) + cross-session memory (context-recall step) + Telegram message-out (the approval checkpoint + final delivery). Real Gmail/Calendar MCP is Phase 2C-2 — until then a playbook step that "fetches calendar" resolves to the mock fixture via the Edge Function.

---

# Persona 2 — `slide-master`

Folder: `agent-packs/slide-master/`. Manifest `version` 2.0.0. The template-library exemplar.
Skills on disk: `narrative-arc-deck-builder`, `template-deck-builder` (+ shared `extend-capabilities`).

## 1. Document templates — state (summary of 05-17 audit)

**6 real, complete, file-backed, manifest-registered deck templates** under `templates/deck/` — `student/{assignment-presentation,thesis-defense,lecture-recap}.md` + `worker/{weekly-report,project-update,training-onboarding}.md`. All `kind: "deck-template"`, consistent YAML front-matter, per-slide `**Title:** / **Visual:** / **Speaker note:**` structure, `{placeholder}` + `[DATA_NEEDED]` markers. This is the only one of the three personas with a genuine populated template library, and its retrieval is the only one **wired** — `template-deck-builder/SKILL.md` step 2 names the exact path `agent-pack/templates/deck/<student|worker>/<template_id>.md`.

**Missing templates:** investor **pitch deck** (the flagship — named in SOUL.md greeting and the `narrative-arc-deck-builder` description, but exists only as the 12-slide arc embedded inline in `narrative-arc-deck-builder/SKILL.md` lines 36-42, no file, `templates_used: []`), board update, customer/sales pitch, executive summary, product-launch/GTM, QBR, conference keynote, webinar. ~6-8 uncovered.

## 2. Process playbooks — state

**Zero process playbooks exist today.** Both deck-builder skills are **single-shot capabilities**: extract fields → produce one markdown deck file in one pass → return. `narrative-arc-deck-builder/SKILL.md` "Yang dilakukan" lists "1. apply defaults … 5. output markdown" — a recipe for one generation pass, no checkpoint, no wait, no inter-step validation. There is no research step, no outline-approval step, no draft-then-polish cycle. The customer gets a full deck back in one shot and can then ask for adjustments conversationally — but that is post-hoc revision, not an orchestrated procedure.

**Playbooks that SHOULD exist for slide-master:**

| Playbook | Step sequence | Gates / checkpoints |
|---|---|---|
| **Pitch-deck creation** | 1 intake (audience/round/ask/topic) → 2 **research** (market size, competitor context — composes deep-researcher-style web search) → 3 **outline** (slide-by-slide arc) → **checkpoint: customer approves outline** → 4 **draft** (fill each slide + speaker notes) → 5 **polish** (visual hierarchy, chart briefs, consistency) → 6 export | Outline-approval checkpoint after step 3 is the defining feature — it stops the agent burning tokens drafting 12 slides off a wrong structure. Step 2 has a data-fabrication gate (SOUL.md: chart data from customer/verified research only). |
| **Investor brief** | 1 pull metrics from customer → 2 validate metrics sufficient for the claimed charts (gate: flag + ask, no extrapolation) → 3 structure → 4 draft → 5 export | Step 2 validation gate is explicit in SOUL.md "How I behave". |
| **Internal review deck** | 1 intake → 2 ingest team data (Q3 metrics etc.) → 3 outline → checkpoint → 4 draft → 5 deliver | Lighter than pitch-deck; outline checkpoint optional. |

The pitch-deck research→outline→draft→polish flow is named almost verbatim in the founder brief and is the highest-value playbook for this persona — see cross-persona §"highest-value playbook".

## 3. Step-format gap

`template-deck-builder/SKILL.md` is the closest existing thing to a step convention: it has a clean numbered "Yang dilakukan", a field-extraction table, an output-wrapper block, "Decline criteria", and "Decline kalau missing context". But it is still a **single-shot recipe** — there is no notion of a step that *pauses for customer approval* and *resumes*. The "Decline kalau missing context" block is a primitive escalation gate (stop + ask one question) but it only fires at the *start*, never *between* steps. Slide-master playbooks need the new sub-format, specifically the per-step `checkpoint:` field so the outline-approval pause is first-class.

## 4. Building blocks

From `agent-packs/slide-master/SOUL.md` "# Connected tools": **deck generation (PowerPoint/Keynote/Google Slides), chart rendering, image search (royalty-free filter), speaker-note generation**. A pitch-deck playbook composes: web-search (research step) + chart rendering (traction slide) + image search (visuals) + deck generation/export (final step) + Telegram message-out (the outline checkpoint). The research step can compose the same Hermes web-search built-in that deep-researcher uses — there is no cross-pack import, but the *built-in* is shared.

---

# Persona 3 — `deep-researcher`

Folder: `agent-packs/deep-researcher/`. Manifest `version` 2.0.0. Tier: pro+studio only.
Skills on disk: `web-research`, `source-evaluator`, `citation-builder`, `synthesis-report` (+ shared `extend-capabilities`). **All four content skill files exist** — the 05-16 audit's "no skills/, no templates/" finding is stale.

## 1. Document templates — state (summary of 05-17 audit)

**2 real, file-backed, manifest-registered reference docs** under `templates/`:
- `source-credibility-rubric.md` — `kind: "reference"`, the 5-dimension grading rubric + A-D tier table, used by `source-evaluator`.
- `synthesis-structure.md` — `kind: "reference"`, the fixed report skeleton (TL;DR / key findings / detail / source conflicts / gaps / sources) + 3 format variants, used by `synthesis-report`.

Both are `kind: "reference"` — standing-rules docs the agent reasons *with* / structures output *to*, closer to playbook than fillable form. Retrieval is **partially wired**: the skills *name* the file (`synthesis-report/SKILL.md` step 2 "Susun struktur ikut `synthesis-structure.md`") but give **no path** — and both skills also re-state the template content inline (defeating the token-cost goal). The front-half skills `web-research` + `citation-builder` have **0 backing templates**.

**Missing templates:** research-brief/scoping template, query/sub-question plan, **per-style citation format specs** (footnote-numbered/APA/author-date/plain — the agent reconstructs each style from memory, directly counter to the determinism goal), literature-review comparison matrix, competitor-scan landscape template, per-source metadata schema. ~5-6 uncovered.

## 2. Process playbooks — state

**Deep-researcher is the closest of the three to having a playbook — but still has zero true playbooks.** Its four skills form an *implicit pipeline*: `web-research` → `source-evaluator` → `citation-builder` → `synthesis-report`, and the SKILL.md files cross-reference each other ("Juga: dipanggil otomatis oleh `synthesis-report`"; "Serahkan source set ke `source-evaluator`"; `synthesis-report` step 1 "Kalau belum ada source set — jalankan `web-research`, lalu `source-evaluator`"). So the *intent* of a sequenced procedure is documented.

But it is **not a real playbook**, because:
- The sequencing lives as **prose cross-references scattered across four separate SKILL.md files**, not as one ordered artifact. Nothing pins the order, the hand-off data shape, or the checkpoints.
- There is **no checkpoint convention** — `source-evaluator` ends "...aku sandarkan klaim utama ke Tier A dan B. Setuju?" and `web-research` ends "...kamu mau adjust scope dulu?", which are *de facto* between-step gates, but they are buried in output-wrapper prose, not declared as steps. Whether the agent actually pauses for that "Setuju?" or barrels on is left to LLM judgement.
- The hand-off payload (the "source set") is passed "as an array" with **no pinned schema** — the 05-17 audit flagged the missing per-source metadata template.

Each of the four skills, taken alone, is a **single-shot capability**. The pipeline is an emergent property of prose, not an orchestrated playbook.

**Playbooks that SHOULD exist for deep-researcher:**

| Playbook | Step sequence | Gates / checkpoints |
|---|---|---|
| **Market research** | 1 scope intake (time period/geography/depth/format) → **checkpoint: confirm scope** → 2 decompose to 3-6 sub-questions → 3 web-search per sub-question → 4 dedup + assemble source set → 5 grade sources (rubric) → **checkpoint: confirm Tier A/B anchor set** → 6 build citations → 7 synthesise report (skeleton) → deliver | Two checkpoints — scope confirmation (SOUL.md: "Sebelum mulai riset besar, aku konfirmasi scope") and source-anchor confirmation (`source-evaluator`'s "Setuju?"). This is the implicit pipeline made explicit + gated. |
| **Competitor analysis** | 1 intake (market/positioning) → 2 enumerate competitors → 3 per-competitor web-search → 4 grade → 5 fill comparison matrix → 6 synthesise landscape → deliver | Needs the missing competitor-scan + comparison-matrix templates as the artifacts steps 5-6 fill. |
| **Source synthesis** | 1 ingest customer-supplied source list → 2 grade → 3 build citations → 4 synthesise → deliver | The pipeline minus the web-research front half — customer brings the sources. |

## 3. Step-format gap

Deep-researcher has the richest *raw material* for a step format but no convention. Its SKILL.md files already carry: field-extraction tables, "Yang dilakukan" numbered lists, output-wrapper blocks, "Decline criteria", "Decline kalau missing context". What is missing is exactly the playbook glue: a declared step order, a per-step expected-input / expected-output, and a per-step checkpoint.

**Important finding for the format recommendation:** the single best existing model of a step-sequenced SKILL.md anywhere in the repo is **`agent-packs/_shared/skills/integration-preflight/SKILL.md`**. It is a genuine multi-step procedure — `### Langkah 1 — Cek status kredensial` → `### Langkah 2a / 2b — Onboarding` → `### Langkah 3 — Operasi inti` — with, per step: an explicit action (an HTTP call shown verbatim), a **3-row status-response table that branches** (`200` → proceed, `404` → onboarding flow, `410` → re-onboarding flow), the success/failure outcome of each branch, and a customer-facing escalation message. That is, in substance, a playbook step-format already proven in this codebase. The recommended format below is essentially `integration-preflight`'s shape, generalised and given explicit field names. **Playbooks do NOT need a brand-new file type — they need a documented SKILL.md sub-format, modelled on `integration-preflight`.**

## 4. Building blocks

From `agent-packs/deep-researcher/SOUL.md` "# Connected tools" + the persona-shell `SKILL.md`: **web search, web scraping, long-document parsing (PDF/paper/report), citation extraction**, plus the persona-shell explicitly names pre-installed Hermes web tools — **arxiv, blogwatcher, llm-wiki**. A market-research playbook composes: web-search + web-scrape + arxiv (gather steps) + long-doc parsing (source-ingest step) + Telegram message-out (the two checkpoints). This persona has the most built-ins to compose and the most-developed implicit pipeline — it is the natural first playbook target.

---

# Cross-persona findings + Phase 2 design recommendations

## Headline

**Across all three personas, zero real process playbooks exist today.** Every skill audited is a single-shot capability. The closest thing to a playbook is deep-researcher's four-skill *implicit* pipeline, but its sequencing is emergent prose scattered across four files with no pinned order, no declared hand-off schema, and no first-class checkpoints. Document templates are further along — slide-master has 6 real ones — but even there the 05-17 audit's core gap (no retrieval loader; templates only used when a SKILL.md names the exact path) stands.

## Recommended SKILL.md playbook step-format

Playbooks do **not** need a new file type. They need a documented **SKILL.md sub-format** — a skill whose `SKILL.md` declares an ordered, gated step sequence. Model it on the proven `agent-packs/_shared/skills/integration-preflight/SKILL.md` shape: `### Langkah N` headers, each with an action + a branch table + a customer-facing message. Formalise that into a fixed per-step schema. Mark the skill in `manifest.json` with a new optional `skill_kind: "playbook"` discriminator (defaulting to `"capability"`) so the manifest validator and bundle pipeline can tell them apart.

Each playbook `SKILL.md` carries a `## Langkah-langkah` section; each step is a `### Langkah N — <title>` block with these fields:

| Field | Purpose |
|---|---|
| **Aksi** | What the agent does this step (call X, draft Y, search Z). |
| **Tautan / endpoint** | The URL or Hermes tool/endpoint the step uses, verbatim — optional for pure-reasoning steps. |
| **Input yang diharapkan** | The data this step needs, and from where (customer message / prior step's output / a named template file). |
| **Output yang diharapkan** | The artifact/data this step produces and hands to the next step — pin the shape (the deep-researcher source-set schema gap is exactly this). |
| **Validasi** | The pass/fail check on the output before advancing — a branch table when the outcomes diverge (mirrors `integration-preflight`'s status table). |
| **Gerbang eskalasi** | Whether the agent must STOP and wait for explicit customer approval before the next step. Three values: `none` (auto-advance), `checkpoint` (pause, show progress, ask "lanjut?"), `hard-gate` (must not proceed without explicit yes — for money / identity / irreversible sends; mirrors The Pro's "tidak meniru kamu di pesan yang belum kamu approve"). |

In two/three sentences: a playbook is a SKILL.md tagged `skill_kind: "playbook"` whose `## Langkah-langkah` section lists ordered `### Langkah N` steps, each declaring Aksi / Tautan / Input / Output / Validasi / Gerbang eskalasi. It is the `integration-preflight` step shape — action, branch table, escalation message — generalised into named fields, so the agent executes a deterministic sequence and pauses at declared checkpoints instead of reconstructing the flow from prose. No new file type, no Hermes patch — a playbook is just a SKILL.md, so it rides the existing skill-staging path untouched.

## How playbooks distribute

**No new distribution mechanism is needed.** A playbook is a `skills/<id>/SKILL.md` file. The existing `scripts/publish-persona-bundles.mjs` pipeline already `cpSync`s the whole `agent-packs/<slug>/` pack — `SOUL.md`, `SKILL.md`, `manifest.json`, `skills/`, `templates/` — into a deterministic per-persona tarball at `bundles/<slug>/<version>.tar.gz`, and `bundle-pull-script.ts` already copies every `skills/<id>/SKILL.md` into `~/.hermes/skills/`. A playbook skill file rides that path with zero change. Bump the pack's `manifest.json` `version` (semver) when a playbook is added so the idempotency probe republishes. The one open item is the same one the 05-17 audit raised for templates: any **template file a playbook step references** (e.g. the source-set schema) must be named by its exact resolved path inside the step's "Input yang diharapkan" field — because there is still no template loader, only path-naming in SKILL.md prose.

## Single highest-value playbook to build first

**Deep-researcher "market research" playbook.** Reasons: (1) the four skills already exist and already form an implicit pipeline — building the playbook is *formalising and gating* existing capability, not authoring from scratch, the lowest-risk first build; (2) it directly exercises every field of the proposed step-format including both checkpoint types (scope-confirm `checkpoint`, source-anchor `checkpoint`), so it doubles as the format's reference implementation; (3) deep-researcher already has 2 of its needed reference templates on disk, so the playbook has artifacts to point at; (4) market/competitor research is named explicitly in the deep-researcher SOUL greeting and is a top-tier paid use-case. Build it as a new `skills/<id>/SKILL.md` (e.g. `market-research-playbook`) tagged `skill_kind: "playbook"`, with the four existing skills as its step handlers.

**Top-3 playbooks to build first, across the three personas (in order):**
1. **deep-researcher — market research** — formalises an existing 4-skill pipeline; reference implementation of the step-format.
2. **slide-master — pitch-deck creation** (research → outline → draft → polish) — flagship use-case, named in the founder brief; the outline-approval `checkpoint` is its defining feature; also forces authoring the missing `pitch-deck` template.
3. **the-pro — customer reply** — smallest in steps but the cleanest demonstration of the `hard-gate` escalation field (no send without explicit approval); high daily-use frequency.

## Open ambiguities (flagged, not guessed)

- **Hermes step-orchestration support.** Whether the upstream Hermes runtime (`v0.13.0`) can natively *pause a skill mid-execution, surface a checkpoint to Telegram, and resume on the customer's reply* is **not determinable from the agent-pack files alone**. `project-conductor/skills/multi-agent-router/SKILL.md` references "Hermes v0.13.0 multi-agent primitive" and a kanban with `In Progress / Review / Done` states, which *suggests* a pause/resume/callback capability exists — but that is inference. If Hermes cannot natively pause-and-resume a skill, the `checkpoint` / `hard-gate` steps would have to be modelled as the agent ending its turn with a question and the customer's next message re-triggering the playbook at the next step (stateless continuation). This is a Hermes-capability question and must be confirmed before the playbook step-format is locked — it determines whether `Gerbang eskalasi` is a real runtime pause or a prompt-engineered turn boundary.
- **`skill_kind` manifest field.** Adding `skill_kind` to `agent-packs/_manifest.schema.json` and `manifest-validator.ts` is a schema change. The 05-17 audit already noted the standalone `_manifest.schema.json` is stale vs the inline validator schema (the `tier` vs `enabled_for_tiers` divergence) — any `skill_kind` addition must be made in both, and reconciling that existing drift should happen first.
- **Playbook vs `project-conductor`.** `project-conductor` (task-decomposer → multi-agent-router → kanban-orchestrator → progress-monitor) is itself a meta-playbook persona. Whether per-persona playbooks should be *invokable as project-conductor steps* (i.e. a project-conductor task whose owner is "slide-master / pitch-deck playbook") is a Phase 2 design question worth raising with the founder — it affects whether the step-format needs to be machine-callable, not just agent-readable.
