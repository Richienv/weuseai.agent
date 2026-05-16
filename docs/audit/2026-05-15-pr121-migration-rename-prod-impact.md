# PR #121 Migration Rename — Production Impact Audit

**Date:** 2026-05-15
**Triggered by:** Cowork consult gate before Phase F's first real-payment run.
**Question:** Could the `20260510120000 → 20260510120100` rename of `refresh_env_requests.sql` cause prod migration churn?

---

## Decision

**No churn risk. Phase F can proceed.** The rename is safe because:

1. **Prod `schema_migrations` does NOT track this migration at all** (and 16 others — all post-2026-05-08 migrations were applied via Mgmt API which bypasses `schema_migrations`).
2. **The SQL is fully idempotent** — re-applying against the existing prod table is a no-op.

---

## GATE-1 evidence — prod `schema_migrations` query

```sql
-- via Supabase Mgmt API to project gtjgsligllbjcisiyrah
SELECT count(*) AS n, min(version) AS min_v, max(version) AS max_v
FROM supabase_migrations.schema_migrations;
```

```
[{"n":11,"min_v":"20260430000000","max_v":"20260508140000"}]
```

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 15;
```

```
20260508140000  bundle_versioning_telemetry
20260508130000  workflow_registry_hermes_native
20260506150000  revoke_pairing_anon_update
20260506140000  pairing_anon_update
20260506130000  anon_read_subscription_status
20260506000000  onboarding
20260504210000  phase2a_openrouter_keys
20260502120000  vps_instances_provider_agnostic
20260502000000  subscription_pending_provision
20260430000001  add_audit_log
20260430000000  initial_schema
```

**11 rows total.** Latest is `20260508140000` from 2026-05-08. The repo has **28 migration files** in `supabase/migrations/`. **17 are missing from prod's `schema_migrations`** — including both `phase_4_5b_hermes_kanban_mirror` (PR #20) and `refresh_env_requests` (PR #61, our renamed one).

So neither old timestamp `20260510120000` nor new `20260510120100` is recorded in prod. **There is no conflict to resolve.**

## GATE-2 evidence — SQL idempotency

`supabase/migrations/20260510120100_refresh_env_requests.sql`:

```sql
create table if not exists public.refresh_env_requests (
  request_id    uuid primary key,
  customer_id   uuid not null references public.customers(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  outcome       jsonb
);

create index if not exists refresh_env_requests_customer_idx
  on public.refresh_env_requests (customer_id, started_at desc);

alter table public.refresh_env_requests enable row level security;

comment on table public.refresh_env_requests is '...';
```

Each statement is idempotent:
- `CREATE TABLE IF NOT EXISTS` — no-op when table exists
- `CREATE INDEX IF NOT EXISTS` — no-op when index exists
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — re-enable on already-enabled RLS is no-op (Postgres ≥10)
- `COMMENT ON TABLE` — overwrites prior comment (no error if same)

Re-applying against prod (which already has the table from a Mgmt-API apply earlier) is a complete no-op.

## GATE-3 — mitigation needed?

**None.** The combination of:
- No `schema_migrations` row for this version (so no conflict regardless of timestamp prefix)
- Fully idempotent SQL (so re-apply is safe even if it did run)

means the rename in PR #121 has zero production impact.

---

## Side finding — broader hygiene issue (not blocking Phase F)

Prod's `schema_migrations` is 17 entries behind the repo. This means:
- A future `supabase db reset` or `supabase migration up --linked` against prod would re-apply 17 migrations
- All of those re-applies should be idempotent (most use `CREATE TABLE IF NOT EXISTS` etc.) but this is unverified
- Anyone setting up a fresh local stack with `supabase start` correctly applies all 28 (verified working in cascade Step 2)

**Recommendation:** post-Phase-F unlock, run a one-shot script that backfills prod `schema_migrations` with the missing 17 versions. This realigns the source-of-truth so future schema drift is visible.

Out of Phase F scope — logged here for follow-up.

---

## Conclusion

**Phase F's 3 real-payment runs are unblocked from the migration-rename concern.** Proceeding with harness build per §11.2 of the consulting handoff doc.
