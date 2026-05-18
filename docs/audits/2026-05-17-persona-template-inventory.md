# Persona Template Inventory — 2026-05-17

**Scope:** Read-only audit of the template situation for three personas — `the-pro`, `slide-master`, `deep-researcher`. No code changed. Upstream Hermes untouched.
**Worktree:** `.worktrees/waitpage-fix` @ branch `chore/pre-final-retest-snapshot`.
**Purpose:** Phase 1 of the template-library workstream. Founder goal: every persona should work from PREBUILT TEMPLATES (doc/deck structures, playbooks) instead of improvising — for higher accuracy, lower token cost, more deterministic output, less customer input.

**Companion doc:** `docs/audits/2026-05-16-persona-system-audit.md` (the persona-delivery audit). That audit found deep-researcher had "no skills/, no templates/" — as of 2026-05-17 that is **stale**: `deep-researcher` now has 4 skill dirs + 2 templates on disk. The §3 finding that "no bundle is published" is **partially closed** — `scripts/publish-persona-bundles.mjs` now exists (it did not when the 05-16 audit was written) and wires the publish path; it is an operator-run script, still not in CI.

---

## How to read "template" in this audit

Two distinct things share the word "template" in this codebase, and conflating them is the central source of confusion:

1. **`manifest.json` `templates[]` entry** — a metadata record (id, kind, description_id, best_for). Validated by `manifest-validator.ts`. Pure catalog metadata.
2. **A real file under `agent-packs/<slug>/templates/`** — the actual structured content (a deck skeleton, a rubric, a JSON fixture).

A manifest `templates[]` entry and an on-disk file are linked **only by string-equal `id`** — the `id` field is the relative path under `templates/`. `manifest-validator.ts` checks that every `skill.templates_used[]` reference points at a real `templates[]` entry **id**, but it does **not** check that the file exists on disk. So a manifest can advertise a template whose file is missing and still pass validation. (Conversely, a file can exist without a manifest entry.)

---

# Persona 1 — `the-pro`

Folder: `agent-packs/the-pro/`. Manifest `version` 1.0.0. The default persona (index 0 of every tier).

## 1. Templates that EXIST today

`agent-packs/the-pro/manifest.json` `templates[]` lists 2 entries; both have a matching file.

| Manifest `id` | File on disk | `kind` | Purpose | Format | Completeness |
|---|---|---|---|---|---|
| `mocks/calendar/typical-day.json` | `templates/mocks/calendar/typical-day.json` | `fixture` | Mock Google Calendar payload (5 events) for the `daily-briefing` skill | JSON | Complete as a fixture |
| `mocks/gmail/typical-day.json` | `templates/mocks/gmail/typical-day.json` | `fixture` | Mock Gmail payload (10 emails) for the `daily-briefing` skill | JSON | Complete as a fixture |

Two more files exist on disk that are **NOT** in the manifest `templates[]`: `templates/mocks/calendar/empty.json` and `templates/mocks/gmail/empty.json` (the empty-state variants). They are unreferenced — a minor manifest/disk drift.

**Critical distinction:** none of these are customer-facing "prebuilt templates" in the founder's sense. They are **demo/test fixtures** — mock data so the `daily-briefing` skill produces a deterministic briefing before the real Google Calendar / Gmail MCP integration lands (Phase 2C-2). `manifest.json` itself says so: `kind: "fixture"`, `best_for: "Demo + integration testing"`. The `daily-briefing-handler.ts` header confirms it reads `templates/mocks/{calendar,gmail}/{scenario}.json`.

**Embedded template-like content** in skills/SOUL:
- `skills/daily-briefing/SKILL.md` contains a fully worked **briefing output example** (lines 59-98) — a complete markdown briefing shape (Kalender / Email [Penting/Follow-up/Noise] / Berita / closing summary). This is effectively an inline output template, but it is prose-in-an-example, not a parameterised file.
- `SOUL.md` "What I do" section describes the briefing structure narratively ("kalender hari ini, satu update pasar, tiga berita") — a spec, not a template.

