# Phase 2 persona-playbook prep notes — 2026-05-18

**Status:** DRAFT — prep only. Phase 1 Week 2 shipped 3 playbooks
(deep-researcher `market-research`, slide-master `pitch-deck`, the-pro
`customer-reply`); they are awaiting per-PR founder review (#143/#144/#145).
Phase 2 persona selection + scope is **not yet greenlit** — this doc parks
the groundwork so Week 3 can start fast once the founder confirms.

Do NOT begin authoring Phase 2 playbooks without explicit founder direction
on which personas and which playbooks.

---

## 1. Candidate personas for Phase 2

Cowork's working suggestion (2026-05-18), pending founder confirmation:

| Persona (slug) | Display name | Candidate playbook | Why it fits Phase 2 |
|---|---|---|---|
| `project-conductor` | Project Conductor | **PT Perorangan registration** — the 7-step AHU → Coretax NPWP → NIB on OSS → domicile → bank → Xendit activation flow | The motivating example for the whole playbook workstream. Long, strictly ordered, every step has an external portal + a real hard-gate (money / legal identity). Exercises the `hard-gate` escalation tier the most heavily. |
| `business-agent` | Business Director | Business-setup or ops playbook (scope TBD) | Pairs naturally with Project Conductor — post-registration operations. |
| `web-app-builder` | Web Creator | Site/app build playbook — brief → scaffold → iterate → ship | A build pipeline maps cleanly to a checkpoint-gated playbook (approve scaffold before full build). |

These three are a *suggestion*, not a decision. The founder picks the final
Phase 2 set. Project Conductor's PT-registration playbook is the strongest
single candidate — it is the use case that originally justified the
playbook concept.

## 2. What Phase 1 Week 2 already de-risked for Phase 2

- **Format is proven.** `skill_kind: "playbook"` manifest discriminator +
  `## Langkah-langkah` (6 fields/step) SKILL.md. Three playbooks already
  ride it; the manifest validator accepts it (PR #142).
- **State engine is live.** `customer_flow_state` table + `flow-state` Edge
  Function (PR #141, deployed, `verify_jwt=false`). Any Phase 2 playbook
  reuses it unchanged — `start` / `get` / `advance` / `complete` / `abort`,
  with `awaiting_customer` (checkpoint) and `escalated` (hard gate) parking.
- **VPS wiring is done.** `WEUSEAI_FLOW_STATE_URL` is in the setup-script
  env (PR #146). Newly provisioned VPSes already carry it.
- **Validation harness exists.** `tests/e2e/playbook-flow-state.e2e.spec.ts`
  drives the deployed engine through a full lifecycle — extend it per new
  playbook rather than rebuilding.

So a Phase 2 playbook is *content authoring + a manifest entry* — no new
engine work, unless the playbook needs a capability the engine lacks (see §3).

## 3. Open follow-ups from the Phase 1 Week 1 audit

Reviewed `docs/audits/2026-05-17-persona-template-and-playbook-inventory.md`
for items the Week 2 work did NOT close:

- **RESOLVED — Hermes pause/resume ambiguity.** The audit flagged
  uncertainty over whether Hermes v0.13.0 can natively pause/resume a skill
  mid-execution. The 2026-05-18 consult resolved it: use the
  state-machine-between-invocations pattern instead. Built + shipped (PR
  #141). No native pause/resume dependency. Closed.

- **OPEN — `_manifest.schema.json` schema drift.** The on-disk
  `agent-packs/_manifest.schema.json` still lists `tier` as a `required`
  field on each skill, but every real manifest uses `enabled_for_tiers`
  (the `tier` field is deprecated, Phase 2E-2). The runtime source of truth,
  `supabase/functions/_shared/manifest-validator.ts`, already treats both as
  optional with a cross-field "at least one present" invariant. The
  standalone JSON schema should be reconciled to match — make neither
  `tier` nor `enabled_for_tiers` strictly `required`, documenting the
  invariant in a description. Low-risk, test-only-adjacent. Carry into a
  Phase 2 housekeeping PR.

- **OPEN — the-pro manifest/disk template drift.**
  `agent-packs/the-pro/templates/mocks/calendar/empty.json` and
  `gmail/empty.json` exist on disk but are absent from the the-pro
  `manifest.json` `templates[]`. Either register them or remove them.
  Trivial; bundle with the schema-drift reconciliation above.

- **OPEN (design question, founder) — playbooks as project-conductor
  steps.** The audit asked whether per-persona playbooks should themselves
  be machine-callable as steps inside a higher-level project-conductor
  orchestration (a playbook-of-playbooks). This is a founder design
  decision, not an engineering gap. Surface it when Phase 2 scope is set —
  it materially affects whether the PT-registration playbook is one flat
  playbook or a project-conductor composition of sub-playbooks.

## 4. Suggested Week 3 sequencing (once greenlit)

1. Founder confirms the Phase 2 persona set + per-playbook scope.
2. Resolve the §3 schema-drift housekeeping in one small PR first (keeps
   the manifest layer clean before adding more entries).
3. Author the Phase 2 playbooks (parallel agents, one persona each — same
   model as Week 2).
4. Extend `tests/e2e/playbook-flow-state.e2e.spec.ts` with a per-playbook
   walk if any new playbook exercises an engine path not already covered
   (e.g. a much longer step count, or a new `set_status` usage).
