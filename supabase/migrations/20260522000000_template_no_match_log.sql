-- P1 of the strict template-fetch flow (2026-05-22 consult).
--
-- When a persona's skill is gated by `template_fetch_required: true` and
-- no library template matches the customer's request, the agent calls
-- the `template-no-match-log` Edge Function which inserts a row here.
-- The founder reviews these monthly via the admin observability endpoint
-- to identify new templates worth authoring (a tight feedback loop from
-- real customer asks → template library deepening).

create table if not exists template_no_match_log (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid references customers(id) on delete cascade,
  persona_slug          text not null,
  -- The skill that asked for a template and found none.
  skill_id              text not null,
  -- A short, customer-message-derived label for the requested deliverable
  -- (e.g. "invoice for PT XYZ", "competitor analysis fintech"). Capped at
  -- 500 chars; the agent supplies the summary.
  requested_deliverable text not null,
  -- Optional context the agent gathered (use_cases keywords it tried,
  -- variables it identified, etc.). jsonb for flexibility.
  match_context         jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists template_no_match_log_persona_skill_idx
  on template_no_match_log(persona_slug, skill_id, created_at desc);

create index if not exists template_no_match_log_created_idx
  on template_no_match_log(created_at desc);

comment on table template_no_match_log is
  'Per-customer record of "no template matched the request" events. '
  'Reviewed via api/admin/observability/template-no-match.ts to surface '
  'new templates worth authoring. P1 of the 2026-05-22 strict template-'
  'fetch flow.';

-- RLS on, no policies: service-role only (agent reaches it through the
-- X-CID-gated template-no-match-log Edge Function; admin reads via the
-- service-key-gated observability endpoint).
alter table template_no_match_log enable row level security;
