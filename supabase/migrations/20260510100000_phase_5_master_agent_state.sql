-- Phase 5-1.a: Master Agent (Business Director v3) state machine + dept threads.
--
-- Spec: docs/plans/2026-05-10-phase-5-spec.md (LOCKED 2026-05-09 with Q1-Q5
-- picks A, A, A, C, C). Day 1 of the 10-day Phase 5 plan.
--
-- Three new tables + 1 column on existing customers table. Idempotent.
--
-- Architecture
-- ────────────
--
--   Customer (Studio tier, phase_5_enabled = true)
--     ↓
--   Business Director v3 (master agent)
--     ↓ dispatches
--   5 department packs (sales / marketing / engineering / legal / finance)
--     ↓ surfaces irreversible actions
--   approval_requests (per-action expiry — Q4=C)
--     ↓ approved
--   department_threads (kanban-backed when multi-step)
--     ↓ tracks
--   business_roadmap_state (5-stage progression — Q1=A "setup")
--
-- All RLS: anon SELECT own; service-role writes only. Per-customer scoping
-- enforced at the handler layer (BD v3 service-role flow).

-- ─── 1. Per-customer 5-stage roadmap tracker ──────────────────────────

CREATE TABLE IF NOT EXISTS public.business_roadmap_state (
  customer_id     uuid primary key references public.customers(id) on delete cascade,
  current_stage   text not null check (current_stage in ('idea','setup','identity','build','sell')),
  stage_entered_at timestamptz not null default now(),
  -- Per-stage deliverable completion. Keys = locked deliverable IDs from
  -- agent-packs/all-in-one-business-agent/templates/roadmap/5-stage-checklist.md
  -- (introduced in 5-2.a). Shape: { "idea_market_validated": true,
  --   "setup_pt_incorporated": false, ... }
  deliverables_completed jsonb not null default '{}'::jsonb,
  -- Free-form founder notes (BD v3 reads + writes via service-role).
  notes_md        text,
  updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_state_stage
  ON public.business_roadmap_state (current_stage);

COMMENT ON TABLE public.business_roadmap_state IS
  'Phase 5-1: per-customer 5-stage roadmap tracker (idea → setup → identity → build → sell). Source of truth for BD v3 stage gating.';
COMMENT ON COLUMN public.business_roadmap_state.current_stage IS
  'Q1=A locked: stage names match Persona v2 BD enum. Renaming would break the existing roadmap-tracker.';

-- ─── 2. Approval queue for irreversible actions ───────────────────────

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  action_kind     text not null check (action_kind in (
    'incorporate', 'contract_sign', 'public_emission', 'regulatory_filing'
  )),
  action_summary  text not null,            -- Human-readable for surfacing in Telegram
  action_payload  jsonb not null,           -- Full structured action (passed to executor on approval)
  proposed_by_agent text not null,          -- e.g. 'all-in-one-business-agent' / 'sales-pack' / 'legal-pack'
  status          text not null check (status in (
    'pending', 'approved', 'rejected', 'expired'
  )) default 'pending',
  approved_by     text,                     -- 'customer' (Telegram reply) / 'founder-admin' (rare)
  approved_at     timestamptz,
  -- Q4=C locked: per-action expiry default. approval-queue-handler
  -- (5-3.b) computes from action_kind on insert:
  --   incorporate        → 14 days
  --   contract_sign      → 14 days
  --   public_emission    → 24 hours
  --   regulatory_filing  → 48 hours
  -- Override via explicit expires_at in the request body. A nightly cron
  -- (5-5) flips pending → expired past the cliff.
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

-- Customer-scoped pending-approvals query — matches the Telegram surface
-- ("here's what's waiting for your approve"). Partial index keeps it
-- small; expired/approved rows accumulate but don't bloat the index.
CREATE INDEX IF NOT EXISTS idx_approval_pending
  ON public.approval_requests (customer_id, status, expires_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.approval_requests IS
  'Phase 5-1: approval queue for irreversible actions (incorporate, contract_sign, public_emission, regulatory_filing). Q2=A: customer approves via Telegram pairing chat reply. Q4=C: per-action expiry computed by handler.';

-- ─── 3. Department thread tracker ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.department_threads (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  department      text not null check (department in (
    'sales', 'marketing', 'engineering', 'legal', 'finance'
  )),
  initiative_summary text not null,         -- "Q3 product launch", "Tax filing prep", etc.
  -- Optional kanban board reference (kanban runs in Hermes; we mirror id
  -- only via hermes_kanban_boards from Phase 4-5b). Nullable for
  -- single-step initiatives that don't warrant a board.
  hermes_kanban_board_id text,
  status          text not null check (status in (
    'active', 'paused', 'closed'
  )) default 'active',
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dept_threads_customer
  ON public.department_threads (customer_id, status);

COMMENT ON TABLE public.department_threads IS
  'Phase 5-1: tracks which department packs (sales/marketing/engineering/legal/finance) are currently engaged for a customer. BD v3 spawns these via dept-thread-spawn-handler (5-3.b).';

-- ─── 4. Customers row gets phase_5_enabled flag ────────────────────────

-- Q3=A locked: ALL 5 department packs are Studio-only. This flag gates
-- BD v3 features per Studio tier. Default false; tier-bump flow flips it
-- when customer.tier = 'studio'.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phase_5_enabled boolean not null default false;

COMMENT ON COLUMN public.customers.phase_5_enabled IS
  'Phase 5-1 (Q3=A): gates BD v3 + 5 department packs. Studio tier only. customer-tier-bump-handler (5-2.b) flips this on tier upgrade.';

-- ─── 5. RLS — service-role writes; customer SELECTs own state ─────────

ALTER TABLE public.business_roadmap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_threads ENABLE ROW LEVEL SECURITY;

-- Customer-side reads (anon JWT): SELECT-only. Per-customer scoping is
-- enforced by the handler that issues the JWT (BD v3 surfaces only the
-- customer's own state). Same convention as bundle_pull_attempts.

DROP POLICY IF EXISTS "anon read own roadmap state" ON public.business_roadmap_state;
CREATE POLICY "anon read own roadmap state"
  ON public.business_roadmap_state FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon read own approvals" ON public.approval_requests;
CREATE POLICY "anon read own approvals"
  ON public.approval_requests FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon read own dept threads" ON public.department_threads;
CREATE POLICY "anon read own dept threads"
  ON public.department_threads FOR SELECT
  TO anon
  USING (true);

-- Service role bypasses RLS by default (Postgres bypassrls grant on the
-- service_role role). All writes go through service-role bearer from BD
-- v3 / approval-queue-handler / dept-thread-spawn-handler / etc. — no
-- explicit policy needed.
