import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import { deriveCustomerStatus, STAGE_ORDER } from '../src/derive.ts'
import type { StageKind, StageStatus } from '../src/types.ts'
import {
  notFound,
  preCheckout,
  paymentPending,
  paymentExpired,
  paidNoVps,
  paidVpsProvisioning,
  paidVpsRunningNoSoul,
  bundleAllOk,
  bundleStorageFail,
  pairedNoMessages,
  healthy,
} from './fixtures/snapshots.ts'

function stage(stages: StageStatus[], kind: StageKind): StageStatus {
  const s = stages.find((x) => x.kind === kind)
  if (!s) throw new Error(`missing stage ${kind}`)
  return s
}

describe('deriveCustomerStatus — stage order', () => {
  it('emits 6 stages in canonical order', () => {
    const r = deriveCustomerStatus(healthy())
    assert.equal(r.stages.length, 6)
    assert.deepEqual(
      r.stages.map((s) => s.kind),
      STAGE_ORDER,
    )
  })

  it('returns unknown overall when customer row missing', () => {
    const r = deriveCustomerStatus(notFound())
    assert.equal(r.overall, 'unknown')
    assert.equal(r.stages.length, 0)
    assert.match(r.nextAction, /Customer row missing/i)
  })
})

describe('deriveCustomerStatus — payment stage', () => {
  it('pending when no invoice', () => {
    const r = deriveCustomerStatus(preCheckout())
    assert.equal(stage(r.stages, 'payment').state, 'pending')
  })

  it('in_progress when invoice pending', () => {
    const r = deriveCustomerStatus(paymentPending())
    const s = stage(r.stages, 'payment')
    assert.equal(s.state, 'in_progress')
    assert.match(s.summary, /pending/i)
  })

  it('failed_hard when invoice expired', () => {
    const r = deriveCustomerStatus(paymentExpired())
    const s = stage(r.stages, 'payment')
    assert.equal(s.state, 'failed_hard')
    assert.match(s.summary, /expired/i)
  })

  it('ok when invoice paid', () => {
    const r = deriveCustomerStatus(paidNoVps())
    const s = stage(r.stages, 'payment')
    assert.equal(s.state, 'ok')
    assert.match(s.summary, /paid/i)
  })
})

describe('deriveCustomerStatus — provisioning stage', () => {
  it('pending while payment unpaid', () => {
    const r = deriveCustomerStatus(paymentPending())
    assert.equal(stage(r.stages, 'provisioning').state, 'pending')
  })

  it('failed_retryable when paid but no VPS row', () => {
    const r = deriveCustomerStatus(paidNoVps())
    const s = stage(r.stages, 'provisioning')
    assert.equal(s.state, 'failed_retryable')
    assert.match(s.summary, /No VPS row/i)
    assert.ok(s.suggestedAction)
  })

  it('in_progress when VPS provisioning', () => {
    const r = deriveCustomerStatus(paidVpsProvisioning())
    assert.equal(stage(r.stages, 'provisioning').state, 'in_progress')
  })

  it('ok when VPS running with IP', () => {
    const r = deriveCustomerStatus(paidVpsRunningNoSoul())
    const s = stage(r.stages, 'provisioning')
    assert.equal(s.state, 'ok')
    assert.match(s.summary, /103\.31\.32\.33/)
  })

  it('failed_hard when VPS status=failed', () => {
    const snap = paidVpsRunningNoSoul()
    snap.vps!.status = 'failed'
    const r = deriveCustomerStatus(snap)
    assert.equal(stage(r.stages, 'provisioning').state, 'failed_hard')
  })

  it('failed_retryable when VPS stopped', () => {
    const snap = paidVpsRunningNoSoul()
    snap.vps!.status = 'stopped'
    const r = deriveCustomerStatus(snap)
    assert.equal(stage(r.stages, 'provisioning').state, 'failed_retryable')
  })
})

describe('deriveCustomerStatus — hermes_persona stage', () => {
  it('pending until VPS running', () => {
    const r = deriveCustomerStatus(paidVpsProvisioning())
    assert.equal(stage(r.stages, 'hermes_persona').state, 'pending')
  })

  it('in_progress when VPS up but SOUL.md empty', () => {
    const r = deriveCustomerStatus(paidVpsRunningNoSoul())
    assert.equal(stage(r.stages, 'hermes_persona').state, 'in_progress')
  })

  it('ok when SOUL.md present', () => {
    const r = deriveCustomerStatus(bundleAllOk())
    const s = stage(r.stages, 'hermes_persona')
    assert.equal(s.state, 'ok')
    assert.match(s.summary, /SOUL\.md generated/)
  })
})

