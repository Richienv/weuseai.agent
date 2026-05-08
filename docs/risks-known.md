# Known operational risks

> Living document. Each entry: pattern → impact → mitigation → forward-looking concern.
> Add new entries top-down (newest first). Don't delete entries when "fixed" — record the fix as a follow-up bullet so the historical context survives.

---

## Direct Postgres connections to Supabase blocked from China (caught 2026-05-08)

**Pattern.** From China-based networks (e.g. founder's Hangzhou primary location), the Great Firewall MITMs the TLS handshake on direct Postgres connections to Supabase. DNS for `db.<project-ref>.supabase.co` and `aws-0-<region>.pooler.supabase.com` resolves to `198.18.1.x` (TEST-NET-2 reserved range — non-routable), and even when overridden, the port-5432/6543 TCP handshake terminates with a TLS EOF error. `supabase db push --linked` fails reliably; `supabase migration list --linked` fails reliably; any `psql` directly against the Supabase host fails reliably.

**Why this matters.** All schema-migration workflows that rely on the Supabase CLI's pg-protocol path are blocked when working from China. The default founder workflow (Hangzhou primary) hits this every time.

**Impact.** Phase 2E-3 Day 3 hit this — Edge Function deploy worked fine (HTTPS:443, unaffected by the block) but `supabase db push --linked` returned `tls error (EOF)` on every retry. ~30 minutes wasted before identifying root cause.

**Mitigation (locked).** Two paths for any future migration on this stack:

1. **Dashboard SQL Editor** — paste the migration SQL into `app.supabase.com → SQL Editor → New query → Run`. Works from any network because the dashboard is HTTPS-only. All our migrations are written to be idempotent (`IF NOT EXISTS` guards) so re-runs are safe.
2. **VPN to a non-China network** — Cloudflare WARP, an SSH tunnel through a non-China VPS, or any commercial VPN. Re-enables the direct pg path. Founder has a paid VPN for this case.

**Forward-looking concerns.**

1. **Production concierge customer onboarding.** Real customers in Indonesia (the target market) won't hit this block. The risk is operator-side only — when the founder applies a migration from China, they need to use the dashboard path. Solo-operator burden, not a customer-facing issue.
2. **Phase 3+ automated migration workflows.** When we wire CI/CD migrations (currently manual), the runner must NOT live in China. GitHub Actions runners (US/EU) are unaffected.
3. **Edge Functions are unaffected.** Anything that lives at `<project-ref>.supabase.co/functions/v1/*` (HTTPS:443) works fine. This means `supabase functions deploy` and any runtime Edge Function call from China works.

**2026-05-08 first incident:** Phase 2E-3 schema migration `20260509000000_phase_2e3_tier_automation.sql` (3 tables — `tier_change_events`, `bundle_pull_attempts_summary`, `cleanup_notifications`) applied via Dashboard SQL Editor in 3 sequential blocks. Tables verified post-apply. `supabase db push` documented in commit `9b50527` as the failed direct path; runbook updated.

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
