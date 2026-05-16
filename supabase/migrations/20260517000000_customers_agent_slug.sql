-- Persona selection (2026-05-17): give every customer an explicit
-- chosen-persona column.
--
-- Pre-fix (persona audit 2026-05-16, docs/audits/2026-05-16-persona-
-- system-audit.md §2): the `customers` table has `tier` but NO column
-- to store which of the tier's personas the customer picked. There was
-- no picker UI and no code path to set a choice, so every customer —
-- regardless of tier — silently ran "The Pro". This column is the
-- storage half of the selection→delivery chain: onboarding's persona
-- picker writes it via complete-onboarding; customer-flow reads it to
-- drive the VPS's primary-persona bundle pull + SOUL.md render.
--
-- Safe three-step shape in one file (no table rewrite blocks writes
-- mid-deploy):
--   1. add the column NULLABLE (instant, no default backfill scan)
--   2. UPDATE every existing row to 'the-pro' — the persona every
--      pre-migration customer actually got (audit verdict). This keeps
--      historical rows truthful, not retroactively "chosen".
--   3. ALTER SET DEFAULT 'the-pro' + SET NOT NULL — so any future
--      insert that forgets agent_slug still lands on the documented
--      default-persona invariant (tier-personas.ts DEFAULT_PERSONA).

-- 1. add nullable
alter table public.customers
  add column if not exists agent_slug text;

-- 2. backfill existing rows to the historical actual persona
update public.customers
  set agent_slug = 'the-pro'
  where agent_slug is null;

-- 3. lock in the default + not-null
alter table public.customers
  alter column agent_slug set default 'the-pro';

alter table public.customers
  alter column agent_slug set not null;

comment on column public.customers.agent_slug is
  'The persona slug the customer chose at onboarding (one of '
  'personasForTier(tier) — tier-personas.ts). Drives both the VPS '
  'primary-persona bundle pull and the rendered SOUL.md baseline. '
  'Defaults to ''the-pro'' (DEFAULT_PERSONA invariant); set by the '
  'complete-onboarding Edge Function after the picker validates the '
  'choice against the customer''s tier.';