**Net for the-pro: 0 real customer-output templates. 2 manifest-registered demo fixtures + 2 unregistered fixture files. 1 inline output-shape example embedded in a SKILL.md.**

## 2. Templates that are MISSING

The Pro's purpose (per `SOUL.md` + `SKILL.md`): daily work companion — morning briefing, cross-session memory, draft email, summarisation, commitment tracking, prioritisation. Common customer request classes with **no template**:

- **Email reply drafts** — SOUL.md "Aku belajar gaya nulis kamu … match ketika bantu draft balasan." No reply-draft template (formal / casual / decline / follow-up shapes).
- **Meeting / conversation → action items** — SOUL.md "Aku rangkum percakapan jadi action items." No action-item document template.
- **Weekly recap** — the first-contact greeting explicitly offers "Recap minggu lalu — aku sintesis … jadi 5 highlight." No recap template.
- **Commitment / follow-up tracker** — SOUL.md "Aku tracking commitments." No tracker template.
- **Prioritisation / trade-off summary** — greeting offers "susun urutan prioritasnya." No template.

The Pro is the broadest, fuzziest persona, so "templates" for it look more like **output-shape playbooks** than fillable documents — but right now even those exist only as prose inside SOUL.md / the daily-briefing example. Use-cases uncovered: **~5**.

## 3. Template retrieval mechanism

- `daily-briefing` skill: `execution: "edge-function"`, `handler_ref: "edge-fn:daily-briefing-handler"`. The fixtures are consumed **server-side** by `daily-briefing-handler.ts` (Edge Function), not by the agent on the VPS. The agent calls `workflow-execute`; the handler loads the mock JSON and returns rendered markdown. So the-pro's two "templates" never enter the agent's LLM context at all — they are server-side handler inputs.
- All other the-pro work (`extend-capabilities`, draft email, summaries) is plain LLM reasoning with **no template lookup**.

## 4. Pre-prompt hook insertion point

See cross-persona section — identical for all three. For the-pro specifically: `SOUL.md` has the standing-instruction sections `# What I do`, `# How I behave`, `# When my customer first messages me`. A "always use template X for request class Y" rule would live as a new line/section in `SOUL.md` (the file Hermes loads as the system-prompt persona) or in the persona-shell `SKILL.md` under `## Yang dilakukan`.

---

# Persona 2 — `slide-master`

Folder: `agent-packs/slide-master/`. Manifest `version` 2.0.0. This persona is **the template-library exemplar** — it is the only one of the three with a real, populated, customer-facing template library.

## 1. Templates that EXIST today

`agent-packs/slide-master/manifest.json` `templates[]` lists 6 entries; all 6 have a matching file under `templates/deck/`. All are `kind: "deck-template"`.

| Manifest `id` | `best_for` | Format | Slides | Completeness |
|---|---|---|---|---|
| `deck/student/assignment-presentation.md` | Mahasiswa S1, presentasi tugas mata kuliah | MD + YAML front-matter | 8-10 | Complete — per-slide title + visual brief + speaker note, `{placeholder}` + `[DATA_NEEDED]` markers |
| `deck/student/thesis-defense.md` | Mahasiswa S1/S2, sidang skripsi/thesis | MD + front-matter | 15-20 | Complete — BAB I-V mapped slide-by-slide |
| `deck/student/lecture-recap.md` | Mahasiswa/pengajar, ringkas materi kuliah | MD + front-matter | 8 | Complete |
| `deck/worker/weekly-report.md` | Karyawan report ke manager/tim | MD + front-matter | 6-8 | Complete |
| `deck/worker/project-update.md` | PM/project lead update stakeholder | MD + front-matter | 10-12 | Complete — includes RAG status logic |
| `deck/worker/training-onboarding.md` | Trainer/team lead onboarding deck | MD + front-matter | 12-15 | Complete |

