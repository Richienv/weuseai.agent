# Known operational risks

> Living document. Each entry: pattern → impact → mitigation → forward-looking concern.
> Add new entries top-down (newest first). Don't delete entries when "fixed" — record the fix as a follow-up bullet so the historical context survives.

---

## Floating IP orphan leak (caught 2026-05-08)

**Pattern.** When a VPS is deleted via the IDCloudHost API, attached Floating IPs are NOT auto-released. They sit unassigned on the billing account and continue to accrue ~Rp 40k/IP/month silently. The IDCH dashboard surfaces this in the Network tab but the VM tab and billing summary don't flag it.

**Impact.** 13 orphan IPs from Phase 2A development churn leaked ~Rp 520k/month (≈ Rp 17k/day) for ~5 days before founder noticed via balance ticker — ~Rp 100k silent burn. Founder caught it during the Phase 2E-2 IDCH top-up (2026-05-08) by manually clicking through the Network tab.

**Mitigation in this PR — DETECTION ONLY, manual release required.**

`scripts/cleanup-orphan-vms.ts --include-ips` lists every Floating IP in the account and flags as orphan anything that's (a) not soft-deleted, (b) not currently attached to a VM, and (c) past a 30-minute grace window. It prints a "next step" pointing the operator to the IDCH dashboard.

**It does NOT release IPs.** IDCloudHost's public API does not expose programmatic IP release as of 2026-05-08:

- `DELETE /v1/network/ip_addresses?uuid=<id>` → HTTP 405 Method Not Allowed (`Allow: GET, POST`).
- `POST /v1/network/ip_addresses` with form body → HTTP 415 Unsupported Media Type.
- `POST /v1/network/ip_addresses` with JSON body → **allocates a new IP** (this is how I burned 4 fresh orphans during endpoint discovery on 2026-05-08; the JSON POST endpoint is the IP-allocation endpoint, not a release endpoint).
- No documented `/release` sub-path — every variant returns "no route and no API found."

The dashboard at `console.idcloudhost.com → Network → Floating IPs → Release` is the only known release path. CORS on the IPs endpoint advertises `console.idcloudhost.com` as the only allowed origin, hinting that release is intentionally dashboard-gated.

**Recommended cron pattern:** the script in detection-only mode is still useful as a daily nag. It surfaces the leak; the founder runs it nightly and clicks through the dashboard once a week to drain the queue.

```sh
# /etc/cron.d/weuseai-cleanup — nightly, detection-only
0 3 * * * weuseai cd /path/to/velorah && \
  IDCLOUDHOST_API_KEY=... \
    tsx scripts/cleanup-orphan-vms.ts --include-ips \
    >> /var/log/weuseai-cleanup.log 2>&1
```

If output flags > 0 orphans, an email/Telegram nudge to the operator is the right escalation. (Phase 3 add-on.)

**Forward-looking concerns.**

1. **Phase 3 (customer cancellation).** When real paying customers run Phase 2A (`spinUpAgent` → IDCH VM), customer cancellation must trigger linked-resource cleanup. The current API doesn't support automated IP release, so the cancellation flow's options are:
   - Surface the orphan to ops via dashboard nag (manual release).
   - Try a "tar pit" — keep the VM stopped instead of deleted so the IP stays attached and pause billing somehow (probably won't actually pause IDCH billing).
   - Open a support ticket with IDCH for an IP-release API endpoint.
2. **Failure modes the cancellation flow will need to cover** (in roughly increasing rarity):
   - VM deleted → Floating IP retained → silent monthly burn (the pattern above).
   - VM deleted → boot disk retained as a snapshot → silent storage burn (suspected, untested).
   - VM never spawned (provisioning aborted mid-flight) → Floating IP allocated but never attached → silent.
3. **Phase 3 task:** an asserts-against-leak integration test that creates a customer, cancels them, and confirms IDCH `vm/list + ip_addresses` has zero un-flagged records bearing their tag. Even if release is manual, the test should at least confirm cleanup-orphan-vms.ts surfaces them.

**2026-05-08 self-inflicted addendum.** During Phase 2E-2 smoke prep, Claude probed for an IP-release endpoint by sending JSON POSTs to `/v1/network/ip_addresses` with various release-shaped bodies. The POSTs timed out from a flaky local network — Claude assumed they failed. They didn't: each one allocated a new IP. Net result: 4 fresh orphans on top of the existing 2. Founder cleaned all 6 via dashboard.

> **Rule (locked, agent-facing):** Never POST to an unknown REST endpoint with resource-creation-shaped paths (collection nouns like `/users`, `/vms`, `/ip_addresses`) without first probing GET-only or known-idempotent ops. The endpoint name plus verb `POST` is the unambiguous "this allocates" signal. If GET-then-DELETE returns 405 and there's no documented `/release` sub-path, **stop probing**: assume the operation is dashboard-only and ask the operator. Trying alternate POST bodies to discover a hidden release path is how you allocate orphans by accident.

---
