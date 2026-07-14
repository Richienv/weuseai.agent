# Founder batch-review queue

**Operating mode:** High-trust auto-merge (locked in 2026-05-18). Sesi A
auto-merges routine playbook/feature PRs after internal self-review
(voice / banned-words / drift gate / format / typecheck / tests).
Founder time is reserved for hard escalation gates — money, credentials,
brand/voice strategic shifts, irreversible actions, strategic product
decisions, customer-facing positioning copy, cross-cutting refactors >5
files. See the consult of 2026-05-18 for the full list.

Weekly batch status, not per-PR. This doc is the running ledger.

---

## A. Currently in queue (awaiting founder eyes)

**Nothing.** All open work is either: auto-merged, in-flight under
autonomous mode, or held for one of the hard escalation gates above (none
currently outstanding).

Most recent batch landing: **9 playbook PRs (#151–#159) all merged
2026-05-18**. See section B.

---

## B. Recently merged (post auto-merge mode activation, 2026-05-18)

The 8-PR Phase 2/3 backlog + the finance-cycle PR + a test-drift fix all
landed under auto-merge mode in one batch session:

| PR | Persona | Playbook | Gate profile |
|----|---------|----------|--------------|
| [#151](https://github.com/Richienv/weuseai.agent/pull/151) | web-app-builder | `site-launch` | 2 checkpoints |
| [#152](https://github.com/Richienv/weuseai.agent/pull/152) | project-conductor | `project-orchestration` | 1 checkpoint (monitoring loop-step) |
| [#153](https://github.com/Richienv/weuseai.agent/pull/153) | business-agent | `compliance-cycle` | 1 checkpoint + 1 hard-gate (`approval_requests` `regulatory_filing` 48h) |
| [#154](https://github.com/Richienv/weuseai.agent/pull/154) | project-conductor | `pt-perorangan-registration` | 1 checkpoint + 6 hard-gates (`approval_requests` `incorporate` 14d) |
| [#155](https://github.com/Richienv/weuseai.agent/pull/155) | trade-pro | `bitget-onboarding` | 1 checkpoint + 1 inline-platform hard-gate (no `approval_requests`) |
| [#156](https://github.com/Richienv/weuseai.agent/pull/156) | social-conductor | `voice-onboarding` | 1 checkpoint |
| [#157](https://github.com/Richienv/weuseai.agent/pull/157) | social-conductor | `campaign-execution` | 2 checkpoints (1 recurring per slot, cron H-2) |
| [#158](https://github.com/Richienv/weuseai.agent/pull/158) | project-conductor | `weekly-recap-cycle` | 1 conditional checkpoint (per `state_data.audience`) |
| [#160](https://github.com/Richienv/weuseai.agent/pull/160) | business-agent | `finance-cycle` + BD-test-drift fix | 1 checkpoint + 1 hard-gate (`regulatory_filing` 48h) — inadvertently swept with the test-drift fix |

PR #159 (finance-cycle agent's original PR) closed-without-merge — its
commits were swept into #160 due to shared-working-tree contention with
the BD-test-drift PR; net result on main is identical. Documented in
the close comment.

**Bundles republished + verified:** all 8 new playbook `SKILL.md` files
present in their tarballs in Storage (web-app-builder 2.2.0,
business-agent 3.2.0, project-conductor 2.3.0, trade-pro 2.2.0,
social-conductor 2.2.0). business-agent 3.2.0 contains both
compliance-cycle + finance-cycle (the bundle published during the
working-tree contention already matched main's eventual state, so the
post-merge republish was a no-op).

**Full suite green:** 1758 tests, 1726 pass, 0 fail, 32 skipped. Drift
gate now covers 12 playbooks × 5 checks = 60 per-playbook assertions +
1 baseline.

---

## C. Forward-looking — Phase 4 and beyond (no founder action needed pre-batch)

With Phase 1, 2, and 3 playbooks now all live on main, the personas
collectively ship **12 playbooks across 8 of 10 persona packs**. The
2 packs without playbooks (`doc-expert`, `video-producer`) are
deliberately deferred — their use cases are single-shot–shaped.

Next-stage opportunities (Cowork autonomous can scope):
- **Phase 4 audit** (optional) — audit `doc-expert` + `video-producer`
  for any genuine multi-step flows that would justify their first
  playbook. If audit says no, the 12-playbook library is the final shape.
- **Engine improvements** — per the Phase 3 audit's flagged ambiguities:
  no TTL on parked runs (becomes a real concern when long-running
  pt-perorangan-registration flows accumulate stale `escalated` rows),
  conditional-gate syntax normalization, optional composable-playbook
  exploration once PMF signals warrant it.
- **Integration tests** — Phase F harness extension to walk every
  playbook through its first 3 steps against deployed `flow-state`. The
  drift gate locks static SKILL.md shape; an e2e harness would lock
  runtime behavior per-playbook.

---

## D. Hard escalation gates still pending (no founder action ready)

| Item | Why founder | Notes |
|---|---|---|
| `XENDIT_API_KEY` rotation to `xnd_production_*` | Founder-only secret action | Triggered by first real-money customer signup. Monitored per Phase F cascade close-out. |

---

## E. Operating-discipline checklist (Sesi A maintains)

- [x] Drift gate (#e874681) catches manifest / SKILL.md inconsistencies
- [x] Per-PR self-review block in merge commit (voice, banned, drift, validator, audit alignment)
- [x] Phase F harness assertions covering critical chain behavior
- [x] Cost monitoring with 70% alert (PR #138, live)
- [x] Bundles republished + tarball content verified after every persona-pack merge
- [x] Feature branches + PR + auto-merge — never commit directly to main
- [x] Weekly batch ping cadence, not per-PR

If regression rate increases or production incidents surface, dial back
to per-PR founder review — discipline is conditional on quality staying
high.
