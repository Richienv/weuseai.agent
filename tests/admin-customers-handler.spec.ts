// Admin UI track: customers handler tests.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TIERS,
  handleAdminCustomers,
  type CustomerRow,
  type CustomerRowMutator,
  type CustomerRowReader,
  type Deps,
} from '../api/admin/customers.ts'

const NOW = '2026-05-10T18:00:00.000Z'
const CUST = '11111111-1111-1111-1111-111111111111'

function makeRow(overrides?: Partial<CustomerRow>): CustomerRow {
  return {
    id: CUST,
    email: 'sarah@example.com',
    display_name: 'Sarah Tanaka',
    tier: 'pro',
    phase_5_enabled: false,
    phase_6_enabled: false,
    monthly_llm_budget_cents: 5000,
    telegram_chat_id: '12345',
    created_at: NOW,
    ...overrides,
  }
}

const noopReader: CustomerRowReader = async () => []
const noopMutator: CustomerRowMutator = async () => ({ ok: false, error: 'noop' })

function makeDeps(overrides?: Partial<Deps>): Deps {
  return {
    reader: noopReader,
    mutator: noopMutator,
    now: () => NOW,
    ...overrides,
  }
}

// ─── Static catalog ────────────────────────────────────────────────

test('TIERS lists exactly 3 (matches CLAUDE.md pricing structure)', () => {
  assert.deepEqual([...TIERS].sort(), ['pro', 'starter', 'studio'])
})

// ─── List mode ────────────────────────────────────────────────────

test('list: no filters → calls reader with empty params', async () => {
  let captured: Parameters<CustomerRowReader>[0] | null = null
  const reader: CustomerRowReader = async (params) => {
    captured = params
    return [makeRow()]
  }
  const result = await handleAdminCustomers(
    { method: 'GET', mode: 'list', query: {} },
    makeDeps({ reader }),
  )
  assert.equal(result.ok, true)
  if (result.ok && 'customers' in result.body) {
    assert.equal(result.body.customers.length, 1)
  }
  assert.deepEqual(captured, {})
})

test('list: tier + phase_5_enabled + limit filters parsed', async () => {
  const captured: Parameters<CustomerRowReader>[0][] = []
  const reader: CustomerRowReader = async (params) => {
    captured.push(params)
    return []
  }
  await handleAdminCustomers(
    {
      method: 'GET',
      mode: 'list',
      query: {
        tier: 'studio',
        phase_5_enabled: 'true',
        phase_6_enabled: 'false',
        limit: '50',
      },
    },
    makeDeps({ reader }),
  )
  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0], {
    tier: 'studio',
    phase_5_enabled: true,
    phase_6_enabled: false,
    limit: 50,
  })
})

test('list: rejects bad tier', async () => {
  const result = await handleAdminCustomers(
    { method: 'GET', mode: 'list', query: { tier: 'enterprise' } },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'bad_tier')
})

test('list: rejects bad boolean filters', async () => {
  for (const key of ['phase_5_enabled', 'phase_6_enabled']) {
    const result = await handleAdminCustomers(
      {
        method: 'GET',
        mode: 'list',
        query: { [key]: 'maybe' } as Record<string, string>,
      },
      makeDeps(),
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, `bad_${key}`)
    }
  }
})

test('list: rejects bad limit (out of range)', async () => {
  for (const bad of ['0', '500', 'abc']) {
    const result = await handleAdminCustomers(
      { method: 'GET', mode: 'list', query: { limit: bad } },
      makeDeps(),
    )
    assert.equal(result.ok, false)
  }
})

// ─── Update mode ──────────────────────────────────────────────────

test('update: rejects bad id', async () => {
  const result = await handleAdminCustomers(
    {
      method: 'POST',
      mode: 'update',
      query: { id: 'not-a-uuid' },
      body: { tier: 'studio' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'invalid_id')
})

test('update: rejects empty body', async () => {
  const result = await handleAdminCustomers(
    { method: 'POST', mode: 'update', query: { id: CUST }, body: {} },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'empty_update')
})

test('update: rejects invalid tier', async () => {
  const result = await handleAdminCustomers(
    {
      method: 'POST',
      mode: 'update',
      query: { id: CUST },
      body: { tier: 'enterprise' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'invalid_tier')
})

test('update: rejects non-boolean phase flags', async () => {
  for (const key of ['phase_5_enabled', 'phase_6_enabled']) {
    const result = await handleAdminCustomers(
      {
        method: 'POST',
        mode: 'update',
        query: { id: CUST },
        body: { [key]: 'true' }, // string, not boolean
      },
      makeDeps(),
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, `invalid_${key}`)
    }
  }
})

test('update: rejects out-of-range monthly_llm_budget_cents', async () => {
  for (const bad of [-1, 100_001, 5.5, 'string']) {
    const result = await handleAdminCustomers(
      {
        method: 'POST',
        mode: 'update',
        query: { id: CUST },
        body: { monthly_llm_budget_cents: bad as never },
      },
      makeDeps(),
    )
    assert.equal(result.ok, false, `${bad} should be rejected`)
  }
})

test('update: tier flip → mutator called with tier only', async () => {
  const captured: Parameters<CustomerRowMutator>[1][] = []
  const mutator: CustomerRowMutator = async (_id, updates) => {
    captured.push(updates)
    return { ok: true, row: makeRow({ tier: 'studio' }) }
  }
  const result = await handleAdminCustomers(
    {
      method: 'POST',
      mode: 'update',
      query: { id: CUST },
      body: { tier: 'studio' },
    },
    makeDeps({ mutator }),
  )
  assert.equal(result.ok, true)
  if (result.ok && 'customer' in result.body) {
    assert.equal(result.body.customer.tier, 'studio')
  }
  assert.deepEqual(captured, [{ tier: 'studio' }])
})

test('update: phase_5 + phase_6 + budget combined update', async () => {
  const captured: Parameters<CustomerRowMutator>[1][] = []
  const mutator: CustomerRowMutator = async (_id, updates) => {
    captured.push(updates)
    return {
      ok: true,
      row: makeRow({
        phase_5_enabled: true,
        phase_6_enabled: true,
        monthly_llm_budget_cents: 10000,
      }),
    }
  }
  await handleAdminCustomers(
    {
      method: 'POST',
      mode: 'update',
      query: { id: CUST },
      body: {
        phase_5_enabled: true,
        phase_6_enabled: true,
        monthly_llm_budget_cents: 10000,
      },
    },
    makeDeps({ mutator }),
  )
  assert.deepEqual(captured, [
    {
      phase_5_enabled: true,
      phase_6_enabled: true,
      monthly_llm_budget_cents: 10000,
    },
  ])
})

test('update: mutator failure surfaces 500', async () => {
  const mutator: CustomerRowMutator = async () => ({
    ok: false,
    error: 'pg constraint',
  })
  const result = await handleAdminCustomers(
    {
      method: 'POST',
      mode: 'update',
      query: { id: CUST },
      body: { tier: 'studio' },
    },
    makeDeps({ mutator }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 500)
    assert.equal(result.error, 'mutator_failed')
  }
})
