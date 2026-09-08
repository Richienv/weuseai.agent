-- AI Video is a separate lifetime product. It deliberately does not reuse
-- subscriptions or subscription_invoices: historical Xendit/Midtrans rows
-- keep their original meaning and provisioning behavior.

create table public.ai_video_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  product_code text not null default 'ai-video-lifetime'
    check (product_code = 'ai-video-lifetime'),
  payment_provider text not null default 'midtrans'
    check (payment_provider = 'midtrans'),
  provider_order_id text not null unique
    check (provider_order_id ~ '^av-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  provider_payment_id text,
  provider_redirect_url text,
  checkout_create_lease_until timestamptz,
  amount_idr integer not null default 450000 check (amount_idr = 450000),
  currency text not null default 'IDR' check (currency = 'IDR'),
  status text not null default 'pending'
    check (status in (
      'pending','paid','failed','expired','held_for_review',
      'refunded','reversed','chargeback'
    )),
  attribution jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attribution) = 'object'),
  policy_version text not null check (length(policy_version) between 1 and 32),
  paid_at timestamptz,
  refund_requested_at timestamptz,
  refund_request_id uuid unique,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (id, customer_id)
);

create unique index ai_video_one_pending_order_per_customer
  on public.ai_video_orders (customer_id)
  where status = 'pending';
create index ai_video_orders_customer_created_idx
  on public.ai_video_orders (customer_id, created_at desc);

create table public.ai_video_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  paid_order_id uuid not null unique references public.ai_video_orders(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended')),
  activated_at timestamptz not null default statement_timestamp(),
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (customer_id),
  unique (id, customer_id)
);

create table public.ai_video_recovery_grants (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.ai_video_orders(id) on delete cascade,
  token_hash bytea not null unique,
  purpose text not null check (purpose in ('checkout_recovery','session_recovery')),
  scopes text[] not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check (
    (purpose = 'checkout_recovery' and order_id is null) or
    (purpose = 'session_recovery' and order_id is not null)
  )
);
create index ai_video_recovery_customer_idx
  on public.ai_video_recovery_grants (customer_id, created_at desc);

create table public.ai_video_channel_links (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null,
  customer_id uuid not null,
  channel text not null check (channel in ('telegram','whatsapp')),
  external_user_id text,
  external_chat_id text,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  link_token_hash bytea unique,
  link_expires_at timestamptz,
  link_used_at timestamptz,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  foreign key (entitlement_id, customer_id)
    references public.ai_video_entitlements(id, customer_id) on delete cascade,
  check (
    (status = 'pending' and link_token_hash is not null and link_expires_at is not null) or
    (status in ('active','revoked'))
  )
);
create unique index ai_video_one_active_channel_per_entitlement
  on public.ai_video_channel_links (entitlement_id, channel)
  where status = 'active';
create unique index ai_video_one_active_telegram_user
  on public.ai_video_channel_links (external_user_id)
  where channel = 'telegram' and status = 'active';
create unique index ai_video_one_active_telegram_chat
  on public.ai_video_channel_links (external_chat_id)
  where channel = 'telegram' and status = 'active';

create table public.ai_video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null,
  customer_id uuid not null,
  channel_link_id uuid references public.ai_video_channel_links(id) on delete set null,
  prompt_category text not null check (prompt_category in (
    'ugc-product-ad','cinematic-product','consistent-character',
    'image-to-video','storyboard-sequence','reels-broll'
  )),
  prompt_version integer not null default 1 check (prompt_version > 0),
  source_brief text not null check (length(source_brief) between 1 and 8000),
  planned_prompt text not null check (length(planned_prompt) between 1 and 16000),
  negative_prompt text,
  aspect_ratio text not null check (aspect_ratio in ('16:9','9:16','1:1','4:3','3:4','21:9','adaptive')),
  duration_seconds integer not null check (duration_seconds between 1 and 20),
  generate_audio boolean not null default false,
  input_bucket text,
  input_object_path text,
  status text not null default 'drafted' check (status in (
    'drafted','queued','submitted','running','succeeded','failed','cancelled','expired'
  )),
  provider text not null default 'byteplus_modelark' check (provider = 'byteplus_modelark'),
  provider_model_id text,
  provider_task_id text unique,
  provider_video_url text,
  failure_code text,
  confirmed_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  cleanup_completed_at timestamptz,
  poll_attempts integer not null default 0 check (poll_attempts between 0 and 20),
  lease_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  foreign key (entitlement_id, customer_id)
    references public.ai_video_entitlements(id, customer_id) on delete restrict
);
create index ai_video_render_jobs_entitlement_idx
  on public.ai_video_render_jobs (entitlement_id, created_at desc);
