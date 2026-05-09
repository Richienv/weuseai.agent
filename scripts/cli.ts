#!/usr/bin/env node
// weuseai-agent root CLI dispatcher.
//
// Used as: `npm run cli -- <subcommand> [args]`
//
// Subcommands:
//   diagnose --customer-id <uuid>    Print onboarding stage status report.
//                                    --verbose adds stage details.
//                                    --json outputs StatusReport JSON.
//                                    --no-color disables ANSI.
//   health                           Operational health-check dashboard.
//                                    Edge Functions + schema tables +
//                                    customer routes. Exit 0 green / 1
//                                    yellow / 2 red. Flags: --no-color,
//                                    --json, --site-url <url>.
//
// Loads env from .env.local for local dev; in CI use real env vars.
//
// New subcommands: add a file under scripts/cli/<name>.ts exporting
// `default async function run(args: string[]): Promise<number>` and
// register here.

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import diagnose from './cli/diagnose.ts'
import health from './cli/health.ts'

type SubcommandHandler = (args: string[]) => Promise<number>

const SUBCOMMANDS: Record<string, SubcommandHandler> = {
  diagnose,
  health,
}

async function main(): Promise<number> {
  loadDotEnvLocal()
  const argv = process.argv.slice(2)
  const sub = argv[0]
  if (!sub || sub === '--help' || sub === '-h') {
    printHelp()
    return sub ? 0 : 1
  }
  const handler = SUBCOMMANDS[sub]
  if (!handler) {
    console.error(`unknown subcommand: ${sub}\n`)
    printHelp()
    return 1
  }
  return handler(argv.slice(1))
}

function printHelp(): void {
  const lines = [
    'weuseai-agent CLI',
    '',
    'usage: npm run cli -- <subcommand> [args]',
    '',
    'subcommands:',
    '  diagnose --customer-id <uuid>   Print onboarding stage report.',
    '                                  Flags: --verbose, --json, --no-color',
    '  health                          Operational health-check dashboard.',
    '                                  Flags: --no-color, --json,',
    '                                         --site-url <url>',
    '',
    'env (read from .env.local automatically):',
    '  SUPABASE_URL',
    '  SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)',
    '  SUPABASE_ACCESS_TOKEN (Mgmt API; needed for `health`)',
  ]
  console.log(lines.join('\n'))
}

/**
 * Minimal `.env.local` loader — no dependency. Only sets vars that
 * aren't already in process.env so real env wins (CI override).
 *
 * Format: `KEY=VALUE`, optional `export ` prefix, optional surrounding
 * quotes on the value.
 */
function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue
    let val = m[2]
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
