# Multi-persona MVP — operational runbook (2026-05-12)

> **Status:** D1 (tier→personas), D2 (default = The Pro), D3 (webhook push, all tiers default `latest`), D4 (personas-only slash commands at MVP) — all locked + shipped on `feat/multi-persona` (PR open against `main`).
>
> **R1 verified:** Hermes upstream auto-routes `/<skill-name>` slash commands to `~/.hermes/skills/<name>/SKILL.md`. Confirmed on Renita's Vultr SGP VPS (45.76.163.93), 2026-05-12 — `/trade-pro` invocation returned the Trade Pro disclaimer line verbatim per its SKILL.md instruction.

---

## What this runbook covers

1. How a customer's Hermes ends up with N persona-shell SKILL.md files
2. How an admin ships a persona version bump
3. How to roll a customer back to a pinned version
4. How to verify multi-persona is working on a customer's VPS
5. Known issues + their workarounds

---

## 1. How multi-persona reaches a customer's VPS

Boot-time flow (every Hermes restart triggers this):

```
[Hermes systemd unit]
  ├── ExecStartPre=+/usr/local/bin/weuseai-bundle-pull   (D1: loops over slugs)
  │     ├── Reads /home/weuseai/.hermes/.env
  │     │     - WEUSEAI_AGENT_SLUGS=the-pro,doc-expert,slide-master,...
  │     │     - WEUSEAI_TIER=pro
  │     │     - WEUSEAI_CUSTOMER_ID=<uuid>
  │     ├── For each slug:
  │     │     ├── POST $SUPABASE_URL/functions/v1/bundle-fetch
  │     │     │   { customer_id, agent_slug } → { version, signed_url }
  │     │     ├── Download $signed_url → /var/lib/weuseai/bundle/<slug>/<version>/
  │     │     ├── apply_tier_filter() — copy enabled-skill SKILL.md files into
  │     │     │   /home/weuseai/.hermes/skills/<id>/SKILL.md
  │     │     └── Persona-shell SKILL.md (at bundle's top-level <slug>/SKILL.md)
  │     │         gets copied to /home/weuseai/.hermes/skills/<slug>/SKILL.md
  │     │         → exposes /<slug> slash command
  │     └── Logs telemetry to bundle_pull_attempts (one row per slug)
  └── ExecStart=hermes gateway start --system
        └── Hermes discovers skills via rglob over ~/.hermes/skills/<id>/SKILL.md
            → Every installed SKILL.md is automatically /<id> slash command
```

**Steady state for a Pro-tier customer:**
- `~/.hermes/skills/the-pro/SKILL.md` → `/the-pro`
- `~/.hermes/skills/doc-expert/SKILL.md` → `/doc-expert`
- `~/.hermes/skills/slide-master/SKILL.md` → `/slide-master`
- `~/.hermes/skills/deep-researcher/SKILL.md` → `/deep-researcher`
- `~/.hermes/skills/trade-pro/SKILL.md` → `/trade-pro`
- `~/.hermes/skills/project-conductor/SKILL.md` → `/project-conductor`
- `~/.hermes/skills/video-producer/SKILL.md` → `/video-producer`
- `~/.hermes/skills/social-conductor/SKILL.md` → `/social-conductor`
- + the sub-skills each persona pack defines (daily-news-briefing-bahasa, invoice-generator, etc.)

A bare message (no `/<slug>` prefix) is handled by `/the-pro` (D2 default).

---

## 2. Shipping a persona version bump (D3 webhook push)

When a persona pack ships a new version:

### Step 1 — Build + publish the bundle to Storage

```bash
# From repo root, on a clean branch with the new pack version:
cd agent-packs/doc-expert
tar -czf doc-expert-v2.0.1.tar.gz SOUL.md SKILL.md manifest.json skills/ templates/

# Upload via Supabase Storage (admin task):
# Bucket: bundles/  Path: bundles/doc-expert/2.0.1.tar.gz
# (See supabase/functions/_shared/bundle-publish-handler.ts for the path scheme)
```

### Step 2 — Bump the manifest version + commit

Update `agent-packs/doc-expert/manifest.json` → `"version": "2.0.1"`. PR + merge.

### Step 3 — Broadcast