describe('deriveCustomerStatus — bundle_pull stage', () => {
  it('pending when no SOUL.md', () => {
    const r = deriveCustomerStatus(paidVpsRunningNoSoul())
    assert.equal(stage(r.stages, 'bundle_pull').state, 'pending')
  })

  it('in_progress when SOUL.md set but zero pull rows', () => {
    const snap = bundleAllOk()
    snap.bundlePulls = []
    const r = deriveCustomerStatus(snap)
    assert.equal(stage(r.stages, 'bundle_pull').state, 'in_progress')
  })

  it('ok when latest pull per agent is success', () => {
    const r = deriveCustomerStatus(bundleAllOk())
    assert.equal(stage(r.stages, 'bundle_pull').state, 'ok')
  })

  it('failed_hard on storage_unavailable', () => {
    const r = deriveCustomerStatus(bundleStorageFail())
    const s = stage(r.stages, 'bundle_pull')
    assert.equal(s.state, 'failed_hard')
    assert.match(s.summary, /storage_unavailable/)
  })

  it('uses latest attempt per agent — recovery from earlier failure counts as ok', () => {
    const snap = bundleAllOk()
    // Add an earlier failure that should be ignored.
    snap.bundlePulls.push({
      agent_slug: 'doc-expert',
      version_requested: '1.0.0',
      version_installed: null,
      status: 'timeout',
      error_detail: 'cf timeout',
      attempted_at: '2026-05-10T05:00:00.000Z',
    })
    const r = deriveCustomerStatus(snap)
    assert.equal(stage(r.stages, 'bundle_pull').state, 'ok')
  })

  it('failed_retryable on transient timeout', () => {
    const snap = bundleAllOk()
    snap.bundlePulls = [
      {
        agent_slug: 'doc-expert',
        version_requested: '1.0.0',
        version_installed: null,
        status: 'timeout',
        error_detail: 'cf timeout',
        attempted_at: '2026-05-10T11:00:00.000Z',
      },
    ]
    const r = deriveCustomerStatus(snap)
    assert.equal(stage(r.stages, 'bundle_pull').state, 'failed_retryable')
  })
})

describe('deriveCustomerStatus — telegram_pairing stage', () => {
  it('in_progress when no bot token', () => {
    const r = deriveCustomerStatus(bundleAllOk())
    assert.equal(stage(r.stages, 'telegram_pairing').state, 'in_progress')
  })

  it('in_progress when bot token but no chat_id', () => {
    const snap = bundleAllOk()
    snap.customer!.telegram_bot_token = '123:abc'
    const r = deriveCustomerStatus(snap)
    const s = stage(r.stages, 'telegram_pairing')
    assert.equal(s.state, 'in_progress')
    assert.match(s.summary, /pairing-code DM/)
  })

  it('ok when chat_id present', () => {
    const r = deriveCustomerStatus(pairedNoMessages())
    assert.equal(stage(r.stages, 'telegram_pairing').state, 'ok')
  })
})

describe('deriveCustomerStatus — first_message stage', () => {
  it('pending when not paired', () => {
    const r = deriveCustomerStatus(bundleAllOk())
    assert.equal(stage(r.stages, 'first_message').state, 'pending')
  })

  it('in_progress when paired but no usage', () => {
    const r = deriveCustomerStatus(pairedNoMessages())
    assert.equal(stage(r.stages, 'first_message').state, 'in_progress')
  })

  it('ok when usage recorded', () => {
    const r = deriveCustomerStatus(healthy())
    const s = stage(r.stages, 'first_message')
    assert.equal(s.state, 'ok')
    assert.match(s.summary, /42 msg/)
  })
})

describe('deriveCustomerStatus — overall + nextAction', () => {
  it('healthy when all stages ok', () => {
    const r = deriveCustomerStatus(healthy())
    assert.equal(r.overall, 'healthy')
    assert.equal(r.nextAction, '')
  })

  it('stuck when any failure', () => {
    const r = deriveCustomerStatus(bundleStorageFail())
    assert.equal(r.overall, 'stuck')
    assert.ok(r.nextAction.length > 0)
  })

  it('in_flight when no failures and at least one in_progress', () => {
    const r = deriveCustomerStatus(paymentPending())
    assert.equal(r.overall, 'in_flight')
  })

  it('nextAction prefers earliest failure over in_progress', () => {
    const snap = bundleStorageFail()
    // earliest failure = bundle_pull. Check next-action references it.
    const r = deriveCustomerStatus(snap)
    assert.match(r.nextAction, /SSH|space|bundle/i)
  })

  it('exposes tier + email + display_name on report', () => {
    const r = deriveCustomerStatus(healthy())
    assert.equal(r.tier, 'pro')
    assert.equal(r.email, 'budi@toko-dapur.id')
    assert.equal(r.displayName, 'Budi Santoso')
  })
})
