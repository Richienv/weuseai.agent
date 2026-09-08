-- Switch founder generate desk to Monid. Keep jobs off the customer render table.

create table if not exists public.ai_video_operator_library (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  prompt text not null check (char_length(prompt) between 40 and 16000),
  lesson text check (lesson is null or char_length(lesson) between 1 and 8000),
  ratio text not null check (ratio in ('9:16', '16:9', '21:9', '1:1')),
  duration_seconds integer not null check (duration_seconds between 4 and 30),
  model text not null check (model in (
    'seedance-2.5', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini'
  )),
  result_path text,
  ref_paths text[] not null default '{}'::text[],
  source_job_id uuid references public.ai_video_operator_jobs(id) on delete set null,
  source_order_id uuid references public.ai_video_orders(id) on delete set null,
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists ai_video_operator_library_created_idx
  on public.ai_video_operator_library (created_at desc);

alter table public.ai_video_operator_jobs
  add column if not exists lesson text,
  add column if not exists library_id uuid references public.ai_video_operator_library(id) on delete set null,
  add column if not exists resolution text not null default '720p';

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_duration_seconds_check,
  drop constraint if exists ai_video_operator_jobs_provider_check,
  drop constraint if exists ai_video_operator_jobs_poll_attempts_check,
  drop constraint if exists ai_video_operator_jobs_lesson_check,
  drop constraint if exists ai_video_operator_jobs_resolution_check,
  drop constraint if exists ai_video_operator_jobs_model_check;

alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_duration_seconds_check
    check (duration_seconds between 4 and 30),
  add constraint ai_video_operator_jobs_provider_check
    check (provider in ('monid', 'byteplus_modelark')),
  add constraint ai_video_operator_jobs_poll_attempts_check
    check (poll_attempts between 0 and 40),
  add constraint ai_video_operator_jobs_lesson_check
    check (lesson is null or char_length(lesson) between 1 and 8000),
  add constraint ai_video_operator_jobs_resolution_check
    check (resolution in ('480p', '720p'));

alter table public.ai_video_operator_jobs
  alter column provider set default 'monid';

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
        and poll_attempts < 40
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

alter table public.ai_video_operator_library enable row level security;
revoke all on table public.ai_video_operator_library from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_video_operator_library to service_role;
revoke all on function public.claim_due_ai_video_operator_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_ai_video_operator_jobs(integer, integer) to service_role;
