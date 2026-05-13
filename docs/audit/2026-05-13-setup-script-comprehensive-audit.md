# Setup-script comprehensive audit (2026-05-13)

> Read every line of the VPS setup pipeline. 5-axis risk per block.
> Triggered by 4 bugs found in 24h via production debug. Goal: surface
> remaining latent bugs BEFORE they hit a customer.
>
> Files audited (on `main @ 1cb69cf` in `.worktrees/phase2-5`):
> - `services/provisioning/src/setup-script.ts` (718 lines)
> - `services/provisioning/src/customer-flow.ts` (511 lines)
> - `services/provisioning/src/bundle-pull-script.ts` (340 lines)
> - `services/provisioning/src/routes/refresh-env.ts` (642 lines)
> - `services/provisioning/src/routes/restart-hermes.ts` (170 lines)
> - `services/provisioning/Dockerfile` (67 lines)
> - `services/provisioning/src/ssh/exec-ssh-provisioner.ts` (105 lines)
> - `services/provisioning/src/index.ts` (285 lines)

## Executive summary

- **Total commands/blocks audited:** ~48 distinct blocks across 8 files
- **High-severity findings:** 3 (would-cause-production-outage if hit)
- **Medium-severity findings:** 7 (degraded experience but recoverable)
- **Low-severity findings:** 9 (cosmetic / theoretical)
- **Already-fixed-by-PR-#83 / #84 / #85:**
  - HF-2 timeouts on apt/Hermes install (PR #83)
  - HF-2 gateway install/start now FATAL with `exit 9` / `exit 10` (PR #83)
  - HF-2 post-install `hermes --version` verification (PR #83)
  - Heartbeat to `/var/log/hermes-install.heartbeat` (PR #83)
  - HF-2b `timeout N env VAR=val …` env-var parsing (PR #84)
  - HF-2c Dockerfile `COPY agent-packs/` so `BOOTSTRAP_BUNDLE_BASE64` populates (PR #85)
  - HF-2d gateway install always runs (no longer gated on `hasTelegram`) (PR #85)
  - HF-2e restart-hermes SSH key written utf-8 + trailing-newline (PR #85)

The four PR-#83/#84/#85 fixes closed a substantial fraction of the high-severity surface, but the audit found several remaining latent risks — particularly around **stdin-piped script + background heartbeat interaction**, **TypeScript-template-literal-meets-bash quoting in `bundle-pull-script.ts`**, and **partial-success state inconsistency** when a step in the middle of setup-script fails.

---

## Per-file findings

### services/provisioning/src/setup-script.ts

#### Block 1: Heartbeat function — lines 591-607
```bash
heartbeat() {
  while true; do
    sleep 30
    date -u '+%Y-%m-%dT%H:%M:%SZ' > /var/log/hermes-install.heartbeat
  done
}
mkdir -p /var/log
touch /var/log/hermes-install.heartbeat
heartbeat &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null" EXIT
```
- **Axis A (hang):** 1 — heartbeat itself can't hang; `sleep 30` is bounded
- **Axis B (silent-fail):** 3 — `kill … 2>/dev/null` swallows the kill error which is fine, but **if `heartbeat &` never started successfully (e.g., out of PIDs)**, `$HEARTBEAT_PID` is empty and `trap "kill"` becomes `trap "kill"` — a parse error but masked by `2>/dev/null`. Low real-world likelihood.
- **Axis C (quoting):** 1 — no user input in the heartbeat body
- **Axis D (network):** N/A
- **Axis E (state):** 2 — the heartbeat file at `/var/log/hermes-install.heartbeat` is created at line 604 with `touch` BEFORE the loop's first iteration writes. So the parent-side watcher will see an empty file (mtime = touch time, not loop time) for the first 30 seconds. A watcher comparing "mtime is recent" works; a watcher comparing "file non-empty" gets a false negative briefly.
- **Severity:** low
- **Recommended fix:** seed the heartbeat file with the current timestamp before forking the loop (one extra line). Optional, low-impact.

#### Block 2: Halo curl — lines 364-377
```bash
log "Sending halo ping to Telegram (proof-of-life)..."
curl -fsS -X POST \
  "https://api.telegram.org/bot${p.telegramBotToken}/sendMessage" \
  -H "Content-Type: application/json" \
  -d '${haloJson}' \
  >> "$LOG" 2>&1 \
  && log "✓ halo sent" \
  || log "✗ halo curl failed (non-fatal, continuing)"
```
- **Axis A (hang):** **4** — `curl -fsS` has NO `--max-time` set. If `api.telegram.org` is reachable but slow (SGP-to-Telegram latency spikes have been observed), this could block the entire setup-script start for minutes. Worse: curl's default has no overall connection timeout in some libcurl builds.
- **Axis B (silent-fail):** 2 — `|| log "halo curl failed (non-fatal, continuing)"` is **intentional** and documented; halo is best-effort. Acceptable.
- **Axis C (quoting):** 3 — `${haloJson}` is the result of `JSON.stringify({ chat_id, text })` interpolated into a single-quoted bash string. The Bahasa Indonesia liveness text contains `'` (e.g., "agen lo") — but the actual `LIVENESS_PING_TEXT` constant at line 268 has no apostrophes, so safe today. However, **if the liveness text is ever edited to contain an apostrophe (very natural in BI/EN copy), the single-quoted heredoc breaks and curl gets a malformed `-d` payload**, returning 400 from Telegram. Silently logs "halo curl failed (non-fatal)" — bug hides until someone reads the post-mortem log.
- **Axis D (network):** Telegram API. Single point of failure but failure is intentionally non-fatal here.
- **Axis E (state):** 1 — halo failure leaves no DB / disk state to recover; next step proceeds.
- **Severity:** medium
- **Recommended fix:** (1) add `--max-time 15` to curl. (2) Either escape `LIVENESS_PING_TEXT` for single-quote safety, or write the JSON to a tmpfile and use `--data @file` so the quoting layer becomes irrelevant.

#### Block 3: apt-get update + install — lines 622-631
```bash
log "Updating apt (timeout 90 sec)..."
if ! timeout 90 env DEBIAN_FRONTEND=noninteractive apt-get update -qq >> "$LOG" 2>&1; then
  log "✗ apt-get update timed out or failed after 90 sec"
  exit 5
fi
log "Installing base packages (timeout 180 sec)..."
if ! timeout 180 env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates python3 sudo >> "$LOG" 2>&1; then
  log "✗ apt-get install timed out or failed after 180 sec"
  exit 6
fi
```
- **Axis A (hang):** 1 — `timeout 90` / `timeout 180` enforced. Good.
- **Axis B (silent-fail):** 1 — exits non-zero on failure (HF-2 fix). Good.
- **Axis C (quoting):** 1 — no user-controlled args
- **Axis D (network):** **4** — `apt-get update` hits `archive.ubuntu.com` (or mirror) + `security.ubuntu.com`. **90 seconds is tight for some PoPs**, especially first-boot on a fresh VM where DNS warm-up + mirror selection can eat 20+ sec. Has it timed out in production? — not yet flagged in PR commits, but on a slow IDCH/Vultr-SGP mirror day this **will** fire `exit 5`.
- **Axis E (state):** 3 — on `exit 5`, customer's VPS has only the base Ubuntu image. `vps_instances.status` gets set to `failed` by customer-flow.ts:315, but the VPS itself is left running, billing the founder. No automated tear-down on setup-script failure.
- **Severity:** medium
- **Recommended fix:** Consider 120/240 timeouts. Add retry-once on `apt-get update` (this is a known-flaky operation). Auto-tear-down on `exit 5/6` is a separate change but worth tracking.

#### Block 4: weuseai user create — lines 633-642
```bash
if ! id weuseai >/dev/null 2>&1; then
  log "Creating weuseai user..."
  useradd -m -s /bin/bash weuseai
  usermod -aG sudo weuseai
  echo 'weuseai ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/weuseai
  chmod 0440 /etc/sudoers.d/weuseai
else
  log "weuseai user already exists"
fi
```
- **Axis A (hang):** 1 — local-only ops
- **Axis B (silent-fail):** 2 — `set -e` is on, so `useradd` failure aborts. Good. But `usermod -aG sudo weuseai` would fail on a Vultr image that lacks the `sudo` group (rare but possible on minimal images). With `set -e`, this aborts setup — desired.
- **Axis C (quoting):** 1
- **Axis D (network):** N/A
- **Axis E (state):** 1 — idempotent re-run via `id weuseai` guard
- **Severity:** low

#### Block 5: Hermes config dir + `.env` heredoc — lines 644-651
```bash
log "Writing Hermes config files..."
sudo -u weuseai mkdir -p /home/weuseai/.hermes/skills/daily-news-briefing-bahasa
cat > /home/weuseai/.hermes/.env <<'WEUSEAI_ENV_EOF'
${envFileBody}
WEUSEAI_ENV_EOF
chown weuseai:weuseai /home/weuseai/.hermes/.env
chmod 0600 /home/weuseai/.hermes/.env
```
- **Axis A (hang):** 1
- **Axis B (silent-fail):** 1
- **Axis C (quoting):** **3** — heredoc delimiter `'WEUSEAI_ENV_EOF'` is single-quoted, so no shell expansion inside (good). But `${envFileBody}` is interpolated by TypeScript template literal — its contents come from `llmEnvLines(p)`, `telegramEnvLines`, etc. Concrete risk: **if `p.telegramBotToken` ever contains a literal newline** (which the input parser doesn't strip; see `spin-up-helpers.ts` parsing), the bash heredoc breaks with values appearing as additional env lines. Telegram bot tokens are normally `\d+:[A-Za-z0-9_-]+` but the validation upstream is brittle. Similarly `agentSlugs.join(',')` would fail if a slug ever contained a comma — unlikely but no defensive check.
- **Axis D (network):** N/A
- **Axis E (state):** 2 — file is written before any `chown`; if `chown` fails (group missing?), `set -e` aborts but `.env` is left readable as the default umask. Minor.
- **Severity:** medium
- **Recommended fix:** validate that `envFileBody` contains no literal `WEUSEAI_ENV_EOF` line and no `\r` characters, OR base64-encode the env body the way `bundlePullScriptB64` is encoded at line 488. The base64 pattern is the right pattern; the heredoc here is the inconsistent one.

#### Block 6: SOUL.md heredoc — lines 653-656
```bash
cat > /home/weuseai/.hermes/SOUL.md <<'WEUSEAI_SOUL_EOF'
${SOUL_MD}WEUSEAI_SOUL_EOF
chown weuseai:weuseai /home/weuseai/.hermes/SOUL.md
```
- **Axis A (hang):** 1
- **Axis B (silent-fail):** 1
- **Axis C (quoting):** **4** — Look at line 654-655: the TypeScript template literal puts `${SOUL_MD}` directly followed by `WEUSEAI_SOUL_EOF` on the SAME line. Since `SOUL_MD` ends with `\n`, the heredoc gets the closing delimiter on its own line. But: **if any future edit removes the trailing newline from `SOUL_MD`**, the heredoc breaks (last persona line concatenated with `WEUSEAI_SOUL_EOF`). More importantly: **if any line within SOUL.md is ever literally `WEUSEAI_SOUL_EOF`** the heredoc terminates early. The closing delimiter for both `WEUSEAI_ENV_EOF` and `WEUSEAI_SOUL_EOF` is *not* unguessable; any user content reaching that string ends the heredoc.
- **Axis D (network):** N/A
- **Axis E (state):** 2 — half-written SOUL.md from an aborted heredoc means Hermes loads a truncated persona. Hermes would still boot, but the agent's voice could be subtly broken until refresh-env writes a fresh one.
- **Severity:** medium
- **Recommended fix:** base64-encode SOUL.md the same way `bundlePullScriptB64` is encoded. The pattern is already there at line 488.

#### Block 7: Daily-news SKILL.md heredoc — lines 658-661
Same shape as Block 6, same risks. Severity: low (SKILL.md content is static; less drift risk).

#### Block 8: Bundle install — lines 452-476
```bash
log "Installing agent-pack bundle (${p.agentSlug ?? 'the-pro'})..."
sudo -u weuseai mkdir -p /home/weuseai/.hermes/agent-pack
echo '${p.bundleTarBase64}' | base64 -d | tar -xz -C /home/weuseai/.hermes/agent-pack >> "$LOG" 2>&1
chown -R weuseai:weuseai /home/weuseai/.hermes/agent-pack
```
- **Axis A (hang):** 1 — local-only
- **Axis B (silent-fail):** **3** — `>> "$LOG" 2>&1` swallows the tar exit code into a pipeline. With `set -e` AND `set -o pipefail` (both enabled at line 576-578), this IS caught: pipefail makes the pipeline fail if ANY component fails. So a corrupted base64 → tar gets caught and aborts. Good. BUT: line 462 `for skill_dir in /home/weuseai/.hermes/agent-pack/skills/*/` — if `skills/` has no subdirs the glob expands to the literal pattern, and `[ -d /home/.../skills ]` at line 461 only checks the parent. If `skills/` is empty, the loop body runs once with the unmatched literal path and `cp` fails. With `set -e`, that aborts. Acceptable but brittle.
- **Axis C (quoting):** 2 — `'${p.bundleTarBase64}'` interpolated into single-quoted bash. Base64 alphabet is `[A-Za-z0-9+/=]` — none of those are single-quote-special. Safe.
- **Axis D (network):** N/A — bootstrap bundle is embedded in the script
- **Axis E (state):** 2 — partial extract leaves orphan files in `/home/weuseai/.hermes/agent-pack/`. Not catastrophic; next boot's `weuseai-bundle-pull` may or may not clean up (it writes to `/var/lib/weuseai/bundle/`, separate dir).
- **Severity:** medium
- **Recommended fix:** `set -o pipefail` already mitigates. Worth adding `|| { log "extract failed"; exit 11; }` for clearer post-mortem.

#### Block 9: weuseai-bundle-pull install + systemd drop-in — lines 489-535
```bash
log "Installing weuseai-bundle-pull at /usr/local/bin/..."
echo '${bundlePullScriptB64}' | base64 -d > /usr/local/bin/weuseai-bundle-pull
chmod 0755 /usr/local/bin/weuseai-bundle-pull

…

mkdir -p /etc/systemd/system/hermes-gateway.service.d
cat > /etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf <<'WEUSEAI_DROPIN_EOF'
[Service]
ExecStartPre=+/usr/local/bin/weuseai-bundle-pull
WEUSEAI_DROPIN_EOF

systemctl daemon-reload >> "$LOG" 2>&1 || log "⚠ daemon-reload failed (non-fatal)"
```
- **Axis A (hang):** 1 — local-only
- **Axis B (silent-fail):** 2 — `systemctl daemon-reload || log "⚠ … (non-fatal)"` is acceptable for a daemon-reload; even if it fails the next `systemctl restart` in step 8 triggers an implicit reload.
- **Axis C (quoting):** 1 — base64 string in single quotes; drop-in body is static
- **Axis D (network):** N/A
- **Axis E (state):** 1 — the drop-in conf and the script land together; even if one stale step happens the next boot picks it up
- **Severity:** low

#### Block 10: Fleet SSH pubkey install — lines 545-567
```bash
sudo -u weuseai mkdir -p /home/weuseai/.ssh
sudo -u weuseai chmod 0700 /home/weuseai/.ssh
sudo -u weuseai touch /home/weuseai/.ssh/authorized_keys
sudo -u weuseai chmod 0600 /home/weuseai/.ssh/authorized_keys
FLEET_KEY=${JSON.stringify(p.fleetSshPubkey)}
if ! sudo -u weuseai grep -qF "$FLEET_KEY" /home/weuseai/.ssh/authorized_keys; then
  echo "$FLEET_KEY" | sudo -u weuseai tee -a /home/weuseai/.ssh/authorized_keys >> "$LOG"
fi
```
- **Axis A (hang):** 1
- **Axis B (silent-fail):** 1
- **Axis C (quoting):** 2 — `JSON.stringify(p.fleetSshPubkey)` produces a double-quoted JSON string. That's then assigned to bash `FLEET_KEY=…`. **Risk:** SSH public keys contain `+/=`, `==`, and (very rarely) backslashes in their base64 content — all safe in JSON double quotes. But if the pubkey's comment field ever contains a literal `"`, JSON.stringify escapes it as `\"`, and the bash assignment `FLEET_KEY="…\"…"` becomes a broken bash literal. Real-world pubkeys don't have `"` in comments (rfc4253 doesn't allow it), but worth noting.
- **Axis D (network):** N/A
- **Axis E (state):** 1 — idempotent via `grep -qF`
- **Severity:** low

#### Block 11: Hermes install (slow + timeout) — lines 689-696
```bash
log "Installing Hermes (pinned to ${pinnedHermesVersion}; this takes 3-6 min, timeout 10 min)..."
if ! timeout 600 \
  su - weuseai -c 'HERMES_VERSION=${pinnedHermesVersion} curl -fsSL --max-time 30 https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | HERMES_VERSION=${pinnedHermesVersion} bash' \
  >> "$LOG" 2>&1
then
  log "✗ Hermes install timed out or failed after 600 sec"
  exit 7
fi
```
- **Axis A (hang):** 1 — `timeout 600` and inner `--max-time 30`. Good.
- **Axis B (silent-fail):** 1 — non-zero exit fires `exit 7`. Good.
- **Axis C (quoting):** **3** — the `su - weuseai -c '…'` payload is single-quoted. Inside it, `${pinnedHermesVersion}` is interpolated by TypeScript template literal — IF `pinnedHermesVersion` ever contained a single quote, the bash single-quote nesting breaks. Today the value comes from `process.env.HERMES_VERSION` or the literal `'v0.13.0'` default. Env-driven. **No validation on `HERMES_VERSION` env shape at customer-flow.ts:410.** A future operator setting `HERMES_VERSION="v0.13.0'; rm -rf /;"` would inject. Threat model: ops-side only; not a customer-facing surface.
- **Axis D (network):** **4** — depends on `raw.githubusercontent.com` (DNS, TCP, TLS, HTTP), then `install.sh` itself runs `pip install` from PyPI + downloads model dependencies. PyPI's SGP CDN has had outages. The `timeout 600` is the only floor; pip itself has no per-package timeout.
- **Axis E (state):** **4** — if the install times out at 10 min, the VPS has half-installed Hermes (partial venv, no binary at `~/.local/bin/hermes`). Step 7b's `hermes --version` then fails with `exit 8`. Customer-flow records `status='failed'`. Recovery requires manual tear-down + re-spin.
- **Severity:** **high** (network-dependency + state-inconsistency combo) — but partially mitigated by `exit 7` failing the whole spinUp cleanly. The "fail-loud" path works; the "partial state" lingering on the VM is the risk if we ever want to retry rather than tear-down.
- **Recommended fix:** Consider retry-once at the customer-flow level on `exit 7` with a fresh VPS. Not setup-script's job to fix.

#### Block 12: Hermes binary verification — lines 700-708
```bash
if ! timeout 30 su - weuseai -c '~/.local/bin/hermes --version' >> "$LOG" 2>&1; then
  log "✗ hermes --version failed within 30 sec — install broken"
  exit 8
fi
```
- All axes: 1. Tight, defensive, clean. HF-2 add — works correctly.
- **Severity:** low

#### Block 13: Hermes gateway install — lines 423-428
```bash
log "Installing Hermes gateway as system service..."
if ! ${HERMES} gateway install --system --run-as-user weuseai >> "$LOG" 2>&1; then
  log "✗ gateway install FAILED — customer's bot would never reply; aborting"
  exit 9
fi
```
- **Axis A (hang):** **2** — no `timeout` wrapper on this. `hermes gateway install` is a CLI that does local file writes + systemd unit generation; in normal cases it's <2 sec. But the binary just installed; if PyPI is mid-degraded, an in-process import could hang. Belt-and-suspenders would add `timeout 30 …`.
- **Axis B (silent-fail):** 1 — FATAL on failure (HF-2 fix). Good.
- **Axis C (quoting):** 1
- **Axis D (network):** N/A (gateway install is local)
- **Axis E (state):** 2 — if this fails, customer's VPS has Hermes binary but no systemd unit. Status set to `failed`. Recoverable via refresh-env's `installIfMissingBlock`.
- **Severity:** low

#### Block 14: Hermes gateway start + cron — lines 431-439
```bash
log "Starting Hermes gateway service..."
if ! ${HERMES} gateway start --system >> "$LOG" 2>&1; then
  log "✗ gateway start FAILED — customer's bot would never reply; aborting"
  exit 10
fi

log "Adding daily-news cron (optional, cosmetic)..."
su - weuseai -c '${HERMES} cron add --schedule "0 0 * * *" --prompt "${shSingleQuote(DAILY_NEWS_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "⚠ cron add failed …"
```
- **Axis A (hang):** 2 — no timeout on either command
- **Axis B (silent-fail):** 2 — gateway start is FATAL (good); cron is `|| log "(non-fatal)"` (acceptable, documented)
- **Axis C (quoting):** **3** — the cron line is the worst-quoted block in the file. `su - weuseai -c '…${HERMES}… --prompt "${shSingleQuote(DAILY_NEWS_CRON_PROMPT)}" …'`. The `shSingleQuote` helper at line 325 escapes `'` as `'\''` — but the outer wrapping is `'…'` (single-quote of su -c), inside which is `"…"` (double-quote for --prompt arg). The single-quote escape pattern in `shSingleQuote` is designed for OUTER single quotes; **inside double quotes it doesn't escape what needs escaping** (double-quotes, backticks, `$`). `DAILY_NEWS_CRON_PROMPT` today has no `"`, `$`, or backticks. If anyone edits it to add interpolation-friendly chars, the cron silently breaks.
- **Axis D (network):** N/A
- **Axis E (state):** 2 — cron failure is genuinely cosmetic per the comment; daily-news skill still works on-demand
- **Severity:** medium
- **Recommended fix:** rewrite the cron-add to feed the prompt via stdin or a tmpfile, eliminating the double-nested quoting

#### Block 15: Ready marker — lines 713-715
- All axes: 1. Trivial. Severity: low.

---

### services/provisioning/src/customer-flow.ts

#### Block 16: spinUpCustomer idempotency check — lines 136-145
- All axes: 1-2. Returns existing row without touching `.env` (this is the documented behavior — refresh-env is the recovery path).
- **Severity:** low — well-documented design choice

#### Block 17: OpenRouter key mint — lines 149-178
- **Axis A (hang):** 3 — no timeout passed to `deps.llmMinter.mint()`. The minter (`OpenRouterKeyMinter`) is presumably HTTP-bound but I didn't read it for this audit. If openrouter.ai is degraded, this could hang indefinitely.
- **Axis B (silent-fail):** 1 — `try/catch` cleanly bubbles; alert chat informed
- **Axis C (quoting):** 1
- **Axis D (network):** **4** — single hard dependency on openrouter.ai. No fallback / mock path.
- **Axis E (state):** 1 — done BEFORE VM creation (line 148: "Done BEFORE VM creation so a minter failure costs us nothing in IDCH IPs.") — excellent.
- **Severity:** medium
- **Recommended fix:** confirm `OpenRouterKeyMinter` has a `fetch` timeout (likely 30s default but worth verifying — out of scope for this audit, flagging)

#### Block 18: VM create — lines 192-215
- **Axis A (hang):** 3 — same as mint. Provider adapter timeout not visible from this file.
- **Axis B (silent-fail):** 1 — clean throw, alert chat informed
- **Axis C (quoting):** 1
- **Axis D (network):** **3** — IDCH/Vultr/DO API. Failover provider in place per the Vultr migration comment.
- **Axis E (state):** **3** — if `vps.create()` partially succeeds (rare, but: Vultr instance created then API call timed out on the response read), customer-flow throws without creating a `vps_instances` row. Result: orphan VPS, no DB pointer, costs the founder until manually cleaned up.
- **Severity:** medium — and outside scope to fix in setup-script; flag for monitoring

#### Block 19: IP polling + SSH wait — lines 241-254
- **Axis A (hang):** 1 — both have deadlines (5 min each by default)
- **Axis B (silent-fail):** 1
- **Axis C (quoting):** 1
- **Axis D (network):** **3** — port-22 reachability test goes via `net.connect` to the customer's public IP. If the customer's region has flaky routing from Fly's region, the deadline may bite.
- **Axis E (state):** 2 — if `waitForPublicIp` succeeds but `waitForSshOpen` times out, the VM is recorded with `ip_address` set, status still `provisioning`. The `done.catch` at line 311-326 marks it `failed`. OK — but the VPS keeps running, billing.
- **Severity:** medium (already known recovery surface)

#### Block 20: SSH setup invocation + fleet-key write — lines 257-302
- **Axis A (hang):** 2 — `timeoutMs: 12 * 60 * 1000` on the SSH call. Hermes install can take 5+ min plus apt + everything. 12 min is conservative; HF-2's 10-min Hermes timeout + 90+180s apt + halo curl could in theory exceed 12 min on a bad day. Tight.
- **Axis B (silent-fail):** 1
- **Axis C (quoting):** 1 — the script is fed via stdin (good — no quoting layer)
- **Axis D (network):** **3** — SSH to customer VPS
- **Axis E (state):** 1 — `finally` cleans up the tmpfile fleet-key. Good.
- **Severity:** medium — bump the SSH timeoutMs to 15 min would be safer

#### Block 21: setup-script success → status='running' — lines 308-310
```typescript
await deps.store.updateVPSInstance(vps.uuid, { status: 'running' })
```
- **Axis A:** 1
- **Axis B:** **3** — `sshResult.ok = true` MEANS exit code 0 from the SSH session. Setup-script's `exit 0` happens after writing `/opt/weuseai/ready`. But: there is no post-SSH verification that `/opt/weuseai/ready` actually exists, nor that the systemd unit is `active`. If a setup-script edit ever ends in a way that returns exit 0 without writing the ready marker, the DB row says `running` but the VPS is broken.
- **Axis C:** 1
- **Axis D:** Supabase write
- **Axis E:** 2 — defense in depth would be: SSH a separate `test -f /opt/weuseai/ready && systemctl is-active hermes-gateway` after the script, only THEN flip to `running`.
- **Severity:** medium
- **Recommended fix:** trail-after-success readiness check before the status flip (or fold into `customer-readiness-probe.ts`)

---

### services/provisioning/src/bundle-pull-script.ts

This file is the **highest-quoting-risk surface** in the audit because it contains the most TypeScript-template-literal-meets-bash interpolation.

#### Block 22: telemetry payload heredoc + bash variable escape — lines 121-151
```bash
record_attempt() {
  local slug="$1"
  …
  local payload
  payload=$(cat <<JSON
{
  "customer_id": "$CID",
  "agent_slug": "$slug",
  …
  "bytes_pulled": $\{bytes_pulled:-null\},
  "duration_ms": $\{duration_ms:-null\}
}
JSON
)
```
- **Axis C (quoting):** **5 (highest in audit)** — Look at lines 139-140: `$\{bytes_pulled:-null\}`. The TypeScript template-literal-escape `$\{…\}` is meant to prevent TypeScript from interpolating `${bytes_pulled:-null}`. The intent is for bash to see `${bytes_pulled:-null}` and use shell parameter expansion. **But the actual emitted bash is `${bytes_pulled:-null}` — the `\{` and `\}` are TS-side escapes that the runtime drops.** Verify by reading the string at runtime; the regex-style escape only works if TypeScript treats `\{` as literal `{` (it does in template literals). So `${bytes_pulled:-null}` reaches bash, and the JSON payload gets either the numeric value or the literal `null` — correct.
  - HOWEVER, the heredoc body has unquoted variables (`$CID`, `$slug`, etc.) being interpolated by bash. **If `$CID` or `$slug` ever contained a literal `"`, the resulting JSON breaks.** The slug is controlled by `tier-personas.ts` (safe), but `$CID` comes from `WEUSEAI_CUSTOMER_ID` env, which itself comes from `customer-flow.ts` line 319 — UUID, regex-safe.
  - The `error_detail` field at line 138 is the most user-controlled-adjacent: it comes from bash-side error messages assembled at lines 247, 259, 289, 301. None should contain `"`, but `"$response"` echoed at line 258 → if bundle-fetch ever returned text containing `"`, it'd propagate into the JSON payload.
- **Axis B (silent-fail):** 2 — telemetry record failure is silently swallowed (`|| log "⚠ telemetry record failed (non-fatal)"` at line 150). Acceptable.
- **Axis D (network):** **3** — POST to bundle-pull-record Edge Function. Single point of failure with 10-sec `--max-time`. Good.
- **Axis E (state):** 1 — telemetry write fail doesn't change install state
- **Severity:** medium
- **Recommended fix:** use `python3` to build the JSON payload (we already depend on python3 for the manifest parse at line 170), or `jq` if we can add to base packages — eliminate the manual JSON quoting.

#### Block 23: Manifest parse via inline Python — lines 170-192
```bash
python3 - "$manifest" "$tier" <<'PYEOF' > /tmp/weuseai-skill-filter.txt
import json, sys
…
PYEOF
```
- **Axis A (hang):** 2 — no timeout. Python parsing of a ~5KB manifest should be <100ms. Acceptable.
- **Axis B (silent-fail):** 1 — `set -o pipefail` + `set -u` are on; if python throws, the redirect fails, the `while read` loop sees no lines, and `apply_tier_filter` returns no-op. Edge case worth noting.
- **Axis C (quoting):** 2 — `'PYEOF'` is single-quoted, so the Python source is not interpolated by bash. Good. The Python reads argv, not env, so no injection from manifest content.
- **Axis D (network):** N/A
- **Axis E (state):** 2 — if the Python crashes (bad manifest JSON?), no skills get installed. Bundle pull returns "success" since `apply_tier_filter` swallows the failure. `bundle_pull_attempts.status='success'` even when no skills landed. Latent.
- **Severity:** medium
- **Recommended fix:** check exit code of python3, set `apply_tier_filter` to return non-zero on parse failure, propagate to record_attempt.

#### Block 24: Curl bundle-fetch — lines 240-249
```bash
response=$(curl -fsS -X POST "${fetchUrl}" \
  -H "Content-Type: application/json" \
  -d "{\"customer_id\":\"$CID\",\"agent_slug\":\"$slug\"}" \
  --max-time ${FETCH_TIMEOUT_SEC} 2>>"$LOG") || {
    …
  }
```
- **Axis A:** 1 — `--max-time 30` enforced
- **Axis B:** 1 — failure caught + logged
- **Axis C:** **3** — `"{\"customer_id\":\"$CID\",\"agent_slug\":\"$slug\"}"` — bash double-quoted, so `$CID` and `$slug` interpolate. Same quoting issue as Block 22: if either contained `"`, the JSON breaks. UUID + tier-personas slug are safe.
- **Axis D:** **3** — Supabase Edge Function dependency
- **Axis E:** 1 — failure is per-persona, other personas continue
- **Severity:** low

#### Block 25: Curl bundle download — lines 286-292
```bash
curl -fsSL "$signed_url" -o "$tmpfile" --max-time ${DOWNLOAD_TIMEOUT_SEC} 2>>"$LOG" || {
```
- **Axis A:** 1 — `--max-time 60` enforced
- **Axis B:** 1
- **Axis C:** 2 — `"$signed_url"` is double-quoted. Signed URL from Supabase Storage contains `?token=…` query string with `+/=`-base64-token chars; safe in double quotes. **Risk:** Supabase has occasionally returned URLs with literal `&` and special URL-encoded chars; if curl receives a URL with HTML-encoded entities (e.g., `&amp;`), the download silently downloads a 4xx error page. The `-o "$tmpfile"` doesn't check Content-Type. `tar -xzf` at line 298 catches gzip-corrupt downloads — so this fails loud. OK.
- **Axis D:** **4** — Supabase Storage; depends on `gtjgsligllbjcisiyrah.supabase.co` reachability + token signing
- **Axis E:** 1 — per-persona, isolated
- **Severity:** low

#### Block 26: Tar extract — lines 298-304
- **Axis A:** 2 — no explicit timeout; tar of a few-MB bundle is fast. OK.
- **Axis B:** 1 — non-zero exit caught
- **Axis C:** 1
- **Axis E:** 2 — partial extract into `$target_dir` not cleaned up on failure. Next boot's idempotency check looks for `.installed-version`, which is written only after successful extract — so on retry the partial dir is just overwritten. OK.
- **Severity:** low

#### Block 27: `chown -R weuseai:weuseai $target_dir` — line 307
- The bundle-pull script runs under `ExecStartPre=+` (root). If `chown` fails (weuseai user gone — would require sabotage), `set -e` is OFF here, the failure is swallowed. Hermes then runs as weuseai but can't read root-owned bundle files. Silent failure mode.
- **Severity:** low (unlikely scenario)

---

### services/provisioning/src/routes/refresh-env.ts

#### Block 28: env-rewrite awk + mv — lines 207-224
```bash
KEY='TELEGRAM_BOT_TOKEN'
VAL='123:abc'
awk -v key="$KEY" -v val="$VAL" '
  BEGIN { found=0 }
  $0 ~ "^"key"=" { print key"="val; found=1; next }
  { print }
  END { if (!found) print key"="val }
' "$ENV_FILE" > /tmp/.env.refresh && \
  sudo mv /tmp/.env.refresh "$ENV_FILE" && \
  sudo chown weuseai:weuseai "$ENV_FILE" && \
  sudo chmod 600 "$ENV_FILE"
```
- **Axis A:** 1 — awk is local + bounded
- **Axis B:** 1 — `set -euo pipefail` at line 326 + the `&& \` chain abort on any failure
- **Axis C:** **3** — `VAL=${escaped}` where `escaped = shellSingleQuote(value)` at line 209. `shellSingleQuote` wraps in single quotes and escapes embedded `'` as `'\''`. Good defense against shell injection. **But:** the value reaches awk via `-v val="$VAL"` (bash double-quoted). Awk's `-v` does its own escape processing — backslashes in `VAL` get interpreted by awk. If a future env value contained a literal `\n` (newline) or `\\`, awk's `-v` would split or escape unexpectedly, writing a different value to disk than intended. Today's `ALLOWED_ENV_KEYS` are `TELEGRAM_BOT_TOKEN` (digits+colon+base64), `OPENAI_API_KEY` / `OPENROUTER_API_KEY` (alphanumeric+dash). All safe.
- **Axis D:** N/A (post-SSH)
- **Axis E:** 2 — atomic mv via tmpfile is correct; if mv fails partway through `&& \` chain, env is unchanged (good). If chown succeeds but chmod fails, the file is owned-but-world-readable for a moment.
- **Severity:** low

#### Block 29: SOUL.md heredoc — lines 231-241
```bash
sudo tee "$SOUL_PATH" > /dev/null <<'WEUSEAI_SOUL_REFRESH_EOF'
${opts.soulMdContent}
WEUSEAI_SOUL_REFRESH_EOF
```
- **Axis C:** **4** — Same heredoc-delimiter-collision risk as setup-script Block 6. SOUL.md content is customer-onboarding-derived (per the comment) — it could plausibly include the literal string `WEUSEAI_SOUL_REFRESH_EOF` if a future onboarding flow lets users paste arbitrary text. Today the content comes from `renderSoulMd()` which interpolates name + expectations; user expectations could in theory contain the delimiter.
- **Axis B:** 1
- **Axis E:** 2 — partial-write on heredoc break leaves a corrupted SOUL.md
- **Severity:** medium
- **Recommended fix:** base64-encode soulMdContent before sending over the wire; decode on the VPS

#### Block 30: Pre-approve Python block — lines 261-292
```bash
sudo -u weuseai python3 - <<'WEUSEAI_PREAPPROVE_EOF'
import json, os, time, tempfile
…
chat_id = "${opts.telegramChatId}"
if chat_id not in data:
    data[chat_id] = {"user_name": "${userName}", "approved_at": time.time()}
…
```
- **Axis A:** 1 — local
- **Axis B:** 1 — atomic via `os.replace`
- **Axis C:** **3** — `"${opts.telegramChatId}"` interpolated INTO the python string literal. **Defended at line 252 by `if (!/^\d+$/.test(opts.telegramChatId)) throw`** — digits-only. Safe. `"${userName}"` is also pre-sanitized at line 257-260 to alphanumeric + space + `._-` + 80-char cap. Safe.
- **Axis D:** N/A
- **Axis E:** 1
- **Severity:** low (well-defended)

#### Block 31: install-if-missing block — lines 304-324
```bash
HERMES_BIN=/home/weuseai/.local/bin/hermes
GATEWAY_UNIT=/etc/systemd/system/hermes-gateway.service
if [ ! -f "$GATEWAY_UNIT" ]; then
  echo "hermes-gateway unit missing — installing now..." >&2
  if [ ! -x "$HERMES_BIN" ]; then
    echo "ERROR: hermes binary not found at $HERMES_BIN — cannot install gateway" >&2
    exit 4
  fi
  sudo "$HERMES_BIN" gateway install --system --run-as-user weuseai >&2 || {
    echo "ERROR: gateway install failed" >&2
    exit 5
  }
  sudo "$HERMES_BIN" gateway start --system >&2 || {
    echo "ERROR: gateway start failed" >&2
    exit 6
  }
  echo "hermes-gateway installed + started" >&2
fi
```
- **Axis A:** 2 — `gateway install` and `gateway start` have no timeout. Per comment in setup-script Block 13/14, these are normally <2s; not a real risk.
- **Axis B:** 1 — exits non-zero on failure
- **Axis C:** 1 — no user data
- **Axis D:** N/A
- **Axis E:** **2** — this block is the back-stop for the HF-2d gate change. Pre-HF-2d, setup-script skipped gateway install when no bot token; this block handled it on first refresh-env call. Post-HF-2d, the block is mostly redundant but kept as defense-in-depth. **One latent issue:** the post-restart `systemctl is-active` check at line 337-341 happens BEFORE this install-if-missing — wait, it happens AFTER per the source order (rewrites → soul → pre-approve → install-if-missing → restart → is-active). Good.
- **Severity:** low

#### Block 32: systemctl restart hermes-gateway — line 331
```bash
sudo systemctl restart hermes-gateway
sleep 2
ACTIVE=$(systemctl is-active hermes-gateway || true)
if [ "$ACTIVE" != "active" ]; then
  echo "hermes-gateway-is-active=$ACTIVE" >&2
  exit 3
fi
```
- **Axis A:** 2 — `sleep 2` is the only delay before is-active check. Hermes-gateway can take 5-10 sec to fully start on a slow VPS (loads bundles via ExecStartPre, imports Python). False-positive `inactive` reads possible.
- **Axis B:** 1 — failed-restart caught + reported
- **Axis C:** 1
- **Axis E:** 3 — if is-active returns `activating` (still booting), exit 3 fires, caller sees `hermes_inactive_after_restart`, but Hermes WILL come up 10 sec later. Customer's `/refresh-env` call rolls back as a failure; their bot still works. Stuck-state in `refresh_env_requests`.
- **Severity:** medium
- **Recommended fix:** poll `systemctl is-active` for up to 30 sec, exit non-zero only on definitive `failed` / `inactive` state after the polling deadline

#### Block 33: ssh runner — lines 359-399
- **Axis A:** 1 — 60-sec timeout via `setTimeout(() => proc.kill('SIGKILL'), 60_000)` at line 382
- **Axis B:** 1 — clean exit-code handling
- **Axis C:** 1
- **Axis D:** 3 — SSH to customer
- **Axis E:** 1
- **Severity:** low — 60-sec ceiling is potentially tight if the SSH command itself takes time (install-if-missing branch could take 30+ sec on slow boxes)

---

### services/provisioning/src/routes/restart-hermes.ts

#### Block 34: SSH key tmpfile + restart — lines 109-128
```typescript
const normalised = deps.fleetSshPrivateKey.endsWith('\n')
  ? deps.fleetSshPrivateKey
  : deps.fleetSshPrivateKey + '\n'
writeFileSync(keyPath, normalised, { encoding: 'utf8' })
chmodSync(keyPath, 0o600)
```
- All axes: 1-2. This is the HF-2e fix from PR #85. Mirrors customer-flow.ts:279-281 + refresh-env.ts:406-408. Clean.
- **Severity:** low

#### Block 35: ssh exec with `accept-new` host-key — lines 122-127
```typescript
'-o', 'StrictHostKeyChecking=accept-new',
```
- **Note:** `accept-new` means the first SSH call writes the host key to a known-hosts file; subsequent calls check it. **But there's no `-o UserKnownHostsFile=…` override** — the default is `~/.ssh/known_hosts`. In the Fly container, the running user is `node` (typically); the file may not be writable. Compare to refresh-env's defaultRunSsh at line 369-372 which uses `StrictHostKeyChecking=no` + `UserKnownHostsFile=/dev/null` — the safer pattern.
- **Severity:** low — but inconsistent across the codebase, and could cause first-call success / second-call host-key-mismatch on a VPS that rebuilt its host key.
- **Recommended fix:** mirror refresh-env's options exactly

#### Block 36: Default exec with no overall timeout — lines 153-170
- **Axis A:** **3** — `defaultExec` has NO timeout. The SSH call could hang indefinitely if the customer's VPS is hung mid-restart. Per the file's comment (`ssh … sudo systemctl restart hermes-gateway`), normal completion is sub-2-sec. But systemd restart of a unit that's stuck in `stop-sigterm` can take 90 sec by default.
- **Severity:** medium
- **Recommended fix:** wrap with same 60-sec kill timer as refresh-env's defaultRunSsh (line 382)

---

### services/provisioning/Dockerfile

#### Block 37: System deps — line 23
`apk add --no-cache openssh-client sshpass` — only 2 packages. **Missing:** `bash` (alpine ships ash; child_process spawn of `ssh` is fine, but if anything spawns `bash`-named scripts it'd fail). Setup-script is fed via stdin to `sudo bash -s` on the REMOTE — local doesn't need bash. OK.

#### Block 38: COPY layers — lines 31-63
The HF-2c comment at lines 52-62 explains the `COPY agent-packs/` add. Good defense-in-depth comment.

**Latent issue:** `COPY supabase/` at line 51 brings in ALL of `supabase/functions/` including Edge Function source. Container image bloat. Not a correctness issue.

- **Severity:** low

#### Block 39: `npm ci --include=dev` — line 41
- **Axis A:** 3 — npm install is network-bound. No timeout.
- **Axis B:** 1 — `RUN` aborts the build on failure (good)
- **Axis E:** 1
- **Severity:** low (build-time, not runtime; founder sees failure immediately)

---

### services/provisioning/src/ssh/exec-ssh-provisioner.ts

#### Block 40: spawn ssh / sshpass — lines 40-101
- **Axis A:** 1 — `setTimeout(() => proc.kill('SIGKILL'), timeoutMs)` at line 75. Per customer-flow, `timeoutMs = 12 * 60 * 1000`. Tight but workable.
- **Axis B:** 1 — clean exit-code + signal handling
- **Axis C:** 1 — script is piped via stdin (zero quoting layer)
- **Axis D:** 3 — SSH to customer VPS
- **Axis E:** 1
- **Severity:** low — this is the cleanest module in the audit

#### Block 41: `sudo bash -s` on remote — line 57
- Comment at lines 59-61 says "For Vultr's `root` default user, `sudo bash` is a no-op (already root). For IDCloudHost's `liren` user, sudo escalates as before."
- **Risk:** on Vultr root user, `sudo` is still spawned; if the Vultr image lacks `sudo` (very-minimal Ubuntu cloud image), the SSH call fails immediately with `sudo: command not found`. Not currently observed.
- **Severity:** low

---

### services/provisioning/src/index.ts

#### Block 42: Auth middleware — lines 68-75
- **Axis A:** 1 — synchronous string compare
- **Axis B:** 1
- **Axis C:** 1
- **Axis D:** N/A
- **Axis E:** **Note:** uses `===` for token compare → timing-attack surface. Provisioning is internal-only (called by Supabase Edge Functions) so not customer-facing. Acceptable.
- **Severity:** low

#### Block 43: `process.exit(1)` if missing AUTH_TOKEN — line 34
- Clean fail-fast on misconfiguration. Good.
- **Severity:** low

#### Block 44: refreshEnvStore conditional construction — lines 152-157
- **Axis B:** 2 — silently returns 500 with `internal` error if Supabase env vars missing, rather than failing at boot. Means a deploy with partial env config doesn't fail fast.
- **Severity:** low
- **Recommended fix:** consider making Supabase env vars MANDATORY at boot (process.exit(1) if missing) like AUTH_TOKEN

---

## Standing memory bumps (for future Sesi A's)

1. **Any new heredoc in setup-script.ts MUST be tested in the Docker harness.** TypeScript template literal + bash heredoc nesting is the highest-risk quoting surface (see Blocks 5, 6, 7, 29). The base64-encode-then-decode pattern (Block 9) is the safe one — prefer it.

2. **Any new `||` or `2>/dev/null` is a silent-fail.** Default to fatal (`exit N`) unless the failure is genuinely cosmetic (and document why in a comment). HF-2 demonstrated the value: pre-HF-2 there were 4+ `|| log "non-fatal"` chains that masked real customer issues.

3. **TypeScript template literals interpolated into bash double-quoted strings have TWO escape layers** — JSON-escape rules AND bash double-quote rules. Use `shSingleQuote()` only when the OUTER context is a bash single-quote. Use base64-encode-then-decode when escape complexity exceeds 2 layers (e.g., `bundlePullScriptB64` at line 488).

4. **The setup-script SSH return code only tells you "exit code 0 was reached"** — it does NOT prove `/opt/weuseai/ready` was written or systemd is active. The DB row flip to `running` (customer-flow.ts:310) should be paired with a separate readiness check.

5. **Heartbeat file mtime is the only liveness signal during setup-script.** A future change to setup-script.ts's heartbeat function (Block 1) must preserve the 30-sec cadence or the parent-side watcher needs updating.

6. **`hermes-gateway` is the only systemd unit we install.** All `systemctl restart` / `is-active` calls assume this. If we ever ship a second unit (e.g., for a separate worker process), the pre-approve + refresh-env restart logic needs to know about both.

7. **The fleet SSH private key is the same across the entire fleet.** Compromise of `FLEET_SSH_PRIVATE_KEY` = compromise of every customer's VPS. This is documented architecture but worth flagging.

8. **Setup-script runs as root (via `sudo bash -s`).** Most steps use `sudo -u weuseai` to drop down. Be careful when adding new steps to remember which user-context they need.

---

## What's already prevented

### Axis A (hang risk)
- HF-2: `timeout 90` / `timeout 180` on apt operations (setup-script Block 3)
- HF-2: `timeout 600` on Hermes install + inner `--max-time 30` on curl
- HF-2: `timeout 30` on `hermes --version` verification (Block 12)
- Existing: `setTimeout(() => proc.kill('SIGKILL'), timeoutMs)` in ExecSshProvisioner (Block 40)
- Existing: 60-sec timer in refresh-env defaultRunSsh
- Existing: ipPollTimeoutMs + sshReadyTimeoutMs in customer-flow (default 5 min each)

### Axis B (silent-fail risk)
- HF-2: gateway install + start are now FATAL with `exit 9` / `exit 10` (setup-script Block 13/14)
- Existing: `set -e` + `set -u` + `set -o pipefail` at top of setup-script (line 576-578)
- Existing: customer-flow catches setup-script failure → sets `status='failed'`

### Axis C (quoting risk)
- Existing: `shSingleQuote()` helper for OUTER-single-quote contexts (setup-script line 325)
- Existing: `shellSingleQuote()` helper in refresh-env (line 353)
- Existing: base64-encode for bundle-pull-script body (setup-script line 488)
- Existing: telegram_chat_id validated digits-only at refresh-env line 252
- Existing: telegram_user_name sanitized at refresh-env line 257

### Axis D (network dependency)
- HF-2: hard timeout on Hermes install (PyPI)
- Existing: `--max-time 30` on bundle-fetch curl
- Existing: `--max-time 60` on bundle download curl
- Existing: failover provider (Vultr + DO) in customer-flow

### Axis E (state inconsistency on partial failure)
- Existing: customer-flow sets `status='failed'` on background-provision failure
- Existing: refresh_env_requests records request_id + outcome for audit + dedup
- HF-2d: gateway install moved out of `hasTelegram` gate, eliminating the race with refresh-env's install-if-missing block
- Existing: refresh-env's `installIfMissingBlock` self-heals pre-HF-2d customers

### Currently-observed non-blocking warnings (founder context)

1. **`OPENAI_BASE_URL is set but model.provider is 'openrouter'`** — flagged here as **axis E (state) severity low**. Chat path verified working today; aux-task path (title generation, context summarization) may silently produce no output but doesn't block customer chat. Worth fixing in a future cleanup PR by aligning `config.yaml` provider setting with the env, but **not** a release blocker.

2. **`No user allowlists configured`** — flagged here as **axis E (state) severity low**. Fires because `TELEGRAM_ALLOWED_USERS=${p.telegramAllowedUserIds ?? ''}` is empty at first spinUp (xendit-webhook path). Self-heals once complete-onboarding's refresh-env writes the customer's chat_id. Customer's first /start works because of the `pre-approve` block (refresh-env Block 30). No action needed.

---

## Findings prioritized

| # | File / block | Severity | Axis | Description | Fix proposal |
|---|---|---|---|---|---|
| 1 | setup-script.ts halo curl (lines 364-377) | medium | A, C | No `--max-time` on halo curl; single-quote-fragile JSON payload | `--max-time 15` + write JSON to tmpfile and `--data @file` |
| 2 | setup-script.ts `.env` heredoc (lines 644-651) | medium | C, E | TypeScript-template-literal-interpolated body into bash heredoc; closing-delimiter collision possible | base64-encode envFileBody like bundlePullScriptB64 |
| 3 | setup-script.ts SOUL.md heredoc (lines 653-656) | medium | C, E | Same heredoc-delimiter-collision risk; persona content could in theory contain the delimiter | base64-encode SOUL_MD |
| 4 | setup-script.ts cron-add nested quotes (line 439) | medium | C | Triple-nested `'…"…${shSingleQuote(…)}…"…'` quoting | Feed cron prompt via stdin or tmpfile |
| 5 | setup-script.ts apt timeouts (lines 622-631) | medium | A, D | 90/180 sec may be tight for slow SGP mirrors | Bump to 120/240 + retry-once |
| 6 | customer-flow.ts setup-script success flip (lines 308-310) | medium | B, E | DB row flips to `running` based only on SSH exit 0, no post-check | Add `test -f /opt/weuseai/ready && systemctl is-active hermes-gateway` over SSH before flip |
| 7 | refresh-env.ts SOUL.md heredoc (lines 231-241) | medium | C, E | Same heredoc-delimiter-collision risk | base64-encode soulMdContent |
| 8 | refresh-env.ts is-active polling (lines 336-341) | medium | A, E | Single `sleep 2` then is-active check; false-positive on slow-boot | Poll up to 30 sec instead of single check |
| 9 | bundle-pull-script.ts JSON payload manual quoting (lines 121-151) | medium | C | Hand-built JSON with bash variable interpolation | Build JSON via python3 (already a dependency) |
| 10 | bundle-pull-script.ts manifest python exit code (lines 170-192) | medium | B, E | Python parse failure silently produces empty filter → reports success | Check python3 exit code, propagate failure |
| 11 | restart-hermes.ts no timeout on exec (lines 153-170) | medium | A | `defaultExec` has no overall timeout | Mirror refresh-env's 60-sec setTimeout(kill) pattern |
| 12 | customer-flow.ts SSH timeoutMs (line 292) | medium | A | 12 min may be tight after HF-2 timeouts stack | Bump to 15 min |
| 13 | setup-script.ts gateway install no timeout (Blocks 13/14) | low | A | No `timeout` wrap on `gateway install` / `start` | Wrap each with `timeout 60` |
| 14 | restart-hermes.ts host-key option (line 123) | low | C | `accept-new` differs from refresh-env's `no` + `/dev/null` pattern | Mirror refresh-env's pattern |
| 15 | bundle-pull-script.ts chown failure (line 307) | low | B | `chown` failure silently swallowed; Hermes can't read bundle | Add error check |
| 16 | setup-script.ts heartbeat first-30s gap (lines 604-607) | low | E | File exists but is empty until first loop iteration | Seed file before fork |
| 17 | setup-script.ts pubkey JSON.stringify (line 559) | low | C | Theoretical break if pubkey comment contains `"` | Strip comment field before JSON.stringify |
| 18 | refresh-env.ts ssh runner 60-sec timeout (line 382) | low | A | Tight if install-if-missing path runs | Bump to 90 sec when install branch known to fire |
| 19 | OPENAI_BASE_URL vs provider mismatch warning | low | E | Aux-task path silently degrades | Align config.yaml provider with env |

---

## What Docker harness should cover (top 15 scenarios)

The Phase 3 Docker harness should exercise these scenarios end-to-end against a freshly-built Ubuntu 22.04 LTS container that simulates a customer VPS post-`vps.create()`. Each scenario takes the script output of `buildSetupScript(params)`, pipes it to `sudo bash -s`, and asserts post-conditions.

1. **Happy path with bundle, Telegram token, full env** — verify `/opt/weuseai/ready` exists, `hermes-gateway` is active, `.env` has all 8+ keys, SOUL.md byte-matches input, agent-pack symlinks exist in `~/.hermes/skills/`.

2. **Happy path WITHOUT Telegram token** (first xendit-webhook spinUp pathway) — verify gateway is INSTALLED but NOT started, no cron added, no halo ping attempted. This catches HF-2d regressions.

3. **Heredoc-injection: SOUL.md content containing `WEUSEAI_SOUL_EOF`** — assert setup-script fails OR successfully writes a SOUL.md byte-matching input. Today this would corrupt the file silently.

4. **Heredoc-injection: env value containing literal newline** — pass a `telegramBotToken` with embedded `\n`. Assert setup-script either fails loud or successfully writes only the intended key=value.

5. **Bundle base64 corruption** — pass a 100-byte garbage `bundleTarBase64`. Assert `set -o pipefail` catches the tar failure, setup-script exits non-zero.

6. **Bundle pull failure simulation** — mock the bundle-fetch Edge Function to return 503. Assert weuseai-bundle-pull returns exit 0 (per SLA), records `storage_unavailable` to telemetry, Hermes still boots with bootstrap skill.

7. **Apt timeout simulation** — `iptables -A OUTPUT -d archive.ubuntu.com -j DROP` then run setup-script. Assert `exit 5` fires after 90 sec.

8. **Hermes install timeout simulation** — `iptables -A OUTPUT -d files.pythonhosted.org -j DROP`. Assert `exit 7` fires after 600 sec.

9. **Hermes binary present but `--version` hangs** — replace `~/.local/bin/hermes` with a script that `sleep 60`. Assert `exit 8` fires after 30 sec.

10. **`hermes gateway install` exit non-zero** — replace with a script returning exit 1. Assert `exit 9` fires.

11. **Re-run idempotency** — run setup-script twice. Assert second run is a no-op (weuseai user exists, .env unchanged, etc.) and exits 0 with the ready marker still present.

12. **Heartbeat liveness** — start setup-script in background, tail `/var/log/hermes-install.heartbeat` for 90 sec, assert it updates every 30 sec ±5 sec.

13. **Refresh-env SOUL.md replacement with delimiter collision** — invoke `buildRefreshEnvCommand` with `soulMdContent` containing `WEUSEAI_SOUL_REFRESH_EOF`. Assert command fails fast.

14. **Refresh-env restart with hermes-gateway stuck `activating`** — replace systemctl with a stub that returns `activating`. Assert single-shot is-active check produces exit 3 (`hermes_inactive_after_restart`), then verify a polling fix would catch the true-active state.

15. **Restart-hermes SSH key edge cases** — pass `FLEET_SSH_PRIVATE_KEY` with no trailing newline, with `\r\n` line endings (Windows-paste), with extra blank lines. Assert all three normalise to a working key file.

**Bonus (nice-to-have, lower priority):**

16. Fleet pubkey idempotency — run setup-script twice with the same pubkey, assert `authorized_keys` has exactly one matching line.

17. Multi-persona bundle install — pass `agentSlugs: ['the-pro', 'doc-expert', 'slide-master']`, mock the bundle-fetch Edge Function to return distinct version strings per slug, assert all three bundles install to `/var/lib/weuseai/bundle/<slug>/<version>/`.

18. Halo curl with single-quote in liveness text — temporarily edit `LIVENESS_PING_TEXT` to include `'`, assert curl either escapes correctly OR setup-script fails loud (today: silent fail).

19. SSH session interrupt mid-Hermes-install — kill the SSH session at second 200 of the 600-sec install. Assert customer-flow records `status='failed'`, no orphan child processes left in the container.

20. Concurrent refresh-env + setup-script — fire `/refresh-env` while setup-script's Hermes install is mid-flight. Assert no race (HF-2d's gateway-always-install should prevent it; verify).

These 15-20 scenarios cover the bulk of the audit's medium-severity findings and provide regression protection for the four PR-#83/#84/#85 fixes. Add to the harness one-at-a-time, starting with scenarios 1, 2, 6, 12 (happy paths + heartbeat + bundle failure mode) which give the highest ratio of confidence-per-LOC of test setup.
