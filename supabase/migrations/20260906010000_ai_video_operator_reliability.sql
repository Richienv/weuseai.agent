-- Stable client keys deduplicate browser/network retries atomically.
alter table public.ai_video_operator_jobs add column if not exists client_request_id uuid;
create unique index if not exists ai_video_operator_request_id_idx on public.ai_video_operator_jobs (client_request_id);

-- Poll by elapsed time, independently of browser refreshes. Never replay an
-- ambiguous provider submission. A paused sync can resume the existing run.
alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_poll_attempts_check;
alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_poll_attempts_check
  check (poll_attempts between 0 and 240);

create or replace function public.claim_due_ai_video_operator_jobs(
  p_limit integer default 3,
  p_lease_seconds integer default 300
)
returns setof public.ai_video_operator_jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- A previously attempted POST without a persisted run ID may already be
  -- billable. Stop here; never silently create a second provider run.
  update public.ai_video_operator_jobs
  set status = 'failed',
      error_code = coalesce(error_code, 'monid_submission_unknown'),
      completed_at = statement_timestamp(), updated_at = statement_timestamp(),
      lease_until = null
  where status = 'queued' and provider_task_id is null
    and (attempt > 0 or error_code is not null)
    and (lease_until is null or lease_until < statement_timestamp());

  -- A local sync timeout does not assert that the provider failed. Preserve
  -- the run ID and output URL so the UI can offer a free status recheck.
  update public.ai_video_operator_jobs
  set status = 'failed', error_code = 'operator_sync_timeout',
      completed_at = statement_timestamp(), updated_at = statement_timestamp(),
      lease_until = null
  where (status in ('submitted', 'running') or (status = 'succeeded' and result_path is null))
    and poll_attempts >= 240
    and (lease_until is null or lease_until < statement_timestamp());

  return query
    with candidates as (
      select id from public.ai_video_operator_jobs
      where (
        (status = 'queued' and attempt = 0 and provider_task_id is null and error_code is null)
        or (status in ('queued', 'submitted', 'running', 'succeeded') and provider_task_id is not null and result_path is null)
      )
      and poll_attempts < 240
      and (lease_until is null or lease_until < statement_timestamp())
      and (status = 'queued' or updated_at <= statement_timestamp() - interval '15 seconds')
      order by updated_at asc
      for update skip locked
      limit least(greatest(p_limit, 1), 3)
    )
    update public.ai_video_operator_jobs j
    set lease_until = statement_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 60), 600)),
        poll_attempts = poll_attempts + 1,
        updated_at = statement_timestamp()
    from candidates c where j.id = c.id
    returning j.*;
end;
$$;
revoke all on function public.claim_due_ai_video_operator_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_ai_video_operator_jobs(integer, integer) to service_role;

-- Store the exact worker URL and a server-only service-role credential in
-- Supabase Vault under ai_video_operator_worker_url and
-- ai_video_operator_worker_token. Never put credential values in migrations.
-- A missing setting raises a visible cron failure instead of silently stalling.
create or replace function public.dispatch_ai_video_operator_worker()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  worker_url text;
  worker_token text;
begin
  if not exists (select 1 from public.ai_video_operator_jobs
    where status in ('queued', 'submitted', 'running') or (status = 'succeeded' and result_path is null)) then
    return;
  end if;
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'ai_video_operator_worker_url' limit 1;
  select decrypted_secret into worker_token from vault.decrypted_secrets where name = 'ai_video_operator_worker_token' limit 1;
  if coalesce(worker_url, '') = '' or coalesce(worker_token, '') = '' then
    raise exception 'operator_worker_schedule_unconfigured';
  end if;
  if worker_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/ai-video-render-worker$' then
    raise exception 'operator_worker_schedule_invalid_url';
  end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_token,
      'apikey', worker_token, 'Content-Type', 'application/json'),
    body := '{"operator_only":true}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.dispatch_ai_video_operator_worker() from public, anon, authenticated;
grant execute on function public.dispatch_ai_video_operator_worker() to service_role;
select cron.unschedule(jobid) from cron.job where jobname = 'ai_video_operator_every_minute';
select cron.schedule('ai_video_operator_every_minute', '* * * * *', 'select public.dispatch_ai_video_operator_worker()');
