-- Sesi D security audit — P0-3 fix.
--
-- Source: docs/audits/2026-05-10-security-audit-sesi-d.md
--   "subscriptions table SELECT-all leaks tier/billing across customers"
--
-- Root cause: subscriptions ships `anon SELECT ... USING (true)` policy.
-- Anon-key holder reads tier, xendit_invoice_id, next_billing_at,
-- hosting_active, always_on_enabled, started_at across all customers.
--
-- Audit-flagged leaks:
--   - tier: revenue intelligence (Studio customer count, distribution)
--   - status='canceled': churn signals (poaching cohorts)
--   - xendit_invoice_id: enables xendit-side enumeration
--   - next_billing_at: time poaching campaigns
--
-- Two-layer fix (mirrors P0-2 pattern):
--   1. Replace USING (true) with X-CID-scoped policy (subscription rows
--      scoped to customer_id matching X-CID header).
--   2. REVOKE-table → GRANT-allowlist for the 3 columns welcome.html
--      legitimately needs: (id, customer_id, status, started_at).
--      All revenue/billing columns become service-role only.
--
-- welcome.html update (separate file in this PR):
--   - Sends X-CID header on subscriptions poll
--   - Already SELECTs only id, status, started_at — no SELECT change
--
-- Idempotent. Applied via Supabase Management API.

-- ─── 1. Replace permissive policy with X-CID-scoped policy ──────────

DROP POLICY IF EXISTS "anon_read_own_subscription_status" ON public.subscriptions;
DROP POLICY IF EXISTS "anon read own subscription scoped by x-cid" ON public.subscriptions;

CREATE POLICY "anon read own subscription scoped by x-cid"
  ON public.subscriptions FOR SELECT
  TO anon
  USING (
    -- Scope to subscription rows belonging to the customer_id in X-CID
    -- request header. Mirrors the customers-table pattern (Sesi D P0-2).
    customer_id = (
      coalesce(
        current_setting('request.headers', true),
        '{}'
      )::json->>'x-cid'
    )::uuid
  );

COMMENT ON POLICY "anon read own subscription scoped by x-cid"
  ON public.subscriptions IS
  'Sesi D P0-3 lock 2026-05-11: cross-customer enumeration via PostgREST anon key blocked. Anon must include X-CID header matching customer_id; without header, 0 rows. Revenue/billing intel (tier, xendit_invoice_id, next_billing_at) further hidden by column REVOKE below. Phase 2B signed-JWT will replace this with auth.uid()=customer_id pattern.';

-- ─── 2. Column allowlist (REVOKE table → GRANT cols) ────────────────

-- Step 2a: revoke table-level SELECT.
REVOKE SELECT ON public.subscriptions FROM anon, authenticated;

-- Step 2b: grant SELECT only on what welcome.html polls.
-- Allowlist: id, customer_id (needed for WHERE filter), status,
--            started_at.
-- Excluded (service-role only):
--   - tier (revenue intelligence — Sesi D P0-3)
--   - xendit_invoice_id (xendit-side enumeration risk)
--   - next_billing_at (poaching-campaign timing intel)
--   - hosting_active (cross-customer churn signal)
--   - always_on_enabled (tier-distribution intel)
GRANT SELECT (
  id,
  customer_id,
  status,
  started_at
) ON public.subscriptions TO anon, authenticated;

COMMENT ON COLUMN public.subscriptions.tier IS
  'Sesi D P0-3 lock 2026-05-11: NOT in anon SELECT allowlist (revenue intelligence). Read via service-role Edge Functions or admin /api/admin/customers (which embeds via PostgREST nested select with service-role key).';
COMMENT ON COLUMN public.subscriptions.xendit_invoice_id IS
  'Sesi D P0-3 lock 2026-05-11: NOT in anon SELECT allowlist (enables xendit-side enumeration). Service-role only.';
COMMENT ON COLUMN public.subscriptions.next_billing_at IS
  'Sesi D P0-3 lock 2026-05-11: NOT in anon SELECT allowlist (poaching-campaign timing intel). Service-role only.';
COMMENT ON COLUMN public.subscriptions.hosting_active IS
  'Sesi D P0-3 lock 2026-05-11: NOT in anon SELECT allowlist (cross-customer churn signal). Service-role only.';
COMMENT ON COLUMN public.subscriptions.always_on_enabled IS
  'Sesi D P0-3 lock 2026-05-11: NOT in anon SELECT allowlist (tier-distribution intel). Service-role only.';
