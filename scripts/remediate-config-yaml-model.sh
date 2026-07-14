#!/usr/bin/env bash
# remediate-config-yaml-model.sh — retroactive fix for the 2026-06-07
# config.yaml model-block YAML incident. Runs ON a customer VPS (as the
# weuseai user, who has passwordless sudo). Idempotent + safe: backs up,
# rebuilds the model block shape-independently, VALIDATES with the Hermes
# venv pyyaml, and only then swaps in + restarts the gateway.
#
# Usage (from an operator box with the fleet key):
#   ssh -i ~/.ssh/weuseai-fleet weuseai@<VPS_IP> 'bash -s' < scripts/remediate-config-yaml-model.sh
#
# Root cause it fixes: a pinned-Hermes update changed top-level `model:` in
# the fresh config from a SCALAR to a DICT (model.default: <opus>). The old
# setup-script `sed 's|^model:.*|model: deepseek/...|'` collapsed that dict
# parent to a scalar, ORPHANING its indented child → invalid YAML → Hermes
# dropped the whole config → empty model → OpenRouter "HTTP 400: No models
# provided". The permanent generator fix is in
# services/provisioning/src/setup-script.ts (modelPinShellBlock +
# configYamlValidateShellBlock); this script remediates already-provisioned
# VPSes. See docs/investigation/2026-06-07-config-yaml-model-shape-incident.md.
set -euo pipefail

PINNED_MODEL="deepseek/deepseek-v4-pro"
CY=/home/weuseai/.hermes/config.yaml
PY=/home/weuseai/.hermes/hermes-agent/venv/bin/python

[ -f "$CY" ] || { echo "FATAL: $CY not found"; exit 1; }

TS=$(date +%s)
cp "$CY" "$CY.bak.$TS"
echo "backup: $CY.bak.$TS"

# Remove ANY existing top-level model: construct (scalar OR dict + its entire
# indented body), then append one canonical nested block. Shape-independent.
awk '
  inblk && /^[[:space:]]/ {next}
  inblk && /^[[:space:]]*$/ {next}
  inblk {inblk=0}
  /^model:/ {inblk=1; next}
  {print}
' "$CY" > "$CY.new"
printf 'model:\n  default: %s\n' "$PINNED_MODEL" >> "$CY.new"

# Validate with the Hermes venv pyyaml BEFORE swapping in. Abort on failure —
# the live (broken) config is left untouched, backup retained.
if [ -x "$PY" ] && "$PY" -c 'import yaml' 2>/dev/null; then
  "$PY" - "$CY.new" "$PINNED_MODEL" <<'PYEOF'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])) or {}
m = d.get("model")
assert isinstance(m, dict) and m.get("default") == sys.argv[2], f"bad model block: {m!r}"
print("VALIDATION_OK model.default=" + m["default"])
PYEOF
else
  echo "FATAL: Hermes venv python/pyyaml unavailable — cannot validate, aborting"
  rm -f "$CY.new"
  exit 1
fi

mv "$CY.new" "$CY"
chown weuseai:weuseai "$CY"
sudo -n systemctl restart hermes-gateway
sleep 4
echo "service_active=$(sudo -n systemctl is-active hermes-gateway)"
echo "DONE — config.yaml remediated + gateway restarted"
