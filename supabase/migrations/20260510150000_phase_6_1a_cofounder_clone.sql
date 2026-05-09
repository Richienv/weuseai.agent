-- Phase 6-1.a: Cofounder-Clone foundation schema.
--
-- Spec: docs/plans/2026-05-10-phase-6-spec.md (LOCKED 2026-05-10 with
-- Q1-Q6 picks C, C, A, A, B, A). Day 1 of the 14-day Phase 6 plan.
--
-- 5 new tables + 2 customers column extensions + 1 hermes_kanban_tasks
-- column extension. Idempotent. Applied via Supabase Management API.
--
-- Q-pick implementation map:
--   Q1=C: approval_patterns.created_via ('manual' | 'suggested')
--   Q2=C: department_workspaces.persona_naming_mode ('indonesian' | 'generic')
--   Q3=A: daily_digests fixed cadence — enforced by cron, no schema change
--   Q4=A: codebase_integrations.status default 'active' (no 'pending' state)
--   Q5=B: hermes_kanban_tasks.last_renewed_at — 7-day stall detection
--   Q6=A: customers.monthly_llm_budget_cents — hard cap default $50

-- ─── 1. Department workspaces — persistent stateful team rooms ────────

CREATE TABLE IF NOT EXISTS public.department_workspaces (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  department      text not null check (department in (
    'sales', 'marketing', 'engineering', 'legal', 'finance'
  )),
  -- Q2=C locked: customer chooses naming mode at workspace setup time.
  -- Default 'indonesian'. simulated_team jsonb supplies actual names.
  persona_naming_mode text not null check (persona_naming_mode in (
    'indonesian', 'generic'
  )) default 'indonesian',
  -- Configured at workspace setup time, immutable thereafter
  simulated_team  jsonb not null default '[]'::jsonb,
  -- Free-form workspace meta (charter, OKRs, current focus areas)
  charter_md      text,
  -- Single Telegram thread per workspace for ongoing chat
  telegram_thread_id text,
  status          text not null check (status in (
    'active', 'paused', 'archived'
  )) default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (customer_id, department)
);

CREATE INDEX IF NOT EXISTS idx_dept_workspaces_customer
  ON public.department_workspaces (customer_id, status);

COMMENT ON TABLE public.department_workspaces IS
  'Phase 6-1: persistent dept workspace per (customer, department). 5-dept × 1-workspace-each. simulated_team holds 2-4 personas per workspace.';
COMMENT ON COLUMN public.department_workspaces.persona_naming_mode IS
  'Q2=C locked: customer chooses Indonesian or generic at setup. Drift-tested in tests/phase-6-1a-schema.spec.ts.';

-- ─── 2. Approval patterns — auto-approval rules ──────────────────────

CREATE TABLE IF NOT EXISTS public.approval_patterns (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  -- Mirror of approval_requests.action_kind enum (Phase 5-1.a)
  action_kind     text not null check (action_kind in (
    'incorporate', 'contract_sign', 'public_emission', 'regulatory_filing'
  )),
  -- JSON match conditions; pattern-matcher (Phase 6-1.b) evaluates this
  -- against incoming approval payloads. Example for public_emission:
  --   { "channel": "ig", "must_pass_brand_voice": true,
  --     "max_audience": 10000, "no_health_claims": true }
  match_conditions jsonb not null,
  -- Q1=C locked: 'manual' = customer pre-configured; 'suggested' = BD v3
  -- proposed it from history (Phase 6.5+ surfaces these for explicit
  -- customer approval before becoming active).
  created_via     text not null check (created_via in (
    'manual', 'suggested'
  )) default 'manual',
  -- Customer's reasoning (for audit + edit later)
  reasoning_md    text,
  status          text not null check (status in (
    'active', 'suspended', 'revoked'
  )) default 'active',
  -- For 'suggested' patterns — when BD v3 surfaced; null for 'manual'
  suggested_at    timestamptz,
  -- For 'suggested' patterns — when customer approved (flips to 'active')
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  -- When this pattern was last triggered (for analytics)
  last_matched_at timestamptz,
  match_count     integer not null default 0
);

CREATE INDEX IF NOT EXISTS idx_approval_patterns_active
  ON public.approval_patterns (customer_id, action_kind, status)
  WHERE status = 'active';

COMMENT ON TABLE public.approval_patterns IS
  'Phase 6-1: customer-locked auto-approval rules. Q1=C hybrid: manual (Phase 6-1) + suggested (Phase 6.5+).';
COMMENT ON COLUMN public.approval_patterns.action_kind IS
  'Mirrors approval_requests.action_kind enum (Phase 5-1.a). Drift-tested.';

-- ─── 3. Daily digests — M/W/F morning summaries ──────────────────────

