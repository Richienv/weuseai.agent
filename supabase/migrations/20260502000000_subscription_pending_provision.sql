-- Add 'pending_provision' to subscriptions.status check constraint.
--
-- Background: webhook handler now distinguishes "payment confirmed but VPS
-- spin-up failed" (recoverable, customer paid -> don't lose money) from
-- "payment failed" (uncoverable). 'failed' is reserved for the latter.
--
-- A future retry worker will pick up 'pending_provision' rows on cron and
-- re-attempt provisioning.spinUp() -- see Bug B in 2026-05-02 diagnosis.
--
-- DEPLOY ORDER: this migration MUST be applied before deploying the updated
-- xendit-webhook function. If the function rolls out first, every paid
-- webhook will crash trying to write the new enum value.

alter table subscriptions
  drop constraint if exists subscriptions_status_check;

alter table subscriptions
  add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'pending_provision', 'paused', 'canceled', 'failed'));
