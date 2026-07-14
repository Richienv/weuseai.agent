-- Dashboard chat (Phase 2) — per-customer API-server key storage + durable
-- per-cid rate/budget. Ships DARK (the relay is flag-gated off); this migration
-- only adds inert schema. See docs/plans/2026-06-16-dashboard-build-prompt.md.

-- 1. Per-customer Hermes API_SERVER_KEY, encrypted at rest (AES-256-GCM via
--    _shared/integration-credential-crypto.ts; cipher = {ciphertext,iv,auth_tag,key_version}).
--    A single VPS .env leak must compromise exactly one customer (random key,
--    NOT a deterministic HMAC). `api_server_enabled` flips true only after the
--    provision-time loopback+listening assertion passes (see setup-script, Phase 5).
alter table vps_instances
  add column if not exists api_server_key_cipher jsonb,
  add column if not exists api_server_enabled boolean not null default false;

-- Defense-in-depth: the anon role must never read the ciphertext column. The
-- relay resolves it service-role-side only. (Wrapped in a DO so re-running on a
-- DB where anon has no table grant at all is a no-op, not an error.)
do $$
begin
  begin
    revoke select (api_server_key_cipher) on vps_instances from anon;
  exception when others then null;
  end;
end $$;

-- 2. Durable per-cid rate + token budget. Authoritative (a Fly in-memory
--    counter is bypassable by a restart). One row per customer.
create table if not exists agent_chat_usage (
  customer_id  uuid primary key references customers(id) on delete cascade,
  window_start timestamptz not null default now(),
  req_count    int  not null default 0,
  jkt_day      date not null default (now() at time zone 'Asia/Jakarta')::date,
  tokens_today bigint not null default 0,
  updated_at   timestamptz not null default now()
);
alter table agent_chat_usage enable row level security;
drop policy if exists "agent_chat_usage anon deny" on agent_chat_usage;
create policy "agent_chat_usage anon deny" on agent_chat_usage
  for all to anon using (false) with check (false);

-- 3. Atomic check-and-pre-charge. SECURITY DEFINER MUST pin search_path
--    (privilege-escalation hardening). Conservative defaults: 10 req/60s,
--    60k tokens/Jakarta-day. Pre-charges the clamped ceiling; agent_chat_rate_commit
--    refunds the (ceiling - actual) delta — never pre-charge an estimate and
--    commit-actual (that fails OPEN on a dropped commit).
create or replace function public.agent_chat_rate_check(p_cid uuid, p_est_tokens int)
returns table(allowed boolean, retry_after int, reason text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_rpm   int    := 10;
  v_daily bigint := 60000;
  today   date   := (now() at time zone 'Asia/Jakarta')::date;
  r       agent_chat_usage%rowtype;
  new_window timestamptz;
  new_reqs   int;
  new_tokens bigint;
begin
  insert into agent_chat_usage (customer_id) values (p_cid)
    on conflict (customer_id) do nothing;
  select * into r from agent_chat_usage where customer_id = p_cid for update;

  -- roll the 60s rate window
  if now() - r.window_start > interval '60 seconds' then
    new_window := now(); new_reqs := 0;
  else
    new_window := r.window_start; new_reqs := r.req_count;
  end if;

  -- roll the Jakarta-day token budget
  if r.jkt_day < today then
    new_tokens := 0;
  else
    new_tokens := r.tokens_today;
  end if;

  -- rate ceiling
  if new_reqs + 1 > v_rpm then
    return query select false,
      greatest(1, ceil(extract(epoch from (new_window + interval '60 seconds' - now())))::int),
      'rate_limited';
    return;
  end if;

  -- daily token ceiling (pre-charge the clamped estimate)
  if new_tokens + p_est_tokens > v_daily then
    return query select false, 0, 'budget_exceeded';
    return;
  end if;

  -- accept: persist the increment + pre-charge
  update agent_chat_usage set
    window_start = new_window,
    req_count    = new_reqs + 1,
    jkt_day      = today,
    tokens_today = new_tokens + p_est_tokens,
    updated_at   = now()
  where customer_id = p_cid;

  return query select true, 0, 'ok';
end; $$;

-- 4. Reconcile actual usage. p_delta = actual_tokens - pre_charged_ceiling
--    (normally NEGATIVE — a refund). Clamped at 0 so a refund can't underflow.
create or replace function public.agent_chat_rate_commit(p_cid uuid, p_delta bigint)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update agent_chat_usage
    set tokens_today = greatest(0, tokens_today + p_delta), updated_at = now()
  where customer_id = p_cid;
end; $$;
