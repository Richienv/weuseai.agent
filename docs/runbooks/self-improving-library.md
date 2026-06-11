# Runbook — Self-Improving Library

What it is: usage signals (template no-matches, playbook dead-ends) →
weekly DeepSeek drafts in the curated format → quality gate → **your**
approval queue at `/admin/proposals` → one click ships into the bundle
pipeline. You are the only authority; failed drafts are dropped with a
log, never queued; nothing reaches a customer without Approve.

Spec: `docs/specs/2026-06-11-mission3-build-spec.md`.

## Deploy (once)

1. Migration `supabase/migrations/20260611000000_library_proposals.sql`
   (table + weekly cron) via the Mgmt API.
2. `supabase functions deploy library-refine`
   `supabase functions deploy library-proposal-apply`
   (`DEEPSEEK_API_KEY` secret is shared with persona-genesis — already set
   if Genesis is deployed.)
3. Cron settings:
   ```sql
   ALTER DATABASE postgres SET app.library_refine_url   = 'https://<ref>.supabase.co/functions/v1/library-refine';
   ALTER DATABASE postgres SET app.library_refine_token = '<service-role-jwt>';
   ```
4. Vercel redeploys automatically with main (admin tab + endpoints).

## Weekly rhythm

- Monday 09:00 WIB the cron runs (≤5 drafts, ≈$0.01-0.05). You get
  proposals at `/admin/proposals` with the evidence: which requests
  no-matched, how many distinct customers, which playbook step keeps dying.
- **Approve + ship** → patches the persona's latest bundle, bumps the patch
  version, uploads (immutable), and fires bundle-version-bump-broadcast —
  latest-policy customer VPSes restart and pull it.
- **Reject** → recorded; the same cluster may re-draft next week.
- `apply_failed` rows show the error inline — safe to re-trigger after
  fixing the cause (the version upload is immutable, so a retry bumps
  again).

## Live verification (~30 min, < $2, then destroy)

1. Provision a throwaway library-full customer (admin form, your test bot).
2. On the VPS bot, ask Doc Expert for a deliverable the library lacks
   (e.g. "buatin surat penawaran harga buat klien korporat") 3× from the
   test customer — the gated skill logs no-matches. (Or insert 3
   `template_no_match_log` rows directly.)
3. Invoke the refine function manually (same POST the cron makes) →
   proposal appears in `/admin/proposals` with the evidence.
4. Approve → confirm new `bundles/doc-expert/<v+1>.tar.gz` in Storage and
   the broadcast restarts the test VPS (`weuseai-bundle-pull.log` shows the
   new version installing).
5. Ask the bot for the same deliverable again — it now fetches the new
   template. Destroy the VPS.

## Manual git backport (monthly chore)

Approved improvements live in Storage versions; the git `agent-packs/`
tree stays the curated baseline. Monthly: download the latest tarballs for
personas with `customer-grown` manifest entries and commit the new
templates back to git so the next from-git publish doesn't regress them.
