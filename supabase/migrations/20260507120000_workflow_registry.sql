-- Workflow registry foundation (Phase 2E-1).
--
-- Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
--
-- Adds the workflow + workflow_runs tables that back the orchestrator
-- pattern (agent fetches pre-built workflows via vector search, executes
-- via deterministic handlers — LLM stays out of the hot path).
--
-- This migration is idempotent (safe to re-apply): every CREATE uses
-- IF NOT EXISTS, and the only data manipulation is the RLS enable. No
-- seed data is inserted — pilots are seeded by the registration helper
-- script in the next commit.

-- ─── pgvector ────────────────────────────────────────────────────────────
--
-- Required for the intent_embedding column. text-embedding-3-small from
-- OpenAI returns 1536-dim vectors; that's the schema choice baked into
-- the workflows table below. Phase 3 may swap providers if data residency
-- becomes a concern — at that point this dim may need to change and
-- ALL existing embeddings get re-computed.

create extension if not exists vector;

-- ─── workflows ──────────────────────────────────────────────────────────
--
-- One row per workflow. Customer-discoverable via vector search against
-- intent_embedding; executed via the handler_ref namespaced URI.

create table if not exists workflows (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name_id             text not null,         -- display name (Bahasa Indonesia)
  description_id      text not null,         -- one-line BI catalog description
  agent_slugs         text[] not null,       -- which personas can invoke this
  category            text not null check (category in (
    'booking', 'scraping', 'generation', 'analysis', 'automation', 'template'
  )),
  intent_phrases      text[] not null,       -- 5-15 sample customer phrases
  intent_embedding    vector(1536),          -- nullable while seeding
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

-- ivfflat is the right index for our scale (3 pilots → thousands).
-- lists=100 is the standard recommendation for small registries.
-- When usage exceeds ~10k workflows, REINDEX with lists=sqrt(N).
create index if not exists workflows_intent_embedding_idx on workflows
  using ivfflat (intent_embedding vector_cosine_ops) with (lists = 100);

create index if not exists workflows_agent_slugs_idx on workflows using gin (agent_slugs);
create index if not exists workflows_category_idx on workflows (category);
create index if not exists workflows_tier_idx on workflows (tier);

comment on table workflows is
  'Phase 2E-1 workflow registry. Each row = one pre-built workflow that customers can discover via vector search and execute via deterministic handlers. Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md';

comment on column workflows.handler_ref is
  'Namespaced URI: edge-fn:<name> | hermes-skill:<name> | external:<id> | composite:<slug>. Pilot uses edge-fn: only.';

comment on column workflows.tier is
  'Minimum subscription tier required. starter < pro < studio. Filtered server-side in workflow-discover before the customer sees results.';

-- ─── workflow_runs ──────────────────────────────────────────────────────
--
-- Audit + telemetry log. One row per workflow-execute call, regardless
-- of success/failure. Phase 2E-2 reads from here to update workflows
-- success_rate / avg_duration_ms / usage_count.

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
-- Anon access is blocked by enabling RLS without adding policies.
--
-- Phase 2E-2 may add a per-customer policy on workflow_runs so the
-- dashboard can read its own runs via anon key. For now: nothing.

alter table workflows enable row level security;
alter table workflow_runs enable row level security;

-- No CREATE POLICY here. Service-role bypasses RLS automatically; anon
-- gets blocked. That's the intent for Phase 2E-1.
