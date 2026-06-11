-- Self-Improving Library (Mission 3, 2026-06-11): founder approval queue.
--
-- Spec: docs/specs/2026-06-11-mission3-build-spec.md
--
-- One row per DeepSeek-drafted, gate-validated library improvement. The
-- founder is the only quality authority: nothing reaches a customer bundle
-- except via the apply handler flipping a PENDING row to APPLIED.
--
-- PRIVACY: `evidence` carries aggregated signal stats + the short
-- deliverable labels the agent already logged (max 500 chars each) — never
-- raw conversation bodies. `draft` is generated content, not customer data.
--
-- Idempotent. Applied via Supabase Mgmt API.

CREATE TABLE IF NOT EXISTS public.library_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  persona_slug  text NOT NULL,
  target_id     text NOT NULL,
  draft         jsonb NOT NULL,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- One open proposal per hot cluster (refine-pipeline dedup).
  dedup_key     text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  applied_version text,
  error_detail  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,

  CONSTRAINT library_proposals_kind_chk
    CHECK (kind IN ('new_template', 'revise_template', 'playbook_fix')),
  CONSTRAINT library_proposals_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'apply_failed'))
);

-- Race-proof refine dedup: only one OPEN (non-rejected, non-failed)
-- proposal per cluster.
CREATE UNIQUE INDEX IF NOT EXISTS library_proposals_open_dedup_idx
  ON public.library_proposals (dedup_key)
  WHERE status IN ('pending', 'approved', 'applied');

CREATE INDEX IF NOT EXISTS library_proposals_status_idx
  ON public.library_proposals (status, created_at DESC);

ALTER TABLE public.library_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_proposals FROM anon;
REVOKE ALL ON public.library_proposals FROM authenticated;
GRANT ALL ON public.library_proposals TO service_role;

COMMENT ON TABLE public.library_proposals IS
  'Self-Improving Library founder approval queue. Gate-validated DeepSeek drafts; founder approve = bundle patch + broadcast. Service-role only.';

-- ─── weekly refine cron (Mon 02:00 UTC = 09:00 WIB) ─────────────────────
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'library_refine_weekly';

SELECT cron.schedule(
  'library_refine_weekly',
  '0 2 * * 1',
  $cron$
    SELECT net.http_post(
      url := current_setting('app.library_refine_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.library_refine_token', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
