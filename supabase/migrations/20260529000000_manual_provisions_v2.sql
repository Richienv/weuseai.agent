-- ──────────────────────────────────────────────────────────────────
-- 20260529000000_manual_provisions_v2.sql
--
-- Extend manual_provisions audit table for v2 form (PR #218 follow-up):
--   - Tier-based persona composition (locked set per tier, not single
--     persona) — persona_slug becomes legacy/optional, persona_slugs
--     jsonb is the new source of truth.
--   - Setup-fee default tracking + price-override flag for accounting.
--   - VPS auto-trigger status callback fields.
--   - Concierge mode metadata (founder mints BotFather + pairs bot on
--     customer's behalf). Bot token is HASHED (sha-256) — never stored
--     plaintext. The actual token is persisted via the normal customers
--     row encrypted-token path.
--   - Email send status (sent / stub / failed) so the founder knows
--     whether to DM the onboarding link manually.
--   - Onboarding URL + Telegram link surfaced on the success card.
--   - Partial-failure bookkeeping: completed_steps array + failed_step
--     + error_detail so a half-failed run can be diagnosed without
--     digging through logs.
--
-- All columns are NULL-able (`add column if not exists`) so existing
-- v1 rows remain valid. RLS unchanged (service-role only).
-- ──────────────────────────────────────────────────────────────────

alter table manual_provisions
  add column if not exists persona_slugs jsonb;

alter table manual_provisions
  add column if not exists tier_default_amount_idr integer;

alter table manual_provisions
  add column if not exists price_override boolean not null default false;

alter table manual_provisions
  add column if not exists concierge_mode boolean not null default false;

alter table manual_provisions
  add column if not exists bot_token_hash text;

alter table manual_provisions
  add column if not exists vps_provisioning_status text;

alter table manual_provisions
  add column if not exists vps_id text;

alter table manual_provisions
  add column if not exists email_send_status text;

alter table manual_provisions
  add column if not exists onboarding_url text;

alter table manual_provisions
  add column if not exists bot_telegram_link text;

alter table manual_provisions
  add column if not exists completed_steps jsonb;

alter table manual_provisions
  add column if not exists failed_step text;

alter table manual_provisions
  add column if not exists error_detail text;

-- v1 persona_slug column stays for back-compat. v2 writes both:
--   persona_slug    = personas[0] (default persona for the tier)
--   persona_slugs   = full locked composition for the tier
-- This keeps any downstream query that joins on persona_slug working
-- while exposing the full set for audit.

comment on column manual_provisions.persona_slugs is
  'v2: locked persona composition for the tier at provision time (jsonb array of slugs). '
  'Mirrors supabase/functions/_shared/tier-personas.ts at that moment.';
comment on column manual_provisions.bot_token_hash is
  'v2 concierge mode: sha-256(bot_token) for audit. Plaintext token is encrypted on customers row, never here.';
comment on column manual_provisions.completed_steps is
  'v2: ordered list of steps that succeeded before any failure '
  '(["customer","subscription","audit","vps_trigger","concierge_validate",...]).';
