-- Sesi D pass-3 audit — P0 fix: consent_events table.
--
-- Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md
--   P0-PASS3-1 "ToS-acceptance stored client-side only — no server-side
--   audit trail" (UU PDP Art. 22(1) compliance + Xendit dispute
--   evidence).
--
-- Root cause: checkout.html captures the ToS checkbox into
-- localStorage only and the create-invoice handler has no DB column
-- for it. Any disputing customer wins by default — we have no record
-- they ever accepted.
--
-- Schema choice: append-only event log keyed on customer_id with
-- enough metadata to satisfy UU PDP Art. 22(1) ("data controller
-- must demonstrate consent") + Xendit chargeback evidence. One row
-- per acceptance event: 'tos' for the required terms acceptance,
-- 'marketing' for the optional opt-in. Versioning lets us prove
-- which version of the policy a customer agreed to when the doc
-- changes.
--
-- Idempotent. Applied via Supabase Management API.

-- ─── 1. Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  accepted_at timestamptz NOT NULL,
  ip_address inet,
  user_agent text,
  version text NOT NULL DEFAULT 'v1.0',
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Whitelisted consent types — keep migrations cheap by gating values
  -- via CHECK rather than a separate enum type. Add new types via
  -- future migration when product needs them (e.g., 'analytics_opt_in').
  CONSTRAINT consent_events_consent_type_chk
    CHECK (consent_type IN ('tos', 'marketing'))
);

-- Index for the most common access pattern: "show me this customer's
-- consent history". Service-role queries from the admin dashboard +
-- the audit-export script both filter by customer_id.
CREATE INDEX IF NOT EXISTS consent_events_customer_id_idx
  ON public.consent_events (customer_id, created_at DESC);

-- ─── 2. RLS ──────────────────────────────────────────────────────
--
-- Lockdown pattern (matches Phase 6-1.a + Sesi D pass-2 fixes):
--   - Enable RLS at the table level
--   - Service-role bypasses RLS by design (its policy is implicit)
--   - Anon: deny all (no policy = no access under RLS)
--   - Authenticated: read own rows scoped by auth.uid() = customer_id
--
-- Anon deliberately has NO policy. PostgREST + supabase-js will return
-- empty rows for any anon SELECT, never leaking existence of rows.
-- INSERTs are server-role only (the create-invoice Edge Function uses
-- the service role to write).

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read own consent" ON public.consent_events;

CREATE POLICY "authenticated read own consent"
  ON public.consent_events FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- ─── 3. Grants ───────────────────────────────────────────────────
--
-- Defensive: even though RLS is on, we ALSO REVOKE direct table access
-- from anon so a future "USING (true)" regression on this table can't
-- silently re-open the floodgates. service_role inherits all rights;
-- authenticated SELECT works against the RLS policy above.

REVOKE ALL ON public.consent_events FROM anon;
REVOKE ALL ON public.consent_events FROM authenticated;
GRANT SELECT ON public.consent_events TO authenticated;
GRANT ALL ON public.consent_events TO service_role;

COMMENT ON TABLE public.consent_events IS
  'Append-only consent log per customer (UU PDP Art. 22(1) compliance + Xendit chargeback evidence). Service-role writes only; authenticated reads own rows.';
COMMENT ON COLUMN public.consent_events.consent_type IS
  'Type of consent: tos (required) | marketing (optional opt-in).';
COMMENT ON COLUMN public.consent_events.version IS
  'Policy version (e.g., v1.0). Bump when /terms or /privacy text changes materially.';