create index ai_video_render_jobs_due_idx
  on public.ai_video_render_jobs (status, lease_until, updated_at)
  where status in ('submitted','running','succeeded');

create table public.ai_video_payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ai_video_orders(id) on delete restrict,
  event_key text not null unique,
  event_type text not null,
  provider_transaction_id text not null,
  gross_amount_idr integer not null check (gross_amount_idr > 0),
  reversal_amount_idr integer,
  provider_status text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp()
);
create index ai_video_payment_events_order_idx
  on public.ai_video_payment_events (order_id, created_at desc);

-- Private inputs are short lived. No output bucket is created: provider URLs
-- are delivered directly and are not copied into our storage.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ai-video-inputs', 'ai-video-inputs', false, 20971520)
on conflict (id) do update
set public = false, file_size_limit = 20971520;

create or replace function public.create_ai_video_pending_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_attribution jsonb,
  p_policy_version text
)
returns public.ai_video_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  out_order public.ai_video_orders;
begin
  select * into out_order
  from public.ai_video_orders
  where customer_id = p_customer_id and status = 'pending'
  for update;

  if found then return out_order; end if;

  insert into public.ai_video_orders (
    id, customer_id, provider_order_id, attribution, policy_version
  ) values (
    p_order_id, p_customer_id, 'av-' || p_order_id::text,
    coalesce(p_attribution, '{}'::jsonb), p_policy_version
  ) returning * into out_order;
  return out_order;
exception when unique_violation then
  select * into out_order
  from public.ai_video_orders
  where customer_id = p_customer_id and status = 'pending'
  for update;
  return out_order;
end;
$$;

