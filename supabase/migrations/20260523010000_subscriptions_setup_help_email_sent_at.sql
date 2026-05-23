-- Phase A2 PR 4 (2026-05-23): dedup column for the setup-help.md email
-- triggered by retry-pending-provisions when a subscription has been
-- stuck in pending_provision for >= 24h.
--
-- The retry-pending-provisions handler runs every 3 min. After 24h
-- in pending_provision (8h past the MAX_ATTEMPTS×3min = 18min retry
-- exhaustion ceiling), we surface a "you might be stuck" email to the
-- customer once per subscription. This column makes that one-time
-- semantics explicit at the DB level.

alter table subscriptions
  add column if not exists setup_help_email_sent_at timestamptz;

comment on column subscriptions.setup_help_email_sent_at is
  'When the retry-pending-provisions worker successfully emailed the '
  'customer the setup-help.md "you might be stuck" template. NULL = '
  'never sent. Stays set for the lifetime of the subscription — the '
  'email is a one-time signal; founder manual reconcile happens after. '
  'Phase A2 PR 4, 2026-05-23.';

-- The worker scans subscriptions WHERE status='pending_provision' AND
-- setup_help_email_sent_at IS NULL AND started_at <= now() - 24h.
-- Partial index keeps the scan tiny — only the at-risk rows.
create index if not exists subscriptions_setup_help_pending_idx
  on subscriptions(started_at)
  where status = 'pending_provision' and setup_help_email_sent_at is null;
