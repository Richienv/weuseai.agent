# Mission 3 build spec — Agent Mesh + Self-Improving Library

**Date:** 2026-06-11
**Status:** Built + locally chain-verified. Live verification (cron, real
DeepSeek, one throwaway VPS) is the founder procedure in the runbooks —
this session has no infra credentials (verified empty env; stated plainly,
same posture as Missions 1-2).
**Guardrail input:** docs/specs/2026-06-11-upstream-capability-map.md —
built nothing the upstream (or our own repo) already provides.

---

## Phase 1 — Agent Mesh

### What the capability map changed

Hermes v0.13 natively ships `delegate_task` (agent tool, parallel batch
≤3, fresh child context) — so the mesh needed **no execution engine**. And
our own project-conductor pack already carried the orchestration prose
(task-decomposer → kanban-orchestrator → multi-agent-router →
project-orchestration 6-step playbook). What was actually missing — and
what shipped — is the **contract layer**:

1. **Real defects fixed:** the router's persona enum referenced two
   nonexistent slugs (`web-master`, `business-director`) — delegation to
   Web Creator or Business Director could never resolve a bundle. Its tier
   gate said "lookup customers.tier", which a VPS agent cannot do.
2. **Tier-gated delegation, runtime-true:** the gate is now
   `$WEUSEAI_AGENT_SLUGS` (the tier's persona list, written at provision
   from tier-personas.ts — the source of truth). Pinned by a drift test
   that derives expectations from `personasForTier()` itself.
3. **Delegation mechanics:** explicit `delegate_task` usage with the
   persona-context recipe (read the target persona's SOUL.md + templates
   from the installed bundle path; children start context-fresh), parallel
   ≤3, and a **graceful fallback**: if the tool is unavailable, the
   conductor does the sub-tasks itself sequentially, adopting each
   persona's SOUL — the customer outcome is the same shape either way.
4. **Assembly + failure honesty:** `_shared/agent-mesh.ts` defines (and
   tests pin the SKILL.md prose to) the deliverable format — one document,
   a section per persona output, "Siapa mengerjakan apa", and "Catatan
   jujur" for anything failed/timed-out/tier-blocked. A partial honest
   deliverable always beats a silent stall.
5. **Out-of-tier copy** (CUSTOMER-FACING — **awaiting founder review**,
   single source `meshOutOfTierCopy()` in agent-mesh.ts, embedded verbatim
   in the router SKILL.md):
   > Satu bagian rencana ini butuh persona [Nama Persona], yang belum
   > termasuk paket kamu. Bagian lain tetap aku kerjakan — hasilnya di
   > bawah. Kalau bagian itu penting, persona [Nama Persona] tersedia di
   > paket yang lebih lengkap.

### Tier placement (recommendation — pricing stays the founder's)

The mesh conductor (project-conductor) already exists ONLY in the
done-for-you (8-set) and library-full (10-set) tiers, so the gate is
inherent to the locked catalog — no new flag needed. Recommended
positioning: **library-full's headline feature** ("semua 10 persona kerja
sebagai satu tim") since only there can every decomposition run un-blocked;
on done-for-you the mesh runs minus Web Creator/Business Director, with
the honest tier note — itself a natural upgrade surface.

Pack version: project-conductor 2.5.0 → **2.6.0**.

## Phase 2 — Self-Improving Library

```
signals (already captured)                    founder (only authority)
 template_no_match_log ──┐                          ▲
 customer_flow_state     ├─► library-signals ──► library-refine (weekly cron)
   status='aborted' ─────┘    (aggregate only:      │  DeepSeek drafts in
                              ids+counts+labels,     │  curated format
                              NEVER state_data /     ▼
                              message bodies)    quality gate (SAME bar as
                                                 Persona Genesis: structure,
                                                 kamu-register, banned words,
                                                 substance floors)
                                                    │ fail → log + DROP
                                                    ▼
                                            library_proposals (PENDING)
                                                    │ admin tab: evidence +
                                                    │ draft + 1-click decide
                                          ┌─────────┴──────────┐
                                       Approve              Reject
                                          │                    │
                              patch current bundle tarball   mark only
                              (tar-gz module) → bump patch
                              version → upload (immutable) →
                              bundle-version-bump-broadcast
                              → latest-policy VPSes restart + pull
```