All 6 are genuinely high quality: consistent YAML front-matter (`template`, `audience`, `duration_minutes`, `slide_count`, `language: id`), per-slide structure (`**Title:**` / `**Visual:**` / `**Speaker note:**` with timing), `{placeholder}` variables for substitution, `[DATA_NEEDED]` markers where customer data is required, and a `> _Catatan:_` usage footer.

The `template-deck-builder` skill's `templates_used[]` in the manifest lists exactly these 6 ids — manifest-internally consistent and `manifest-validator` clean.

**Embedded template-like content** in skills:
- `skills/narrative-arc-deck-builder/SKILL.md` (lines 36-42) embeds the **default 12-slide narrative arc structure** (Slide 1-2 hook, 3-5 solution, 6-8 traction, 9-10 differentiator, 11-12 ask). This is a 7th deck template — but it lives **inside a SKILL.md as prose**, not as a file under `templates/`, and has no `templates[]` manifest entry. The `narrative-arc-deck-builder` skill's `templates_used[]` is empty `[]`. So the default mode of the persona runs off an embedded structure, not a retrievable template file.

**Net for slide-master: 6 real, complete deck templates (file-backed, manifest-registered) + 1 embedded-in-SKILL.md narrative-arc structure.**

## 2. Templates that are MISSING

Slide-master's purpose: outline/brief → professional deck. The 6 templates cover student (3) and internal-worker (3) cases well. Major customer use-cases with **no template file**:

- **Investor pitch deck** — the SOUL.md first-contact greeting leads with "Pitch deck untuk investor" and the `narrative-arc-deck-builder` description says "cocok buat pitch deck." Yet there is no `pitch-deck` template file — only the embedded arc inside the SKILL.md. The persona's flagship use-case has no first-class template.
- **Board update** — `narrative-arc-deck-builder` extract field lists `audience: board` as an enum value, but no board-specific template exists.
- **Customer / sales pitch deck** — greeting offers "Customer-facing deck." No template.
- **Executive summary deck** — no template.
- **Product launch / GTM deck** — no template.
- **Quarterly business review (QBR)** — no template.
- **Conference / keynote talk** — no template.
- **Webinar deck** — no template.

Use-cases uncovered: **~6-8** (pitch deck being the most glaring — it is named in both the SOUL greeting and the skill description but has no file).

## 3. Template retrieval mechanism

The most concrete of the three. Trace from `skills/template-deck-builder/SKILL.md` "Yang dilakukan":

1. Customer triggers template mode ("deck dari template").
2. The skill (per its SKILL.md, step 2) resolves the file at `agent-pack/templates/deck/<student|worker>/<template_id>.md` — i.e. the agent reads the template file **from the staged agent-pack directory on the VPS itself**, using the customer's BYOK LLM (`execution: "hermes-skill"`, `handler_ref: "hermes-skill:template-deck-builder"`, runs entirely on the VPS).
3. The agent substitutes `{placeholder}` values with customer content, writes the output markdown to `/tmp/slide-master-out/`.

**The path the skill expects (`agent-pack/templates/deck/...`) is where `templates/` physically lands** — see cross-persona §"retrieval mechanism" below. So slide-master's template retrieval is the **only one of the three that is actually wired**: the skill SKILL.md tells the agent the exact on-disk path, the publish script ships the `templates/` dir, and the file is there for the agent to read. The weak link: this depends on the agent being instructed (via the SKILL.md prose) to go read that path — there is no loader that pre-injects the template; the agent must `cat` it itself as a tool action. It works because `template-deck-builder/SKILL.md` explicitly says so. **`narrative-arc-deck-builder` does NOT — its structure is inline, never retrieved.**

## 4. Pre-prompt hook insertion point

See cross-persona section. Slide-master specific: the persona-shell `SKILL.md` `## Yang dilakukan` step 2 already encodes a standing instruction ("Tanya: template-based atau narrative-arc?"). A "for request class X always pull template Y" rule belongs either there or in `SOUL.md` "What I do / How I behave."

