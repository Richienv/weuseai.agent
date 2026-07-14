-- Phase 1 Week 2 (2026-05-18 consult): the state-machine-between-skill-
-- invocations engine for persona playbooks.
--
-- A playbook is a sequence of atomic skill invocations. This table holds
-- one row per (customer, playbook) run — the cursor (current_step) plus
-- the accumulated per-step outputs (state_data) — so a playbook survives
-- message gaps, customer think-time, and VPS restarts. The persona's
-- playbook skill reaches this table only through the X-CID-gated
-- `flow-state` Edge Function; it is never customer-readable directly.

create table if not exists customer_flow_state (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  -- Playbook identifier, e.g. 'market-research', 'pitch-deck', 'customer-reply'.
  playbook_id   text not null,
  current_step  int  not null default 1 check (current_step >= 1),
  total_steps   int  not null check (total_steps >= 1),
  status        text not null default 'in_progress'
    check (status in (
      'in_progress',       -- mid-run, ready for the next advance
      'awaiting_customer', -- parked — waiting for the customer to reply
      'escalated',         -- parked at a hard gate — needs explicit approval
      'completed',
      'aborted'
    )),
  -- Accumulated step outputs, shallow-merged on each advance.
  state_data    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One active run per playbook per customer. `start` upserts on this
  -- key, resetting a stale/completed run rather than colliding.
  unique (customer_id, playbook_id)
);

create index if not exists customer_flow_state_customer_idx
  on customer_flow_state(customer_id);

comment on table customer_flow_state is
  'Per-(customer,playbook) state-machine cursor for persona playbooks. '
  'Written only via the X-CID-gated flow-state Edge Function. '
  'Phase 1 Week 2, 2026-05-18 consult.';

-- RLS on, no policies: only the service-role key (used by the flow-state
-- Edge Function) may touch it. Customers reach their own run through the
-- function's X-CID gate, never via a direct anon-key query — same
-- fail-closed posture as the Sesi D pass-3 gates.
alter table customer_flow_state enable row level security;