Pieces: `library-signals.ts` (aggregation), `library-draft-validator.ts`
(gate, reuses `brandVoiceViolations` exported from the Genesis validator),
`library-refine-handler.ts` (pipeline; ≤5 drafts/run ≈ ≤$0.05 LLM spend),
`library-bundle-patch.ts` (patched manifest must pass the SAME
`validateManifest` as the curated library), `library-proposal-apply-handler.ts`
(approve→ship / reject), Edge entries `library-refine` (weekly cron) +
`library-proposal-apply` (service-role), Vercel admin endpoints (cookie-
authed list + decide proxy — no client ever holds a service key),
`admin/proposals.html` tab, migration `20260611000000` (race-proof
open-proposal dedup via partial unique index).

**Privacy contract (pinned by test):** aggregate rows carry only persona/
skill/playbook ids, counts, distinct-customer counts, and the ≤500-char
deliverable labels the agent already logs. `customer_flow_state.state_data`
is never selected; no conversation bodies exist anywhere in the loop.

**Repo-drift note (honest):** approved improvements live in Storage bundle
versions; the git `agent-packs/` tree does not auto-update. Recommended
follow-up: a monthly founder chore (or CI job) backporting `customer-grown`
manifest entries to git. Until then git remains the curated baseline and
Storage the live truth — same relationship the bundle pipeline already had.

## Budget

No new recurring infrastructure (one weekly cron on existing pg_cron; one
admin tab on existing Vercel). Refine pipeline LLM: DeepSeek only,
≤5 drafts/run ≈ $0.01-0.05/week.

## Verification state

- Local: 40 new tests incl. two Phase F chains (mesh full run; library
  signal→approve→shipped-version loop with dedup closure). Suite
  **2274 pass / 0 fail**, typecheck clean.
- Live (founder, ~30 min, < $2): runbooks
  `docs/runbooks/self-improving-library.md` (deploy + cron settings) and
  the demo script below on one throwaway library-full VPS, then destroy.

## Demo script — Agent Mesh (sales video)

Throwaway **library-full** customer, bot paired, `/start` done.

| # | Founder sends (Telegram) | Expected agent behavior |
|---|---|---|
| 1 | `siapin launch produk aku — kopi susu botolan, target bulan depan` | Conductor opens the project-orchestration playbook: asks 1 compact intake question (timeline/team/constraints) if needed. |
| 2 | `tim cuma aku, budget 20 juta, fokus Instagram dan TikTok` | Decomposes into 6-12 tasks with suggested persona owners (Deep Researcher riset kompetitor, Doc Expert press release, Slide Master deck, Social Conductor kalender konten, Web Creator landing page), shows the plan + critical path, then PARKS: "Aku lanjut spawn task dengan plan dan owner ini, atau kamu mau adjust dulu?" — the money line for the video: *spawn = approved by you*. |
| 3 | `gas, lanjut` | Dispatches via `delegate_task` (≤3 parallel) — each child runs under its persona's SOUL. Status updates per task land as the conductor reports In Progress → Review. |
| 4 | `udah sampai mana?` | One monitoring cycle: tasks done/in-progress/blocked, in project framing. |
| 5 | *(when tasks complete)* `tutup project-nya, kasih hasilnya` | **The deliverable**: one document — sections per persona output, "Siapa mengerjakan apa" listing each persona by display name, and (if anything failed) "Catatan jujur" with a retry offer. |
| 6 | *(variant for the tier-gate beat — run the same flow on a done-for-you box and include a landing-page task)* | The Web Creator step is NOT spawned; the conductor completes the rest and states the flagged tier line verbatim — honest, calm, and a natural upsell beat for the video. |

## Copy lines awaiting founder review

1. `meshOutOfTierCopy()` (agent-mesh.ts + router SKILL.md) — above.
2. `admin/proposals.html` UI strings (founder-facing, not customer-facing —
   lower stakes, listed for completeness).
