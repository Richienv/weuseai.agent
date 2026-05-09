// `npm run cli -- health` (also aliased as `npm run health-check`).
//
// Runs the operational health-check suite and prints a green/yellow/red
// dashboard. Exit code maps to severity (0 green / 1 yellow / 2 red) so
// CI / cron jobs can branch on it.
//
// Reads from .env.local (CLI dispatcher loads it):
//   SUPABASE_URL              — base for /functions/v1
//   SUPABASE_ACCESS_TOKEN     — Mgmt API token for schema query
//
// Optional flags:
//   --no-color                Disable ANSI color codes
//   --json                    Emit SuiteResult JSON instead of dashboard
//   --site-url <url>          Override customer-facing site URL
//                             (default: https://weuseai-agent-richies-projects-6f212435.vercel.app)

import {
  type Deps,
  type HttpProbe,
  type SqlQuery,
  renderSuite,
  runHealthChecks,
  suiteExitCode,
} from '../lib/health-checks.ts'

const SUPABASE_PROJECT_REF = 'gtjgsligllbjcisiyrah'
const DEFAULT_SITE_URL = 'https://weuseai-agent-richies-projects-6f212435.vercel.app'

interface ParsedArgs {
  noColor: boolean
  json: boolean
  siteUrl: string
}

function parseArgs(args: string[]): ParsedArgs {
  let noColor = false
  let json = false
  let siteUrl = DEFAULT_SITE_URL
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--no-color') noColor = true
    else if (a === '--json') json = true
    else if (a === '--site-url') {
      siteUrl = args[++i] ?? siteUrl
    }
  }
  return { noColor, json, siteUrl }
}

export default async function run(args: string[]): Promise<number> {
  const opts = parseArgs(args)

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

  if (!SUPABASE_URL) {
    console.error('error: SUPABASE_URL not set in env / .env.local')
    return 2
  }
  if (!SUPABASE_ACCESS_TOKEN) {
    console.error(
      'error: SUPABASE_ACCESS_TOKEN not set — needed for schema-table check via Mgmt API',
    )
    return 2
  }

  const supabaseFunctionsBaseUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1`

  // Real HTTP probe — Node 20 has fetch built in. Best-effort with a
  // 5-second cap per request so a stuck function doesn't hang the suite.
  const http: HttpProbe = async (input) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const r = await fetch(input.url, {
        method: input.method ?? 'GET',
        headers: input.headers,
        body: input.body,
        signal: controller.signal,
      })
      return { status: r.status, ok: r.ok }
    } finally {
      clearTimeout(timeout)
    }
  }

  // Mgmt API SQL query for schema check.
  const sql: SqlQuery = async (sqlText) => {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: sqlText }),
      },
    )
    if (!r.ok) {
      throw new Error(`Mgmt API ${r.status}`)
    }
    return (await r.json()) as unknown[]
  }

  const deps: Deps = {
    http,
    sql,
    supabaseFunctionsBaseUrl,
    customerSiteBaseUrl: opts.siteUrl,
    now: () => new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  }

  const suite = await runHealthChecks(deps)

  if (opts.json) {
    process.stdout.write(JSON.stringify(suite, null, 2) + '\n')
  } else {
    process.stdout.write(renderSuite(suite, { noColor: opts.noColor }))
  }

  return suiteExitCode(suite)
}
