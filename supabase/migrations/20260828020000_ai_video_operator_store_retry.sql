-- Retry copy when Seedance finished but the MP4 is not in Storage yet.

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
      where (
          status in ('queued', 'submitted', 'running')
          or (status = 'succeeded' and result_path is null)
        )
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

revoke all on function public.claim_due_ai_video_operator_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_ai_video_operator_jobs(integer, integer) to service_role;
