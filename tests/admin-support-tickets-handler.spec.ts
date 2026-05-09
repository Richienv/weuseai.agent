// Admin dashboard scaffolding: support-tickets pure-handler tests.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TICKET_KINDS,
  TICKET_STATUSES,
  TICKET_SEVERITIES,
  handleAdminSupportTickets,
  type Deps,
  type TicketRow,
  type TicketRowMutator,
  type TicketRowReader,
  type TicketRowWriter,
} from '../api/admin/support-tickets.ts'

const NOW = '2026-05-10T12:00:00.000Z'
const CUST = '11111111-1111-1111-1111-111111111111'
const TICKET_ID = '22222222-2222-2222-2222-222222222222'

function makeRow(overrides?: Partial<TicketRow>): TicketRow {
  return {
    id: TICKET_ID,
    customer_id: CUST,
    kind: 'provisioning_stuck',
    status: 'open',
    title: 'VPS spawn timeout',
    body_md: null,
    resolution_md: null,
    severity: 'medium',
    created_at: NOW,
    updated_at: NOW,
    resolved_at: null,
    ...overrides,
  }
}

const noopReader: TicketRowReader = async () => []
const noopWriter: TicketRowWriter = async () => ({ ok: false, error: 'noop' })
const noopMutator: TicketRowMutator = async () => ({ ok: false, error: 'noop' })

function makeDeps(overrides?: Partial<Deps>): Deps {
  return {
    reader: noopReader,
    writer: noopWriter,
    mutator: noopMutator,
    now: () => NOW,
    ...overrides,
  }
}

// ─── Domain enums (drift defense) ────────────────────────────────

test('TICKET_KINDS lists exactly the 9 schema CHECK enum members', () => {
  assert.deepEqual([...TICKET_KINDS].sort(), [
    'billing_dispute',
    'bundle_pull_failed',
    'feature_request',
    'first_message_silence',
    'hermes_crash',
    'other',
    'pairing_failed',
    'provisioning_stuck',
    'tier_change_request',
  ])
})

test('TICKET_STATUSES lists exactly the 5 schema CHECK enum members', () => {
  assert.deepEqual([...TICKET_STATUSES].sort(), [
    'awaiting_customer',
    'closed_no_action',
    'in_progress',
    'open',
    'resolved',
  ])
})

test('TICKET_SEVERITIES lists exactly the 4 schema CHECK enum members', () => {
  assert.deepEqual([...TICKET_SEVERITIES].sort(), ['high', 'low', 'medium', 'urgent'])
})

test('handler enums match schema CHECK constraints (drift defense)', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const sql = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'supabase/migrations/20260510140000_admin_support_tickets.sql',
    ),
    'utf8',
  )
  // kind enum
  for (const kind of TICKET_KINDS) {
    assert.ok(sql.includes(`'${kind}'`), `migration missing kind '${kind}'`)
  }
  // status enum
  for (const status of TICKET_STATUSES) {
    assert.ok(sql.includes(`'${status}'`), `migration missing status '${status}'`)
  }
  // severity enum
  for (const sev of TICKET_SEVERITIES) {
    assert.ok(sql.includes(`'${sev}'`), `migration missing severity '${sev}'`)
  }
})

// ─── List mode ─────────────────────────────────────────────────────

test('list: no filters → calls reader with empty params', async () => {
  let captured: Parameters<TicketRowReader>[0] | null = null
  const reader: TicketRowReader = async (params) => {
    captured = params
    return [makeRow()]
  }
  const result = await handleAdminSupportTickets(
    { method: 'GET', mode: 'list', query: {} },
    makeDeps({ reader }),
  )
  assert.equal(result.ok, true)
  if (result.ok && 'tickets' in result.body) {
    assert.equal(result.body.tickets.length, 1)
  }
  assert.deepEqual(captured, {})
})

test('list: customer_id + status filters passed through to reader', async () => {
  let captured: Parameters<TicketRowReader>[0] | null = null
  const reader: TicketRowReader = async (params) => {
    captured = params
    return []
  }
  await handleAdminSupportTickets(
    {
      method: 'GET',
      mode: 'list',
      query: { customer_id: CUST, status: 'in_progress' },
    },
    makeDeps({ reader }),
  )
  assert.deepEqual(captured, { customer_id: CUST, status: 'in_progress' })
})

test('list: bad customer_id (not uuid) → 400', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'GET',
      mode: 'list',
      query: { customer_id: 'not-a-uuid' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'bad_customer_id')
  }
})

test('list: bad status → 400', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'GET',
      mode: 'list',
      query: { status: 'unknown' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'bad_status')
  }
})

test('list: bad limit (non-number / out of range) → 400', async () => {
  for (const bad of ['abc', '0', '-5', '500']) {
    const result = await handleAdminSupportTickets(
      { method: 'GET', mode: 'list', query: { limit: bad } },
      makeDeps(),
    )
    assert.equal(result.ok, false, `limit=${bad} should be rejected`)
  }
})

