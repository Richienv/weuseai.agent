-- Operator fulfillment + one-time 25% next-purchase promo.
-- AI-video tables only. Payment settlement remains the only mint trigger.

alter table public.ai_video_orders
  add column if not exists list_amount_idr integer;

alter table public.ai_video_orders
  add column if not exists reserved_promo_id uuid;

alter table public.ai_video_orders
  add column if not exists fulfillment_status text;

alter table public.ai_video_orders
  add column if not exists fulfillment_note text;

alter table public.ai_video_orders
  add column if not exists fulfillment_updated_at timestamptz;

alter table public.ai_video_orders
  add column if not exists fulfillment_updated_by text;

update public.ai_video_orders
set list_amount_idr = amount_idr
where list_amount_idr is null;

alter table public.ai_video_orders
  drop constraint if exists ai_video_orders_amount_idr_check;

alter table public.ai_video_orders
  add constraint ai_video_orders_amount_idr_check
    check (amount_idr in (450000, 499000, 99000, 337500, 374250, 74250));

alter table public.ai_video_orders
  drop constraint if exists ai_video_orders_list_amount_idr_check;

alter table public.ai_video_orders
  add constraint ai_video_orders_list_amount_idr_check
    check (list_amount_idr is null or list_amount_idr in (450000, 499000, 99000));

alter table public.ai_video_orders
  drop constraint if exists ai_video_orders_fulfillment_status_check;

alter table public.ai_video_orders
  add constraint ai_video_orders_fulfillment_status_check
    check (fulfillment_status is null or fulfillment_status in (
      'processing', 'in_progress', 'delivered', 'refund_needed', 'refunded', 'extension'
    ));

update public.ai_video_orders
set fulfillment_status = 'processing',
    fulfillment_updated_at = coalesce(paid_at, updated_at)
where status = 'paid' and fulfillment_status is null;

update public.ai_video_orders
set fulfillment_status = 'refunded',
    fulfillment_updated_at = updated_at
where status in ('refunded', 'reversed', 'chargeback') and fulfillment_status is null;

create table if not exists public.ai_video_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ai_video_orders(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in (
    'processing', 'in_progress', 'delivered', 'refund_needed', 'refunded', 'extension'
  )),
  actor text not null check (length(actor) between 1 and 80),
  note text,
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists ai_video_fulfillment_events_order_idx
  on public.ai_video_fulfillment_events (order_id, created_at desc);

create table if not exists public.ai_video_promos (
  id uuid primary key default gen_random_uuid(),
  serial text not null,
  source_order_id uuid not null unique references public.ai_video_orders(id) on delete restrict,
  source_customer_id uuid not null references public.customers(id) on delete restrict,
  percent_off integer not null default 25 check (percent_off = 25),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  reserved_order_id uuid unique references public.ai_video_orders(id) on delete set null,
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.ai_video_orders(id) on delete restrict,
  redeemed_customer_id uuid references public.customers(id) on delete restrict,
  check (serial ~ '^[0-9]{8,12}$'),
  check (expires_at > created_at),
  check (
    (redeemed_at is null and redeemed_order_id is null and redeemed_customer_id is null)
    or (redeemed_at is not null and redeemed_order_id is not null and redeemed_customer_id is not null)
  )
);

create unique index if not exists ai_video_promos_serial_uidx
  on public.ai_video_promos (serial);
create index if not exists ai_video_promos_expires_idx
  on public.ai_video_promos (expires_at, redeemed_at);
create index if not exists ai_video_orders_status_created_idx
  on public.ai_video_orders (status, created_at desc);

alter table public.ai_video_fulfillment_events enable row level security;
alter table public.ai_video_promos enable row level security;
revoke all on table public.ai_video_fulfillment_events from public, anon, authenticated;
revoke all on table public.ai_video_promos from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_video_fulfillment_events to service_role;
grant select, insert, update, delete on table public.ai_video_promos to service_role;

create or replace function public.mint_ai_video_promo_serial()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bytes bytea;
  code text;
  idx integer;
begin
  loop
    bytes := gen_random_bytes(10);
    code := '';
    for idx in 0..9 loop
      code := code || (get_byte(bytes, idx) % 10)::text;
    end loop;
    exit when not exists (
      select 1 from public.ai_video_promos where ai_video_promos.serial = code
    );
  end loop;
  return code;
end;
$$;

revoke all on function public.mint_ai_video_promo_serial() from public, anon, authenticated;

