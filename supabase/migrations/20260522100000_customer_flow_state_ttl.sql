-- P4G parked-run TTL for customer_flow_state (2026-05-22 consult).
--
-- The pt-perorangan-registration playbook is multi-day (10-18 calendar
-- days end to end), with hard-gates that park the run at `escalated`
-- waiting on customer action. Without a TTL, abandoned runs accumulate
-- indefinitely in the escalated/awaiting_customer states. This migration
-- adds an `expires_at` column populated by the flow-state handler when a
-- run is parked and cleared when it resumes. A daily sweep Edge Function
-- (flow-state-ttl-sweep) aborts rows past their expiry.
--
-- Default park TTL: 14 days from the most recent park. Configurable per
-- playbook in future iterations; locked at 14d for v1 because that
-- matches the existing `incorporate` approval_requests expiry window.

alter table customer_flow_state
  add column if not exists expires_at timestamptz;

comment on column customer_flow_state.expires_at is
  'When a parked run (awaiting_customer / escalated) auto-aborts. Set by '
  'the flow-state handler at park time; cleared on resume / complete / '
  'abort. Swept daily by flow-state-ttl-sweep.';

-- Partial index for the sweep — only the parked rows need to be queried,
-- and only by their expiry timestamp. Tiny index, fast scan.
create index if not exists customer_flow_state_expires_at_parked_idx
  on customer_flow_state(expires_at)
  where status in ('awaiting_customer', 'escalated') and expires_at is not null;
