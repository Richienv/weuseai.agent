// Unit tests for customer-tier-bump handler (Phase 2E-3).
//
// Reference: supabase/functions/_shared/customer-tier-bump-handler.ts
//
// Covers:
//  - Input validation (uuid, tier enum, reason enum, xendit_invoice_id required)
//  - Customer-not-found → 404
//  - Idempotent no-op when already at target tier
//  - Audit row inserted before side effects
//  - DB update fail → audit marked with error_detail, returns 500
//  - VPS host null → DB-only path, no provisioning call
//  - Provisioning call fail → audit marked with error_detail, returns 502
//  - Provisioning call ok → completed_at set, optional notify
//  - Notify failure swallowed (non-fatal)
//  - Happy path returns full body shape

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  customerTierBumpHandler,
  type TierBumpDeps,
  type TierBumpInput,
} from '../supabase/functions/_shared/customer-tier-bump-handler.ts'
import type { WorkflowTier } from '../supabase/functions/_shared/workflow-types.ts'

// ─── helpers ────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

function baseInput(overrides: Partial<TierBumpInput> = {}): TierBumpInput {
  return {
    customer_id: VALID_UUID,
    target_tier: 'pro',
    reason: 'xendit_invoice_paid',
    xendit_invoice_id: 'inv-xendit-1',
    ...overrides,
  }
}

type Recorder = {
  lookups: Array<string>
  audits: Array<unknown>
  updates: Array<{ customer_id: string; target_tier: WorkflowTier }>
  marks: Array<{ event_id: string; completion: unknown }>
  provCalls: Array<unknown>
  notifyCalls: Array<unknown>
}

function makeDeps(
  rec: Recorder,
  overrides: Partial<TierBumpDeps> = {},
): TierBumpDeps {
  return {
    async lookupCustomer(customer_id) {
      rec.lookups.push(customer_id)
      return { ok: true, current_tier: 'starter', vps_host: '203.0.113.1' }
    },
    async updateCustomerTier(customer_id, target_tier) {
      rec.updates.push({ customer_id, target_tier })
      return { ok: true }
    },
    async insertAuditRow(row) {
      rec.audits.push(row)
      return { ok: true, event_id: 'evt-1' }
    },
    async markAuditComplete(event_id, completion) {
      rec.marks.push({ event_id, completion })
      return { ok: true }
    },
    async callProvisioningTierBump(args) {
      rec.provCalls.push(args)
      return { ok: true, restarted_at: '2026-05-08T10:00:00Z' }
    },
    async notifyCustomer(args) {
      rec.notifyCalls.push(args)
      return { ok: true }
    },
    ...overrides,
  }
}

function recorder(): Recorder {
  return {
    lookups: [],
    audits: [],
    updates: [],
    marks: [],
    provCalls: [],
    notifyCalls: [],
  }
}

// ─── input validation ───────────────────────────────────────────────────

describe('customerTierBumpHandler — input validation', () => {
  test('rejects invalid customer_id (not a UUID)', async () => {
    const r = await customerTierBumpHandler(
      baseInput({ customer_id: 'not-a-uuid' }),
      makeDeps(recorder()),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_input')
    assert.match(r.detail!, /uuid/)
  })

  test('rejects invalid target_tier', async () => {
    const r = await customerTierBumpHandler(
      // @ts-expect-error intentional invalid tier
      baseInput({ target_tier: 'enterprise' }),
      makeDeps(recorder()),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.detail!, /target_tier/)
  })

  test('rejects invalid reason', async () => {
    const r = await customerTierBumpHandler(
      // @ts-expect-error intentional
      baseInput({ reason: 'because_i_said_so' }),
      makeDeps(recorder()),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.detail!, /reason/)
  })

  test('requires xendit_invoice_id when reason=xendit_invoice_paid', async () => {
    const r = await customerTierBumpHandler(
      baseInput({ xendit_invoice_id: undefined }),
      makeDeps(recorder()),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.detail!, /xendit_invoice_id/)
  })

  test('does NOT require xendit_invoice_id for other reasons', async () => {
    const r = await customerTierBumpHandler(
      baseInput({ reason: 'manual_admin', xendit_invoice_id: undefined }),
      makeDeps(recorder()),
    )
    assert.equal(r.ok, true)
  })
})

// ─── customer not found ─────────────────────────────────────────────────

describe('customerTierBumpHandler — customer-not-found', () => {
  test('returns 404 when lookup fails', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async lookupCustomer() {
          return { ok: false, error: 'no customer with id …' }
        },
      }),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 404)
    assert.equal(r.error, 'customer_not_found')
    // No side-effects: no audit, no update, no provisioning.
    assert.equal(rec.audits.length, 0)
    assert.equal(rec.updates.length, 0)
    assert.equal(rec.provCalls.length, 0)
  })
})

// ─── idempotency ────────────────────────────────────────────────────────

