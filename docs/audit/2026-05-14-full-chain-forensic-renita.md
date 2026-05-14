# Full-Chain Forensic — Renita (cid `42c024ce`)

**Date:** 2026-05-14
**Customer:** Renita / kdwb.co@gmail.com (founder testing-as-customer; chat_id 6805409051 = RICHIE_CHAT_ID)
**VPS:** `45.76.176.206` Vultr SGP `liren-42c024ce-271600`
**Subscription:** `f3161c54-3078-4a16-abf8-5eecae3016ea` (active, tier `pro`, started 2026-05-14T06:47:36 UTC)
**Brief:** founder reported customer flow has NEVER worked end-to-end across multiple test sessions. Full-chain forensic to find where it breaks.

---

## TL;DR

**First-fail stage: A3 (Hermes start).** The gateway is INSTALLED but never STARTED. Architectural race: setup-script defers `systemctl start hermes-gateway` to a follow-up `refresh-env` call from `complete-onboarding`, but `refresh-env` fires ~2 min after VPS creation — BEFORE setup-script finishes (~7 min in). SSH connection refused → refresh-env errors → no retry → hermes-gateway stays inactive forever. Customer's bot never polls Telegram.

This is **not a recent regression**. The architecture has been brittle since the HF-2d commit (2026-05-13) that split first-spinUp from gateway-start. Today's symptom (`ssh_unreachable`) is just one of several manifestations — 2026-05-12 saw `ssh_auth_failed` on a different VPS. The cascade PRs #91–117 didn't introduce the bug, but they also didn't catch or fix it because front-end smoke can't see the post-pairing service state.

**Renita's current VPS is healthy and SSH-reachable RIGHT NOW.** A single manual `refresh-env` call (or an equivalent `systemctl start hermes-gateway` after pushing the bot token) would unstick her. Founder approval requested before salvage (Phase C).

---

## Stage-by-stage evidence

### Stage 1 · Payment — ✅ PASS

Evidence collected from Supabase service-role queries.

