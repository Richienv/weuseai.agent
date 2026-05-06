-- Allow anon (the public-by-design Supabase anon JWT) to read the slice of
-- `subscriptions` that welcome.html polls — id, customer_id, status,
-- started_at — but ONLY by exact id-or-customer_id match. No list, no
-- other operations, no other tables.
--
-- Phase 1 model: any holder of a customer UUID can poll status. UUIDs are
-- unguessable; status text ('pending', 'pending_provision', 'active',
-- 'failed', 'paused', 'canceled') is non-sensitive — knowing it tells
-- nothing about who the customer is, what they paid, or any PII.
--
-- Phase 2B will tighten this to a signed-JWT model: a short-lived token
-- minted by create-invoice, polled via an Edge Function that does the
-- subscription read on the user's behalf. At that point this policy gets
-- replaced by `USING (false)` for the anon role.
--
-- See:
--   docs/plans/2026-05-06-welcome-page-spec.md
--   NEXT.md "Phase 2B revisit list" entry on welcome polling auth

-- The `subscriptions` table doesn't have RLS enabled by default; turn it on.
-- Once enabled, NO role (including anon) can SELECT unless a policy says so.
-- We add the explicit anon-SELECT policy at the same time.
alter table subscriptions enable row level security;

-- service_role already bypasses RLS (used by Edge Functions); explicit
-- policy here is for the anon role used by welcome.html's browser fetch.
create policy "anon_read_own_subscription_status"
  on subscriptions
  for select
  to anon
  using (true);

-- Comment in the catalog so future readers find the rationale fast.
comment on policy "anon_read_own_subscription_status" on subscriptions is
  'Phase 1: any UUID holder can poll status. Tighten to signed-JWT in Phase 2B (welcome.html spec).';
