import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import { deriveCustomerStatus } from '../src/derive.ts'
import { renderStatusReportHtml } from '../src/render-html.ts'
import {
  healthy,
  bundleStorageFail,
  paymentPending,
} from './fixtures/snapshots.ts'

describe('renderStatusReportHtml', () => {
  it('returns a single <section>', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(healthy()))
    assert.match(out, /^<section class="obs-report">/)
    assert.match(out, /<\/section>$/)
  })

  it('emits all 6 stages as <li>', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(healthy()))
    const stageMatches = out.match(/class="obs-stage /g) ?? []
    assert.equal(stageMatches.length, 6)
  })

  it('uses obs-stage-ok class on healthy stages', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(healthy()))
    assert.match(out, /obs-stage-ok/)
  })

  it('emits obs-stage-failed_hard for hard failures', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(bundleStorageFail()))
    assert.match(out, /obs-stage-failed_hard/)
  })

  it('escapes HTML in customer fields', () => {
    const r = deriveCustomerStatus(healthy())
    r.email = 'evil"<script>'
    const out = renderStatusReportHtml(r)
    assert.ok(!out.includes('<script>'))
    assert.match(out, /&lt;script&gt;/)
    assert.match(out, /&quot;/)
  })

  it('emits obs-overall-stuck on stuck overall', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(bundleStorageFail()))
    assert.match(out, /obs-overall-stuck/)
  })

  it('emits obs-next-action when nextAction non-empty', () => {
    const out = renderStatusReportHtml(deriveCustomerStatus(paymentPending()))
    assert.match(out, /obs-next-action/)
  })
})
