-- ──────────────────────────────────────────────────────────
-- Liren Stand — Supabase schema
-- Apply via Supabase SQL editor
-- ──────────────────────────────────────────────────────────

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  telegram_chat_id text,
  whatsapp_number text,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  tier text check (tier in ('starter', 'pro')),
  xendit_subscription_id text,
  status text check (status in ('active', 'paused', 'canceled')),
  started_at timestamptz default now(),
  next_billing_at timestamptz
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
alter table vps_instances enable row level security;
alter table credits enable row level security;
alter table usage_log enable row level security;
alter table credit_topups enable row level security;

-- Service role bypasses RLS (used by provisioning service + proxy)
-- Customer-facing dashboard policies go here later when /stand/dashboard is built.
