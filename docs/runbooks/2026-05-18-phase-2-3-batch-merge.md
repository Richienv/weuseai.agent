# Phase 2 + Phase 3 batch-merge runbook (2026-05-18)

**For:** Sesi A, after the founder returns from the 2026-05-18 hands-off
window and APPROVES the playbook PRs in `docs/founder-batch-review-queue.md`.
**Prerequisites:** founder has left `APPROVED` / `CHANGES: …` comments on
each of #151 / #152 / #153 / #154 / #155 / #156 / #157 / #158.

This runbook turns those verdicts into landed code, published bundles, and
unblocks `finance-cycle` authoring. Roughly 30–45 min if every PR is
APPROVED clean; longer if any need CHANGES iteration.

---

## 0. Setup

```bash
cd "/Volumes/Extreme SSD/weuseai.agent/velorah"
git checkout main
git pull --quiet origin main
gh pr list --state open --json number,title,headRefName --limit 20
```

Confirm the 8 expected PRs are still open. Pull each one's APPROVED /
CHANGES verdict (`gh pr view <N> --comments`).

---

## 1. Iterate CHANGES PRs first (if any)

For each PR with a `CHANGES: …` comment: read the change request, iterate
the SKILL.md (or manifest), push to the same branch, re-ping the founder
on that specific PR. Hold the rest of the merge sequence until the
re-verdict comes back.

**Do not merge any PR until all 8 are APPROVED clean.** This keeps the
3-way / 2-way rebase chains predictable.

---

## 2. Merge order (locks dependencies cleanly)

The order matters for: (a) the project-conductor 3-way version rebase
chain, (b) the social-conductor 2-way chain, (c) unblocking finance-cycle
authoring.

### 2a. Phase 2 first

The order within Phase 2 doesn't materially matter, but suggested:

```bash
# Independent — merge any order:
gh pr merge 151 --squash --delete-branch    # site-launch
gh pr merge 153 --squash --delete-branch    # compliance-cycle (UNBLOCKS finance-cycle)
```

Then the project-conductor pair (3-way conflict starts here):

```bash
# Merge first project-conductor PR straight:
gh pr merge 152 --squash --delete-branch    # project-orchestration → main now at 2.1.0

# Second PR will need rebase (its branch still bumps from 2.0.0):
git fetch origin
gh pr checkout 154   # PT-registration
# Rebase onto main, resolve the manifest.json version conflict to 2.2.0,
# and merge the skills[] array additions (both new entries should coexist).
git rebase origin/main
#   Conflict in agent-packs/project-conductor/manifest.json:
#     "version": keep "2.2.0" (was "2.1.0" in #154, bump because #152 took 2.1.0)
#     "skills": include BOTH project-orchestration (from #152, now on main)
#               AND pt-perorangan-registration (from this branch)
git add agent-packs/project-conductor/manifest.json
git rebase --continue
git push --force-with-lease
gh pr merge 154 --squash --delete-branch   # main now at 2.2.0
```

### 2b. Phase 3 next

Independent (no manifest collision with each other):

```bash
gh pr merge 155 --squash --delete-branch    # bitget-onboarding (trade-pro standalone)
```

social-conductor 2-way:

```bash
gh pr merge 156 --squash --delete-branch    # voice-onboarding → social-conductor 2.1.0

# Rebase #157 onto main; bump to 2.2.0 + merge skills[]:
gh pr checkout 157
git rebase origin/main
#   Conflict in agent-packs/social-conductor/manifest.json:
#     "version": bump to "2.2.0"
#     "skills": include BOTH voice-onboarding (from main) AND campaign-execution
git add agent-packs/social-conductor/manifest.json
git rebase --continue
git push --force-with-lease
gh pr merge 157 --squash --delete-branch
```

project-conductor 3rd bumper (weekly-recap-cycle, already at 2.2.0 in its
branch — so it needs to rebase to 2.3.0):

```bash
gh pr checkout 158
git rebase origin/main
#   Conflict in agent-packs/project-conductor/manifest.json:
#     "version": bump to "2.3.0"
#     "skills": include project-orchestration + pt-perorangan-registration
#               (both on main) + weekly-recap-cycle (this branch)
git add agent-packs/project-conductor/manifest.json
git rebase --continue
git push --force-with-lease
gh pr merge 158 --squash --delete-branch
```

