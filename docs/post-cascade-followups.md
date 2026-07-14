# Post-cascade follow-ups — Phase F (8-min → 15-min flow)

Items deliberately deferred during the Phase F cascade (closed 2026-05-16).
**None of these are started.** Do NOT pick one up without explicit founder
direction — they are parked, ordered roughly by founder-impact.

1. **`tearDownCustomer` should set `vps_instances.status='stopped'` on every path.**
   Currently a row whose VPS failed provisioning stays `status='failed'` after
   teardown even though the Vultr VM is actually deleted. Cosmetic, but it
   misleads `scripts/orphan-vps-cleanup.mjs`. Fix in
   `services/provisioning/src/customer-flow.ts` (~`updateVPSInstance(... 'stopped')`),
   add a unit test for teardown of a `failed`-status row, redeploy provisioning.

2. **Orphan-VPS-cleanup v2 — guarded delete.** `scripts/orphan-vps-cleanup.mjs`
   is alert-only v1 (lists orphans, never deletes). A v2 could delete with a
   confirmation guard. Also: it currently scans Vultr only — DigitalOcean SGP1
   failover instances are not scanned.

3. **Pre-commit hook / CI check for `._*` AppleDouble files.** The repo lives on
   an exFAT external SSD that regenerates macOS `._*` sidecars on every write;
   they broke the Fly Docker build context 3× during the cascade. A hook that
   rejects `._*` in commits (or a `dot_clean` pre-build step) would end it.

4. **Setup-script speed optimization.** Stage 5 (setup-script) is the long pole
   (~5.5-6.5 min). Parallelize apt + curl, pre-bake an AMI/snapshot, or run a
   warm pool of pre-provisioned VPSes. **Only pursue if the founder explicitly
   asks for a faster target** — reliability is proven; current pace is within
   the 15-min budget and was explicitly accepted.

5. **VPN bypass rules in the founder's environment.** A VPN (Shadowrocket, then
   another brand) flapped 3+ times during the cascade — fake-IP DNS to
   `198.18.x.x` broke TLS to Supabase / Xendit / GitHub mid-run. Add permanent
   DIRECT rules for `*.supabase.co`, `*.xendit.co`, `api.telegram.org`,
   `*.fly.dev`, `api.vultr.com`, `github.com`.

6. **Phase F as a scheduled regression test.** Wire `smoke:chain:deployed` as a
   periodic (e.g. daily) run on Xendit test mode, alerting if any stage fails.
   Catches provisioning/onboarding regressions before a real customer does.

7. **"Empty response after tool calls" — upstream Hermes behaviour.** The agent
   loop in `run_agent.py` occasionally ends a tool turn with no final text and
   falls back to prior content. We suppressed the user-facing status leak via
   config; the underlying behaviour is upstream NousResearch/hermes-agent —
   **documented, do NOT patch** (locked: we don't fork/patch Hermes core).

8. **First real customer — name + prod-mode monitoring.** The first real paid
   customer doubles as: (a) prod-mode Xendit signing + `invoice.paid`
   body-shape fidelity validation (deferred gate), and (b) confirmation that
   `display_name` flows from the onboarding form into the proactive greeting
   (CASE A — expected to work; the harness can't cover it because it skips the
   onboarding form). Monitor that first payment closely.

---

## Convention notes (not deferred work — reference for future authors)

**Playbook file layout (Phase 1 Week 2, 2026-05-18).** A persona *playbook*
ships as `agent-packs/<persona>/skills/<playbook-id>/SKILL.md` — the same
directory form every single-shot skill uses (`skills/<id>/SKILL.md`), NOT a
flat `<id>.flow.md` file. The directory form is the only layout both the
bundle-publish pipeline (`scripts/publish-persona-bundles.mjs` copies the pack
tree wholesale) and Hermes skill discovery recognise. The playbook is
distinguished from a single-shot skill purely by its manifest entry's
`skill_kind: "playbook"` discriminator and the `## Langkah-langkah` section in
its SKILL.md — no new file type, no new distribution mechanism. The drift gate
at `tests/playbook-skill-md-drift.spec.ts` (Phase 2 Wk3) catches manifest /
SKILL.md drift automatically on every new playbook PR. Future template
/ playbook authors: follow the directory form; the `.flow.md` shorthand seen in
some planning notes is not a real on-disk convention.

**Agent worktree isolation — operational gotcha (Phase 3, 2026-05-18).** The
Claude `Agent` tool's `isolation: "worktree"` mode requires the *dispatching*
shell's CWD to be inside a git repo at dispatch time. If the parent shell's
CWD is one level above the repo (a common state when a session opens at a
project root that contains the repo as a sibling directory), the Agent tool
errors with "Cannot create agent worktree: not in a git repository" before
the agent ever runs. The workaround that worked all session: `cd` into the
repo immediately before each `Agent` call, OR omit `isolation: "worktree"`
and have the agent prompt instruct the agent to create its own branch off
`main` inside the shared main working tree (the same pattern the Phase 2 Wk2
agents fell back to when their isolation hiccupped). Either way the resulting
PR is clean. No code fix needed — this is a dispatch-time operational rule.
