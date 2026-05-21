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
| 4 | TBD (agent in flight) | **project-conductor `pt-perorangan-registration` playbook** — ~7 steps, 5–6 hard-gates, headline deliverable. Real money, multi-day flow. | Highest-stakes playbook — every step needs your eye | ~45 min | High — this is the headline; correctness here determines whether the workstream pays off |

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

---

## E. Recommended batch-session sequence (when you return)

~3 hours total:
1. **20 min** — read this doc top-to-bottom, prioritize.
2. **2 hours** — read all 4 Phase 2 playbook PRs (#151/#152/#153/#PT-registration) + leave APPROVED / CHANGES comments.
3. **60 min** — live retest of all 6 personas (Phase 1 + Phase 2), reply per persona.
4. **~5 min** — rotate `XENDIT_API_KEY` if you're ready for the first real customer (optional).
5. Anything in CHANGES → Sesi A iterates that PR, re-pings.

After your batch session lands: I run `publish:bundles` for any newly-merged playbooks, verify the bundle tarballs, and clean up.
