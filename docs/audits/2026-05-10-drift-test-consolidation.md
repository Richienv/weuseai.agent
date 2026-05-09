# Drift-Test Consolidation Audit (2026-05-10)

> **Verdict:** safe to remove 3 pure-duplicate tests from `phase-5-integration.spec.ts`. Per-sub-phase tests fully cover the removed assertions. Test count drops from 838 → 836; coverage unchanged.

---

## Layering policy (2-tier drift defense)

After Phase 5 cascade shipped 8 PRs in a single session, drift tests accumulated across two tiers. Going forward, both tiers stay — but each owns a distinct concern:

### Tier 1 — Per-sub-phase tests
**Pattern:** `tests/phase-<N>-<sub>-<topic>.spec.ts`

**Owns:** "this sub-phase's deliverables exist + match spec at the time of merge."

**Examples:**
- `phase-5-2-dept-packs.spec.ts` — 5 dispatch SKILL.md files, manifest entries, Studio-tier
- `phase-5-3a-bd-v3-soul.spec.ts` — BD v3 SOUL.md content, manifest 3.0.0, bd_decisions_log migration shape
- `phase-5-4-id-context-templates.spec.ts` — 4 templates exist + registered + content markers
- `phase-4-3-seed-skills.spec.ts` — 6 DRAFT seed-skill SKILL.md scaffolding

**Lifecycle:** stays alive even after the sub-phase is complete. Catches "someone deleted the SKILL.md" or "someone bumped manifest by accident."

### Tier 2 — Cross-cutting integration tests
**Pattern:** `tests/phase-<N>-integration.spec.ts`

**Owns:** "across-file coherence — schema enum matches handler enum matches SOUL.md prose matches template references."

**Examples (Phase 5 integration after dedup):**
- `services/business-roadmap STAGES matches schema CHECK enum`
- `approval-queue-handler ACTION_KINDS matches schema CHECK enum`
- `approval-queue-handler ACTION_EXPIRY_HOURS matches Q4=C lock` (14d/14d/24h/48h)
- `approval-telegram-formatter handles all 4 action_kinds`
- `5-stage-checklist references all 20 deliverable ids from stages.ts`
- `BD v3 SOUL.md references all 5 dept dispatch skills by exact id` (cross-file: SOUL ↔ manifest)
- `department-task-spawner is purged from all Phase 5+ references` (cross-file)
- `Phase 5 migration files use the locked timestamp range (20260510*)`

**Lifecycle:** stays alive forever. Catches "someone renamed an enum but only updated half the surface."

---

## What was redundant (now removed)

3 tests in `tests/phase-5-integration.spec.ts` were pure duplicates:

| Removed test | Per-sub-phase home | Verification |
|---|---|---|
| `business-director manifest is at version 3.0.0 (BD v3)` | `phase-5-3a-bd-v3-soul.spec.ts:96` (`business-director manifest version bumped to 3.0.0`) | Both load same JSON, assert same string. |
| `BD v3 manifest declares all 5 dept dispatch skills` | `phase-5-2-dept-packs.spec.ts:67` (`every dept-dispatch entry is Studio-tier-only`) | Per-sub-phase version is stricter (also asserts Studio-tier). |
| `BD v3 manifest declares all Phase 5-4 templates` | `phase-5-4-id-context-templates.spec.ts:75` (`all 4 Phase 5-4 templates registered`) | Per-sub-phase version is more granular (with attribution check). |

**Pattern:** integration tests had become a "second copy" of per-sub-phase manifest assertions without adding cross-cutting value. Removing keeps integration spec tight on what it uniquely covers.

---

## What was NOT removed (despite looking similar)

The following stayed in `phase-5-integration.spec.ts` because they assert CROSS-FILE consistency that no single per-sub-phase test can see:

| Kept test | Why kept |
|---|---|
| `BD v3 SOUL.md references all 5 dept dispatch skills by exact id` | SOUL.md (markdown) ↔ manifest (JSON) consistency. Per-sub-phase 5-3a checks SOUL alone, doesn't bridge to manifest. |
| `BD v3 SOUL.md references all 4 action_kinds by exact name` | SOUL.md ↔ approval-queue-handler.ts enum. Per-sub-phase 5-3a checks SOUL alone. |
| `BD v3 SOUL.md references the locked Q4=C expiry numbers` | Numeric lock (14d/24h/48h) appearing in SOUL prose. Unique to integration. |
| `services/business-roadmap STAGES matches schema CHECK enum` | TypeScript enum ↔ SQL schema. Cross-language consistency. |
| `5-stage-checklist references all 20 deliverable ids from stages.ts` | Markdown template ↔ TypeScript module. Per-sub-phase 5-2 doesn't check this bridge. |
| `department-task-spawner is purged from all Phase 5+ references` | Cross-file purge check across 3 files. |

---

## Test count impact

```
Before consolidation:  838 pass + 1 pre-existing skip = 839 total
After consolidation:   836 pass + 1 pre-existing skip = 837 total
                       (3 pure-duplicate tests removed)
```

**Net coverage:** zero change. Every assertion previously made by the removed tests is also made by a per-sub-phase test that runs in the same suite invocation.

---

## Future drift-test discipline

When adding new sub-phase tests:

1. **Default to per-sub-phase file** for "this sub-phase's deliverables exist."
2. **Add to integration spec** ONLY when asserting cross-file consistency the per-sub-phase test can't reach.
3. If both files need the same assertion, prefer integration spec (because it travels with the cross-cutting policy).
4. Pure manifest existence checks → per-sub-phase. Manifest ↔ SOUL.md ↔ enum bridges → integration.

When in doubt, add the test in both places. The test suite runs in ~1s; redundancy is cheap. Real cost is reviewer cognitive load — and that cost is also small if the duplication is intentional + documented (header note in integration spec explains the layering).

---

## No action required from this audit

This is the audit + the dedupe in one PR. No follow-ups planned.

If new Phase 5 sub-phase tests get added (e.g. Phase 5-3c test extensions for the new HMAC paths), they should follow the layering policy above.
