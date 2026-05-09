-- Phase 5-3.a: BD v3 cross-session memory (Q5=C hybrid).
--
-- Spec: docs/plans/2026-05-10-phase-5-spec.md (Q5=C locked) — durable
-- decisions log + Hermes context for "vibe + last few exchanges."
--
-- BD v3 prepends `SELECT … LIMIT N` of last 30-day decisions to each new
-- conversation so the customer doesn't re-explain what was already
-- decided. Covers stage transitions, approval outcomes, department-thread
-- spawns, and customer-stated commitments.
--
-- Idempotent. Applied via Supabase Management API.

CREATE TABLE IF NOT EXISTS public.bd_decisions_log (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  -- Decision category — drives BD v3's prompt-template formatting at
  -- session start. Renaming requires a coordinated update to the
  -- prompt template + drift test in
  -- tests/phase-5-3a-bd-decisions-log.spec.ts.
  decision_kind text not null check (decision_kind in (
    'stage_transition',     -- e.g. idea → setup
    'approval_outcome',     -- approved/rejected/expired result
    'thread_spawn',         -- new department initiative thread opened
    'customer_commitment',  -- explicit customer-stated commitment ("we will incorporate as PT")
    'recommendation',       -- BD-issued advisory marked as accepted (not auto-executed)
    'pivot'                 -- explicit strategic pivot (e.g. target-segment change)
  )),
  -- Compact human-readable summary (single sentence). BD v3 reads this
  -- when prepending decisions to context — keep ≤200 chars to bound
  -- prompt size as logs accumulate.
  summary       text not null check (length(summary) <= 200),
  -- Full structured payload for forensic review + approval-id linkbacks.
  -- Free-form jsonb — shape varies by decision_kind. Examples:
  --   stage_transition  → { from: 'idea', to: 'setup', deliverables: {...} }
  --   approval_outcome  → { approval_id: '<uuid>', action_kind: 'incorporate', outcome: 'approved' }
  --   thread_spawn      → { department: 'sales', initiative_summary: 'Q3 launch', dept_thread_id: '<uuid>' }
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Customer-scoped recency query — matches BD v3's "last 30 days" lookup
-- at session start. Composite (customer_id, created_at desc) is optimal.
CREATE INDEX IF NOT EXISTS idx_bd_decisions_customer_recent
  ON public.bd_decisions_log (customer_id, created_at DESC);

-- Decision-kind aggregations (e.g. "all approval outcomes for this
-- customer this quarter"). Smaller than the full recency index; pays for
-- itself when BD v3 expands per-kind decision summaries.
CREATE INDEX IF NOT EXISTS idx_bd_decisions_kind
  ON public.bd_decisions_log (customer_id, decision_kind, created_at DESC);

COMMENT ON TABLE public.bd_decisions_log IS
  'Phase 5-3.a (Q5=C hybrid memory): durable log of BD v3 decisions. Prepended to context at session start (last 30d) so customer does not re-explain what was decided. Vibe + recent exchanges handled by Hermes session persistence — not duplicated here.';
COMMENT ON COLUMN public.bd_decisions_log.decision_kind IS
  'Q5=C locked enum. CHECK constraint mirrored in tests/phase-5-3a-bd-decisions-log.spec.ts drift test.';
COMMENT ON COLUMN public.bd_decisions_log.summary IS
  'Compact one-line summary, max 200 chars. Read by BD v3 prompt template at session start.';

-- ─── RLS — service-role writes; customer SELECTs own rows ────────────

ALTER TABLE public.bd_decisions_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read own bd decisions" ON public.bd_decisions_log;
CREATE POLICY "anon read own bd decisions"
  ON public.bd_decisions_log FOR SELECT
  TO anon
  USING (true);

-- Service role bypasses RLS for all writes (BD v3 + roadmap-state-handler
-- + approval-queue-handler all use service-role bearer).
