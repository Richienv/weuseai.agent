# @weuseai/observability

Customer onboarding observability — pure-logic snapshot-to-status derivation, PostgREST snapshot fetcher, and text/HTML renderers.

Backs the internal admin dashboard (`/admin/observability/customer`) and the diagnose CLI (`npm run cli -- diagnose --customer-id <uuid>`).

## What it does

Walks a customer's onboarding through 6 canonical stages and returns a `StatusReport` describing health + a founder-facing next-action when something is stuck.

| # | Stage | Source signal |
|---|---|---|
| 1 | `payment` | most recent `subscription_invoices` row where `kind='setup_first_month'` |
| 2 | `provisioning` | most recent `vps_instances` row |
| 3 | `hermes_persona` | `customers.soul_md_text` (set after `complete-onboarding`) |
| 4 | `bundle_pull` | `bundle_pull_attempts` grouped by `agent_slug` (latest per slug) |
| 5 | `telegram_pairing` | `customers.telegram_bot_token` + `telegram_chat_id` |
| 6 | `first_message` | most recent `usage_log` row + 7-day count |

Each stage rolls up to one of: `pending`, `in_progress`, `ok`, `failed_retryable`, `failed_hard`. The overall report is `healthy` / `in_flight` / `stuck` / `unknown`.

## Layout

```
packages/observability/
├── src/
│   ├── types.ts          CustomerSnapshot + StageStatus + StatusReport
│   ├── derive.ts         pure logic — snapshot → StatusReport
│   ├── fetch.ts          PostgREST snapshot fetcher (apikey + Bearer)
│   ├── render-text.ts    terminal-friendly renderer (ASCII or ANSI)
│   ├── render-html.ts    HTML fragment for the admin dashboard
│   └── index.ts          barrel
└── tests/
    ├── fixtures/snapshots.ts   reusable scenario fixtures
    ├── derive.spec.ts          stage + overall + nextAction logic
    ├── fetch.spec.ts           URL composition + headers via stub fetch
    ├── render-text.spec.ts
    └── render-html.spec.ts
```

54 tests covering every stage transition + every render mode. No runtime dependencies.

## Use from a Vercel function

```ts
import {
  fetchCustomerSnapshot,
  deriveCustomerStatus,
  renderStatusReportHtml,
} from '../../packages/observability/src/index.ts'

const snap = await fetchCustomerSnapshot(customerId, {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SECRET_KEY!,
})
const report = deriveCustomerStatus(snap)
res.setHeader('Content-Type', 'text/html')
res.send(renderStatusReportHtml(report))
```

## Use from the CLI

```sh
npm run cli -- diagnose --customer-id 11111111-1111-4111-8111-111111111111
npm run cli -- diagnose --customer-id <uuid> --json     # machine-readable
npm run cli -- diagnose --customer-id <uuid> --verbose  # stage details
```

CLI exit codes:
- `0` healthy
- `2` in_flight (in_progress stages, no failures)
- `3` stuck (any failure stage)
- `4` unknown (customer row missing)
- `1` bad arguments / runtime error

Reads `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) from env. The CLI dispatcher (`scripts/cli.ts`) auto-loads `.env.local` if present.

## Admin dashboard

The static page at `/admin/observability/customer` (file: `admin/observability/customer.html`) prompts the founder for a customer id + the `OBSERVABILITY_ADMIN_SECRET` and calls `/api/admin/observability/customer?id=<uuid>&format=json|html`. The secret is sent as `Authorization: Bearer …` and persists in `sessionStorage` for the tab.

The endpoint returns either JSON (default) or an HTML fragment using these classes (admin page styles them):
- `obs-report`, `obs-header`, `obs-stages`
- `obs-stage`, `obs-stage-{state}` (`ok` / `pending` / `in_progress` / `failed_retryable` / `failed_hard`)
- `obs-overall-{healthy|in_flight|stuck|unknown}`
- `obs-next-action`, `obs-stage-action`

Required Vercel env: `OBSERVABILITY_ADMIN_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

## Run tests

```sh
cd packages/observability
npm test
npx tsc --noEmit
```
