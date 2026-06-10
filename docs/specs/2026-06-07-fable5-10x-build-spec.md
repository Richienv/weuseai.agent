# Fable 5 10x build — Fleet Sentinel

**Date:** 2026-06-07 (built 2026-06-10)
**Author:** Fable 5
**Status:** Built — handler + Edge Function + provisioning routes + tests + migration.
Deployment (apply migration, deploy Edge Function, schedule cron, Fly redeploy) is
a founder action (needs prod credentials) — steps in §Deploy.

---

## Why this, not a flashier feature

The candidate 10x features (Persona Genesis, Agent Mesh, Vision, Marketplace,
"self-improving system") are exciting, but the audit made the right build
obvious: **the fleet is blind and leaky, and the business model's core survival
mechanism does not exist in code.** Shipping a "self-improving system" on top of
a fleet that can't tell you when an agent dies, that bills abandoned VPSes
forever, and whose 30-day auto-suspend is vaporware would be building the second
floor before the foundation. The honest, frontier-level move is to build the
thing that lets one founder safely run hundreds of customer VPSes: an autonomous
fleet lifecycle + health + cost-guard control plane.

A normal team would scope "fleet observability + lifecycle automation + alerting"
as a multi-month platform-engineering epic. Here it ships as one cohesive,
fully-unit-tested control plane that respects every architectural lock (no Hermes
patch, no new paid dependency, no pricing change, DeepSeek-default untouched).

It is also **honest engineering**: it actually does what it claims. The decision
logic is a pure function with exhaustive tests — not a black box that "gets
smarter." Every action it takes (suspend, alert, reap) is observable and deduped.

---

## What it does

Fleet Sentinel is a scheduled control loop (Edge Function on pg_cron) plus a pure
decision handler. On each tick it reads fleet state and emits a set of **actions**
and **alerts**, then executes them idempotently.

### 1. Lifecycle — auto-suspend / auto-resume (closes audit P0 #1)
- A VPS with no customer activity for `IDLE_SUSPEND_DAYS` (default 30) and an
  active subscription **without** the Always-On add-on becomes a *suspend
  candidate*. The sentinel calls provisioning `/suspend` (Vultr halt via the
  existing `IVPSProvider.stop`), stamps `vps_instances.lifecycle_state='suspended'`
  + `suspended_at`, and records a `fleet_alerts` row (so the customer/founder has
  an audit trail). Storage is retained; only compute is halted → the Rp 145k → Rp
  17k drop the business model assumes.
- Activity on a suspended customer (a new `usage_log` row, a paid invoice, a
  tier-bump) flips it back: the sentinel calls `/resume` (Vultr start) and clears
  the suspend stamp.
- **Always-On is respected** — those customers are never suspended.

### 2. Health — dead-agent + orphan detection (closes audit P0 #3, #6)
- **Orphaned provision:** a `vps_instances` row stuck in `provisioning` longer
  than `ORPHAN_PROVISION_MINUTES` (default 30) → alert founder + (optional) reap.
- **Stale bundle-pull:** a running VPS whose latest `bundle_pull_attempts` is all
  failures over `BUNDLE_FAIL_WINDOW` → alert (agent likely skill-less).
- **Dead agent heuristic:** running + active subscription + zero activity + no
  successful readiness signal within `DEAD_AGENT_HOURS` → alert.

### 3. Cost-guard — runaway-spend alert (closes audit P1 #4 partial)
- Per-customer spend delta over the tick window above `RUNAWAY_USD_CENTS` →
  founder alert. This is the missing *delivery* on top of the existing admin
  cost view.

### 4. Founder alerting with dedup
- All alerts route to the founder Telegram (`RICHIE_CHAT_ID` /
  `SUPPORT_TELEGRAM_BOT_TOKEN`, the same channel the provision-retry exhaustion
  alert already uses).
- Every alert is keyed `(customer_id, kind, dedup_bucket)` in `fleet_alerts`; the
  sentinel never re-sends the same alert within its dedup window. This is what
  makes a 5-minute cron safe to run — it won't spam.

---

## Architecture

```
            pg_cron (every N min)
                   │
                   ▼
        supabase/functions/fleet-sentinel
        (I/O shell: reads Supabase, sends Telegram,
         calls provisioning /suspend|/resume)
                   │  injects reads + clock
                   ▼
   _shared/fleet-sentinel-handler.ts   ← PURE. no I/O.
     input:  FleetSnapshot (vps rows, activity, spend,
             pending provisions, existing alerts, now)
     output: { actions: SentinelAction[],
               alerts:  SentinelAlert[] }
                   │
                   ▼
        Edge Function executes:
          - POST provisioning /suspend|/resume
          - insert fleet_alerts (dedup)
          - send founder Telegram
          - patch vps_instances lifecycle_state
```