create or replace function public.reserve_ai_video_promo(
  p_serial text,
  p_order_id uuid,
  p_customer_id uuid,
  p_list_amount_idr integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked public.ai_video_promos;
  expected integer;
begin
  if p_serial is null or p_serial !~ '^[0-9]{8,12}$' then
    raise exception 'invalid_promo_serial';
  end if;
  select * into locked from public.ai_video_promos
  where serial = p_serial
  for update;
  if not found then raise exception 'unknown_promo'; end if;
  if locked.redeemed_at is not null then raise exception 'promo_redeemed'; end if;
  if locked.reserved_order_id is not null and locked.reserved_order_id <> p_order_id then
    raise exception 'promo_redeemed';
  end if;
  if locked.expires_at <= statement_timestamp() then raise exception 'promo_expired'; end if;
  expected := p_list_amount_idr - ((p_list_amount_idr * 25) / 100);
  if expected not in (337500, 374250, 74250) then
    raise exception 'promo_amount_mismatch';
  end if;
  update public.ai_video_promos
  set reserved_order_id = p_order_id
  where id = locked.id;
  return locked.id;
end;
$$;

revoke all on function public.reserve_ai_video_promo(text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_video_promo(text, uuid, uuid, integer)
  to service_role;

create or replace function public.release_ai_video_promo(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_video_promos
  set reserved_order_id = null
  where reserved_order_id = p_order_id
    and redeemed_at is null;
end;
$$;

revoke all on function public.release_ai_video_promo(uuid) from public, anon, authenticated;
grant execute on function public.release_ai_video_promo(uuid) to service_role;

drop function if exists public.create_ai_video_pending_order(uuid, uuid, jsonb, text, text, integer);

create function public.create_ai_video_pending_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_attribution jsonb,
  p_policy_version text,
  p_product_code text default 'ai-video-lifetime',
  p_amount_idr integer default 450000,
  p_promo_serial text default null
)
returns public.ai_video_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  out_order public.ai_video_orders;
  list_idr integer;
  promo_id uuid;
begin
  if p_product_code not in ('ai-video-lifetime', 'dfy-ultra', 'dfy-foto5') then
    raise exception 'unknown product';
  end if;
  list_idr := case p_product_code
    when 'ai-video-lifetime' then 450000
    when 'dfy-ultra' then 499000
    else 99000
  end;
  if p_promo_serial is null or length(trim(p_promo_serial)) = 0 then
    if p_amount_idr <> list_idr then raise exception 'sku amount mismatch'; end if;
  else
    if p_amount_idr <> (list_idr - ((list_idr * 25) / 100)) then
      raise exception 'promo_amount_mismatch';
    end if;
  end if;

  select * into out_order
  from public.ai_video_orders
  where customer_id = p_customer_id and status = 'pending'
  for update;

  if found then
    if out_order.product_code = p_product_code and out_order.amount_idr = p_amount_idr then
      return out_order;
    end if;
    perform public.release_ai_video_promo(out_order.id);
    update public.ai_video_orders
    set status = 'expired', updated_at = statement_timestamp()
    where id = out_order.id and status = 'pending';
  end if;

  insert into public.ai_video_orders (
    id, customer_id, product_code, provider_order_id, amount_idr, list_amount_idr,
    attribution, policy_version
  ) values (
    p_order_id, p_customer_id, p_product_code, 'av-' || p_order_id::text,
    p_amount_idr, list_idr, coalesce(p_attribution, '{}'::jsonb), p_policy_version
  ) returning * into out_order;

  if p_promo_serial is not null and length(trim(p_promo_serial)) > 0 then
    promo_id := public.reserve_ai_video_promo(trim(p_promo_serial), out_order.id, p_customer_id, list_idr);
    update public.ai_video_orders
    set reserved_promo_id = promo_id, updated_at = statement_timestamp()
    where id = out_order.id
    returning * into out_order;
  end if;
  return out_order;
exception when unique_violation then
  select * into out_order
  from public.ai_video_orders
  where customer_id = p_customer_id and status = 'pending'
  for update;
  return out_order;
end;
$$;

revoke all on function public.create_ai_video_pending_order(uuid, uuid, jsonb, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_ai_video_pending_order(uuid, uuid, jsonb, text, text, integer, text)
  to service_role;

create or replace function public.claim_midtrans_ai_video_payment(
  p_provider_order_id text,
  p_transaction_id text,
  p_gross_amount_idr integer,
  p_currency text,
  p_paid_at timestamptz
)
returns table (
  claimed boolean,
  order_id uuid,
  customer_id uuid,
  entitlement_id uuid,
  order_status text,
  entitlement_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_order public.ai_video_orders;
  entitlement public.ai_video_entitlements;
begin
  select * into locked_order from public.ai_video_orders
  where provider_order_id = p_provider_order_id
  for update;
  if not found then raise exception 'unknown order'; end if;
  if locked_order.amount_idr <> p_gross_amount_idr or locked_order.currency <> p_currency then
    raise exception 'payment binding mismatch';
  end if;
  if locked_order.provider_payment_id is not null and locked_order.provider_payment_id <> p_transaction_id then
    raise exception 'transaction binding mismatch';
  end if;

  if locked_order.status = 'paid' then
    if locked_order.claim_code is null then
      update public.ai_video_orders
      set claim_code = public.mint_ai_video_claim_code(),
          updated_at = statement_timestamp()
      where id = locked_order.id
      returning * into locked_order;
    end if;
    insert into public.ai_video_promos (
      serial, source_order_id, source_customer_id, created_at, expires_at
    )
    select public.mint_ai_video_promo_serial(), locked_order.id, locked_order.customer_id,
           locked_order.paid_at, locked_order.paid_at + interval '7 days'
    where not exists (
      select 1 from public.ai_video_promos where source_order_id = locked_order.id
    );
    select * into entitlement from public.ai_video_entitlements
    where paid_order_id = locked_order.id;
    return query select false, locked_order.id, locked_order.customer_id,
      entitlement.id, locked_order.status, entitlement.status;
    return;
  end if;

  if locked_order.status <> 'pending' then
    update public.ai_video_orders set status = 'held_for_review',
      provider_payment_id = coalesce(provider_payment_id, p_transaction_id),
      updated_at = statement_timestamp()
    where id = locked_order.id;
    return query select false, locked_order.id, locked_order.customer_id,
      null::uuid, 'held_for_review'::text, null::text;
    return;
  end if;

  update public.ai_video_orders
  set status = 'paid',
      provider_payment_id = p_transaction_id,
      paid_at = p_paid_at,
      claim_code = coalesce(claim_code, public.mint_ai_video_claim_code()),
      fulfillment_status = coalesce(fulfillment_status, 'processing'),
      fulfillment_updated_at = statement_timestamp(),
      fulfillment_updated_by = 'midtrans',
      updated_at = statement_timestamp()
  where id = locked_order.id
  returning * into locked_order;

  update public.ai_video_promos
  set redeemed_at = p_paid_at,
      redeemed_order_id = locked_order.id,
      redeemed_customer_id = locked_order.customer_id
  where reserved_order_id = locked_order.id
    and redeemed_at is null;

  insert into public.ai_video_promos (
    serial, source_order_id, source_customer_id, created_at, expires_at
  )
  select public.mint_ai_video_promo_serial(), locked_order.id, locked_order.customer_id,
         p_paid_at, p_paid_at + interval '7 days'
  where not exists (
    select 1 from public.ai_video_promos where source_order_id = locked_order.id
  );

  insert into public.ai_video_entitlements (customer_id, paid_order_id, status)
  values (locked_order.customer_id, locked_order.id, 'active')
  on conflict (paid_order_id) do nothing;

  select * into entitlement from public.ai_video_entitlements
  where paid_order_id = locked_order.id;
  if entitlement.id is null then raise exception 'entitlement conflict'; end if;

  return query select true, locked_order.id, locked_order.customer_id,
    entitlement.id, 'paid'::text, entitlement.status;
end;
$$;

revoke all on function public.claim_midtrans_ai_video_payment(text,text,integer,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_midtrans_ai_video_payment(text,text,integer,text,timestamptz)
  to service_role;

create or replace function public.transition_midtrans_ai_video_failed(
  p_provider_order_id text,
  p_transaction_id text,
  p_order_status text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_order public.ai_video_orders;
begin
  if p_order_status not in ('failed','expired') then raise exception 'invalid failure status'; end if;
  select * into locked_order from public.ai_video_orders
  where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'unknown order'; end if;
  if locked_order.status = 'paid' then return locked_order.status; end if;
  perform public.release_ai_video_promo(locked_order.id);
  update public.ai_video_orders
  set status = p_order_status,
      provider_payment_id = coalesce(provider_payment_id, p_transaction_id),
      reserved_promo_id = null,
      updated_at = statement_timestamp()
  where id = locked_order.id;
  return p_order_status;
end;
$$;

create or replace function public.set_ai_video_fulfillment(
  p_order_id uuid,
  p_status text,
  p_actor text,
  p_note text default null
)
returns public.ai_video_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked public.ai_video_orders;
begin
  if p_status not in ('processing','in_progress','delivered','refund_needed','refunded','extension') then
    raise exception 'invalid_fulfillment';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'invalid_actor';
  end if;
  select * into locked from public.ai_video_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  insert into public.ai_video_fulfillment_events (order_id, from_status, to_status, actor, note)
  values (locked.id, locked.fulfillment_status, p_status, trim(p_actor), nullif(trim(coalesce(p_note, '')), ''));
  update public.ai_video_orders
  set fulfillment_status = p_status,
      fulfillment_note = nullif(trim(coalesce(p_note, '')), ''),
      fulfillment_updated_at = statement_timestamp(),
      fulfillment_updated_by = trim(p_actor),
      updated_at = statement_timestamp()
  where id = locked.id
  returning * into locked;
  return locked;
end;
$$;

revoke all on function public.set_ai_video_fulfillment(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_ai_video_fulfillment(uuid, text, text, text)
  to service_role;
