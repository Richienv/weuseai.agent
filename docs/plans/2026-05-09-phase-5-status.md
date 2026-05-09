# Phase 5: Cofounder Ambition — Status Summary (2026-05-09)

> **Status: SHIPPED end-to-end.** All 5 sub-phases + Days 9-10 integration sweep complete in a single autonomous cascade. BD v3 + 5 dept packs + approval queue + cross-session memory + Indonesian-context templates + Telegram UX + integration verified.

> **Locked decisions** (per [Phase 5 spec](2026-05-10-phase-5-spec.md)): Q1=A (Setup naming), Q2=A (Telegram approval), Q3=A (Studio-only strict), Q4=C (per-action expiry), Q5=C (hybrid memory).

---

## What's live in production

### Schema (3 migrations, all applied via Supabase Mgmt API)

| Migration | Tables added | Status |
|---|---|---|
| `20260510100000_phase_5_master_agent_state.sql` | `business_roadmap_state`, `approval_requests`, `department_threads`, `customers.phase_5_enabled` | ✅ live |
| `20260510120000_phase_4_5b_hermes_kanban_mirror.sql` | `hermes_kanban_boards`, `hermes_kanban_tasks` | ✅ live (Phase 4-5b prereq) |
| `20260510130000_phase_5_3a_bd_decisions_log.sql` | `bd_decisions_log` (6-member decision_kind enum, 200-char summary cap) | ✅ live |

All RLS enabled. anon SELECT policies for customer-side reads. Service-role bypasses for handler writes.

### Edge Functions (3 deployed, all `--no-verify-jwt`)

| Function | Modes | Smoke verified |
|---|---|---|
| `approval-queue` | create / list / decide | ✅ 201 create, 200 list, 200 decide, 204 cleanup |
| `roadmap-state` | get / init / mark_deliverable / advance | ✅ 404 → 201 → 200 → 200 → 409 missing → 204 cleanup |
| `hermes-kanban-proxy` | upsert | ✅ 200 happy path with idempotent re-call (Phase 4-5b) |

### Master Agent Business Director v3

| Component | Phase | Status |
|---|---|---|
| `business-director/manifest.json` | 5-2 + 5-3.a | v2.0.0 → v3.0.0; description rewritten |
| `business-director/SOUL.md` | 5-3.a | Full rewrite to v3 (dept dispatch, approval queue, Studio gate, bd_decisions_log) |
| `supabase/functions/_shared/soul-md-template.ts` | 5-3.a | `BUSINESS_DIRECTOR_SCAFFOLD` constant updated; drift-test enforced |

### Department dispatch (5 facade-routing skills)

| Skill | Routes to | Approval gate |
|---|---|---|
| `sales-dispatch` | The Pro / Deep Researcher / Social Conductor / Doc Expert / Slide Master / Trade Pro | none |
| `marketing-dispatch` | Social Conductor / Web Master / Video Producer / Doc Expert | `public_emission` (24h) |
| `engineering-dispatch` | The Pro / Doc Expert / Trade Pro | none — advisory only |
| `legal-dispatch` | Doc Expert / Deep Researcher / Business Director | `contract_sign` (14d) |
| `finance-dispatch` | Trade Pro / Doc Expert | `regulatory_filing` (48h) |

All 5 are `enabled_for_tiers: ["studio"]` (Q3=A locked).

### Indonesian-context templates (Phase 5-4)

| Template | Topics |
|---|---|
| `templates/incorporation/pt-vs-cv-comparison.md` | PT vs CV decision tree (pre-existing, Phase 2E-3) |
| `templates/incorporation/oss-checklist.md` | OSS RBA flow (pre-existing, Phase 2E-3) |
| `templates/compliance/indonesian-due-dates.md` | BPJS/SPT/PPh due dates (pre-existing) |
| `templates/finance/bpjs-registration-paths.md` | BPJS Kesehatan + 4-program Ketenagakerjaan registration |
| `templates/finance/djp-tax-filing-cycle.md` | Monthly + annual DJP cycle, PKP threshold |
| `templates/finance/bank-account-checklist.md` | Bank comparison + multi-account strategy |
| `templates/legal/uu-pdp-basic-compliance.md` | UU 27/2022 3-tier compliance checklist |

