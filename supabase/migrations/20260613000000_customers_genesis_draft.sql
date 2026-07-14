-- Genesis Onboarding — Telegram-native draft (2026-06-13).
--
-- When a paired-but-not-onboarded customer forwards work samples into their
-- bot, pair-customer-bot-webhook distills them (via genesis-distill) and
-- stores the confirmable draft here. The web onboarding form reads it to
-- pre-fill Step 4. This is NOT SOUL or provisioning state — just the draft
-- the customer confirms.
--
-- Additive + nullable: no backfill, no RLS change (the existing per-customer
-- self-read policy covers the new column; the service-role webhook writes it).

ALTER TABLE customers ADD COLUMN IF NOT EXISTS genesis_draft jsonb;

COMMENT ON COLUMN customers.genesis_draft IS
  'Genesis Onboarding draft distilled from forwarded samples (2026-06-13): '
  '{ expectations_paragraph, recommended_persona, persona_name, voice_note, '
  'summary_bahasa, created_at }. Null until the customer forwards samples to '
  'their bot during onboarding. Consumed by onboarding.html Step 4 pre-fill.';
