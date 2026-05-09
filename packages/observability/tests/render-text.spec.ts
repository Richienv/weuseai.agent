import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import { deriveCustomerStatus } from '../src/derive.ts'
import { renderStatusReportText } from '../src/render-text.ts'
import {
  healthy,
  bundleStorageFail,
  paymentPending,
  notFound,
} from './fixtures/snapshots.ts'

describe('renderStatusReportText', () => {
  it('renders all 6 stages numbered', () => {
    const r = deriveCustomerStatus(healthy())
    const out = renderStatusReportText(r)
    for (let i = 1; i <= 6; i++) assert.match(out, new RegExp(`^${i}\\.`, 'm'))
    assert.match(out, /Payment/)
    assert.match(out, /Provisioning/)
    assert.match(out, /Hermes \/ SOUL\.md/)
    assert.match(out, /Bundle pull/)
    assert.match(out, /Telegram pairing/)
    assert.match(out, /First message/)
  })

  it('marks healthy as HEALTHY', () => {
    const r = deriveCustomerStatus(healthy())
    const out = renderStatusReportText(r)
    assert.match(out, /overall:\s+HEALTHY/)
  })

  it('marks stuck as STUCK + emits next action', () => {
    const r = deriveCustomerStatus(bundleStorageFail())
    const out = renderStatusReportText(r)
    assert.match(out, /STUCK/)
    assert.match(out, /next action:/)
  })

  it('skips suggested-action lines for ok / pending stages', () => {
    const r = deriveCustomerStatus(paymentPending())
    const out = renderStatusReportText(r)
    // The arrow is only emitted for failed_* states.
    const arrows = out.match(/^\s+→/gm) ?? []
    assert.equal(arrows.length, 0)
  })

  it('emits banner for missing customer', () => {
    const r = deriveCustomerStatus(notFound())
    const out = renderStatusReportText(r)
    assert.match(out, /unknown/i)
    assert.match(out, /Customer row missing/i)
  })

  it('color: true wraps overall in ANSI', () => {
    const r = deriveCustomerStatus(healthy())
    const out = renderStatusReportText(r, { color: true })
    assert.ok(out.includes('\x1b['))
  })

  it('verbose: true emits stage details', () => {
    const r = deriveCustomerStatus(healthy())
    const out = renderStatusReportText(r, { verbose: true })
    assert.match(out, /recent_7d:/)
    assert.match(out, /vps_id:/)
  })

  it('default render is ANSI-free', () => {
    const r = deriveCustomerStatus(healthy())
    const out = renderStatusReportText(r)
    assert.ok(!out.includes('\x1b['))
  })
})
