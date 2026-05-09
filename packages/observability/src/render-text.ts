// Terminal-friendly status report renderer.
//
// Used by `npm run cli -- diagnose --customer-id <uuid>`. Plain ASCII +
// no ANSI by default (CI logs); pass { color: true } for terminal use.

import type { StageStatus, StatusReport } from './types.ts'

const STATE_LABEL: Record<StageStatus['state'], string> = {
  pending: 'pending',
  in_progress: 'in flight',
  ok: 'ok',
  failed_retryable: 'failed (retryable)',
  failed_hard: 'failed (hard)',
}

const STATE_GLYPH: Record<StageStatus['state'], string> = {
  pending: '·',
  in_progress: '~',
  ok: '✓',
  failed_retryable: '!',
  failed_hard: '✗',
}

const ANSI: Record<StageStatus['state'], string> = {
  pending: '\x1b[90m',
  in_progress: '\x1b[33m',
  ok: '\x1b[32m',
  failed_retryable: '\x1b[33m',
  failed_hard: '\x1b[31m',
}
const ANSI_RESET = '\x1b[0m'
const ANSI_BOLD = '\x1b[1m'

const KIND_LABEL: Record<StageStatus['kind'], string> = {
  payment: 'Payment',
  provisioning: 'Provisioning',
  hermes_persona: 'Hermes / SOUL.md',
  bundle_pull: 'Bundle pull',
  telegram_pairing: 'Telegram pairing',
  first_message: 'First message',
}

export interface RenderTextOptions {
  color?: boolean
  verbose?: boolean
}

export function renderStatusReportText(
  report: StatusReport,
  opts: RenderTextOptions = {},
): string {
  const c = !!opts.color
  const lines: string[] = []
  const wrap = (s: string, on: string) => (c ? `${on}${s}${ANSI_RESET}` : s)
  const bold = (s: string) => (c ? `${ANSI_BOLD}${s}${ANSI_RESET}` : s)

  lines.push(bold(`Customer ${report.customerId || '(unknown)'}`))
  if (report.email) lines.push(`  email:        ${report.email}`)
  if (report.displayName) lines.push(`  display name: ${report.displayName}`)
  if (report.tier) lines.push(`  tier:         ${report.tier}`)
  lines.push(`  generated at: ${report.generatedAt}`)
  lines.push(`  overall:      ${overallLabel(report.overall, c)}`)
  if (report.nextAction) {
    lines.push(`  next action:  ${report.nextAction}`)
  }
  lines.push('')

  for (let i = 0; i < report.stages.length; i++) {
    const s = report.stages[i]
    const idx = `${i + 1}.`.padEnd(3, ' ')
    const glyph = wrap(STATE_GLYPH[s.state], ANSI[s.state])
    const label = KIND_LABEL[s.kind].padEnd(20, ' ')
    const state = wrap(`[${STATE_LABEL[s.state]}]`, ANSI[s.state])
    lines.push(`${idx} ${glyph} ${label} ${state}`)
    lines.push(`      ${s.summary}`)
    if (s.asOf) lines.push(`      asOf: ${s.asOf}`)
    if (s.suggestedAction && (s.state === 'failed_hard' || s.state === 'failed_retryable')) {
      lines.push(`      → ${s.suggestedAction}`)
    }
    if (opts.verbose && s.details) {
      for (const [k, v] of Object.entries(s.details)) {
        lines.push(`      ${k}: ${v ?? '(null)'}`)
      }
    }
  }
  return lines.join('\n')
}

function overallLabel(overall: StatusReport['overall'], color: boolean): string {
  const label = overall.toUpperCase()
  if (!color) return label
  switch (overall) {
    case 'healthy':
      return `${ANSI.ok}${label}${ANSI_RESET}`
    case 'in_flight':
      return `${ANSI.in_progress}${label}${ANSI_RESET}`
    case 'stuck':
      return `${ANSI.failed_hard}${label}${ANSI_RESET}`
    default:
      return `${ANSI.pending}${label}${ANSI_RESET}`
  }
}