```bash
curl -X POST "https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/bundle-version-bump-broadcast" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_slug": "doc-expert",
    "new_version": "2.0.1",
    "reason": "publish"
  }'
```

**Response shape:**
```json
{
  "ok": true,
  "agent_slug": "doc-expert",
  "new_version": "2.0.1",
  "matched": 3,
  "restarted": 2,
  "failed": 0,
  "skipped_tier": 1,
  "per_customer": [
    { "customer_id": "a3827996-...", "tier": "pro", "status": "restarted" },
    { "customer_id": "b...",         "tier": "pro", "status": "restarted" },
    { "customer_id": "c...",         "tier": "starter", "status": "skipped_tier" }
  ]
}
```

### Step 4 — Verify

```sql
-- Recent broadcasts (last hour)
select agent_slug, status, count(*)
from bundle_version_broadcasts
where broadcast_at > now() - interval '1 hour'
group by 1, 2;

-- Boot-side pulls that landed the new version
select agent_slug, version_installed, status, count(*)
from bundle_pull_attempts
where attempted_at > now() - interval '5 minutes'
group by 1, 2, 3;
```

---

## 3. Rolling a customer back to a pinned version

If a v2.0.1 ships with a bug and you want to freeze a specific customer on v2.0.0:

```sql
update customers
set bundle_versions = jsonb_set(
      coalesce(bundle_versions, '{}'::jsonb),
      '{doc-expert}',
      '"2.0.0"'
    ),
    bundle_update_policy = 'pin'
where id = '<customer_uuid>';
```

Then trigger restart manually:
```bash
curl -X POST "$PROVISIONING_URL/restart-hermes" \
  -H "Authorization: Bearer $PROVISIONING_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "customer_id": "<customer_uuid>", "reason": "manual-rollback-doc-expert-v2.0.1" }'
```

To re-enable auto-updates after the fix ships:
```sql
update customers
set bundle_versions = bundle_versions - 'doc-expert',
    bundle_update_policy = 'latest'
where id = '<customer_uuid>';
```

---

## 4. Verifying multi-persona on a customer's VPS

### Quick check via SSH

```bash
# From a host with the fleet SSH private key:
ssh -i ~/.ssh/weuseai-fleet root@<vps_ip>

# Inside the VPS:
su - weuseai -c '~/.local/bin/hermes skills list' | grep local
# Should show 8+ rows (8 Pro-tier personas + sub-skills like daily-news-briefing-bahasa)

# Inspect installed persona-shell SKILL.md files:
ls /home/weuseai/.hermes/skills/

# Confirm the multi-slug env line is present:
sudo cat /home/weuseai/.hermes/.env | grep WEUSEAI_AGENT_SLUGS

# Watch a fresh boot pull (after triggering restart):
sudo systemctl restart hermes-gateway
sudo journalctl -u hermes-gateway -n 100 --no-pager | grep weuseai-bundle-pull
sudo cat /var/log/weuseai-bundle-pull.log | tail -50
```

### One-shot slash-command smoke test

```bash
# Inside the VPS:
su - weuseai -c '~/.local/bin/hermes -z "/the-pro Apa voice signature kamu?" 2>&1' | tail -10
su - weuseai -c '~/.local/bin/hermes -z "/trade-pro Sebutkan disclaimer wajib." 2>&1' | tail -10
```

If both produce **distinct, in-character** responses → multi-persona is working.

### From the customer's actual Telegram

(Founder smoke-test path — verifies the end-to-end UX):
- Open the customer's bot in Telegram
- Send `/the-pro hi` → should respond in The Pro voice
- Send `/trade-pro hi` → should respond with the Trade Pro disclaimer
- Send a bare message like `halo` → should be handled by The Pro (D2 default)

---

## 5. Known issues + workarounds

### Issue: BotFather slash-command menu not auto-populated

When a customer types `/` in Telegram, BotFather's slash menu shows only what's configured via `/setcommands`. Hermes routes `/<slug>` correctly regardless, but the visual menu won't list the persona slugs unless we explicitly populate it.

**Workaround for MVP:** customers type the slug literally (`/the-pro`, `/web-app-builder`). Document in onboarding step 4 / welcome email.

**P1 (post-launch):** add a setup-script step that runs `hermes commands list --as-bot-father` or similar to publish the customer's persona slug menu to BotFather.

