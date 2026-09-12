-- Existing Seedance jobs remain unchanged. Permit saved prompts from the simple Wan studio.
alter table public.ai_video_operator_library
  drop constraint if exists ai_video_operator_library_model_check;
alter table public.ai_video_operator_library
  add constraint ai_video_operator_library_model_check check (model in (
    'wan3.0', 'seedance-2.5', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini'
  ));
