// HTML fragment renderer — chrome-on-canvas styled. Embeddable in the
// admin/observability/customer.html static page.
//
// Produces a self-contained <section> with inline-only safe content. No
// external CSS deps; admin page provides its own stylesheet using the
// classes emitted here:
//   .obs-report, .obs-overall, .obs-stage, .obs-stage-ok,
//   .obs-stage-pending, .obs-stage-in_progress,
//   .obs-stage-failed_retryable, .obs-stage-failed_hard,
//   .obs-stage-glyph, .obs-stage-body, .obs-stage-action.

import type { StageStatus, StatusReport } from './types.ts'

const KIND_LABEL: Record<StageStatus['kind'], string> = {
  payment: 'Payment',
  provisioning: 'Provisioning',
  hermes_persona: 'Hermes / SOUL.md',
  bundle_pull: 'Bundle pull',
  telegram_pairing: 'Telegram pairing',
  first_message: 'First message',
}

const STATE_GLYPH: Record<StageStatus['state'], string> = {
  pending: '·',
  in_progress: '~',
  ok: '✓',
  failed_retryable: '!',
  failed_hard: '✗',
}

const STATE_LABEL: Record<StageStatus['state'], string> = {
  pending: 'pending',
  in_progress: 'in flight',
  ok: 'ok',
  failed_retryable: 'failed (retryable)',
  failed_hard: 'failed (hard)',
}

export function renderStatusReportHtml(report: StatusReport): string {
  const overallClass = `obs-overall obs-overall-${esc(report.overall)}`
  const head = [
    `<section class="obs-report">`,
    `<header class="obs-header">`,
    `<h1>Customer ${esc(report.customerId)}</h1>`,
    `<dl>`,
    report.email ? `<dt>email</dt><dd>${esc(report.email)}</dd>` : '',
    report.displayName ? `<dt>display name</dt><dd>${esc(report.displayName)}</dd>` : '',
    report.tier ? `<dt>tier</dt><dd>${esc(report.tier)}</dd>` : '',
    `<dt>generated at</dt><dd>${esc(report.generatedAt)}</dd>`,
    `<dt>overall</dt><dd class="${overallClass}">${esc(report.overall)}</dd>`,
    report.nextAction ? `<dt>next action</dt><dd class="obs-next-action">${esc(report.nextAction)}</dd>` : '',
    `</dl>`,
    `</header>`,
  ].join('')

  const stages = report.stages
    .map((s, idx) => renderStage(s, idx + 1))
    .join('')

  return `${head}<ol class="obs-stages">${stages}</ol></section>`
}

function renderStage(s: StageStatus, n: number): string {
  const cls = `obs-stage obs-stage-${esc(s.state)}`
  const glyph = STATE_GLYPH[s.state]
  const label = KIND_LABEL[s.kind]
  const stateLabel = STATE_LABEL[s.state]
  const action =
    s.suggestedAction && (s.state === 'failed_hard' || s.state === 'failed_retryable')
      ? `<p class="obs-stage-action">→ ${esc(s.suggestedAction)}</p>`
      : ''
  const asOf = s.asOf ? `<p class="obs-stage-asof">${esc(s.asOf)}</p>` : ''
  const detailsBlock = s.details && Object.keys(s.details).length > 0
    ? `<dl class="obs-stage-details">${Object.entries(s.details)
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v ?? ''))}</dd>`)
        .join('')}</dl>`
    : ''
  return [
    `<li class="${cls}">`,
    `<div class="obs-stage-head">`,
    `<span class="obs-stage-num">${n}</span>`,
    `<span class="obs-stage-glyph">${glyph}</span>`,
    `<span class="obs-stage-label">${esc(label)}</span>`,
    `<span class="obs-stage-state">${esc(stateLabel)}</span>`,
    `</div>`,
    `<div class="obs-stage-body">`,
    `<p>${esc(s.summary)}</p>`,
    asOf,
    detailsBlock,
    action,
    `</div>`,
    `</li>`,
  ].join('')
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
