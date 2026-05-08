-- Phase 2E-2: bundle versioning + pull telemetry.
--
-- Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
--
-- Adds:
--   1. customers.bundle_versions     — per-agent semver pins (jsonb)
--   2. customers.bundle_update_policy — pin | latest | staged
--   3. bundle_pull_attempts table     — 1 row per Hermes boot pull attempt
--
-- Both customer columns default to safe values for existing rows:
--   bundle_versions      → empty {} (bundle-fetch falls back to tier-default)
--   bundle_update_policy → 'pin' (matches Starter default; Pro/Studio
--                          rows can be backfilled or updated as customers
--                          upgrade)
--
-- Idempotent: every alter/create uses IF NOT EXISTS / IF NOT EXISTS guards.

-- ─── customers.bundle_versions + bundle_update_policy ──────────────────

alter table customers
  add column if not exists bundle_versions jsonb not null default '{}'::jsonb,
  add column if not exists bundle_update_policy text
    not null default 'pin'
    check (bundle_update_policy in ('pin', 'latest', 'staged'));

comment on column customers.bundle_versions is
  'Per-agent semver pins, e.g. {"doc-expert": "1.0.0", "the-pro": "1.2.0"}. Hermes boot script (bundle-pull) consults bundle-fetch which reads this column. Empty {} means tier-default lookup (Phase 2E-2 hardcodes 1.0.0 as the only version).';

comment on column customers.bundle_update_policy is
  'pin: never auto-update; latest: pull latest-semver on boot if newer than installed; staged: pull but stay disabled until customer confirms in dashboard. Tier defaults set at subscription activation: starter=pin, pro=latest, studio=latest. staged mode lands in Phase 3+ alongside dashboard UI.';

-- ─── bundle_pull_attempts ──────────────────────────────────────────────

create table if not exists bundle_pull_attempts (
  id                bigserial primary key,
  customer_id       uuid references customers(id) on delete cascade,
  agent_slug        text not null,
  version_requested text,
  version_installed text,
  status            text not null check (status in (
    'success',
    'failed',
    'timeout',
    'permission_denied',
    'storage_unavailable'
  )),
  error_detail      text,
  bytes_pulled      bigint,
  duration_ms       int,
  attempted_at      timestamptz default now()
);

create index if not exists bundle_pull_attempts_customer_idx
  on bundle_pull_attempts(customer_id, attempted_at desc);

create index if not exists bundle_pull_attempts_status_idx
  on bundle_pull_attempts(status, attempted_at desc);

comment on table bundle_pull_attempts is
  'Phase 2E-2 telemetry. One row per Hermes-boot bundle pull (success or fail). Customer-side reliability data — used for per-customer dashboards (Phase 3+) and fleet-wide failure-rate alerting. Indexes optimize per-customer history queries and fleet-wide status rollups.';

-- ─── RLS ────────────────────────────────────────────────────────────────
--
-- Service-role only. Hermes boot script POSTs telemetry through the
-- bundle-pull-record Edge Function which uses the service-role key. anon
-- never sees this table.

alter table bundle_pull_attempts enable row level security;