The split mirrors the repo's established pattern (pure `_shared/*-handler.ts` +
thin `functions/*/index.ts`), so the decision logic is testable with zero network
and the Edge Function is a dumb executor.

Provisioning gains two routes that wrap the **already-existing**
`IVPSProvider.stop/start`:

```
POST /suspend  { customerId }  → vps.stop(vps_id);  store patch stopped
POST /resume   { customerId }  → vps.start(vps_id); store patch running
```

Both reuse the existing `Bearer PROVISIONING_AUTH_TOKEN` middleware and the mock
provider, so they unit-test under `VPS_PROVIDER=mock` exactly like `/spin-up`.

---

## Data model

New migration `…_fleet_sentinel.sql`:

- `vps_instances` gains:
  - `last_activity_at timestamptz` — touched by usage/onboarding/tier-bump.
  - `lifecycle_state text` — `active | idle_warned | suspended` (default `active`).
  - `suspended_at timestamptz`.
- `fleet_alerts` (new, append-only, service-role only, RLS-denied to anon):
  - `id`, `customer_id`, `kind` (`idle_suspend | orphan_provision | stale_bundle |
    dead_agent | runaway_spend | resume`), `dedup_bucket text`, `detail jsonb`,
    `created_at`. Unique `(customer_id, kind, dedup_bucket)` gives DB-level dedup.
- The three scale indexes the architecture audit flagged
  (`subscriptions(status,started_at)`, `provision_retry_attempts(subscription_id,
  attempted_at desc)`, `vps_instances(provider,vps_id)`), folded in here since the
  sentinel queries lean on them.

---

## Configuration (all env-overridable, safe defaults)

| Knob | Default | Meaning |
|------|---------|---------|
| `IDLE_SUSPEND_DAYS` | 30 | inactivity before suspend |
| `ORPHAN_PROVISION_MINUTES` | 30 | stuck-provisioning alert threshold |
| `DEAD_AGENT_HOURS` | 48 | running-but-silent alert threshold |
| `RUNAWAY_USD_CENTS` | 500 | per-tick per-customer spend alert |
| `FLEET_SENTINEL_DRY_RUN` | `false` | compute + alert but do not suspend/reap |

`FLEET_SENTINEL_DRY_RUN=true` is the recommended first production setting: it
surfaces every action it *would* take to the founder Telegram without halting a
single VPS, so the thresholds can be tuned against the real fleet before the loop
is given teeth.

---

## Success criteria

1. Pure handler: given a snapshot, produces the correct action/alert set —
   covered by unit tests (idle→suspend, always-on exempt, suspended+activity→
   resume, orphan, dead-agent, runaway, dedup-suppression, dry-run).
2. Provisioning `/suspend` + `/resume` halt/start the mock VPS and patch the row —
   route tests.
3. Proxy cost-guard: `max_tokens` defaulted, no charge on non-2xx, oversized
   request rejected — proxy tests.
4. Full suite stays green; `typecheck:all` clean.
5. Idempotent: a second tick over unchanged state sends zero new alerts and takes
   zero new actions (dedup proven by test).

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Suspending a customer who is actually active (false positive) | `last_activity_at` is touched by usage/onboarding/tier-bump; Always-On exempt; `DRY_RUN` first; resume is automatic on next activity. |
| Alert spam from a 5-min cron | DB-level unique dedup key + per-kind dedup buckets; handler suppresses already-recorded alerts. |
| Reaping a VPS that was mid-recovery | Orphan reap is **off by default** (alert-only); only suspends/halts (reversible), never deletes. |
| Halting via Vultr fails | Route returns the provider error; sentinel records a failure alert and retries next tick (idempotent). |
| Scale-out of provisioning breaks single-machine assumptions | Sentinel state lives in Supabase, not in-memory; safe across machines. |

## Deploy (founder action — needs prod credentials)

1. Apply migration: `supabase db push` (or Mgmt API) — adds columns + `fleet_alerts` + indexes.
2. Deploy Edge Function: `supabase functions deploy fleet-sentinel`.
3. Schedule: `select cron.schedule('fleet-sentinel','*/15 * * * *', $$ select net.http_post(... fleet-sentinel ...) $$);`
4. Provisioning: redeploy Fly (the `/suspend` + `/resume` routes ship with it) via the existing `deploy-provisioning.yml`.
5. **Set `FLEET_SENTINEL_DRY_RUN=true` first.** Watch the founder Telegram for a
   day, confirm the suspend candidates are genuinely idle, then flip to `false`.

## Not in this build (deliberately deferred)
- Per-customer STT metering (needs a Hermes-side usage seam — out of scope, no
  upstream patch allowed).
- Proxy per-customer rate limiter (needs a KV/Durable-Object store decision — a
  follow-up; the `max_tokens` cap + concurrency note here is the cheap 80%).
- Auto-reaping orphans (kept alert-only until thresholds are trusted).
