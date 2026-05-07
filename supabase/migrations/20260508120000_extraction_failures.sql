-- Telemetry log for failed parameter extractions in workflow-discover.
--
-- Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md (Q3a)
--
-- Each row = one extraction attempt that fell through to the empty
-- fallback (malformed JSON twice, HTTP error, missing key, etc).
-- Used for tuning extraction prompts + identifying problematic
-- parameters_schema entries.
--
-- Storage policy: message_text TRUNCATED to first 500 chars to bound
-- row size + reduce PII exposure. Phase 2E-2 may add encryption-at-rest
-- or hash-only storage if compliance review flags this.

create table if not exists extraction_failures (
  id              bigserial primary key,
  workflow_id     uuid references workflows(id) on delete cascade,
  customer_id     uuid references customers(id) on delete cascade,
  -- First 500 chars of the customer message that triggered extraction.
  message_excerpt text,
  -- Tagged reason — must be one of the ExtractionResult.reason variants
  -- in supabase/functions/_shared/parameter-extraction.ts.
  reason          text not null check (reason in (
    'malformed_json_twice',
    'http_error',
    'no_api_key',
    'empty_response',
    'bad_response'
  )),
  -- Optional: first 500 chars of the raw LLM response (for malformed
  -- JSON cases — helps tune the prompt). Null for HTTP errors.
  raw_excerpt     text,
  failed_at       timestamptz default now()
);

create index if not exists extraction_failures_workflow_idx
  on extraction_failures(workflow_id, failed_at desc);

create index if not exists extraction_failures_reason_idx
  on extraction_failures(reason, failed_at desc);

comment on table extraction_failures is
  'Phase 2E-1 telemetry log for parameter-extraction fallback events. Used for tuning prompts + flagging problematic parameters_schema. message_excerpt + raw_excerpt truncated to 500 chars each.';

-- RLS: service-role only. Operations dashboards (Phase 2E-2) will read
-- via service-role from a separate analytics path.
alter table extraction_failures enable row level security;
