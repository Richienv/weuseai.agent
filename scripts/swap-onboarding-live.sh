#!/usr/bin/env bash
#
# Promote the DC-runtime tarot redesign (onboarding-new.html) to the LIVE
# onboarding page (onboarding.html), in one shot, with the drift-gate estate
# reconciled so `npm test` stays green.
#
# ───────────────────────────────────────────────────────────────────────────
#  RUN THIS ONLY AFTER a real-cid end-to-end onboarding test has passed on a
#  freshly provisioned VPS (token validate → pairing → complete-onboarding →
#  greeting). That test needs founder infra (Vultr IP-allowlist, a real
#  Telegram bot, Xendit) and CANNOT be run from CI. The onboarding-new.html
#  redesign is at behavioural parity with the live funnel (see
#  tests/onboarding-new-wiring.spec.ts) — this script is the mechanical swap
#  only. Nothing here proves the live chain works; only a real payment/cid does.
# ───────────────────────────────────────────────────────────────────────────
#
# What it does:
#   1. onboarding-new.html  →  onboarding.html   (git mv; overwrites the old)
#   2. Repoints the two DC gates' FILE constant  onboarding-new.html → onboarding.html
#   3. Deletes the 6 vanilla-JS drift gates whose pinned symbols no longer exist
#      (their contracts are re-expressed, DC-shaped, in onboarding-new-wiring.spec.ts)
#   4. Surgically removes the ONE onboarding assertion from
#      welcome-bot-username-link.spec.ts (its 3 welcome.html tests stay)
#   5. Runs the full suite
#
# Usage:  bash scripts/swap-onboarding-live.sh          (do it)
#         bash scripts/swap-onboarding-live.sh --dry-run (print the plan only)
#
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
run() { echo "  \$ $*"; [[ $DRY -eq 1 ]] || eval "$*"; }

[[ -f onboarding-new.html ]] || { echo "ERROR: onboarding-new.html not found — nothing to promote."; exit 1; }
[[ -f onboarding.html ]]     || { echo "ERROR: onboarding.html not found — unexpected repo state."; exit 1; }

echo "── 1. promote onboarding-new.html → onboarding.html"
run "git rm -q onboarding.html"
run "git mv onboarding-new.html onboarding.html"

echo "── 2. repoint the DC gates at the promoted file"
for g in tests/onboarding-new-wiring.spec.ts tests/onboarding-new-persona-breadth.spec.ts; do
  run "sed -i '' \"s#\\.\\./onboarding-new\\.html#../onboarding.html#g\" $g"
done

echo "── 3. delete the vanilla-JS drift gates (contracts now in onboarding-new-wiring.spec.ts)"
for g in \
  tests/onboarding-step1-profile-save.spec.ts \
  tests/onboarding-pair-code-loading.spec.ts \
  tests/onboarding-pair-code-reassurance.spec.ts \
  tests/onboarding-pending-provision-copy.spec.ts \
  tests/onboarding-capacity-error-copy.spec.ts \
  tests/onboarding-wrong-bot-link.spec.ts ; do
  [[ -f "$g" ]] && run "git rm -q $g" || echo "  (already gone: $g)"
done

echo "── 4. drop the single onboarding assertion from welcome-bot-username-link.spec.ts"
# Removes from the "onboarding.html sanity check" comment banner through the end
# of that test block; the 3 welcome.html tests above it are untouched.
if [[ $DRY -eq 1 ]]; then
  echo "  \$ python3 (strip the onboarding sanity test block)"
else
  python3 - <<'PY'
import re, pathlib
p = pathlib.Path('tests/welcome-bot-username-link.spec.ts')
s = p.read_text()
m = re.search(r'\n// ─+ onboarding\.html sanity check', s)
if not m:
    print("  (onboarding sanity block already removed)"); raise SystemExit
start = m.start()
# find the end of the test(...) call that follows: the line that is exactly '})'
tail = s[start:]
end_rel = re.search(r'\n\}\)\s*(\n|$)', tail)
assert end_rel, "could not find the end of the onboarding sanity test"
s = s[:start] + s[start + end_rel.end():]
p.write_text(s)
print("  stripped the onboarding sanity test; welcome.html tests kept")
PY
  run "git add tests/welcome-bot-username-link.spec.ts"
fi

echo "── 5. verify"
if [[ $DRY -eq 1 ]]; then
  echo "  \$ npm test   (skipped in --dry-run)"
  echo ""
  echo "DRY RUN complete — no files changed. Re-run without --dry-run to apply."
else
  npm test
  echo ""
  echo "SWAP DONE. Review \`git status\`, then commit + open a PR. Merging deploys"
  echo "the new onboarding to weuseai.id/onboarding (auto — Vercel static)."
fi
