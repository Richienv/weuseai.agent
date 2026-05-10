-- Track 3a of agent-activation-gap cascade (2026-05-10).
--
-- refresh_env_requests — idempotency dedup for /refresh-env on the
-- provisioning service. Lets a caller (complete-onboarding-handler,
-- admin-customer-vps-refresh, manual rescue) replay the same
-- request_id within 10 min and get the cached outcome instead of
-- re-running SSH.
--
-- Design: docs/design/2026-05-10-vps-config-refresh.md (Idempotency
-- strategy — two layers: server-side dedup via request_id +
-- inherent idempotency on env state).
--
-- TTL: 10 min hardcoded in the route handler. Older rows are still
-- returned by SELECT but the handler ignores them and re-runs.
-- Periodic cleanup (Phase 6) — for now the table grows ~unbounded
-- but each row is small (~1KB). At paying-customer-zero scale this
-- is fine; revisit at 100+ customers.

create table if not exists public.refresh_env_requests (
  request_id    uuid primary key,
  customer_id   uuid not null references public.customers(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  outcome       jsonb
);

create index if not exists refresh_env_requests_customer_idx
  on public.refresh_env_requests (customer_id, started_at desc);

-- Service-role only. The provisioning service holds the service-role
-- key and writes via the Supabase REST API. RLS denies anon by default
-- (table not granted to anon role).
alter table public.refresh_env_requests enable row level security;

comment on table public.refresh_env_requests is
  'Track 3a 2026-05-10: idempotency dedup for provisioning /refresh-env. 10 min TTL enforced in handler.';