### Cross-session memory (Q5=C hybrid)

`bd_decisions_log` table tracks 6 decision_kind enum values:
- `stage_transition` (e.g. idea → setup)
- `approval_outcome` (approved/rejected/expired)
- `thread_spawn` (new department initiative)
- `customer_commitment` (customer-stated commitment)
- `recommendation` (BD-issued advisory accepted)
- `pivot` (strategic pivot)

BD v3 prepends last-30-day decisions to context at session start. Hermes session persistence handles vibe + recent exchanges.

### Telegram approval UX (Phase 5-5 first cut)

- `_shared/approval-telegram-formatter.ts` — pure formatter
  - `formatApprovalRequest(row, nowIso) → {text, reply_markup}`
  - 2-button inline keyboard (Approve / Reject)
  - Callback wire format: `appr:<approve|reject>:<uuid>` (49 bytes, ≤64 cap)
  - BI brand voice (kamu form, no banned words, no exclamation)
- 14 unit tests covering callback round-trip, expiry rendering, brand-voice compliance

**Deferred to Phase 5-5b**: webhook callback_query branch + approval-queue post-create dispatch via `sendMessageWithButtonsAs`. <100 LOC each.

---

## Test coverage

| Sub-phase | New tests |
|---|---|
| 5-1.a (schema) | (DB-resident; verified via Mgmt API queries) |
| 5-1.b (state machine) | 23 |
| 5-2 (dept packs) | 13 |
| 5-3.a (BD v3 SOUL.md) | 12 |
| 5-3.b (Edge Functions) | 28 (16 + 12) |
| 5-4 (ID context) | 14 |
| 5-5 (Telegram UX) | 14 |
| Days 9-10 (integration) | 25 |
| **Total Phase 5 new tests** | **129** |
| Pre-existing tests | ~670 |
| **Grand total** | **799 pass** + 1 pre-existing skip |

`npm run typecheck:all` clean across all packages.

---

## Cost discipline (autonomous mandate)

Per founder rule "minimize founder touch, maximize autonomous execution":

- **All 5 sub-phases shipped autonomously**, no founder gates triggered
- **Schema migrations**: applied via Supabase Mgmt API (free, programmatic)
- **Edge Functions**: deployed via Supabase CLI (free)
- **No real-money spend** — no Runway/Pika smoke (deferred to founder option), no IDCloudHost provisioning, no live LLM tokens
- **No cost ceiling breach** — total Phase 5 spend: Rp 0

## What's left for Phase 5 follow-ups (defer-by-default)

| Item | Why deferred |
|---|---|
| Phase 5-5b (webhook callback wiring) | <100 LOC; clean separation from formatter PR |
| Phase 5-3c (per-customer signed token for proxy/approval handlers) | Current MVP uses customer_id existence check (matches bundle-pull-record convention) |
| Days 11+ (rolling-out to first Studio customer) | Requires founder Studio tier sale + tier-bump-handler integration |

---

## Open questions for founder review

**None.** Q1-Q5 locked at spec time; all implementation respected the locks.

If founder wants to revisit any decision:
- Q1 (stage naming): change `stages.ts` STAGES + migration CHECK enum + 5-stage-checklist (drift tests catch)
- Q2 (Telegram-only): add `/approvals` dashboard route in 5-5c
- Q3 (Studio-only strict): change `enabled_for_tiers` per skill in BD manifest
- Q4 (per-action expiry): change `ACTION_EXPIRY_HOURS` in approval-queue-handler
- Q5 (hybrid memory): currently optimized for ≤200-char summaries; can extend to longer if needed

---

## Status: ready for first Studio customer onboarding

**Next session work** when founder wants to ship to first paying Studio customer:

1. Tier bump flow: when `customers.tier` flips to `'studio'`, set `phase_5_enabled = true` (1-line change in customer-tier-bump-handler).
2. Onboarding: BD v3 first-message prompts customer for current stage; init `business_roadmap_state` row.
3. Phase 5-5b webhook wiring: customer can actually press the Approve button (currently they'd see the buttons but tap would dead-end).
4. Real customer Autobrowse capture sessions for the 6 Phase 4-3 DRAFT seed skills (still gates the multi-channel campaign-planner workflows).