// ─── Create mode ───────────────────────────────────────────────────

test('create: rejects null body', async () => {
  const result = await handleAdminSupportTickets(
    { method: 'POST', mode: 'create', body: null },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_input')
  }
})

test('create: rejects bad customer_id', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: 'not-a-uuid',
        kind: 'provisioning_stuck',
        title: 't',
      },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_customer_id')
  }
})

test('create: rejects bad kind', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST,
        kind: 'made_up_kind',
        title: 't',
      },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_kind')
  }
})

test('create: rejects empty/oversized title', async () => {
  for (const bad of ['', '  ', 'x'.repeat(121)]) {
    const result = await handleAdminSupportTickets(
      {
        method: 'POST',
        mode: 'create',
        body: { customer_id: CUST, kind: 'provisioning_stuck', title: bad },
      },
      makeDeps(),
    )
    assert.equal(result.ok, false, `title='${bad.slice(0, 10)}...' should be rejected`)
  }
})

test('create: happy path → 201 with row', async () => {
  let captured: Parameters<TicketRowWriter>[0] | null = null
  const writer: TicketRowWriter = async (input) => {
    captured = input
    return { ok: true, row: makeRow({ kind: input.kind, title: input.title }) }
  }
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST,
        kind: 'pairing_failed',
        title: 'Bot token rejected by Telegram',
        body_md: 'Customer pasted token, getMe returned 401.',
        severity: 'high',
      },
    },
    makeDeps({ writer }),
  )
  assert.equal(result.ok, true)
  if (result.ok && 'ticket' in result.body) {
    assert.equal(result.status, 201)
    assert.equal(result.body.ticket.kind, 'pairing_failed')
  }
  assert.deepEqual(captured, {
    customer_id: CUST,
    kind: 'pairing_failed',
    title: 'Bot token rejected by Telegram',
    body_md: 'Customer pasted token, getMe returned 401.',
    severity: 'high',
  })
})

test('create: trims title whitespace', async () => {
  const captured: Parameters<TicketRowWriter>[0][] = []
  const writer: TicketRowWriter = async (input) => {
    captured.push(input)
    return { ok: true, row: makeRow({ title: input.title }) }
  }
  await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST,
        kind: 'other',
        title: '   trimmed title   ',
      },
    },
    makeDeps({ writer }),
  )
  assert.equal(captured.length, 1)
  assert.equal(captured[0].title, 'trimmed title')
})

test('create: writer failure surfaces 500', async () => {
  const writer: TicketRowWriter = async () => ({
    ok: false,
    error: 'pg constraint',
  })
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST,
        kind: 'other',
        title: 't',
      },
    },
    makeDeps({ writer }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 500)
    assert.equal(result.error, 'writer_failed')
  }
})

// ─── Update mode ──────────────────────────────────────────────────

test('update: rejects bad id', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: 'not-a-uuid' },
      body: { status: 'resolved' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_id')
  }
})

test('update: rejects empty update body', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: {},
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'empty_update')
  }
})

test('update: rejects bad status', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: { status: 'fixed' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_status')
  }
})

test('update: rejects bad severity', async () => {
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: { severity: 'critical' },
    },
    makeDeps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'invalid_severity')
  }
})

test('update: status + resolution_md → 200 with mutator called', async () => {
  let captured: Parameters<TicketRowMutator>[1] | null = null
  const mutator: TicketRowMutator = async (id, updates) => {
    captured = updates
    return { ok: true, row: makeRow({ id, status: 'resolved', resolution_md: updates.resolution_md ?? null }) }
  }
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: { status: 'resolved', resolution_md: 'rebooted hermes service' },
    },
    makeDeps({ mutator }),
  )
  assert.equal(result.ok, true)
  if (result.ok && 'ticket' in result.body) {
    assert.equal(result.body.ticket.status, 'resolved')
  }
  assert.deepEqual(captured, {
    status: 'resolved',
    resolution_md: 'rebooted hermes service',
  })
})

test('update: mutator failure surfaces 500', async () => {
  const mutator: TicketRowMutator = async () => ({ ok: false, error: 'boom' })
  const result = await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: { status: 'resolved' },
    },
    makeDeps({ mutator }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'mutator_failed')
  }
})

test('update: body_md null clears the field', async () => {
  const captured: Parameters<TicketRowMutator>[1][] = []
  const mutator: TicketRowMutator = async (id, updates) => {
    captured.push(updates)
    return { ok: true, row: makeRow({ id, body_md: null }) }
  }
  await handleAdminSupportTickets(
    {
      method: 'POST',
      mode: 'update',
      query: { id: TICKET_ID },
      body: { body_md: null },
    },
    makeDeps({ mutator }),
  )
  assert.equal(captured.length, 1)
  assert.equal(captured[0].body_md, null)
})