After all 8 merges, `main` should hold:
- `the-pro 1.2.0` (unchanged from Phase 1)
- `deep-researcher 2.1.0` (unchanged)
- `slide-master 2.1.0` (unchanged)
- `web-app-builder 2.2.0` (after #151)
- `business-agent 3.1.0` (after #153)
- `project-conductor 2.3.0` (after #152 + #154 + #158)
- `trade-pro 2.2.0` (after #155)
- `social-conductor 2.2.0` (after #156 + #157)

---

## 3. Publish bundles + verify

```bash
export SUPABASE_URL="$(grep -oE '^SUPABASE_URL=.+' .env.local | cut -d= -f2-)"
export SUPABASE_SERVICE_ROLE_KEY="$(grep -oE '^SUPABASE_SERVICE_ROLE_KEY=.+' .env.local | cut -d= -f2-)"
npm run publish:bundles
# Expect: 5 published (web-app-builder, business-agent, project-conductor,
# trade-pro, social-conductor — the 5 personas whose versions changed),
# 5 unchanged (the-pro, deep-researcher, slide-master, doc-expert,
# video-producer).
```

If `the-pro: fetch failed` or similar transient errors, retry — the
publish is idempotent (SHA-compared).

### Verify each new bundle tarball contains its playbook SKILL.md

```bash
node -e '
const fs=require("fs");
const env=fs.readFileSync(".env.local","utf8");
const get=k=>env.match(new RegExp("^"+k+"=(.+)$","m"))[1].trim();
const url=get("SUPABASE_URL"), sk=get("SUPABASE_SERVICE_ROLE_KEY");
const targets=[
  ["web-app-builder/2.2.0","site-launch"],
  ["project-conductor/2.3.0","project-orchestration"],
  ["project-conductor/2.3.0","pt-perorangan-registration"],
  ["project-conductor/2.3.0","weekly-recap-cycle"],
  ["business-agent/3.1.0","compliance-cycle"],
  ["trade-pro/2.2.0","bitget-onboarding"],
  ["social-conductor/2.2.0","voice-onboarding"],
  ["social-conductor/2.2.0","campaign-execution"],
];
(async()=>{
  for(const [path,pb] of targets){
    const slug=path.split("/")[0];
    const r=await fetch(`${url}/storage/v1/object/workflow-templates/bundles/${path}.tar.gz`,
      {headers:{authorization:`Bearer ${sk}`}});
    if(!r.ok){console.log(`${slug}/${pb}: HTTP ${r.status} DOWNLOAD FAIL`);continue;}
    const tmp=`/tmp/${slug}-${pb}.tar.gz`;
    fs.writeFileSync(tmp,Buffer.from(await r.arrayBuffer()));
    const { execSync }=require("node:child_process");
    const entries=execSync(`tar -tzf ${tmp}`,{encoding:"utf8"});
    const ok=entries.includes(`skills/${pb}/SKILL.md`);
    console.log(`${slug}/${pb}: ${ok?"OK":"MISSING"}`);
  }
})();
'
```

All 8 lines should print `OK`. If any prints `MISSING`, the publish picked
up the wrong commit — re-pull main, re-run `npm run publish:bundles`.

---

## 4. Dispatch finance-cycle agent (unblocked after #153 lands)

```bash
# Sesi A — dispatch via Agent tool with the brief in
# /Volumes/Extreme SSD/weuseai.agent/velorah/.claude/notes/finance-cycle-agent-brief.md
# OR re-derive from docs/audits/2026-05-18-phase-3-persona-playbook-audit.md
# §business-agent finance-cycle entry, mirroring the compliance-cycle pattern
# (`approval_requests` action_kind: `regulatory_filing`, 48h expiry, one per
# filing).
```

Agent should be told: read `agent-packs/business-agent/skills/compliance-cycle/SKILL.md`
from main (now landed) as the pattern reference. Bump business-agent
version 3.1.0 → 3.2.0.

---

## 5. Verify drift gate + full suite

```bash
npx tsx --test tests/playbook-skill-md-drift.spec.ts
# Expect: 1 baseline + 8 playbooks × 5 checks = 41 tests passing
# (after #158 lands and finance-cycle hasn't yet — 41 tests; after
# finance-cycle: 46 tests)

npm test
# Expect: ~1710 tests, 0 failures.
```

---

## 6. Update the queue doc

After all merges + finance-cycle PR opens, update
`docs/founder-batch-review-queue.md`:
- Move merged PRs from section A to a new "Merged + published" section.
- Add the finance-cycle PR to section A.
- Update the recommended-batch-session sequence in section E to reflect
  what's left.
- Send the founder a "Phase 2/3 retest-ready" ping with the per-persona
  retest script (the 6-persona script from the prior ping, now extended
  to all merged personas).

---

## Anti-patterns

- **DO NOT merge before all 8 are APPROVED** — the rebase chains assume
  no fast-merge interleaving with new pushes.
- **DO NOT use the GitHub UI for the conflicted manifest rebases** —
  the JSON merge needs human eyes to keep BOTH skill entries; GitHub's
  3-way merger can pick one branch's manifest wholesale and silently
  drop the other's entry.
- **DO NOT skip the bundle-content verify step** — `publish:bundles`
  succeeding does not prove the tarball contains the playbook SKILL.md
  (it could pick up a stale staging dir). The tarball download check is
  the real evidence.
- **DO NOT dispatch finance-cycle before #153 lands on main** — the agent
  reads compliance-cycle's SKILL.md as its pattern reference; from a PR
  branch it's possible but error-prone.
