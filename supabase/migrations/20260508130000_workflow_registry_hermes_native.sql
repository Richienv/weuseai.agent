-- Workflow registry foundation (Phase 2E-1.5, Hermes-native).
--
-- Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md
--
-- Architecture pivot 2026-05-08: dropped platform-side workflow-discover.
-- Hermes does intent matching + parameter extraction natively on the
-- customer's VPS using the customer's BYOK LLM. The registry tables
-- here back the deterministic handler invocation path
-- (workflow-execute → handler edge function) and the audit log.
--
-- Removed vs the pre-pivot version:
--   - pgvector extension (no vector search anymore)
--   - intent_embedding vector(1536) column
--   - intent_phrases text[] column (Hermes uses SKILL.md "Kapan dipakai" for matching)
--   - ivfflat index
--
-- Idempotent: every CREATE uses IF NOT EXISTS. Safe to re-apply.

-- ─── workflows ──────────────────────────────────────────────────────────

create table if not exists workflows (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name_id             text not null,         -- display name (Bahasa Indonesia)
  description_id      text not null,         -- one-line BI catalog description
  agent_slugs         text[] not null,       -- which personas can invoke this
  category            text not null check (category in (
    'booking', 'scraping', 'generation', 'analysis', 'automation', 'template'
  )),
  parameters_schema   jsonb not null,        -- JSON Schema (validated server-side)
  execution_type      text not null check (execution_type in (
    'edge-function', 'hermes-skill', 'composite', 'external-api'
  )),
  handler_ref         text not null,         -- 'edge-fn:invoice-generator-handler' etc.
  output_type         text not null check (output_type in (
    'file', 'text', 'json', 'side-effect'
  )),
  tier                text not null check (tier in ('starter', 'pro', 'studio')),
  version             int not null default 1,
  success_rate        numeric default 0,     -- updated by 2E-2 batch job
  avg_duration_ms     int default 0,         -- updated by 2E-2 batch job
  usage_count         int default 0,         -- updated by 2E-2 batch job
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists workflows_agent_slugs_idx on workflows using gin (agent_slugs);
create index if not exists workflows_category_idx on workflows (category);
create index if not exists workflows_tier_idx on workflows (tier);

comment on table workflows is
  'Phase 2E-1.5 Hermes-native workflow registry. Each row = one pre-built workflow that customers invoke via Hermes skills (skill-side intent matching + param extraction; deterministic handler runs server-side here). Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md';

comment on column workflows.handler_ref is
  'Namespaced URI: edge-fn:<name> | hermes-skill:<name> | external:<id> | composite:<slug>. Pilot uses edge-fn: only.';

-- ─── workflow_runs ──────────────────────────────────────────────────────

create table if not exists workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references workflows(id) on delete restrict,
  customer_id   uuid not null references customers(id) on delete cascade,
  agent_slug    text not null,         -- which persona invoked
  parameters    jsonb,
  status        text not null check (status in (
    'pending', 'running', 'success', 'failed'
  )),
  output        jsonb,                 -- handler output (signed URL, text, etc.)
  error         text,                  -- only populated when status='failed'
  duration_ms   int,                   -- end-to-end execution time
  started_at    timestamptz default now(),
  completed_at  timestamptz
);

create index if not exists workflow_runs_customer_idx
  on workflow_runs(customer_id, started_at desc);

create index if not exists workflow_runs_workflow_idx
  on workflow_runs(workflow_id, started_at desc);

create index if not exists workflow_runs_status_idx
  on workflow_runs(status, started_at desc);

comment on table workflow_runs is
  'Audit + telemetry log for workflow-execute calls. Failsafe by design: every invocation gets a row, exceptions update status=failed + error text rather than silently dropping.';

-- ─── RLS ────────────────────────────────────────────────────────────────
--
-- Service-role only. Edge Functions use service-role internally and
-- validate customer_id against the request body before doing anything.

alter table workflows enable row level security;
alter table workflow_runs enable row level security;
