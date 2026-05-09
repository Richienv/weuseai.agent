// Pure-logic derivation: snapshot → status report.
//
// No fetch, no I/O, no network. Takes a CustomerSnapshot (rows already
// queried) and walks the 6 canonical stages in order:
//
//   1. payment        ← subscription_invoices (setup_first_month)
//   2. provisioning   ← vps_instances
//   3. hermes_persona ← customers.soul_md_text (set after complete-onboarding)
//   4. bundle_pull    ← bundle_pull_attempts grouped by agent_slug
//   5. telegram_pair  ← customers.telegram_chat_id + telegram_bot_token
//   6. first_message  ← usage_log most-recent row
//
// Each stage carries a single short summary line + optional details.
// `overall` rolls up to healthy / in_flight / stuck / unknown.

import type {
  CustomerSnapshot,
  StageKind,
  StageState,
  StageStatus,
  StatusReport,
} from './types.ts'

const STAGE_ORDER: StageKind[] = [
  'payment',
  'provisioning',
  'hermes_persona',
  'bundle_pull',
  'telegram_pairing',
  'first_message',
]

export function deriveCustomerStatus(snapshot: CustomerSnapshot): StatusReport {
  const customerId = snapshot.customer?.id ?? ''
  const email = snapshot.customer?.email ?? null
  const displayName = snapshot.customer?.display_name ?? null
  const tier = snapshot.subscription?.tier ?? null

  if (!snapshot.customer) {
    return {
      customerId,
      email,
      displayName,
      tier,
      generatedAt: new Date().toISOString(),
      stages: [],
      overall: 'unknown',
      nextAction: 'Customer row missing — check the customers table for the id you passed.',
    }
  }

  const stages: StageStatus[] = STAGE_ORDER.map((kind) => deriveStage(kind, snapshot))

  const overall = rollUp(stages)
  const nextAction = computeNextAction(stages, overall)

  return {
    customerId,
    email,
    displayName,
    tier,
    generatedAt: new Date().toISOString(),
    stages,
    overall,
    nextAction,
  }
}

// ─── Stage derivers ──────────────────────────────────────────────────

function deriveStage(kind: StageKind, snap: CustomerSnapshot): StageStatus {
  switch (kind) {
    case 'payment':
      return derivePayment(snap)
    case 'provisioning':
      return deriveProvisioning(snap)
    case 'hermes_persona':
      return deriveHermesPersona(snap)
    case 'bundle_pull':
      return deriveBundlePull(snap)
    case 'telegram_pairing':
      return deriveTelegramPairing(snap)
    case 'first_message':
      return deriveFirstMessage(snap)
  }
}

function derivePayment(snap: CustomerSnapshot): StageStatus {
  const inv = snap.setupInvoice
  if (!inv) {
    return {
      kind: 'payment',
      state: 'pending',
      summary: 'No setup invoice yet — customer hasn\'t reached checkout.',
      asOf: snap.customer?.created_at,
    }
  }
  if (inv.status === 'paid') {
    return {
      kind: 'payment',
      state: 'ok',
      summary: `Setup invoice paid (Rp ${formatIdr(inv.amount_idr)}).`,
      asOf: inv.paid_at ?? inv.created_at,
      details: { invoice_id: inv.id, amount_idr: inv.amount_idr },
    }
  }
  if (inv.status === 'pending') {
    return {
      kind: 'payment',
      state: 'in_progress',
      summary: `Setup invoice pending (Rp ${formatIdr(inv.amount_idr)}) — Xendit awaiting payment.`,
      asOf: inv.created_at,
      details: { invoice_id: inv.id },
      suggestedAction: 'If older than 24h, customer likely abandoned — chase via email.',
    }
  }
  if (inv.status === 'expired' || inv.status === 'failed') {
    return {
      kind: 'payment',
      state: 'failed_hard',
      summary: `Setup invoice ${inv.status}.`,
      asOf: inv.created_at,
      details: { invoice_id: inv.id },
      suggestedAction: 'Re-issue invoice (Xendit dashboard or /admin/replay).',
    }
  }
  return {
    kind: 'payment',
    state: 'pending',
    summary: 'Invoice exists but status is null — DB inconsistent.',
    asOf: inv.created_at,
    suggestedAction: 'Inspect subscription_invoices row by hand.',
  }
}

