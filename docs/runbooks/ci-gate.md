# Runbook — CI gate (tests + typecheck)

`.github/workflows/ci.yml` runs `npm run typecheck:all` + `npm test` on every
PR and every push to main. Shipped Mission 2 Phase 0.1 (2026-06-10), after the
audit found CI had no test gate at all and 5+ latent typecheck errors sat on
main (all fixed in the same PR).

## Founder action required (one time, ~1 minute)

Make the check REQUIRED so a red PR physically cannot merge:

1. GitHub → `Richienv/weuseai.agent` → Settings → Branches
2. Add (or edit) a branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Search and select **`test-and-typecheck`**
5. Save

Until this is done the workflow runs and reports, but a merge can still
bypass a red run.

## Notes

- The suite is ~18s and typecheck ~30s locally; the whole job should finish
  in ~3-4 min on GitHub runners (npm ci dominates).
- `e2e-smoke.yml` (post-deploy, real network) and `setup-script-harness.yml`
  (Docker) are unchanged — this gate is the fast, hermetic layer under them.
- If the job ever needs secrets, it doesn't have any on purpose: everything
  it runs is mock-based by design (local-first iteration directive,
  2026-05-14).