---

# Persona 3 — `deep-researcher`

Folder: `agent-packs/deep-researcher/`. Manifest `version` 2.0.0. Tier: pro+studio only (not Starter).

## 1. Templates that EXIST today

`agent-packs/deep-researcher/manifest.json` `templates[]` lists 2 entries; both have a matching file directly under `templates/`. Both are `kind: "reference"`.

| Manifest `id` | File on disk | Purpose | Format | Completeness |
|---|---|---|---|---|
| `source-credibility-rubric.md` | `templates/source-credibility-rubric.md` | The 5-dimension source-grading rubric (authority, recency, primary/secondary, bias, corroboration) + A-D tier table. Used by `source-evaluator`. | Markdown reference doc | Complete |
| `synthesis-structure.md` | `templates/synthesis-structure.md` | The fixed research-report skeleton (TL;DR, key findings, detail, source conflicts, gaps, sources) + 3 format variants (brief-memo / executive-summary / full-report). Used by `synthesis-report`. | Markdown reference doc | Complete |

`source-evaluator`'s `templates_used[]` references `source-credibility-rubric.md`; `synthesis-report`'s references `synthesis-structure.md` — both manifest-consistent and validator-clean.

**Distinction:** these are `kind: "reference"`, not fillable output templates. They are **standing-rules documents** — a rubric the agent reasons *with*, and a report skeleton the agent structures output *to*. Closer to "playbook" than "fillable form." They are genuine prebuilt structures and serve the founder's deterministic-output goal well.

**Embedded template-like content** in skills:
- `skills/synthesis-report/SKILL.md` (lines 47-69) embeds a full **persona-voice output wrapper** showing the exact report shape (TL;DR / Key findings / Detail / Konflik antar sumber / Gaps / Sumber). This duplicates `synthesis-structure.md` as a worked example inside the SKILL.md.
- `skills/source-evaluator/SKILL.md` (lines 27-35) re-states the 5 rubric dimensions inline — duplicating `source-credibility-rubric.md`.
- `skills/web-research/SKILL.md` and `skills/citation-builder/SKILL.md` have **no** `templates_used[]` and no backing file — they run on inline SKILL.md instructions only.

**Net for deep-researcher: 2 real reference/playbook templates (file-backed, manifest-registered), both for the back-half skills (evaluate + synthesise). The front-half skills (web-research, citation-builder) have 0 templates.**

## 2. Templates that are MISSING

Deep-researcher's purpose: research complex topics from many sources, grade credibility, cite per claim, synthesise a structured report. The 2 reference docs cover grading + report skeleton. Use-cases with **no template**:

