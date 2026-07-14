-- Bug-1 fix (2026-05-16): one-time proactive-greeting idempotency guard.
--
-- The race-proof wait-page fix (PR #123) split the gateway-start path in
-- two: complete-onboarding's happy path, OR the provisioning second-
-- finisher (admin-customer-vps-refresh, fired by customer-flow's
-- notifyVpsReady). The proactive greeting only lived in the happy path,
-- so a fast customer who onboarded before their VPS was ready never got
-- greeted — the gateway started via the second-finisher, silently.
--
-- greeting_sent_at lets BOTH paths attempt the greeting and guarantees
-- it fires exactly once: whichever path delivers it stamps this column;
-- the other path reads it and skips. Null = customer not yet greeted.
alter table public.customers
  add column if not exists greeting_sent_at timestamptz;

comment on column public.customers.greeting_sent_at is
  'When the proactive in-character greeting was delivered to the '
  'customer''s Telegram chat. Set once by whichever path completes the '
  'gateway-start sequence (complete-onboarding step 8c OR '
  'admin-customer-vps-refresh second-finisher). Null = not yet greeted.';