CREATE TABLE IF NOT EXISTS public.daily_digests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  digest_date     date not null,
  -- Compact summary by department (rendered to Telegram + dashboard)
  body_md         text not null,
  -- Action items requiring customer decision (links to approval_requests)
  pending_decisions jsonb not null default '[]'::jsonb,
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (customer_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_digests_recent
  ON public.daily_digests (customer_id, digest_date DESC);

COMMENT ON TABLE public.daily_digests IS
  'Phase 6-1: M/W/F morning digest per customer. Q3=A: cron runs at 00:00 UTC (07:00 WIB) Mon/Wed/Fri.';

-- ─── 4. Codebase integrations — GitHub repo per customer ─────────────

CREATE TABLE IF NOT EXISTS public.codebase_integrations (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  github_repo     text not null,                       -- "owner/repo" format
  -- Encrypted GitHub fine-grained PAT. Same pgcrypto pattern as
  -- customers.telegram_bot_token (Block 2.5 helpers encrypt_bot_token /
  -- decrypt_bot_token reused — generic enough).
  github_pat_encrypted text not null,
  -- Customer-supplied commands (run inside Vercel Sandbox or VPS)
  test_command    text,
  build_command   text,
  -- Q4=A locked: default 'active' on insert (opt-in is binary; no
  -- 'pending' state needed since customer explicitly connects)
  status          text not null check (status in (
    'active', 'suspended', 'revoked'
  )) default 'active',
  created_at      timestamptz not null default now(),
  -- When customer last revoked or re-enabled (audit trail)
  status_changed_at timestamptz not null default now(),
  unique (customer_id, github_repo)
);

CREATE INDEX IF NOT EXISTS idx_codebase_integrations_active
  ON public.codebase_integrations (customer_id, status)
  WHERE status = 'active';

COMMENT ON TABLE public.codebase_integrations IS
  'Phase 6-1: opt-in GitHub repo connection per customer (Q4=A). PAT encrypted via pgcrypto same as bot tokens. Used by codebase-pr-opener Edge Function (Phase 6-4.b).';

-- ─── 5. Persona memories — append-only per-persona context ──────────

CREATE TABLE IF NOT EXISTS public.persona_memories (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.department_workspaces(id) on delete cascade,
  persona_slug    text not null,                       -- e.g. 'sales-rep-1'
  memory_kind     text not null check (memory_kind in (
    'lead',         -- prospect / contact info
    'contact',      -- existing customer / vendor / partner contact
    'project',      -- in-flight initiative
    'commitment',   -- promise made (by us or to us)
    'preference',   -- customer preference / vibe note
    'recall'        -- general "remember this" notes
  )),
  body_md         text not null check (length(body_md) > 0 and length(body_md) <= 1000),
  source          text,                                -- which task/conversation surfaced this
  created_at      timestamptz not null default now()
);

-- Customer-scoped recency query — matches per-persona prompt prepend at
-- session start (last N memories per kind).
CREATE INDEX IF NOT EXISTS idx_persona_memories_workspace_recent
  ON public.persona_memories (workspace_id, persona_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_persona_memories_kind
  ON public.persona_memories (workspace_id, persona_slug, memory_kind, created_at DESC);

COMMENT ON TABLE public.persona_memories IS
  'Phase 6-1: append-only per-simulated-persona context log. Each persona accumulates ≤1000-char memories across sessions; prompt template prepends recent ones at session start. Drift-tested for the 6-member memory_kind enum.';

-- ─── 6. customers row extensions ────────────────────────────────────

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phase_6_enabled boolean not null default false;

-- Q6=A locked: hard cap on customer's monthly LLM token spend (BYOK).
-- $50/month default. Stored as cents to avoid float drift. Customer can
-- request raise via support ticket → admin flips to higher value.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS monthly_llm_budget_cents integer not null default 5000;

COMMENT ON COLUMN public.customers.phase_6_enabled IS
  'Phase 6-1 (Q4=A): gates Cofounder-Clone features. Studio tier only. customer-tier-bump-handler flips on tier upgrade WHEN customer also opted into Phase 6 explicitly.';
COMMENT ON COLUMN public.customers.monthly_llm_budget_cents IS
  'Q6=A locked: hard cap on customer BYOK LLM spend. Default $50/month = 5000 cents. Admin can raise via support ticket. Phase 6 cap-enforcement runs at LLM-call time (Hermes-side proxy refuses past 100% budget).';

-- ─── 7. hermes_kanban_tasks extension (Q5=B 7-day stall) ────────────

-- last_renewed_at tracks when customer last interacted with this task
-- (approve/comment/status change). Cron flags tasks where:
--   now() - last_renewed_at > 7 days
-- → surfaces 'task_continuation' approval to customer.

ALTER TABLE public.hermes_kanban_tasks
  ADD COLUMN IF NOT EXISTS last_renewed_at timestamptz not null default now();

CREATE INDEX IF NOT EXISTS idx_hermes_kanban_tasks_stall
  ON public.hermes_kanban_tasks (last_renewed_at)
  WHERE status NOT IN ('done', 'blocked');

COMMENT ON COLUMN public.hermes_kanban_tasks.last_renewed_at IS
  'Q5=B locked: 7-day stall detection. now() - last_renewed_at > 7d → task_continuation approval surfaced.';

-- ─── 8. RLS — same convention as Phase 5 ────────────────────────────

ALTER TABLE public.department_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codebase_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_memories ENABLE ROW LEVEL SECURITY;

-- anon SELECT for customer-facing reads (per-customer scoping enforced
-- by JWT-issuing handler — same as Phase 5 convention)
DROP POLICY IF EXISTS "anon read own workspaces" ON public.department_workspaces;
CREATE POLICY "anon read own workspaces"
  ON public.department_workspaces FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon read own approval patterns" ON public.approval_patterns;
CREATE POLICY "anon read own approval patterns"
  ON public.approval_patterns FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon read own digests" ON public.daily_digests;
CREATE POLICY "anon read own digests"
  ON public.daily_digests FOR SELECT
  TO anon
  USING (true);

-- codebase_integrations + persona_memories: NO anon SELECT.
-- codebase_integrations contains encrypted PAT (sensitive); persona_memories
-- contain free-form business context (also sensitive). Service-role only
-- access via Edge Functions.

-- Service role bypasses RLS for all writes (BD v3 + handlers).