create or replace function public.claim_ai_video_snap_creation(
  p_order_id uuid,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare claimed boolean;
begin
  update public.ai_video_orders
  set checkout_create_lease_until = statement_timestamp() + make_interval(secs => greatest(10, least(p_lease_seconds, 300))),
      updated_at = statement_timestamp()
  where id = p_order_id
    and status = 'pending'
    and provider_redirect_url is null
    and (checkout_create_lease_until is null or checkout_create_lease_until < statement_timestamp())
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.complete_ai_video_snap_creation(
  p_order_id uuid,
  p_redirect_url text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_redirect_url !~ '^https://' then raise exception 'invalid redirect url'; end if;
  update public.ai_video_orders
  set provider_redirect_url = p_redirect_url,
      checkout_create_lease_until = null,
      updated_at = statement_timestamp()
  where id = p_order_id and status = 'pending';
  if not found then raise exception 'order not pending'; end if;
end;
$$;

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
  set status = 'paid', provider_payment_id = p_transaction_id,
      paid_at = p_paid_at, updated_at = statement_timestamp()
  where id = locked_order.id;

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
declare current_status text;
begin
  if p_order_status not in ('failed','expired') then raise exception 'invalid failure status'; end if;
  select status into current_status from public.ai_video_orders
  where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'unknown order'; end if;
  if current_status = 'paid' then return current_status; end if;
  update public.ai_video_orders
  set status = p_order_status,
      provider_payment_id = coalesce(provider_payment_id, p_transaction_id),
      updated_at = statement_timestamp()
  where provider_order_id = p_provider_order_id;
  return p_order_status;
end;
$$;

create or replace function public.record_midtrans_ai_video_reversal(
  p_provider_order_id text,
  p_transaction_id text,
  p_event_key text,
  p_event_type text,
  p_gross_amount_idr integer,
  p_reversal_amount_idr integer,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare locked_order public.ai_video_orders;
declare inserted_count integer := 0;
declare next_status text;
begin
  select * into locked_order from public.ai_video_orders
  where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'unknown order'; end if;
  if locked_order.provider_payment_id is not null and locked_order.provider_payment_id <> p_transaction_id then
    raise exception 'transaction binding mismatch';
  end if;
  if locked_order.amount_idr <> p_gross_amount_idr then raise exception 'amount mismatch'; end if;

  insert into public.ai_video_payment_events (
    order_id, event_key, event_type, provider_transaction_id,
    gross_amount_idr, reversal_amount_idr, provider_status, occurred_at
  ) values (
    locked_order.id, p_event_key, p_event_type, p_transaction_id,
    p_gross_amount_idr, p_reversal_amount_idr, p_event_type, p_occurred_at
  ) on conflict (event_key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  next_status := case p_event_type
    when 'chargeback' then 'chargeback'
    when 'partial_chargeback' then 'chargeback'
    when 'reversal' then 'reversed'
    else 'refunded'
  end;
  update public.ai_video_orders
  set status = next_status, updated_at = statement_timestamp()
  where id = locked_order.id;
  update public.ai_video_entitlements
  set status = 'suspended', suspended_at = statement_timestamp(),
      suspension_reason = p_event_type, updated_at = statement_timestamp()
  where paid_order_id = locked_order.id;
  return true;
end;
$$;

create or replace function public.consume_ai_video_recovery_grant(p_token_hash text)
returns table (customer_id uuid, order_id uuid, purpose text, scopes text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.ai_video_recovery_grants g
  set used_at = statement_timestamp()
  where g.token_hash = decode(p_token_hash, 'hex')
    and g.used_at is null and g.revoked_at is null
    and g.expires_at > statement_timestamp()
  returning g.customer_id, g.order_id, g.purpose, g.scopes;
end;
$$;

create or replace function public.create_ai_video_session_recovery_grant(
  p_customer_id uuid,
  p_order_id uuid,
  p_token_hash text,
  p_scopes text[],
  p_ttl_seconds integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare grant_id uuid;
begin
  if not exists (
    select 1 from public.ai_video_orders o
    join public.ai_video_entitlements e on e.paid_order_id = o.id
    where o.id = p_order_id and o.customer_id = p_customer_id
      and o.status = 'paid' and e.status = 'active'
  ) then return null; end if;
  insert into public.ai_video_recovery_grants (
    customer_id, order_id, token_hash, purpose, scopes, expires_at
  ) values (
    p_customer_id, p_order_id, decode(p_token_hash, 'hex'),
    'session_recovery', p_scopes,
    statement_timestamp() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 3600))
  ) returning id into grant_id;
  return grant_id;
end;
$$;

create or replace function public.create_ai_video_link_code(
  p_entitlement_id uuid,
  p_customer_id uuid,
  p_token_hash text,
  p_channel text default 'telegram',
  p_ttl_seconds integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare link_id uuid;
begin
  perform 1 from public.ai_video_entitlements
  where id = p_entitlement_id and customer_id = p_customer_id and status = 'active'
  for update;
  if not found then return null; end if;
  update public.ai_video_channel_links set status = 'revoked', revoked_at = statement_timestamp()
  where entitlement_id = p_entitlement_id and channel = p_channel and status = 'pending';
  insert into public.ai_video_channel_links (
    entitlement_id, customer_id, channel, link_token_hash, link_expires_at
  ) values (
    p_entitlement_id, p_customer_id, p_channel, decode(p_token_hash, 'hex'),
    statement_timestamp() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 1800))
  ) returning id into link_id;
  return link_id;
end;
$$;

create or replace function public.consume_ai_video_link_code(
  p_token_hash text,
  p_external_user_id text,
  p_external_chat_id text
)
returns table (link_id uuid, entitlement_id uuid, customer_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.ai_video_channel_links l
  set status = 'active', external_user_id = p_external_user_id,
      external_chat_id = p_external_chat_id, link_used_at = statement_timestamp(),
      linked_at = statement_timestamp(), updated_at = statement_timestamp()
  from public.ai_video_entitlements e
  where l.link_token_hash = decode(p_token_hash, 'hex')
    and l.status = 'pending' and l.link_used_at is null
    and l.link_expires_at > statement_timestamp()
    and e.id = l.entitlement_id and e.customer_id = l.customer_id
    and e.status = 'active'
  returning l.id, l.entitlement_id, l.customer_id;
end;
$$;

create or replace function public.create_ai_video_render_draft(
  p_job_id uuid,
  p_entitlement_id uuid,
  p_customer_id uuid,
  p_channel_link_id uuid,
  p_prompt_category text,
  p_source_brief text,
  p_planned_prompt text,
  p_negative_prompt text,
  p_aspect_ratio text,
  p_duration_seconds integer,
  p_generate_audio boolean,
  p_input_bucket text default null,
  p_input_object_path text default null
)
returns public.ai_video_render_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare out_job public.ai_video_render_jobs;
begin
  perform 1 from public.ai_video_entitlements
  where id = p_entitlement_id and customer_id = p_customer_id and status = 'active'
  for update;
  if not found then raise exception 'inactive entitlement'; end if;
  if (select count(*) from public.ai_video_render_jobs
      where entitlement_id = p_entitlement_id
        and status in ('drafted','queued','submitted','running')) >= 3 then
    raise exception 'busy';
  end if;
  if (select count(*) from public.ai_video_render_jobs
      where entitlement_id = p_entitlement_id
        and created_at > statement_timestamp() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;
  insert into public.ai_video_render_jobs (
    id, entitlement_id, customer_id, channel_link_id, prompt_category,
    source_brief, planned_prompt, negative_prompt, aspect_ratio,
    duration_seconds, generate_audio, input_bucket, input_object_path
  ) values (
    p_job_id, p_entitlement_id, p_customer_id, p_channel_link_id, p_prompt_category,
    p_source_brief, p_planned_prompt, p_negative_prompt, p_aspect_ratio,
    p_duration_seconds, p_generate_audio, p_input_bucket, p_input_object_path
  ) returning * into out_job;
  return out_job;
end;
$$;

create or replace function public.queue_ai_video_render_job(
  p_job_id uuid,
  p_channel_link_id uuid
)
returns public.ai_video_render_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare out_job public.ai_video_render_jobs;
begin
  select j.* into out_job
  from public.ai_video_render_jobs j
  join public.ai_video_channel_links l on l.id = j.channel_link_id
  join public.ai_video_entitlements e on e.id = j.entitlement_id
  where j.id = p_job_id and l.id = p_channel_link_id
    and l.status = 'active' and e.status = 'active'
  for update of j;
  if not found then raise exception 'job not available'; end if;
  if out_job.status = 'drafted' then
    update public.ai_video_render_jobs
    set status = 'queued', confirmed_at = statement_timestamp(), updated_at = statement_timestamp()
    where id = p_job_id returning * into out_job;
  end if;
  return out_job;
end;
$$;

create or replace function public.claim_due_ai_video_render_jobs(
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns setof public.ai_video_render_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id from public.ai_video_render_jobs
    where status in ('submitted','running','succeeded')
      and (delivered_at is null or cleanup_completed_at is null) and poll_attempts < 20
      and (lease_until is null or lease_until < statement_timestamp())
    order by updated_at asc
    for update skip locked
    limit least(greatest(p_limit, 1), 25)
  )
  update public.ai_video_render_jobs j
  set lease_until = statement_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 30), 600)),
      poll_attempts = poll_attempts + 1,
      updated_at = statement_timestamp()
  from candidates c where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.claim_ai_video_delivery(
  p_job_id uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare claimed boolean;
begin
  update public.ai_video_render_jobs
  set lease_until = statement_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 30), 600)),
      updated_at = statement_timestamp()
  where id = p_job_id and status = 'succeeded' and delivered_at is null
    and (lease_until is null or lease_until < statement_timestamp())
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

