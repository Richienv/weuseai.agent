-- Founder generate desk. Separate from customer BYOK render jobs and DFY factory.

create table if not exists public.ai_video_operator_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ai_video_orders(id) on delete restrict,
  example_id text,
  prompt text not null check (char_length(prompt) between 40 and 16000),
  ratio text not null check (ratio in ('9:16', '16:9', '21:9', '1:1')),
  duration_seconds integer not null check (duration_seconds between 4 and 15),
  generate_audio boolean not null default false,
  status text not null check (status in (
    'queued', 'submitted', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  provider text not null default 'byteplus_modelark' check (provider = 'byteplus_modelark'),
  provider_model_id text,
  provider_task_id text unique,
  provider_video_url text,
  result_bucket text,
  result_path text,
  attempt integer not null default 0 check (attempt between 0 and 2),
  error_code text,
  usage jsonb not null default '{}'::jsonb,
  ref_paths text[] not null default '{}'::text[],
  ref_urls text[] not null default '{}'::text[],
  poll_attempts integer not null default 0 check (poll_attempts between 0 and 20),
  lease_until timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (cardinality(ref_paths) + cardinality(ref_urls) between 0 and 8)
);

create index if not exists ai_video_operator_jobs_status_idx
  on public.ai_video_operator_jobs (status, updated_at desc);
create index if not exists ai_video_operator_jobs_order_idx
  on public.ai_video_operator_jobs (order_id, created_at desc)
  where order_id is not null;
create index if not exists ai_video_operator_jobs_due_idx
  on public.ai_video_operator_jobs (status, lease_until, updated_at)
  where status in ('queued', 'submitted', 'running');

create table if not exists public.ai_video_operator_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_video_operator_jobs(id) on delete cascade,
  kind text not null check (kind in ('ref', 'result')),
  bucket text not null default 'ai-video-inputs',
  path text not null,
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists ai_video_operator_assets_job_idx
  on public.ai_video_operator_assets (job_id, created_at desc);

create table if not exists public.ai_video_operator_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_video_operator_jobs(id) on delete cascade,
  kind text not null check (kind in ('seedance')),
  model text,
  amount_usd numeric(10, 4),
  amount_idr integer,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists ai_video_operator_costs_job_idx
  on public.ai_video_operator_costs (job_id, created_at desc);

create or replace function public.claim_due_ai_video_operator_jobs(
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns setof public.ai_video_operator_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id from public.ai_video_operator_jobs
    where status in ('queued', 'submitted', 'running')
      and attempt < 2
      and poll_attempts < 20
      and (lease_until is null or lease_until < statement_timestamp())
    order by updated_at asc
    for update skip locked
    limit least(greatest(p_limit, 1), 25)
  )
  update public.ai_video_operator_jobs j
  set lease_until = statement_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 30), 600)),
      poll_attempts = poll_attempts + 1,
      updated_at = statement_timestamp()
  from candidates c where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.claim_ai_video_operator_delivery(
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
  update public.ai_video_operator_jobs
  set lease_until = statement_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 30), 600)),
      updated_at = statement_timestamp()
  where id = p_job_id and status = 'succeeded' and result_path is null
    and (lease_until is null or lease_until < statement_timestamp())
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

alter table public.ai_video_operator_jobs enable row level security;
alter table public.ai_video_operator_assets enable row level security;
alter table public.ai_video_operator_costs enable row level security;
revoke all on table public.ai_video_operator_jobs from public, anon, authenticated;
revoke all on table public.ai_video_operator_assets from public, anon, authenticated;
revoke all on table public.ai_video_operator_costs from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_video_operator_jobs to service_role;
grant select, insert, update, delete on table public.ai_video_operator_assets to service_role;
grant select, insert, update, delete on table public.ai_video_operator_costs to service_role;

revoke all on function public.claim_due_ai_video_operator_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_ai_video_operator_delivery(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_due_ai_video_operator_jobs(integer, integer) to service_role;
grant execute on function public.claim_ai_video_operator_delivery(uuid, integer) to service_role;
