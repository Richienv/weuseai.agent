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

**⚠ Version conflicts** (all post-APPROVED Sesi A handles via rebase; no founder action beyond APPROVED):
- **project-conductor**: PR #152 (project-orchestration) AND PR #154 (PT-registration) AND PR #TBD (weekly-recap-cycle, in flight) all bump from 2.0.0 → will land at 2.1.0 / 2.2.0 / 2.3.0 after merge sequencing.
- **social-conductor**: PR #156 (voice-onboarding) AND PR #157 (campaign-execution) both bump 2.0.0 → 2.1.0; whichever merges second rebases to 2.2.0.
- **trade-pro**: PR #155 stands alone — no conflict.

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

These will be authored during the hands-off window using the proven Phase 2 Week 2 pattern (parallel agents, one playbook each). When founder returns, they'll appear in **section A** as additional PRs awaiting per-PR APPROVED.

| # | Persona | Playbook | Step count | Gate profile | Dependency |
|---|---|---|---|---|---|
| 1 | trade-pro | `bitget-onboarding` | ~8 | 1 checkpoint, 1 hard-gate (no approval_requests — inline platform reject) | None |
| 2 | project-conductor | `weekly-recap-cycle` | 6–7 | 1 conditional checkpoint | Soft — wants #152 merged for consistency |
| 3 | social-conductor | `voice-onboarding` | ~6 | 1 checkpoint | None |
| 4 | business-agent | `finance-cycle` | ~8 | 1+ hard-gate per filing (`regulatory_filing`, 48h approval_requests) | **Hard — needs #153 merged first** (mirrors compliance-cycle pattern) |
| 5 | social-conductor | `campaign-execution` | ~8 | 2 checkpoints | None |

---

## E. Recommended batch-session sequence (when you return)

~3 hours total:
1. **20 min** — read this doc top-to-bottom, prioritize.
2. **2 hours** — read all 4 Phase 2 playbook PRs (#151/#152/#153/#PT-registration) + leave APPROVED / CHANGES comments.
3. **60 min** — live retest of all 6 personas (Phase 1 + Phase 2), reply per persona.
4. **~5 min** — rotate `XENDIT_API_KEY` if you're ready for the first real customer (optional).
5. Anything in CHANGES → Sesi A iterates that PR, re-pings.

After your batch session lands: I run `publish:bundles` for any newly-merged playbooks, verify the bundle tarballs, and clean up.