function deriveProvisioning(snap: CustomerSnapshot): StageStatus {
  // Provisioning gate: payment must be paid first.
  if (snap.setupInvoice?.status !== 'paid') {
    return {
      kind: 'provisioning',
      state: 'pending',
      summary: 'Waiting for payment to clear.',
    }
  }
  if (!snap.vps) {
    return {
      kind: 'provisioning',
      state: 'failed_retryable',
      summary: 'No VPS row — provisioning never started.',
      suggestedAction:
        'Re-trigger provisioning service (services/provisioning) or check IDCloudHost API errors.',
    }
  }
  if (snap.vps.status === 'running' && snap.vps.ip_address) {
    return {
      kind: 'provisioning',
      state: 'ok',
      summary: `VPS running at ${snap.vps.ip_address} (${snap.vps.region ?? 'no region'}).`,
      asOf: snap.vps.created_at,
      details: { vps_id: snap.vps.id, ip: snap.vps.ip_address ?? '' },
    }
  }
  if (snap.vps.status === 'provisioning') {
    return {
      kind: 'provisioning',
      state: 'in_progress',
      summary: 'IDCloudHost VPS booting (cloud-init in flight).',
      asOf: snap.vps.created_at,
      details: { vps_id: snap.vps.id },
      suggestedAction: 'If older than 10m, SSH into VPS and check cloud-init logs.',
    }
  }
  if (snap.vps.status === 'failed') {
    return {
      kind: 'provisioning',
      state: 'failed_hard',
      summary: 'VPS provisioning failed.',
      asOf: snap.vps.created_at,
      details: { vps_id: snap.vps.id },
      suggestedAction: 'Inspect IDCloudHost dashboard → delete VPS → re-trigger provisioning.',
    }
  }
  if (snap.vps.status === 'stopped') {
    return {
      kind: 'provisioning',
      state: 'failed_retryable',
      summary: 'VPS stopped.',
      asOf: snap.vps.created_at,
      details: { vps_id: snap.vps.id },
      suggestedAction: 'Boot via IDCloudHost dashboard or Always-On flag.',
    }
  }
  return {
    kind: 'provisioning',
    state: 'pending',
    summary: 'VPS row exists but status null.',
  }
}

function deriveHermesPersona(snap: CustomerSnapshot): StageStatus {
  if (!snap.vps || snap.vps.status !== 'running') {
    return {
      kind: 'hermes_persona',
      state: 'pending',
      summary: 'Waiting for VPS to be running.',
    }
  }
  const soul = snap.customer?.soul_md_text
  if (!soul || soul.trim().length === 0) {
    return {
      kind: 'hermes_persona',
      state: 'in_progress',
      summary: 'VPS up but SOUL.md not yet generated — customer still in /onboarding.',
      suggestedAction:
        'Customer needs to complete /onboarding answers — chase via email if 1h+ stale.',
    }
  }
  return {
    kind: 'hermes_persona',
    state: 'ok',
    summary: `SOUL.md generated (${soul.length} chars).`,
    details: { soul_md_chars: soul.length },
  }
}

function deriveBundlePull(snap: CustomerSnapshot): StageStatus {
  // Gate: only meaningful once SOUL.md has been written (Hermes ready to pull).
  if (!snap.customer?.soul_md_text) {
    return {
      kind: 'bundle_pull',
      state: 'pending',
      summary: 'Waiting for SOUL.md (Hermes can\'t pull bundles yet).',
    }
  }
  const expectedAgents = Object.keys(snap.customer.bundle_versions ?? {})
  const pulls = snap.bundlePulls ?? []
  if (pulls.length === 0) {
    return {
      kind: 'bundle_pull',
      state: 'in_progress',
      summary: expectedAgents.length === 0
        ? 'No bundle entries pinned yet — tier-default lookup pending.'
        : `Hermes hasn\'t pulled any of ${expectedAgents.length} pinned bundle(s) yet.`,
      details: { expected_agents: expectedAgents.length },
      suggestedAction:
        'Check Hermes systemd unit + bundle-fetch Edge Function logs on the VPS.',
    }
  }
  // Most recent pull per agent_slug.
  const latestByAgent = new Map<string, (typeof pulls)[number]>()
  for (const p of pulls) {
    const prev = latestByAgent.get(p.agent_slug)
    if (!prev || p.attempted_at > prev.attempted_at) {
      latestByAgent.set(p.agent_slug, p)
    }
  }
  const failed = [...latestByAgent.values()].filter((p) => p.status !== 'success')
  const ok = [...latestByAgent.values()].filter((p) => p.status === 'success')
  if (failed.length === 0 && ok.length > 0) {
    return {
      kind: 'bundle_pull',
      state: 'ok',
      summary: `${ok.length} bundle(s) pulled successfully.`,
      asOf: latestPulledAt(pulls),
      details: {
        agents_ok: ok.length,
        agents_total: latestByAgent.size,
        latest_at: latestPulledAt(pulls),
      },
    }
  }
  if (failed.length > 0) {
    const errSlugs = failed.map((p) => `${p.agent_slug}=${p.status}`).join(', ')
    const isHard = failed.some(
      (p) => p.status === 'permission_denied' || p.status === 'storage_unavailable',
    )
    return {
      kind: 'bundle_pull',
      state: isHard ? 'failed_hard' : 'failed_retryable',
      summary: `${failed.length}/${latestByAgent.size} bundle(s) failed: ${errSlugs}.`,
      asOf: latestPulledAt(pulls),
      details: { agents_failed: failed.length, agents_total: latestByAgent.size },
      suggestedAction: isHard
        ? 'SSH to VPS — check disk space + permissions. Re-trigger bundle-pull manually.'
        : 'Wait for next Hermes-boot retry, or trigger bundle-pull-record replay.',
    }
  }
  return {
    kind: 'bundle_pull',
    state: 'in_progress',
    summary: 'Bundle pulls in progress.',
  }
}

