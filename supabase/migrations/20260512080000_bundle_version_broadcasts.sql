-- D1 multi-persona webhook push (2026-05-12).
--
-- bundle_version_broadcasts table — one row per (broadcast, customer)
-- pair recorded by bundle-version-bump-broadcast Edge Function.
--
-- Captures the full fan-out of a version bump so admins can answer:
--   - Which customers got pinged for web-app-builder@2.1.0?
--   - Which of them succeeded / failed?
--   - Was anyone skipped because their tier doesn't include the slug?
--
-- Companion to existing bundle_pull_attempts (Phase 2E-2) which logs
-- the VPS-side outcome of the subsequent boot pull.

create table if not exists bundle_version_broadcasts (
  id            bigserial primary key,
  agent_slug    text not null,
  new_version   text,                                  -- nullable; admin may
                                                       -- broadcast without
                                                       -- specifying version
                                                       -- (uses latest in storage)
  customer_id   uuid references customers(id) on delete cascade,
  status        text not null check (status in (
    'restarted',
    'failed',
    'skipped_tier'
  )),
  detail        text,
  broadcast_at  timestamptz not null default now()
);

create index if not exists bundle_version_broadcasts_slug_idx
  on bundle_version_broadcasts(agent_slug, broadcast_at desc);

create index if not exists bundle_version_broadcasts_customer_idx
  on bundle_version_broadcasts(customer_id, broadcast_at desc);

create index if not exists bundle_version_broadcasts_status_idx
  on bundle_version_broadcasts(status, broadcast_at desc);

comment on table bundle_version_broadcasts is
  'D1 multi-persona webhook push telemetry. One row per (broadcast, customer) pair. Companion to bundle_pull_attempts which captures the VPS-side boot outcome.';

-- ─── RLS ──────────────────────────────────────────────────────────────
-- Same rule as bundle_pull_attempts: admin-only via service-role; anon
-- has zero access. RLS forced on so even service-role writes are gated
-- through the policy (defense in depth — broadcast handler runs with
-- service-role explicitly).

alter table bundle_version_broadcasts enable row level security;

drop policy if exists "admin only" on bundle_version_broadcasts;
create policy "admin only" on bundle_version_broadcasts
  for all
  to service_role
  using (true)
  with check (true);

revoke all on bundle_version_broadcasts from anon, authenticated;
grant all on bundle_version_broadcasts to service_role;
