-- Phase 4-5b: Hermes v0.13.x kanban platform-side mirror
--
-- Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-5b deferred work,
--       unblocked once SUPABASE_ACCESS_TOKEN is live).
--
-- Architecture
-- ────────────
--
--   Customer VPS                         Platform
--   ─────────────                        ────────
--   Hermes v0.13.x runtime
--     │                                  hermes-kanban-proxy-handler
--     ├─ kanban-orchestrator skill ────→ /functions/v1/hermes-kanban-proxy
--     │   (source of truth)              ↓
--     │                                  upsert into hermes_kanban_boards
--     │                                  + hermes_kanban_tasks (this file)
--     │                                  ↑
--     └─ progress-monitor skill          founder dashboard reads
--                                        cross-customer aggregations
--
-- The customer VPS Hermes runtime owns the source of truth via its
-- v0.13.x native kanban API (typed contract in
-- services/hermes-kanban-client/src/types.ts). The platform mirrors
-- board state for the founder cross-customer dashboard view.
--
-- The hermes-kanban-proxy-handler Edge Function (Phase 4-5b code, ships
-- separately) POSTs board snapshots here on update. This migration sets
-- up the schema. Idempotent.

-- ─── boards (denormalized JSON copy + key columns for indexing) ────────

create table if not exists hermes_kanban_boards (
  id            uuid primary key,                              -- matches Hermes-side board.id
  customer_id   uuid not null references customers(id) on delete cascade,
  title         text not null,
  -- Full board JSON (columns + tasks embedded). Lets the founder UI do
  -- a single-board fetch in one row read. The per-task table below is
  -- for cross-board / cross-customer aggregations.
  board_jsonb   jsonb not null,
  hermes_version text not null check (hermes_version ~ '^v?0\.13\.[0-9]+$'),
  -- Source-side timestamps from Hermes; mirror-side timestamp records
  -- when we last synced.
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  mirrored_at   timestamptz default now()
);

create index if not exists hermes_kanban_boards_customer_idx
  on hermes_kanban_boards(customer_id, updated_at desc);

create index if not exists hermes_kanban_boards_mirrored_idx
  on hermes_kanban_boards(mirrored_at desc);

comment on table hermes_kanban_boards is
  'Phase 4-5b: platform-side mirror of Hermes v0.13.x kanban boards. Source of truth on customer VPS. Proxy handler upserts on board update. Founder dashboard reads.';
comment on column hermes_kanban_boards.hermes_version is
  'Pin guard — mirror only accepts v0.13.x range to match the typed contract version (HERMES_VERSION_RANGE_RE in services/hermes-kanban-client/src/types.ts).';

-- ─── tasks (denormalized — one row per task across boards) ─────────────

create table if not exists hermes_kanban_tasks (
  board_id        uuid not null references hermes_kanban_boards(id) on delete cascade,
  task_id         text not null,                   -- Hermes-side task.id
  title           text not null,
  owner_persona   text not null check (owner_persona in (
    'the-pro',
    'deep-researcher',
    'web-app-builder',
    'doc-expert',
    'slide-master',
    'trade-pro',
    'project-conductor',
    'business-agent',
    'video-producer',
    'social-conductor'
  )),
  status          text not null check (status in (
    'todo',
    'in_progress',
    'review',
    'done',
    'blocked'
  )),
  due_date        timestamptz,
  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  mirrored_at     timestamptz default now(),
  primary key (board_id, task_id)
);

-- Founder dashboard queries: "what's stuck across all customers" /
-- "what's the persona-load distribution this week" — both fast on
-- (owner_persona, status).
create index if not exists hermes_kanban_tasks_persona_status_idx
  on hermes_kanban_tasks(owner_persona, status);

-- Partial index for "what's overdue right now" — excludes done so the
-- index stays small as historical tasks accumulate.
create index if not exists hermes_kanban_tasks_due_active_idx
  on hermes_kanban_tasks(due_date)
  where status != 'done' and due_date is not null;

comment on table hermes_kanban_tasks is
  'Phase 4-5b: denormalized task mirror for cross-customer + cross-board aggregations. Always upserted alongside hermes_kanban_boards parent (proxy handler does both in one transaction).';

-- ─── RLS ───────────────────────────────────────────────────────────────
--
-- Service role only. Hermes-side proxy + founder dashboard both call
-- via service-role bearer (same convention as bundle_pull_attempts /
-- cleanup_notifications). anon / authenticated never touch these
-- tables — multi-tenant isolation is enforced by the proxy handler's
-- ownership check (customer_id must match the calling Hermes
-- instance's signed token).

alter table hermes_kanban_boards enable row level security;
alter table hermes_kanban_tasks  enable row level security;