- **Research brief / scoping template** — SOUL.md "Sebelum mulai riset besar, aku konfirmasi scope: time period, geografi, depth, format." No scoping template; the agent improvises the scope questions.
- **Query / sub-question plan** — `web-research` SKILL.md step 1 is "pecah topik jadi 3-6 sub-pertanyaan." No query-plan template.
- **Citation format specs** — `citation-builder` offers `footnote-numbered / apa / author-date / plain` styles. No per-style format template; the agent reconstructs each style from memory each time (directly counter to the founder's determinism goal — citation formatting is exactly the kind of rigid structure a template should pin).
- **Literature-review matrix** — the SOUL greeting offers "Sintesis 10 paper akademik … mapping konvergensi dan disagreement." `thesis-defense.md` (slide-master) even uses a "penulis | tahun | findings | gap" table — deep-researcher has no such comparison-matrix template.
- **Competitor-scan template** — SOUL greeting explicitly offers "Riset kompetitor untuk launch produk baru." No competitor-landscape template.
- **Source set / bibliography data shape** — sources pass between `web-research` → `source-evaluator` → `citation-builder` → `synthesis-report` as an "array," but no template pins the per-source metadata schema (author, title, year, publisher, URL/DOI, access date).

Use-cases uncovered: **~5-6**. Citation-format specs and the source-set schema are the highest-value gaps for the determinism goal.

## 3. Template retrieval mechanism

All deep-researcher skills are `execution: "hermes-skill"` — they run on the VPS via the customer's BYOK LLM. `synthesis-report/SKILL.md` step 2 says "Susun struktur ikut `synthesis-structure.md`" and `source-evaluator/SKILL.md` says "pakai rubrik di `source-credibility-rubric.md`." These are **bare filename references with no path** — unlike slide-master's `template-deck-builder` which gives the full `agent-pack/templates/deck/...` path. So the deep-researcher skills *name* their template but **do not tell the agent where to find it**. In practice the agent either (a) already has the rubric/skeleton content because the SKILL.md re-states it inline (which it does — see §1 embedded content), or (b) must guess the path. The reference files exist and ship in the bundle, but the retrieval instruction is weaker than slide-master's. There is no loader.

## 4. Pre-prompt hook insertion point

See cross-persona section. Deep-researcher's `SOUL.md` has strong standing-instruction sections already (`# What I do`, `# How I behave`, `# Hard limits`) and the persona-shell `SKILL.md` `## Yang dilakukan` is itself a 5-step standing playbook. Insertion point identical to the others.

---

# Cross-persona findings

## The common retrieval mechanism (and why it half-works)

There is **no template loader anywhere**. Templates reach the agent by two physical-staging paths, then are read (or not) by the agent as an ordinary file-read tool action:

1. **Provision-time** — `setup-script.ts` (lines 408-424) base64-decodes the agent-pack tarball into `/home/weuseai/.hermes/agent-pack/`. The tar root is the pack root, so `templates/` lands at `/home/weuseai/.hermes/agent-pack/templates/...`. The script then loops over `agent-pack/skills/*/` and copies **only `SKILL.md`** files into `/home/weuseai/.hermes/skills/<id>/`. **`templates/` is decoded onto disk but never registered with Hermes.**
2. **Boot-time** — `bundle-pull-script.ts` pulls each tier persona's tarball from Storage, extracts the **whole pack** (templates included) into `/var/lib/weuseai/bundle/<slug>/<version>/`, then `apply_tier_filter` copies **only `SKILL.md`** files (per-skill `skills/<id>/SKILL.md` + the persona-shell `<slug>/SKILL.md`) into `~/.hermes/skills/`. **Again `templates/` lands on disk but is never wired into Hermes' skill-discovery path or the system prompt.**

`scripts/publish-persona-bundles.mjs` (new, 2026-05-17) **does** include `templates/` in the published tarball (it `cpSync`s the whole pack dir). So the template files genuinely arrive on the VPS — in two locations. What is missing is the *connection*: nothing tells Hermes "these files exist, here, use them." 

The retrieval therefore works **only** when a skill's own `SKILL.md` prose explicitly tells the agent the on-disk path to `cat`. **`slide-master/skills/template-deck-builder/SKILL.md` is the single skill that does this correctly** (`agent-pack/templates/deck/<...>/<id>.md`). Every other template-bearing skill either names the file with no path (`deep-researcher`) or re-states the template content inline as a workaround (`deep-researcher` rubric + skeleton), or has the structure embedded with no file at all (`slide-master` narrative-arc, the-pro briefing example).

**One-sentence summary:** Templates are tar-staged onto the VPS (`~/.hermes/agent-pack/templates/` at provision, `/var/lib/weuseai/bundle/<slug>/<version>/templates/` at boot) but there is no loader — the agent only uses a template if a skill's `SKILL.md` prose explicitly instructs it to read that file path, which today only `slide-master/template-deck-builder` does.

## The common pre-prompt insertion point

Standing per-persona instructions can live in exactly two places, both already shipped to the VPS and both already in Hermes' reading path:

- **`agent-packs/<slug>/SOUL.md`** — Hermes loads this as the persona system prompt (`setup-script.ts` writes it to `/home/weuseai/.hermes/SOUL.md`; `renderSoulMd` is the renderer). It already has the standing-instruction sections `# What I do`, `# How I behave`, `# Hard limits`, `# When my customer first messages me`. A persona-wide rule ("always pull template X for request class Y") belongs as a new section here — e.g. `# Templates I use`. This is the **strongest** insertion point: it is unconditionally in context for every message.
- **`agent-packs/<slug>/SKILL.md`** (the persona-shell) and **`skills/<id>/SKILL.md`** — every SKILL.md has a `## Yang dilakukan` / `## Kapan dipakai` section that Hermes surfaces when the skill matches. Per-skill template rules belong here (this is where `template-deck-builder` already correctly puts the path). Weaker than SOUL.md because it is only in context when the skill is triggered.

**One-sentence summary:** The concrete insertion point for "always use template X" standing instructions is a new `# Templates I use` section in `agent-packs/<slug>/SOUL.md` (always in context) for persona-wide rules, and the existing `## Yang dilakukan` block of each `skills/<id>/SKILL.md` (in context on skill trigger) for per-skill rules.

## The single biggest gap to close first

**There is no loader that connects on-disk template files to the agent — and no convention that every template-bearing skill must name its template's exact path.** The files ship; the wiring does not. Today the system silently relies on either (a) one well-written SKILL.md (`template-deck-builder`), or (b) duplicating template content inline into SKILL.md prose (deep-researcher's rubric/skeleton) — which defeats the founder's token-cost goal, because the "template" is then re-sent in the prompt every time instead of being a retrieved artifact.

