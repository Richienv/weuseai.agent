-- Studio wizard: persistent character library + per-image roles on operator jobs.
-- Characters are generated character sheets (FRONT/SIDE/BACK/CLOSE-UP plates),
-- never raw photos — BytePlus privacy detection rejects real-person photos.

create table if not exists public.ai_video_operator_characters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  sheet_path text check (sheet_path is null or sheet_path ~ '^operator/'),
  sheet_url text check (sheet_url is null or sheet_url ~ '^(https://|/assets/)'),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default statement_timestamp(),
  check (sheet_path is not null or sheet_url is not null)
);

create index if not exists ai_video_operator_characters_created_idx
  on public.ai_video_operator_characters (created_at desc);

-- Per-image roles, parallel to ref_urls followed by ref_paths in submit order.
-- Empty array means every image is reference_image (face lock). first_frame is
-- opt-in for scene stills only — a character sheet must never be frame one.
alter table public.ai_video_operator_jobs
  add column if not exists ref_roles text[] not null default '{}'::text[];

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_ref_roles_check;

alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_ref_roles_check
    check (ref_roles <@ array['first_frame', 'reference_image']::text[]);

alter table public.ai_video_operator_characters enable row level security;
revoke all on table public.ai_video_operator_characters from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_video_operator_characters to service_role;
