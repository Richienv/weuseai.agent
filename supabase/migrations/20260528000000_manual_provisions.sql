-- ──────────────────────────────────────────────────────────────────
-- 20260528000000_manual_provisions.sql
--
-- Audit table for Path 1 manual customer onboarding (bank transfer /
-- QRIS manual / Wise / other). The admin sub-app (/admin/manual-provision)
-- writes one row per provision so the founder has a clean ledger of
-- non-Xendit revenue.
--
-- Existing `subscriptions` table is the source of truth for tier/status —
-- this table only records the manual-provision metadata that doesn't
-- belong on `subscriptions` itself (payment method, payment ref, notes).
--
-- RLS: service-role only (the admin sub-app uses the SUPABASE_SECRET_KEY).
-- No anon SELECT — these rows contain operator notes that may reference
-- payment refs / customer context not meant for the customer-facing
-- dashboard.
-- ──────────────────────────────────────────────────────────────────

create table if not exists manual_provisions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  -- Operator identity. Single-admin model today (founder is the only
  -- operator). Free text so we can extend later without a migration.
  created_by text not null default 'admin',
  -- Enum-shaped via a check constraint so the app + DB stay in lockstep
  -- if the form ever adds a new method.
  payment_method text not null check (
    payment_method in (
      'manual_bank_transfer',
      'manual_qris',
      'manual_wise',
      'other'
    )
  ),
  -- Free text — operator records the mutasi line, transfer ID, etc. NULL
  -- when the founder skipped it. Validation in the form discourages full
  -- bank account numbers, but DB-level we just store what's given.
  payment_reference text,
  -- IDR integer (matches subscription_invoices.amount_idr convention).
  amount_idr integer not null check (amount_idr > 0),
  -- Persona chosen at provision time. Mirrors what the customer would
  -- have selected during Xendit-flow onboarding. Free text rather than a
  -- check constraint so adding a persona to tier-personas.ts doesn't
  -- require a migration.
  persona_slug text not null,
  -- Tier inferred from persona — denormalised here so the audit row
  -- survives even if subscriptions.tier gets mutated later (tier bump
  -- via customer-tier-bump-handler).
  tier text not null check (tier in ('starter', 'pro', 'studio')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_provisions_customer
  on manual_provisions (customer_id, created_at desc);

create index if not exists idx_manual_provisions_created_at
  on manual_provisions (created_at desc);

alter table manual_provisions enable row level security;
-- No policies = service-role only (RLS denies anon by default). The
-- admin sub-app uses the service-role key; no customer-facing path
-- reads this table.

comment on table manual_provisions is
  'Audit ledger for Path 1 manual customer onboarding (non-Xendit). '
  'Written by /admin/manual-provision. Service-role only.';
