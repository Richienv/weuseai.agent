-- Admin dashboard: support_tickets foundational schema.
--
-- Tracks customer-reported issues + founder-side resolutions. Backs the
-- /api/admin/support-tickets endpoint (list + create + update).
--
-- Idempotent. Applied via Supabase Management API.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  -- Free-form ticket category. Initial set covers what's surfaced via
  -- observability dashboard + diagnose CLI (Phase 4-5b).
  kind            text not null check (kind in (
    'provisioning_stuck',     -- VPS spawn / cloud-init issues
    'pairing_failed',         -- Telegram bot pairing problems
    'bundle_pull_failed',     -- skill bundle delivery to VPS
    'hermes_crash',           -- Hermes runtime crash on customer VPS
    'first_message_silence',  -- agent paired but never sends Pagi message
    'tier_change_request',    -- customer wants tier upgrade/downgrade
    'billing_dispute',        -- payment / refund / invoice issue
    'feature_request',        -- non-bug, customer-facing wishlist item
    'other'                   -- escape hatch — review periodically + add new categories
  )),
  status          text not null check (status in (
    'open',
    'in_progress',
    'awaiting_customer',
    'resolved',
    'closed_no_action'
  )) default 'open',
  -- Customer-supplied title (≤120 chars for Telegram-summary friendliness)
  title           text not null check (length(title) > 0 and length(title) <= 120),
  -- Founder/admin-supplied notes accumulating per ticket. Markdown-safe.
  body_md         text,
  -- Resolution narrative when status flips to resolved/closed_no_action
  resolution_md   text,
  -- Severity gate (informational; surfaces to founder dashboard)
  severity        text not null check (severity in (
    'low',
    'medium',
    'high',
    'urgent'
  )) default 'medium',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_customer
  ON public.support_tickets (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_open_severity
  ON public.support_tickets (severity, created_at DESC)
  WHERE status IN ('open', 'in_progress');

COMMENT ON TABLE public.support_tickets IS
  'Admin dashboard scaffolding (2026-05-10): customer-reported issues + founder-side resolutions. Surfaced via /api/admin/support-tickets. RLS enabled — service-role writes only; customers do NOT read this table directly (escalation flow via Telegram only for Phase 5).';
COMMENT ON COLUMN public.support_tickets.kind IS
  'Category enum locked. Adding a new category requires synchronized update to admin UI + drift test in tests/admin-support-tickets-handler.spec.ts.';

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- No anon SELECT policy — customer-facing surface for tickets is the
-- Telegram bot reply, not direct DB read. Phase 5+ may add an "anon
-- read own open tickets" policy if customers want a self-service view.