### Issue: Slug collision risk between persona-shell and persona-sub-skill

If a persona pack accidentally has a sub-skill with the same name as a top-level persona (e.g., `web-app-builder/skills/web-app-builder/SKILL.md`), bundle-pull's `apply_tier_filter` and the persona-shell-install step both target the same destination path. Last-writer-wins (the persona-shell copy happens after the sub-skill loop, so the shell wins).

**Mitigation:** drift test `tests/persona-shell-skill.spec.ts` enforces persona-shell presence; an additional check should prevent sub-skill names from colliding with persona slugs. Tracked for Phase 2.

### Issue: BD slug is verbose

`/all-in-one-business-agent` is 28 chars — long to type. Founder marked this as "or similar TBD" in the cascade brief. Shortening to `/aio` or `/business-agent` is a one-PR follow-up if friction shows up in usage data.

### Issue: One-shot `hermes -z` mode bypasses the gateway

The smoke-test command `hermes -z "/the-pro ..."` runs a fresh chat session per call. It does NOT exercise the Telegram → gateway → skill-routing path; it exercises only the LLM → SKILL.md routing. The Telegram-side routing was the original R1 question — verified independently via the test-skill installation + Hermes `skills list` showing `2 local` immediately after file creation (no daemon reload needed).

### Issue: SSH restart visible to customer

`sudo systemctl restart hermes-gateway` causes a ~5-10 sec window where Hermes isn't long-polling Telegram. Customer messages sent during that window are queued by Telegram (since the bot has no webhook → fallback to long-poll) and delivered when Hermes comes back. No data loss, but customer might see a delayed response.

**Mitigation:** schedule version-bump broadcasts during low-usage hours (e.g., 03:00 WIB cron). MVP doesn't enforce — admin discretion.

---

## 6. Tier-personas map (D1 lock)

| Tier | Personas (slash commands available) |
|---|---|
| **Starter** | `/the-pro`, `/doc-expert`, `/slide-master` |
| **Pro** | Starter + `/deep-researcher`, `/trade-pro`, `/project-conductor`, `/video-producer`, `/social-conductor` |
| **Studio** | Pro + `/web-app-builder`, `/all-in-one-business-agent` |

Source of truth: `supabase/functions/_shared/tier-personas.ts`. Adding / removing a persona from a tier requires updating this file + bumping affected customer VPSes via broadcast.

---

## 7. Renita's migration state (2026-05-12)

- `customer_id`: `a3827996-c2d7-4254-a92d-7bf74616e27b`
- Subscription tier: `pro` / status: `active`
- `bundle_versions`: `{}` (empty — bundle-fetch falls back to v1.0.0 per Phase 2E-2 default)
- `bundle_update_policy`: `latest` (flipped from `pin` 2026-05-12 per D3 lock)
- VPS: Vultr SGP `45.76.163.93`

Manual smoke test performed pre-merge:
- 8 Pro-tier persona-shell SKILL.md files uploaded via scp + installed to `~/.hermes/skills/<slug>/SKILL.md`
- `hermes skills list` confirms 9 local skills (8 personas + daily-news-briefing-bahasa)
- `/the-pro` and `/trade-pro` produce distinct in-character responses
- Hermes auto-discovery requires zero restarts — file presence at the right path is enough

After PR merge, Renita's next provisioning event (or manual restart-hermes call) will trigger the multi-bundle bundle-pull cycle and replace the manually-installed shells with the canonical bundle-pulled versions.

---

## 8. Sesi D pass-3 trigger update

New attack surface introduced by this cascade:

1. **`POST /restart-hermes` on provisioning service** — bearer-gated, but no per-request HMAC; an attacker with the auth token can restart any customer's Hermes. Mitigation: provisioning bearer is in Fly secrets only. Hardening recommendation: add HMAC over customer_id + timestamp.

2. **`POST /functions/v1/bundle-version-bump-broadcast`** — verify-jwt ON (service-role only). No additional auth needed; service-role key is already the keys-to-the-kingdom secret.

3. **`bundle_version_broadcasts` table** — service-role-only write; RLS denies anon/authenticated. No PII (just `customer_id` UUIDs + slug strings); leak risk low.

**Recommend Sesi D pass-3 trigger** for review of points 1 + 2 within the next 3 days.
