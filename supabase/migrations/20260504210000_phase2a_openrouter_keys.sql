-- Phase 2A: per-customer OpenRouter key minting + LLM usage tracking.
--
-- Replaces the planned Cloudflare Worker LLM proxy. OpenRouter mints scoped
-- keys per customer with built-in spend caps; we store the hash (not the
-- secret) for revocation/usage queries, and snapshot daily usage for
-- billing reconciliation.

create table if not exists customer_openrouter_keys (
  customer_id uuid primary key references customers(id) on delete cascade,
  -- OpenRouter's `hash` field — the deletion identifier (NOT the secret key).
  -- Real key is shipped once over SSH to the VM's ~/.hermes/.env and never
  -- stored on our side.
  openrouter_key_hash text not null,
  -- Spend cap, in USD cents. Maps from tier on initial mint:
  --   starter → 300 ($3), pro → 500 ($5), studio → 3000 ($30).
  credit_limit_usd_cents bigint not null,
  created_at timestamptz default now(),
  last_topped_up_at timestamptz
);

create index if not exists customer_openrouter_keys_hash_idx
  on customer_openrouter_keys(openrouter_key_hash);

create table if not exists llm_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  -- Polled from OpenRouter daily; stored for billing audit + cost dashboards.
  snapshot_at timestamptz not null,
  total_cost_usd_cents bigint not null
);

create index if not exists llm_usage_snapshots_customer_at_idx
  on llm_usage_snapshots(customer_id, snapshot_at desc);
