// Unit tests for deriveLlmCostReport — the pure per-customer LLM cost
// monitoring compute (Item 3, 2026-05-18 consult).
//
// Covers: pct computation, the 70%-of-cap alert threshold, sort order,
// alert counting, and the edge cases (zero/unknown cap, unavailable
// cost source).

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import {
  deriveLlmCostReport,
  type LlmCostInputRow,
} from '../packages/observability/src/llm-cost.ts'

const NOW = new Date('2026-05-18T12:00:00.000Z')

function row(over: Partial<LlmCostInputRow>): LlmCostInputRow {
  return {
    customer_id: '11111111-1111-4111-8111-111111111111',
    email: 'a@example.com',
    credit_limit_usd_cents: 500,
    cost_usd_cents: 0,
    cost_source: 'openrouter_live',
    ...over,
  }
}

describe('deriveLlmCostReport', () => {
  it('computes pct_used as cost / cap * 100, rounded to 1dp', () => {
    const r = deriveLlmCostReport([row({ cost_usd_cents: 123, credit_limit_usd_cents: 500 })], { now: NOW })
    assert.equal(r.customers[0].pct_used, 24.6)
  })

  it('flags alert_70 at exactly 70% of cap and above', () => {
    const r = deriveLlmCostReport(
      [
        row({ customer_id: '11111111-1111-4111-8111-111111111111', cost_usd_cents: 349 }), // 69.8% — no
        row({ customer_id: '22222222-2222-4222-8222-222222222222', cost_usd_cents: 350 }), // 70.0% — yes
        row({ customer_id: '33333333-3333-4333-8333-333333333333', cost_usd_cents: 500 }), // 100% — yes
      ],
      { now: NOW },
    )
    const byId = Object.fromEntries(r.customers.map((c) => [c.customer_id, c.alert_70]))
    assert.equal(byId['11111111-1111-4111-8111-111111111111'], false)
    assert.equal(byId['22222222-2222-4222-8222-222222222222'], true)
    assert.equal(byId['33333333-3333-4333-8333-333333333333'], true)
    assert.equal(r.alert_count, 2)
  })

  it('sorts customers by pct_used descending, nulls last', () => {
    const r = deriveLlmCostReport(
      [
        row({ customer_id: '11111111-1111-4111-8111-111111111111', cost_usd_cents: 100 }), // 20%
        row({ customer_id: '22222222-2222-4222-8222-222222222222', credit_limit_usd_cents: 0 }), // null
        row({ customer_id: '33333333-3333-4333-8333-333333333333', cost_usd_cents: 400 }), // 80%
      ],
      { now: NOW },
    )
    assert.deepEqual(
      r.customers.map((c) => c.customer_id),
      [
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    )
  })

  it('returns pct_used null and alert_70 false when the cap is zero/unknown', () => {
    const r = deriveLlmCostReport([row({ credit_limit_usd_cents: 0, cost_usd_cents: 999 })], { now: NOW })
    assert.equal(r.customers[0].pct_used, null)
    assert.equal(r.customers[0].alert_70, false)
  })

  it('never alerts when the cost source is unavailable, regardless of stale cost', () => {
    const r = deriveLlmCostReport(
      [row({ cost_usd_cents: 500, cost_source: 'unavailable' })],
      { now: NOW },
    )
    assert.equal(r.customers[0].alert_70, false)
    assert.equal(r.customers[0].pct_used, null)
  })

  it('reports counts and a stable generated_at timestamp', () => {
    const r = deriveLlmCostReport(
      [row({ customer_id: '11111111-1111-4111-8111-111111111111', cost_usd_cents: 400 })],
      { now: NOW },
    )
    assert.equal(r.customer_count, 1)
    assert.equal(r.alert_threshold_pct, 70)
    assert.equal(r.generated_at, '2026-05-18T12:00:00.000Z')
  })

  it('handles an empty customer list without throwing', () => {
    const r = deriveLlmCostReport([], { now: NOW })
    assert.equal(r.customer_count, 0)
    assert.equal(r.alert_count, 0)
    assert.deepEqual(r.customers, [])
  })

  it('honors a custom alert threshold', () => {
    const r = deriveLlmCostReport(
      [row({ cost_usd_cents: 300 })], // 60%
      { now: NOW, alertThresholdPct: 50 },
    )
    assert.equal(r.alert_threshold_pct, 50)
    assert.equal(r.customers[0].alert_70, true)
  })
})