**Recommended first move:** Establish a single retrieval convention and apply it everywhere — every skill with a `templates_used[]` entry must, in its `SKILL.md` "Yang dilakukan" step, name the **exact resolved path** of the template file (mirroring `template-deck-builder`), and a manifest-integrity test should assert (1) every `templates[]` `id` has a real file under `templates/`, and (2) every `templates_used[]` reference resolves. Optionally promote this further: have the bundle-pull / setup-script stage `templates/` into a predictable, documented path and add one line to each `SOUL.md` telling the persona that its templates live there. This is low-risk (docs + a path convention + a test, no Hermes patching) and it is the prerequisite for the whole template-library workstream — without it, adding more template files just adds more dead weight on disk.

A secondary but related gap: **slide-master's flagship "pitch deck" and deep-researcher's citation-format specs have no template file at all** — they exist only as inline SKILL.md prose. Those are the two highest-value new template files to author once the retrieval convention is in place.

---

## Appendix — quick reference

| Persona | Real templates (file-backed, manifest-registered) | Use-cases uncovered | Retrieval wired? | Notes |
|---|---|---|---|---|
| `the-pro` | 0 customer-output templates (2 demo fixtures, server-side only) | ~5 | n/a | Fixtures consumed by Edge Function, not agent context. 2 extra unregistered fixture files. |
| `slide-master` | 6 deck templates | ~6-8 | Yes — only for `template-deck-builder` | `narrative-arc` (default mode) structure is embedded in SKILL.md, no file. Pitch deck missing. |
| `deep-researcher` | 2 reference/playbook docs | ~5-6 | Partially — files named but no path | Rubric + skeleton also duplicated inline in SKILL.md. Citation-format + source-schema gaps. |

**Known integrity issues spotted (not in scope to fix):**
- `the-pro` has 2 fixture files (`mocks/calendar/empty.json`, `mocks/gmail/empty.json`) on disk but absent from `manifest.json` `templates[]`.
- `agent-packs/_manifest.schema.json` requires per-skill field `tier` (line 29 `required`), but all three manifests use `enabled_for_tiers` instead. The inline schema in `manifest-validator.ts` correctly makes both optional with a cross-field check — so the standalone `.json` schema file is **stale/stricter than the validator**. The `tests/manifest-validator.spec.ts` drift test claims to assert equality between the two; this divergence is worth confirming.
