# Founder batch-review queue

**Maintained during the 2026-05-18+ founder hands-off window.** When the
founder returns, this single doc is the agenda for a focused review session.
Each entry: what + why-it-needs-founder + estimated founder-time + risk if
delayed further.

Last updated: 2026-05-18 by Sesi A (autonomous mode).

---

## A. Playbook PRs awaiting per-PR APPROVED / CHANGES

All are held unmerged until you give APPROVED per PR (Phase 1 Week 2 lesson
locked in). After APPROVED: I merge + run `publish:bundles` + verify the
bundle tarball contains the playbook SKILL.md.

| # | PR | What | Why founder | Est. read | Risk if delayed |
|---|----|------|-------------|-----------|-----------------|
| 1 | [#151](https://github.com/Richienv/weuseai.agent/pull/151) | **web-app-builder `site-launch` playbook** — 6 steps, 2 checkpoints, 0 hard-gates (build → preview → approve → deploy). | Content quality + persona-voice judgment | ~25 min | Low — lowest-risk Phase 2 playbook, no money/legal surface |
| 2 | [#152](https://github.com/Richienv/weuseai.agent/pull/152) | **project-conductor `project-orchestration` playbook** — 6 steps, 1 checkpoint, includes the monitoring loop-step pattern. | Content quality + the loop-step explanation | ~25 min | Low |
| 3 | [#153](https://github.com/Richienv/weuseai.agent/pull/153) | **business-agent `compliance-cycle` playbook** — 5 steps, 1 checkpoint, **1 hard-gate per filing** wired through `approval_requests` (per your Q2 confirmation). | First playbook composing flow-state + approval_requests — verify the composition reads cleanly to a customer | ~30 min | Medium — defines the composition pattern PT-registration will copy |
| 4 | [#154](https://github.com/Richienv/weuseai.agent/pull/154) | **project-conductor `pt-perorangan-registration` playbook** — 7 steps, 1 checkpoint + 6 hard-gates, headline deliverable. Multi-day flow (3–10+ day waits on AHU / Coretax / OSS / Xendit). Each hard-gate wired through `approval_requests` (`incorporate` action_kind, 14d expiry; step 6 uses `regulatory_filing`, 48h). | Highest-stakes playbook — every step needs your eye. Verify the action-plan specifics (KBLI gotcha, virtual-office advice, ~Rp 1.5–2.5jt service-assisted estimate) land right. | ~45 min | High — this is the headline; correctness here determines whether the workstream pays off |
| 5 | [#155](https://github.com/Richienv/weuseai.agent/pull/155) | **trade-pro `bitget-onboarding` playbook** — 8 steps, 1 checkpoint + 1 hard-gate (**inline-platform** — no `approval_requests`; Bitget's permissions endpoint is the durable ledger). The hard-gate proves that not every irreversible gate needs `approval_requests` when the platform itself is the durable yes/no — contrast with #153 and #154 which both do. | Verify the "Gerbang keras tanpa baris approval terpisah" `Cara kerja` explanation reads cleanly + the read-only scope guard reads as customer-protective | ~30 min | Medium — sets the precedent for inline-platform gates in future playbooks |
| 6 | [#156](https://github.com/Richienv/weuseai.agent/pull/156) | **social-conductor `voice-onboarding` playbook** — 6 steps, 1 checkpoint, 0 hard-gates. Customer rates 5 trial drafts in Langkah 5 before voice-locker activates the profile for downstream drafting. Content-only, no money/legal surface. | Content quality + brand-voice judgment on whether the activation/re-lock UX feels right | ~20 min | Low |
| 7 | [#157](https://github.com/Richienv/weuseai.agent/pull/157) | **social-conductor `campaign-execution` playbook** — 8 steps, 2 checkpoints + 0 hard-gates. Step 6 is a **recurring per-slot checkpoint** (loop-inside-a-step, mirrors project-orchestration's monitoring loop): cron fires H-2 reminders per scheduled slot, each parks `awaiting_customer` for that slot only, cursor doesn't move until every slot reaches `posted`/`skipped`. Steps 4/5/8 also use loop-inside-a-step (fan-out: stage slots, pre-draft per slot, daily engagement digest). | Verify the loop-inside-a-step explanation lands cleanly + the H-2 cron handoff is unambiguous | ~30 min | Medium — proves the recurring-checkpoint pattern; informs future scheduled-flow playbooks |
| 8 | [#158](https://github.com/Richienv/weuseai.agent/pull/158) | **project-conductor `weekly-recap-cycle` playbook** — 7 steps, 1 **conditional** checkpoint, 0 hard-gates. Langkah 6's gate reads `state_data.audience`: `checkpoint` (park `awaiting_customer`) when audience is non-self (team/client/board), `none` (auto-deliver) when audience is self. Introduces a new gate-syntax convention — Phase 4 audit may normalize, but the audit endorsed the inline `kalau X · kalau Y` notation. Style-paired with #152 (read project-orchestration's branch before drafting). | Verify the conditional-gate syntax reads cleanly + content quality | ~25 min | Low — content-only flow, but the new conditional convention sets future precedent |

**⚠ Version conflicts** (all post-APPROVED Sesi A handles via rebase; no founder action beyond APPROVED):
- **project-conductor (3-way):** PR #152 (project-orchestration, 2.1.0) + PR #154 (pt-perorangan-registration, 2.1.0) + PR #158 (weekly-recap-cycle, **2.2.0** — already bumped two steps to acknowledge the third bumper). Merge sequence + rebase chain is mine; final version after all three land = 2.3.0.
- **social-conductor (2-way):** PR #156 (voice-onboarding, 2.1.0) + PR #157 (campaign-execution, 2.1.0). Whichever merges second rebases to 2.2.0.
- **trade-pro:** PR #155 stands alone — no conflict.

**Phase 1 playbooks** (PR #143 deep-researcher market-research / #144 slide-master pitch-deck / #145 the-pro customer-reply) are merged + published. You'll batch-retest all 6 live in one session per the autonomous-mode plan.

---

## B. Phase 1 + 2 retest pass (live, in-product)

| Item | Why founder | Est. time | Risk if delayed |
|---|---|---|---|
| Click-through retest of **all 6 playbooks** (3 Phase 1 live + 3 Phase 2 after merge) using the script I sent in the prior ping (open weuseai-agent.vercel.app incognito → pay test invoice → pick persona → trigger playbook → walk 3+ steps → judge the gates). Reply per persona: WORKS / CHANGES: \<specifics\>. | Real-world UX judgment + brand-voice landed-right | ~60 min total for 6 personas | Medium — bugs caught here are cheap to fix; deferred = catch them later under more code |

---

## C. Strategic / credentials items (founder-only)

| Item | Why founder | Est. time | Risk if delayed |
|---|---|---|---|
| **`XENDIT_API_KEY` rotation to `xnd_production_*`** | Founder-only secret action. Monitored during the first real payment per Phase F cascade close-out notes. | ~5 min | Low — first real customer triggers it; defer is fine |
| **OAuth / paid signups** (none currently blocking — `OPENROUTER_PROVISIONING_KEY` already set, verified live) | — | — | — |

---

## D. Open audit follow-ups (Cowork autonomous can close most)

| Item | Owner | Est. founder-time |
|---|---|---|
| Phase 1 Week 1 audit: composable playbook-of-playbooks (per-persona playbooks as project-conductor steps) — RESOLVED by Q3: shipping flat in Phase 2, composition deferred to Phase 3 post-PMF. | Closed | 0 min |
| Worktree-isolation hiccup (agents reported `isolation: worktree` not taking effect during Phase 2 Wk2) — task #6, low priority, parking as post-cascade item if non-trivial. | Sesi A | ~5 min FYI |
| **Phase 3 Week 1 audit landed (`docs/audits/2026-05-18-phase-3-persona-playbook-audit.md`)** — 5 playbook candidates recommended: trade-pro `bitget-onboarding`, project-conductor `weekly-recap-cycle`, social-conductor `voice-onboarding`, business-agent `finance-cycle`, social-conductor `campaign-execution`. Audit confirms the Cowork-pre-resolved persona set is the right one. One soft dependency (`weekly-recap-cycle` ⇒ #152 merged) and one hard (`finance-cycle` ⇒ #153 merged) — the build order I'll follow sequences `finance-cycle` at position #4 so #153 has time to land. | FYI only — Cowork drives Phase 3 authoring during the hands-off window | ~10 min skim |

---

## D2. Phase 3 content authoring (Cowork autonomous, no founder review needed pre-batch)

Authored during the hands-off window using the proven Phase 2 Week 2 pattern. **4 of 5 landed** — they're in **section A** as PRs awaiting per-PR APPROVED. The 5th (`finance-cycle`) is hard-blocked on PR #153 (compliance-cycle) merging — it copies that PR's `approval_requests` composition.

| # | Persona | Playbook | Status |
|---|---|---|---|
| 1 | trade-pro | `bitget-onboarding` | ✅ PR #155 open (see section A row 5) |
| 2 | project-conductor | `weekly-recap-cycle` | ✅ PR #158 open (see section A row 8) |
| 3 | social-conductor | `voice-onboarding` | ✅ PR #156 open (see section A row 6) |
| 4 | business-agent | `finance-cycle` | ⏸ **BLOCKED on #153 merge** — will dispatch as soon as you APPROVE + I merge #153 |
| 5 | social-conductor | `campaign-execution` | ✅ PR #157 open (see section A row 7) |

---

## E. Recommended batch-session sequence (when you return)

**Total queue: 8 PRs open (4 Phase 2 + 4 Phase 3), ~3.5–4 hours founder time.**

Suggested order:
1. **15 min** — read this doc top-to-bottom, prioritize.
2. **~2.5 hours** — read all 8 playbook PRs in section A + leave APPROVED / CHANGES comments. Suggested reading order:
   - **Phase 2 first** (these are merged downstream):
     - #151 site-launch (lowest stakes warm-up, ~25 min)
     - #152 project-orchestration (~25 min)
     - #153 compliance-cycle (~30 min — composition pattern; APPROVING this unblocks Phase 3 finance-cycle authoring)
     - #154 pt-perorangan-registration (~45 min — headline, save your eye for this when fresh)
   - **Phase 3 second**:
     - #155 bitget-onboarding (~30 min — inline-platform gate precedent)
     - #156 voice-onboarding (~20 min — content-only)
     - #157 campaign-execution (~30 min — recurring-checkpoint precedent)
     - #158 weekly-recap-cycle (~25 min — conditional-gate precedent)
3. **~60 min** — live retest pass of the Phase 1 (already live) personas + any Phase 2/3 personas you've merged. (Use the per-persona script from the prior ping — open weuseai-agent.vercel.app incognito → pay test → pick persona → trigger playbook → walk 3+ steps → reply WORKS / CHANGES.)
4. **~5 min** — rotate `XENDIT_API_KEY` if ready for first real customer (optional).
5. CHANGES verdicts → I iterate the specific PR, re-ping.

After your batch session lands: I merge approved PRs in dependency order (Phase 2 first so the project-conductor 3-way + social-conductor 2-way rebases chain cleanly), run `publish:bundles` for each, verify each bundle tarball contains its SKILL.md, dispatch the `finance-cycle` agent as soon as #153 lands, and update this doc.
