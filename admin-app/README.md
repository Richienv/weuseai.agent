# weuseai.agent admin sub-app

Internal Next.js dashboard for founder-side ops. Deployed as a SEPARATE
Vercel project pointing to this directory (`admin-app/`), distinct from
the main landing site at the repo root.

## Why separate

The landing site is static HTML + Vercel Functions in `api/`. Mixing a
Next.js framework build into the same Vercel project would need
multi-build config that's fragile in practice. Keeping admin as its own
project means:

- Zero risk to the live landing
- Vercel auto-detects Next.js in `admin-app/`, no config needed
- The admin URL (e.g. `weuseai-admin.vercel.app`) is just a separate
  shortcut the founder bookmarks. No DNS/rewrite work required.

## Tabs

- `/admin/manual-provision` (this PR — Tab 1): create a customer + active
  subscription row for Path 1 onboarding (bank transfer / QRIS / Wise).
  Sends welcome email. **Does NOT spin up a VPS** — the provisioning
  service `/spin-up` needs the customer's bot token, OpenRouter key, and
  SOUL.md content, none of which the manual form collects. The founder
  runs the regular onboarding flow with the customer after this row
  exists.
- Tabs 2–5 (customer list, fleet, cost, template no-match) — separate
  future PRs.

## Auth

- Single password = `OBSERVABILITY_ADMIN_SECRET` env (already set for the
  existing `/api/admin/observability/*` Vercel Functions). The admin app
  re-uses the same secret.
- `/login` form posts via a Server Action that timing-safe-compares the
  password against the secret, then sets a 7-day HTTPOnly cookie whose
  value IS the secret.
- `middleware.ts` enforces the cookie on every route except `/login`
  and the login API; mismatches redirect to `/login`.

No DB-backed session store. The cookie-value-equals-env-secret model
keeps the auth surface small and self-contained.

## Env vars (Vercel → admin project)

| Var | Used by | Notes |
| --- | --- | --- |
| `OBSERVABILITY_ADMIN_SECRET` | login + middleware | Required. Same value the main project uses. |
| `SUPABASE_URL` | server actions | Required. Same project as the main app. |
| `SUPABASE_SECRET_KEY` _(or `SUPABASE_SERVICE_ROLE_KEY`)_ | server actions | Required. Service-role key. |
| `RESEND_API_KEY` | welcome email | Optional. Missing → email send becomes a no-op stub. |

## Local dev

```bash
cd admin-app
npm install
OBSERVABILITY_ADMIN_SECRET=devsecret \
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY=<service-role-key> \
npm run dev
# open http://localhost:3000/login, password = devsecret
```

## Migration

The `manual_provisions` audit table is added in
`supabase/migrations/20260528000000_manual_provisions.sql`. Apply via
the project's standard migration path (Supabase Mgmt API). The admin
form will fail at the audit-insert step until the migration lands —
the customer + subscription rows insert fine before that, so first-time
deploy without the migration will surface the audit-row error in the
success banner without blocking the actual provision.
