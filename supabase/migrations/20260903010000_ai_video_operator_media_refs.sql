-- Seedance 2.5 multimodal refs: 30 images + 10 videos + 10 audio.
-- The old 8-image cardinality check would reject a legal 2.5 pack.

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.ai_video_operator_jobs'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%cardinality(ref_paths)%'
  loop
    execute format('alter table public.ai_video_operator_jobs drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_ref_count_check;

alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_ref_count_check
    check (cardinality(ref_paths) + cardinality(ref_urls) between 0 and 50);

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_ref_roles_check;

alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_ref_roles_check
    check (ref_roles <@ array[
      'first_frame',
      'reference_image',
      'reference_video',
      'reference_audio'
    ]::text[]);

update storage.buckets
set file_size_limit = 83886080
where id = 'ai-video-inputs';