function deriveTelegramPairing(snap: CustomerSnapshot): StageStatus {
  const c = snap.customer
  if (!c) {
    return { kind: 'telegram_pairing', state: 'pending', summary: 'No customer.' }
  }
  if (!c.telegram_bot_token) {
    return {
      kind: 'telegram_pairing',
      state: 'in_progress',
      summary: 'Customer hasn\'t pasted their bot token yet.',
      suggestedAction:
        'Customer creates bot via @BotFather → pastes token in /onboarding step 3.',
    }
  }
  if (!c.telegram_chat_id) {
    return {
      kind: 'telegram_pairing',
      state: 'in_progress',
      summary: 'Bot token present but pairing-code DM not yet received.',
      details: { pairing_code: c.pairing_code ?? '' },
      suggestedAction:
        'Customer DMs the 6-digit pairing code to their bot — webhook captures chat_id.',
    }
  }
  return {
    kind: 'telegram_pairing',
    state: 'ok',
    summary: `Telegram paired (chat_id ${c.telegram_chat_id}).`,
    details: { telegram_chat_id: c.telegram_chat_id },
  }
}

function deriveFirstMessage(snap: CustomerSnapshot): StageStatus {
  // Gate: telegram pairing must be ok for "first message" to be meaningful.
  if (!snap.customer?.telegram_chat_id) {
    return {
      kind: 'first_message',
      state: 'pending',
      summary: 'Waiting for Telegram pairing to complete.',
    }
  }
  if (!snap.firstMessageAt) {
    return {
      kind: 'first_message',
      state: 'in_progress',
      summary: 'Customer paired but no LLM call recorded yet.',
      suggestedAction:
        'Customer should DM the bot to confirm. If they did and nothing appears, check Hermes logs + LLM proxy.',
    }
  }
  return {
    kind: 'first_message',
    state: 'ok',
    summary: `Agent answered at least once (${snap.recentMessageCount} msg in last 7d).`,
    asOf: snap.firstMessageAt,
    details: { recent_7d: snap.recentMessageCount },
  }
}

// ─── Roll-up + next-action ───────────────────────────────────────────

function rollUp(stages: StageStatus[]): StatusReport['overall'] {
  if (stages.length === 0) return 'unknown'
  const states = stages.map((s) => s.state)
  if (states.some((s) => s === 'failed_hard' || s === 'failed_retryable')) return 'stuck'
  if (states.every((s) => s === 'ok')) return 'healthy'
  if (states.some((s) => s === 'in_progress')) return 'in_flight'
  return 'in_flight'
}

function computeNextAction(stages: StageStatus[], overall: StatusReport['overall']): string {
  if (overall === 'healthy') return ''
  // Prefer first failure (founder unsticks) over first in_progress (just wait).
  const failed = stages.find(
    (s) => s.state === 'failed_hard' || s.state === 'failed_retryable',
  )
  if (failed) {
    return failed.suggestedAction ?? `Investigate stage: ${failed.kind} (${failed.state}).`
  }
  const inFlight = stages.find((s) => s.state === 'in_progress')
  if (inFlight) {
    return inFlight.suggestedAction ?? `Waiting on: ${inFlight.kind}.`
  }
  return ''
}

// ─── helpers ─────────────────────────────────────────────────────────

function formatIdr(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

function latestPulledAt(pulls: CustomerSnapshot['bundlePulls']): string {
  return pulls.reduce((acc, p) => (p.attempted_at > acc ? p.attempted_at : acc), '')
}

// Re-export stage-order constant for tests/UI.
export { STAGE_ORDER }
// Allow consumers to reference unused but conceptually-paired type without
// a separate import.
export type { StageState, StageStatus }
