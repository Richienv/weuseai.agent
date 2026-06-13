-- Genesis Onboarding Phase 3b — let the onboarding page read the draft.
--
-- customers uses a column-ALLOWLIST grant model (Sesi D P0-2,
-- 20260511010000): table-level SELECT is revoked from anon/authenticated and
-- only specific non-PII columns are granted back. genesis_draft is the
-- customer's OWN confirmable draft (their expectations paragraph + a summary
-- they typed/forwarded), X-CID-scoped by the existing RLS policy — same
-- sensitivity class as display_name, which is already in the allowlist.
--
-- Without this grant, onboarding.html's anon SELECT of genesis_draft returns
-- nothing and the Telegram-forwarded draft can't pre-fill Step 4.

GRANT SELECT (genesis_draft) ON public.customers TO anon, authenticated;

COMMENT ON COLUMN public.customers.genesis_draft IS
  'Genesis Onboarding (2026-06-13): draft distilled from forwarded samples. '
  'IN the anon/authenticated SELECT allowlist (Phase 3b, 20260613010000) — '
  'the customer''s own confirmable draft, X-CID-scoped; read by '
  'onboarding.html Step 4 pre-fill. Written only by the service-role webhook.';
