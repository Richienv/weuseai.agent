-- Phase A2 PR 2 (2026-05-23): paused-email dedup column for the
-- flow-paused-nudge daily cron.
--
-- The cron finds customer_flow_state rows parked at awaiting_customer /
-- escalated for >= 7 days and emails the flow-paused.md template. To
-- dedup (so a customer doesn't get one email per daily tick for 7 days
-- straight), we stamp paused_email_sent_at on the row when the email
-- sends successfully. The cron's query filters paused_email_sent_at IS
-- NULL.
--
-- The flow-state handler clears this column when the run resumes
-- (advance), completes, or aborts — same lifecycle as expires_at.
-- That way a future park-event on the same row can re-trigger the
-- nudge cleanly.

alter table customer_flow_state
  add column if not exists paused_email_sent_at timestamptz;

comment on column customer_flow_state.paused_email_sent_at is
  'When the flow-paused-nudge daily cron successfully emailed the '
  'customer about this parked run. NULL = never nudged. Cleared by the '
  'flow-state handler on resume / complete / abort, alongside '
  'expires_at. Phase A2 PR 2, 2026-05-23.';

-- Partial index for the nudge query — only the parked, not-yet-nudged
-- rows need scanning. Small footprint, fast scan.
create index if not exists customer_flow_state_paused_nudge_idx
  on customer_flow_state(expires_at)
  where status in ('awaiting_customer', 'escalated')
    and expires_at is not null
    and paused_email_sent_at is null;
