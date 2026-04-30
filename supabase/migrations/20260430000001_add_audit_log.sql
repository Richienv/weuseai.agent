-- ──────────────────────────────────────────────────────────
-- Migration 20260430000001 — audit_log table
-- Action-level tracking. Idempotent.
-- ──────────────────────────────────────────────────────────

create table if not exists audit_log (
  id bigserial primary key,
  customer_id uuid references customers(id) on delete cascade,
  action text not null,
  target text,
  result text check (result in ('ok', 'error')),
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_customer_time
  on audit_log(customer_id, created_at desc);

alter table audit_log enable row level security;
