# Runbook — Fleet Sentinel

What it is: the cron control loop that auto-suspends idle VPSes, flags dead
agents + orphaned provisions, and DMs you on runaway spend. Code:
`supabase/functions/fleet-sentinel/` (entry) + `_shared/fleet-sentinel-handler.ts`
(decisions) + `services/provisioning` `/suspend` `/resume`. Spec:
`docs/specs/2026-06-07-fable5-10x-build-spec.md`.

## First-time deploy (do this once)

1. Apply the migration (adds vps_instances lifecycle columns + `fleet_alerts`
   + scale indexes + the pg_cron schedule):
   `supabase/migrations/20260607000000_fleet_sentinel.sql` via the Mgmt API.
2. Deploy the function: `supabase functions deploy fleet-sentinel`.
3. Redeploy the provisioning service (ships `/suspend` + `/resume`) via the
   existing `deploy-provisioning.yml`.
4. Set the cron's URL + token (so pg_cron can call the function):
   ```sql
   ALTER DATABASE postgres SET app.fleet_sentinel_url   = 'https://<ref>.supabase.co/functions/v1/fleet-sentinel';
   ALTER DATABASE postgres SET app.fleet_sentinel_token = '<service-role-jwt>';
   ```
5. **Start in dry-run.** Set the function env `FLEET_SENTINEL_DRY_RUN=true`.
   For a day it will DM you every action it *would* take (`[DRY-RUN] 💤
   Suspending …`) without halting a single VPS.
6. When the suspend candidates look right, set `FLEET_SENTINEL_DRY_RUN=false`.
   Now it actually suspends.

## What you'll see in Telegram

| Emoji | Kind | Meaning | Action it takes |
|-------|------|---------|-----------------|
| 💤 | idle_suspend | VPS idle ≥ 30d | Halts it (storage kept) |
| ▶️ | resume | A suspended customer came back | Powers it back on |
| 🛠️ | orphan_provision | Stuck 'provisioning' > 30m | Alert only — check/reap manually |
| ⚠️ | stale_bundle | Bundle-pull failing | Alert only — check Storage |
| 🔕 | dead_agent | Was active, silent > 48h | Alert only — health-check |
| 💸 | runaway_spend | Spend over threshold in the window | Alert only — check for a stuck loop |

Each alert fires **once** per situation (deduped in `fleet_alerts`), so the
15-min cron won't spam you.

## Tuning (function env vars)

`IDLE_SUSPEND_DAYS` (30) · `ORPHAN_PROVISION_MINUTES` (30) ·
`DEAD_AGENT_HOURS` (48) · `RUNAWAY_USD_CENTS` (500) · `FLEET_SENTINEL_DRY_RUN`.

## Safety properties

- **Reversible.** Suspend = Vultr *halt*, never delete. Resume powers it back
  on; Hermes restarts itself and re-pulls its bundles.
- **Always-On is exempt** — those customers are never suspended.
- **Resume is automatic** on the next activity tick, so a false suspend
  self-heals when the customer messages again.
- **Orphans are alert-only** — the sentinel never auto-deletes a VPS.

## If something looks wrong

- Too many suspends → raise `IDLE_SUSPEND_DAYS`, or flip back to dry-run.
- A customer says their bot went quiet after travel → check `fleet_alerts` for
  an `idle_suspend` row; it will auto-resume on their next message, or POST
  `/resume {customerId, vpsId, provider}` to the provisioning service to force it.
- The cron isn't firing → check `cron.job` for `fleet_sentinel_every_15min` and
  that `app.fleet_sentinel_url` / `_token` are set.
