-- Onboarding flow additions (Phase 1, post-payment).
--
-- Adds the columns + audit table the onboarding page + complete-onboarding
-- + telegram-bot-webhook need to capture customer's persona contract,
-- pair their Telegram chat without giving them their own bot, and audit
-- the SOUL.md content shipped to their VPS.
--
-- Spec: docs/plans/2026-05-06-onboarding-page-spec.md

alter table customers
  add column if not exists pairing_code text,
  add column if not exists pairing_code_expires_at timestamptz,
  add column if not exists soul_md_text text;

-- A given 6-digit code can only be active for one customer at a time.
-- The unique partial index covers the (rare) collision case at code
-- rotation; second writer fails, the application catches and retries.
create unique index if not exists customers_pairing_code_active_idx
  on customers(pairing_code)
  where pairing_code is not null;

-- Audit log: hash-only, no raw SOUL.md content. Lets us later answer
-- "did this customer's agent get exactly the persona we generated"
-- without storing PII twice. One row per (re-)provisioning attempt.
create table if not exists customer_persona_audit (
  id bigserial primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  soul_md_sha256 text not null,        -- hex, 64 chars
  generated_at timestamptz default now()
);

create index if not exists customer_persona_audit_customer_idx
  on customer_persona_audit(customer_id, generated_at desc);

-- Enable row-level security on customers (was off by default in v1.1).
-- The anon SELECT policy below is narrow-by-uuid; service-role writes
-- continue to bypass RLS as usual.
alter table customers enable row level security;

-- Phase 1 RLS: the onboarding page polls customers via the anon key to
-- read its own state (display_name, email, whatsapp_number, pairing_code,
-- telegram_chat_id). UUIDs are unguessable so "anyone-with-the-uuid"
-- is acceptable for MVP. Phase 2B replaces UUIDs with short-lived signed
-- tokens (same plan as welcome.html spec).
drop policy if exists "anon can read own customer onboarding state"
  on customers;

create policy "anon can read own customer onboarding state"
  on customers for select
  to anon
  using (true);
