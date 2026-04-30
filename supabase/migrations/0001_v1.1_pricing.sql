-- ──────────────────────────────────────────────────────────
-- Migration 0001 — Business model v1.1 alignment
-- Apply via Supabase SQL editor on top of schema.sql.
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────

-- 1. Allow 'studio' tier on subscriptions
alter table subscriptions drop constraint if exists subscriptions_tier_check;
alter table subscriptions add constraint subscriptions_tier_check
  check (tier in ('starter', 'pro', 'studio'));

-- 2. Track Xendit invoice for setup-fee idempotency
alter table subscriptions add column if not exists xendit_invoice_id text unique;

-- 3. Always-On + hosting state per v1.1 add-on model
alter table subscriptions add column if not exists always_on_enabled boolean default false;
alter table subscriptions add column if not exists hosting_active boolean default false;

-- 4. Allow 'pending' and 'failed' subscription states
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'paused', 'canceled', 'failed'));

-- 5. Pending bot token / channel info — customer pastes via dashboard later
alter table customers add column if not exists telegram_bot_token text;
alter table customers add column if not exists telegram_allowed_user_ids text;

-- 6. subscription_invoices — tracks each monthly billing cycle
create table if not exists subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  xendit_invoice_id text unique,
  kind text check (kind in ('setup_first_month', 'monthly_hosting', 'monthly_always_on')),
  amount_idr integer not null,
  period_start timestamptz,
  period_end timestamptz,
  status text check (status in ('pending', 'paid', 'expired', 'failed')),
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists idx_subscription_invoices_subscription
  on subscription_invoices(subscription_id, created_at desc);

create index if not exists idx_subscription_invoices_xendit
  on subscription_invoices(xendit_invoice_id);

-- 7. RLS on new table — service role bypasses
alter table subscription_invoices enable row level security;
