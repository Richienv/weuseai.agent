-- Persona Genesis (2026-06-10): per-customer generated personas.
--
-- Spec: docs/specs/2026-06-10-mission2-build-spec.md
--
-- One row per customer (regenerations bump version in place). The row is
-- the source of truth bundle-fetch uses to serve `custom-<cid>` bundles —
-- only status='active' rows are fetchable, and only by their owner.
--
-- Idempotent. Applied via Supabase Mgmt API.

CREATE TABLE IF NOT EXISTS public.custom_personas (
  customer_id  uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  version      text NOT NULL DEFAULT '1.0.0',
  status       text NOT NULL DEFAULT 'generating',
  persona_name text,
  -- The interview profile the generation ran from (no PII beyond what the
  -- customer typed about their own job; service-role only regardless).
  profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_detail text,
  -- Daily regeneration cap support. Reset by the handler when the UTC day
  -- of updated_at differs from today.
  generations_today integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT custom_personas_status_chk
    CHECK (status IN ('generating', 'active', 'failed')),
  CONSTRAINT custom_personas_slug_chk
    CHECK (slug = 'custom-' || customer_id::text)
);

ALTER TABLE public.custom_personas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_personas FROM anon;
REVOKE ALL ON public.custom_personas FROM authenticated;
GRANT ALL ON public.custom_personas TO service_role;

COMMENT ON TABLE public.custom_personas IS
  'Persona Genesis: one generated persona per customer. bundle-fetch serves bundles/custom-<cid>/<version>.tar.gz only for status=active rows, only to the owner. Service-role only.';
