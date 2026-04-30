-- ──────────────────────────────────────────────────────────
-- weuseai.agent — Supabase schema (v1.1)
-- Apply via Supabase SQL editor for a fresh project.
-- For an existing project applied at v1.0, run the migration in
-- supabase/migrations/0001_v1.1_pricing.sql instead.
-- ──────────────────────────────────────────────────────────

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  telegram_chat_id text,
  telegram_bot_token text,
  telegram_allowed_user_ids text,
  whatsapp_number text,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  tier text check (tier in ('starter', 'pro', 'studio')),
  status text check (status in ('pending', 'active', 'paused', 'canceled', 'failed')),
  xendit_invoice_id text unique,
  always_on_enabled boolean default false,
  hosting_active boolean default false,
  started_at timestamptz default now(),
  next_billing_at timestamptz
);

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

create table if not exists vps_instances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  idcloudhost_vps_id text not null,
  ip_address inet,
  ssh_key_id text,
  region text,
  status text check (status in ('provisioning', 'running', 'stopped', 'failed')),
  created_at timestamptz default now()
);

create table if not exists credits (
  customer_id uuid primary key references customers(id) on delete cascade,
  balance_usd_cents integer default 0 check (balance_usd_cents >= 0),
  updated_at timestamptz default now()
);

create table if not exists usage_log (
  id bigserial primary key,
  customer_id uuid references customers(id) on delete cascade,
  vps_instance_id uuid references vps_instances(id) on delete set null,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd_cents integer,
  created_at timestamptz default now()
);

create table if not exists credit_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  xendit_invoice_id text unique,
  amount_idr integer,
  credits_usd_cents integer,
  created_at timestamptz default now()
);

create index if not exists idx_usage_log_customer_time on usage_log(customer_id, created_at desc);
create index if not exists idx_subscriptions_customer on subscriptions(customer_id);
create index if not exists idx_vps_instances_customer on vps_instances(customer_id);
create index if not exists idx_subscription_invoices_subscription
  on subscription_invoices(subscription_id, created_at desc);
create index if not exists idx_subscription_invoices_xendit
  on subscription_invoices(xendit_invoice_id);

-- ──────────────────────────────────────────────────────────
-- RPC: atomic credit decrement
-- Hermes proxy panggil ini setiap LLM call → credit balance turun
-- ──────────────────────────────────────────────────────────

create or replace function decrement_credits(p_customer_id uuid, p_cents integer)
returns integer
language plpgsql
security definer
as $$
declare
  new_balance integer;
begin
  update credits
    set balance_usd_cents = greatest(0, balance_usd_cents - p_cents),
        updated_at = now()
    where customer_id = p_customer_id
    returning balance_usd_cents into new_balance;
  return coalesce(new_balance, 0);
end;
$$;

-- ──────────────────────────────────────────────────────────
-- RLS — basic, refine before public launch
-- ──────────────────────────────────────────────────────────

alter table customers enable row level security;
alter table subscriptions enable row level security;
alter table subscription_invoices enable row level security;
alter table vps_instances enable row level security;
alter table credits enable row level security;
alter table usage_log enable row level security;
alter table credit_topups enable row level security;

-- Service role bypasses RLS (used by Edge Functions, provisioning service, proxy)
-- Customer-facing dashboard policies go here later when /dashboard is built.