-- Tables and all state-changing RPCs are service-role only. No browser gets
-- direct table access; capabilities are enforced by Edge Functions.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'ai_video_orders','ai_video_entitlements','ai_video_recovery_grants',
    'ai_video_channel_links','ai_video_render_jobs','ai_video_payment_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

revoke all on function public.create_ai_video_pending_order(uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.claim_ai_video_snap_creation(uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_ai_video_snap_creation(uuid,text) from public, anon, authenticated;
revoke all on function public.claim_midtrans_ai_video_payment(text,text,integer,text,timestamptz) from public, anon, authenticated;
revoke all on function public.transition_midtrans_ai_video_failed(text,text,text) from public, anon, authenticated;
revoke all on function public.record_midtrans_ai_video_reversal(text,text,text,text,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.consume_ai_video_recovery_grant(text) from public, anon, authenticated;
revoke all on function public.create_ai_video_session_recovery_grant(uuid,uuid,text,text[],integer) from public, anon, authenticated;
revoke all on function public.create_ai_video_link_code(uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.consume_ai_video_link_code(text,text,text) from public, anon, authenticated;
revoke all on function public.create_ai_video_render_draft(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,boolean,text,text) from public, anon, authenticated;
revoke all on function public.queue_ai_video_render_job(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_due_ai_video_render_jobs(integer,integer) from public, anon, authenticated;
revoke all on function public.claim_ai_video_delivery(uuid,integer) from public, anon, authenticated;

grant execute on function public.create_ai_video_pending_order(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.claim_ai_video_snap_creation(uuid,integer) to service_role;
grant execute on function public.complete_ai_video_snap_creation(uuid,text) to service_role;
grant execute on function public.claim_midtrans_ai_video_payment(text,text,integer,text,timestamptz) to service_role;
grant execute on function public.transition_midtrans_ai_video_failed(text,text,text) to service_role;
grant execute on function public.record_midtrans_ai_video_reversal(text,text,text,text,integer,integer,timestamptz) to service_role;
grant execute on function public.consume_ai_video_recovery_grant(text) to service_role;
grant execute on function public.create_ai_video_session_recovery_grant(uuid,uuid,text,text[],integer) to service_role;
grant execute on function public.create_ai_video_link_code(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.consume_ai_video_link_code(text,text,text) to service_role;
grant execute on function public.create_ai_video_render_draft(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,boolean,text,text) to service_role;
grant execute on function public.queue_ai_video_render_job(uuid,uuid) to service_role;
grant execute on function public.claim_due_ai_video_render_jobs(integer,integer) to service_role;
grant execute on function public.claim_ai_video_delivery(uuid,integer) to service_role;