| Check | Result |
|---|---|
| Customer row exists for `kdwb.co@gmail.com` | ✅ id=`42c024ce-a4d6-4374-8dcf-1e396ae9e750`, created 2026-05-10 |
| Latest subscription created | ✅ id=`f3161c54-3078-4a16-abf8-5eecae3016ea`, status=`active`, hosting_active=`true`, started 2026-05-14T06:47:36 |
| Xendit invoice referenced | ✅ `6a0570080168694c2c2d0ceb` (staging — Xendit test-mode is separate P0 from PR #117 smoke finding) |
| ToS consent persisted | ✅ row id=`dd0759d4-...`, accepted_at=2026-05-14T06:47:34 |
| Marketing consent persisted | ✅ row id=`4bf8a722-...`, accepted_at=2026-05-14T06:47:34 |
| Webhook IP captured | ✅ `103.54.154.4`, Chrome/147 user-agent |

**Stage timing:** 0 sec → subscription + consent rows.

### Stage 2 · VPS provisioning — ✅ PASS

| Check | Result |
|---|---|
| vps_instances row created | ✅ id=`a2b66271-...`, vps_id=`d8b65dba-090b-4678-a671-366f804d9d52`, provider=`vultr`, region=`sgp`, ip=`45.76.176.206`, status=`running`, created 2026-05-14T06:47:55 |
| Public IP reachable (ICMP) | ✅ 3/3 packets, ~290ms RTT (consistent with SGP from US tester) |
| TCP port 22 (SSH) open | ✅ |
| TCP port 80 / 443 / 8080 open | ✅ all three |
| SSH login as `weuseai` works with `~/.ssh/weuseai-fleet` | ✅ uid=1001, group=sudo |
| SSH login as `root` works | ✅ |
| `uname -a` / `uptime` | ✅ Linux 5.15 Ubuntu 22.04, 23 min uptime |

**Stage timing:** ~20 sec → vps_instances row written; cloud-init completed by 06:49:52 (3 min after VPS create).

### Stage 3 · Hermes install — ⚠️ PARTIAL (install OK, START FAILED)

**3a. Install: ✅ PASS**

| Check | Result |
|---|---|
| `/home/weuseai/.hermes/` directory tree | ✅ all subdirs present (agent-pack, hermes-agent, hooks, image_cache, logs, memories, pairing, sessions, skills) |
| `/home/weuseai/.hermes/SOUL.md` | ✅ 3638 bytes, persona content present |
| `/home/weuseai/.hermes/.env` | ✅ 594 bytes — but see Stage 3b for what's MISSING from it |
| `/home/weuseai/.hermes/config.yaml` | ✅ 56236 bytes |
| `/home/weuseai/.local/bin/hermes` wrapper script | ✅ 117 bytes (exec into venv) |
| Hermes version | ✅ `Hermes Agent v0.13.0 (2026.5.7)` (matches CLAUDE.md pin) |
| Skills synced | ✅ "87 new, 0 updated, 0 unchanged. 87 total bundled." per setup log |
| `/var/log/weuseai-setup.log` final line | ✅ `[06:55:27] === weuseai setup COMPLETE ===` |

**3b. systemd unit registration: ✅ PASS**

| Check | Result |
|---|---|
| `/etc/systemd/system/hermes-gateway.service` | ✅ file exists, dated 06:55:27 |
| `/etc/systemd/system/multi-user.target.wants/hermes-gateway.service` symlink | ✅ unit enabled |
| Drop-in `/etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf` | ✅ ExecStartPre wired to `/usr/local/bin/weuseai-bundle-pull` |
| `/usr/local/bin/weuseai-bundle-pull` script | ✅ 9930 bytes |

**3c. systemd unit name mismatch with CLAUDE.md — non-fatal but worth noting**

CLAUDE.md (top-level project brief) says:
> systemd unit `hermes-agent.service` (`ExecStart=/home/weuseai/.local/bin/hermes gateway start`, `Restart=always`)

Reality:
> Unit name: `hermes-gateway.service`
> ExecStart: `/home/weuseai/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --replace`

The CLAUDE.md doc is stale — fix it in lockstep with the next CLAUDE.md edit.

**3d. systemd unit START: ❌ FIRST FAIL**

| Check | Result |
|---|---|
| `systemctl is-active hermes-gateway` | ❌ `inactive (dead)` |
| `ps aux | grep hermes` | ❌ no running process |
| Listening ports | ❌ only 22 (SSH) + 53 (systemd-resolve); no Hermes gateway port |
| `/home/weuseai/.hermes/logs/agent.log` | ❌ EMPTY (0 bytes) — gateway never started |
| `/home/weuseai/.hermes/logs/errors.log` | ❌ EMPTY |
| `/var/log/weuseai-bundle-pull.log` | ❌ does not exist — ExecStartPre never fired (gateway never started) |
| `journalctl -u hermes-gateway` | ❌ only 2 lines, both from unit-file LOAD at 06:55:27 (config parse warnings). Zero start attempts. |

**Setup-script's own log explains why** (last 3 lines of `/var/log/weuseai-setup.log`):

```
[06:55:27] No TELEGRAM_BOT_TOKEN at first spinUp — gateway installed but not started.
[06:55:27]   complete-onboarding step 8a will start it once customer pairs.
[06:55:27] === weuseai setup COMPLETE ===
```

The setup-script intentionally **defers `systemctl start hermes-gateway`** to a follow-up `refresh-env` call from `complete-onboarding` — because the bot token isn't passed to the first spinUp (see `supabase/functions/_shared/xendit-webhook-handler.ts:160` explicitly setting `customerTelegramBotToken: ''`).

**The defer-and-resume handshake is broken.** Evidence: `refresh_env_requests` table for cid `42c024ce`:

| started_at | outcome | detail |
|---|---|---|
| 2026-05-10T11:07:50 | ✅ ok | TELEGRAM_BOT_TOKEN updated, hermes restarted, active=true (IDCloudHost VPS `103.181.142.20`) |
| 2026-05-12T07:26:51 | ❌ `ssh_auth_failed` | SSH key denied on Vultr VPS `45.76.176.206` (different attempt) |
| **2026-05-14T06:49:36** | **❌ `ssh_unreachable`** | **`ssh: connect to host 45.76.176.206 port 22: Connection refused`** |

The 2026-05-14 attempt fired **2 minutes 41 seconds** after the VPS was created (06:47:55 → 06:49:36). Cloud-init finished at 06:49:52 but the FULL setup-script kept running until 06:55:27 — **5 min 31 sec after refresh-env gave up**.

There is **no retry**. Once refresh-env fails, the customer is permanently stuck unless the founder manually intervenes.

### Stage 4 · Bot registration — ❌ DERIVATIVE FAILURE (caused by Stage 3)

| Check | Result |
|---|---|
| `customers.telegram_bot_token` row present (encrypted) | ✅ base64 blob present, set originally 2026-05-10 |
| `customers.telegram_bot_username` | ✅ `kamis14maybot` |
| Bot token decrypted onto VPS `.env` | ❌ **`TELEGRAM_BOT_TOKEN` is missing from `/home/weuseai/.hermes/.env`** — refresh-env never succeeded, so it was never written |
| Telegram `getMe` works with stored token | ⏸️ NOT TESTABLE — `BOT_TOKEN_ENC_KEY` is on Supabase as write-only secret; no way to decrypt locally without it (would need a service-role-context RPC, which only exists inside Edge Functions) |
| Telegram webhook URL set via `getWebhookInfo` | ⏸️ NOT TESTABLE without decrypted token |

Even if I could decrypt and the token IS valid: hermes-gateway is dead → no process is polling Telegram → no incoming `/start` would be processed.

### Stage 5 · End-to-end messaging — ❌ DERIVATIVE FAILURE

| Check | Result |
|---|---|
| Telegram → webhook received by Edge Function | ❌ N/A — no webhook is registered, no process polling |
| Webhook handler routed to Hermes | ❌ N/A — Hermes process not running |
| Hermes attempted a response | ❌ logs empty |
| Response reached Telegram | ❌ N/A |

---

## Root cause analysis

### What's broken (single sentence)

The setup-script defers `systemctl start hermes-gateway` to a `refresh-env` call from `complete-onboarding`, but `refresh-env` fires before setup-script finishes — and when it fails, nothing retries.

### Why the cascade PRs didn't catch this

PRs #91–#117 shipped front-end-only changes (checkout copy, welcome trust signals, A2 error catalog, B2 failure banner, P3 accordion, smoke harness pinned to `weuseai-agent.vercel.app`). The HTTP-only smoke walks ONLY:

1. landing renders
2. /checkout reachable
3. POST /create-invoice
4. invoice_url well-formed
5. /welcome reachable
6. P3 accordion in DOM
7. B2 failure banner in DOM

**Nothing in the smoke ever touches the post-payment service chain.** No SSH check, no `systemctl is-active`, no Telegram getMe, no end-to-end message round-trip. The "Step 5 PASSED" in CI is genuinely correct as far as it tested — but the system isn't done at Step 5. The customer-facing failure happens silently 5+ minutes later when the bot doesn't respond.

This is exactly what the structural-pass closeout (PR #116) warned about under "next-cascade smoke additions":
> Telegram pairing + first /persona response — Closes the full "5-min setup" loop end-to-end — When more than the founder is doing paid signups

That recommendation was a "phase 4 polish" item. Reality: it should have been the FIRST smoke, not a polish.

### Why complete-onboarding's refresh-env raced

`services/provisioning/src/index.ts` (Fly.io provisioning service) exposes `/refresh-env`. When called, it SSHes into the customer's VPS, sed-edits `.env`, and runs `sudo systemctl restart hermes-gateway`. No waiting / no polling for SSH readiness.

The caller (`supabase/functions/_shared/onboarding-provisioning-client.ts`) fires this immediately when complete-onboarding finishes — without checking whether the VPS is ready to accept SSH yet. On a fresh VPS that's still in cloud-init / setup-script, this races.

`setup-script.ts` line 405–422 explicitly comments "No race possible" — the assumption being that complete-onboarding only fires AFTER customer pairs, which is AFTER setup-script's window. But for an existing customer whose bot token is already stored in `customers.telegram_bot_token` (like Renita's pre-paired bot from 2026-05-10), complete-onboarding fires immediately on subscription-active, which IS within the setup-script window.

So the architecture works for net-new customers (where pairing takes longer than setup-script) but **fails for existing-customer re-subscriptions** (where the bot token is already stored).

### When did this break?

Renita's three subscription attempts:

| Date | Subscription outcome | refresh-env outcome | Notes |
|---|---|---|---|
| 2026-05-10 | active (later canceled) | ✅ ok | First sign-up, IDCloudHost VPS in JKT, slower provision. refresh-env happened ~5 min after VPS create — outside the cloud-init window. |
| 2026-05-12 | active (later canceled) | ❌ `ssh_auth_failed` | After Vultr cutover (PR #75 on 2026-05-11). New SSH-key flow not properly synced to VPS in this attempt. |
| 2026-05-14 | active (current) | ❌ `ssh_unreachable` | Today's attempt. Vultr SGP is FAST (~3 min from create to SSH-up). refresh-env fired at +2:41 — too early. |

The 2026-05-12 → 2026-05-14 progression shows TWO different failure modes on Vultr. The 2026-05-10 success on IDCloudHost masked the underlying race because IDCloudHost was slow enough that refresh-env's 2-min-after-create timing landed AFTER the VPS was up. Vultr provisions faster → race is exposed.

So this isn't a code regression in the cascade PRs — it's a **pre-existing architectural defect that the Vultr cutover (PR #75, 2026-05-11) exposed by making provisioning fast enough for the race to consistently lose.**

---

## Salvage options for Renita (Phase C — awaiting founder approval)

Renita's VPS is healthy and SSH-reachable right now. Hermes is installed. The only missing piece is "push bot token to .env + start gateway." Three remediations:

| Option | What it does | Risk |
|---|---|---|
| **A. Manual refresh-env** | Call the provisioning service's `/refresh-env` endpoint manually with Renita's cid. Pushes bot token to `.env`, restarts gateway, verifies active. | Low — uses production path. Mirrors what complete-onboarding was supposed to do automatically. |
| **B. Direct SSH push** | SSH in, write `TELEGRAM_BOT_TOKEN=<decrypted>` to `.env`, `sudo systemctl start hermes-gateway`. | Medium — bypasses the production code path. Could mask future regressions. |
| **C. Tear down + re-provision** | Destroy current VPS, trigger fresh spinUp. Real $5/month spend resets. | High — $5 burn, takes ~7 min, doesn't fix the underlying race. Next attempt could fail the same way. |

**Recommended: Option A.** Single CLI command, mirrors production code, validates the salvage path actually works. Output a one-line confirmation message I send via WhatsApp to her.

---

## Recurrence-prevention scope (Phase D + E — after founder approval)

### Phase D — service smoke (the one that should have existed from day one)

A real end-to-end smoke that PROVES the customer flow works:

1. Simulate Xendit success webhook (`xendit-webhook` Edge Function POST with a test invoice)
2. Poll `customers` table for new row
3. Poll `vps_instances` for status=`running`
4. Poll for `setup-script` completion via SSH (look for `=== weuseai setup COMPLETE ===` in `/var/log/weuseai-setup.log`)
5. Poll `refresh_env_requests` for ok outcome
6. Poll `systemctl is-active hermes-gateway` via SSH
7. Bot `getMe` via Telegram API with decrypted token (need Edge Function helper)
8. Send `/start` to bot via Telegram Bot API
9. Poll Telegram for response
10. Send `/the-pro hi` for persona-specific response
11. Tear down: delete VPS, mark customer/subscription test, cleanup rows

**Acceptance:** total < 10 min, all 11 steps must pass, cleanup runs even on failure, idempotent.

**Cost:** ~$5 Vultr/run (1 hour worth of `vc2-1c-1gb`, billed by Vultr at hourly granularity). Daily run = $150/month. Acceptable as the early-warning cost for catching exactly this class of bug.

**CI:** daily scheduled (not per-PR), workflow_dispatch on-demand, Telegram DM on failure.

### Phase E — fix the race

Two architectural options, both should be considered:

1. **Make refresh-env retry-aware.** Add a 5-min retry window with exponential backoff on `ssh_unreachable` / `ssh_auth_failed`. Per-customer queue so 100 customers don't all retry in lockstep.

2. **Bot token in first spinUp.** Reverse the HF-2d split: if `customers.telegram_bot_token` is set at spinUp time (existing customer re-subscribe case), pass it to setup-script and skip the deferred refresh-env entirely. New-customer case stays unchanged (empty token at spinUp, refresh-env after pairing).

Option 2 is the cleaner fix because it eliminates the race entirely for the existing-customer case. Option 1 is a fallback that catches the new-customer-pairs-fast edge.

---

## Founder decision needed before Phase C / D / E

1. **Salvage Renita?** Option A (recommended manual refresh-env), B (SSH direct), C (re-provision), or "leave her stuck for now and rebuild the chain first"?
2. **Phase D priority?** Build the service smoke now (1-2 days of work, ~$5/day standing cost), or fix the regression first then smoke second?
3. **Phase E approach?** Option 1 (retry-aware refresh-env), Option 2 (bot token in first spinUp), or both?
4. **Daily smoke cost ~$5/day acceptable?** Or run weekly ($35/month) to start, ramp to daily once first paying customer arrives?

---

## What I am NOT doing right now

- No code changes shipped — investigation only
- No VPS spin-up / tear-down without founder approval
- No touching Renita's data without founder approval
- No further patches to the cascade until the service-smoke gate is in place
