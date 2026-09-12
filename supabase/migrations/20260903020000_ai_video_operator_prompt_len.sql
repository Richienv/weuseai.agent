-- Drop the homemade 16_000 prompt cap. Studio stores the prompt as written.
-- Seedance 2.5 official text field is about 10_000 characters; upstream
-- may still reject. We do not invent a tighter generate gate.

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_prompt_check;

alter table public.ai_video_operator_library
  drop constraint if exists ai_video_operator_library_prompt_check;

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_prompt_len_check;

alter table public.ai_video_operator_library
  drop constraint if exists ai_video_operator_library_prompt_len_check;

alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_prompt_len_check
    check (char_length(prompt) >= 40);

alter table public.ai_video_operator_library
  add constraint ai_video_operator_library_prompt_len_check
    check (char_length(prompt) >= 40);