describe('customerTierBumpHandler — idempotency', () => {
  test('returns ok=true no-op when already at target tier', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput({ target_tier: 'starter' }),
      makeDeps(rec, {
        async lookupCustomer() {
          return { ok: true, current_tier: 'starter', vps_host: '203.0.113.1' }
        },
      }),
    )
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.equal(r.body.event_id, 'noop-already-at-target')
    // No side-effects on no-op.
    assert.equal(rec.audits.length, 0)
    assert.equal(rec.updates.length, 0)
    assert.equal(rec.provCalls.length, 0)
  })
})

// ─── audit-first ordering ───────────────────────────────────────────────

describe('customerTierBumpHandler — audit-first ordering', () => {
  test('insertAuditRow runs BEFORE updateCustomerTier and provisioning call', async () => {
    const order: string[] = []
    const r = await customerTierBumpHandler(baseInput(), {
      lookupCustomer: async () => ({ ok: true, current_tier: 'starter', vps_host: 'h' }),
      insertAuditRow: async () => { order.push('audit'); return { ok: true, event_id: 'evt' } },
      updateCustomerTier: async () => { order.push('update'); return { ok: true } },
      callProvisioningTierBump: async () => { order.push('prov'); return { ok: true, restarted_at: 't' } },
      markAuditComplete: async () => { order.push('mark'); return { ok: true } },
    })
    assert.equal(r.ok, true)
    assert.deepEqual(order, ['audit', 'update', 'prov', 'mark'])
  })

  test('audit insert failure → 500, no further side-effects', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async insertAuditRow() {
          return { ok: false, error: 'pg connection lost' }
        },
      }),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.error, 'audit_insert_failed')
    assert.equal(rec.updates.length, 0)
    assert.equal(rec.provCalls.length, 0)
  })
})

// ─── DB update failure ──────────────────────────────────────────────────

describe('customerTierBumpHandler — DB update failure', () => {
  test('marks audit row with error_detail when DB update fails', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async updateCustomerTier() {
          return { ok: false, error: 'unique violation on subscription_id' }
        },
      }),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 500)
    assert.equal(r.error, 'db_update_failed')
    assert.equal(rec.marks.length, 1)
    assert.deepEqual(rec.marks[0].completion, {
      error_detail: 'db_update_failed: unique violation on subscription_id',
    })
    assert.equal(rec.provCalls.length, 0) // skipped because DB update failed
  })
})

// ─── VPS host null path ─────────────────────────────────────────────────

describe('customerTierBumpHandler — no VPS yet', () => {
  test('skips provisioning call when vps_host is null; DB-only path completes ok', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async lookupCustomer() {
          return { ok: true, current_tier: 'starter', vps_host: null }
        },
      }),
    )
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.equal(r.body.from_tier, 'starter')
    assert.equal(r.body.to_tier, 'pro')
    assert.equal(rec.provCalls.length, 0) // NOT called — no VPS to SSH into
    assert.equal(rec.marks.length, 1)
    // Audit marked complete (not error)
    assert.ok('completed_at' in (rec.marks[0].completion as object))
  })
})

// ─── Provisioning failure ───────────────────────────────────────────────

describe('customerTierBumpHandler — provisioning failure', () => {
  test('marks audit row with error, returns 502', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async callProvisioningTierBump() {
          return { ok: false, error: 'SSH timeout after 30s' }
        },
      }),
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 502)
    assert.equal(r.error, 'provisioning_call_failed')
    assert.deepEqual(rec.marks[0].completion, {
      error_detail: 'provisioning_call_failed: SSH timeout after 30s',
    })
  })
})

// ─── Happy path ─────────────────────────────────────────────────────────

describe('customerTierBumpHandler — happy path', () => {
  test('returns ok with full body + invokes notify', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(baseInput(), makeDeps(rec))
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.equal(r.body.from_tier, 'starter')
    assert.equal(r.body.to_tier, 'pro')
    assert.equal(r.body.completed_at, '2026-05-08T10:00:00Z')
    assert.equal(r.body.event_id, 'evt-1')
    assert.equal(rec.notifyCalls.length, 1)
  })

  test('audit row carries xendit_invoice_id', async () => {
    const rec = recorder()
    await customerTierBumpHandler(
      baseInput({ xendit_invoice_id: 'inv-12345' }),
      makeDeps(rec),
    )
    assert.equal((rec.audits[0] as { xendit_invoice_id: string }).xendit_invoice_id, 'inv-12345')
  })

  test('notify failure does NOT fail the bump', async () => {
    const rec = recorder()
    const r = await customerTierBumpHandler(
      baseInput(),
      makeDeps(rec, {
        async notifyCustomer() {
          throw new Error('telegram backend down')
        },
      }),
    )
    assert.equal(r.ok, true) // still ok
  })

  test('notify is not called when notifyCustomer dep is omitted', async () => {
    const rec = recorder()
    const deps = makeDeps(rec)
    delete (deps as { notifyCustomer?: unknown }).notifyCustomer
    const r = await customerTierBumpHandler(baseInput(), deps)
    assert.equal(r.ok, true)
    assert.equal(rec.notifyCalls.length, 0)
  })
})
