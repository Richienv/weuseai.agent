// `npm run cli -- diagnose --customer-id <uuid>` subcommand.
//
// Reads SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// from env (CLI dispatcher loads .env.local). Fetches the customer
// snapshot via PostgREST, derives a stage-by-stage status report,
// renders to terminal text.
//
// Exit codes:
//   0   healthy
//   2   in flight (in_progress stages, no failures)
//   3   stuck (any failure stage)
//   4   unknown (customer row missing)
//   1   bad arguments / runtime error

import {
  deriveCustomerStatus,
  fetchCustomerSnapshot,
  renderStatusReportText,
} from '../../packages/observability/src/index.ts'
import type { StatusReport } from '../../packages/observability/src/index.ts'

interface ParsedArgs {
  customerId: string | null
  verbose: boolean
  json: boolean
  noColor: boolean
  help: boolean
  err: string | null
}

export default async function run(args: string[]): Promise<number> {
  const parsed = parseArgs(args)
  if (parsed.help) {
    printHelp()
    return 0
  }
  if (parsed.err) {
    console.error(parsed.err)
    printHelp()
    return 1
  }
  if (!parsed.customerId) {
    console.error('--customer-id <uuid> is required')
    printHelp()
    return 1
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      'SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.',
    )
    return 1
  }

  let snapshot
  try {
    snapshot = await fetchCustomerSnapshot(parsed.customerId, {
      supabaseUrl,
      supabaseServiceKey,
    })
  } catch (e) {
    console.error(
      `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    )
    return 1
  }

  const report = deriveCustomerStatus(snapshot)

  if (parsed.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    const color = !parsed.noColor && process.stdout.isTTY
    process.stdout.write(
      renderStatusReportText(report, {
        color,
        verbose: parsed.verbose,
      }) + '\n',
    )
  }

  return overallToExitCode(report.overall)
}

function overallToExitCode(overall: StatusReport['overall']): number {
  switch (overall) {
    case 'healthy':
      return 0
    case 'in_flight':
      return 2
    case 'stuck':
      return 3
    case 'unknown':
      return 4
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {
    customerId: null,
    verbose: false,
    json: false,
    noColor: false,
    help: false,
    err: null,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') {
      out.help = true
      continue
    }
    if (a === '--verbose' || a === '-v') {
      out.verbose = true
      continue
    }
    if (a === '--json') {
      out.json = true
      continue
    }
    if (a === '--no-color') {
      out.noColor = true
      continue
    }
    if (a === '--customer-id') {
      const v = args[i + 1]
      if (!v) {
        out.err = '--customer-id requires a value'
        return out
      }
      out.customerId = v
      i++
      continue
    }
    const eq = /^--customer-id=(.+)$/.exec(a)
    if (eq) {
      out.customerId = eq[1]
      continue
    }
    out.err = `unknown flag: ${a}`
    return out
  }
  return out
}

function printHelp(): void {
  const lines = [
    'usage: npm run cli -- diagnose --customer-id <uuid> [flags]',
    '',
    'flags:',
    '  --customer-id <uuid>  customer row id (required)',
    '  -v, --verbose         emit stage details',
    '  --json                emit StatusReport JSON instead of text',
    '  --no-color            disable ANSI in text output',
    '  -h, --help            show this',
    '',
    'exit codes:',
    '  0 healthy',
    '  2 in_flight',
    '  3 stuck',
    '  4 unknown (customer not found)',
  ]
  console.log(lines.join('\n'))
}
