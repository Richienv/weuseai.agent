// Phase 4-5b: hermes-kanban-proxy handler tests.
//
// Pure handler at supabase/functions/_shared/hermes-kanban-proxy-handler.ts
// Receives Hermes v0.13.x kanban board snapshots and upserts the platform-side
// mirror (hermes_kanban_boards + hermes_kanban_tasks).
//
// MVP auth model: customer_id existence check only (matches bundle-pull-record).
// Per-customer signed token deferred to Phase 4-5c.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hermesKanbanProxyHandler,
  type ProxyInput,
  type CustomerExistsCheck,
  type BoardMirrorWriter,
  type ProxyResult,
} from '../supabase/functions/_shared/hermes-kanban-proxy-handler.ts'

// ─── Fixtures ────────────────────────────────────────────────────────────

const VALID_BOARD_ID = '11111111-1111-1111-1111-111111111111'
const VALID_CUSTOMER_ID = '22222222-2222-2222-2222-222222222222'
const NOW = '2026-05-09T13:00:00.000Z'

function makeBoard(): ProxyInput['board'] {
  return {
    id: VALID_BOARD_ID,
    title: 'Q3 product launch',
    customer_id: VALID_CUSTOMER_ID,
    columns: [
      { id: 'todo', title: 'To Do', order: 0, task_ids: ['t1'] },
      { id: 'in_progress', title: 'In Progress', order: 1, task_ids: [] },
      { id: 'review', title: 'Review', order: 2, task_ids: [] },
      { id: 'done', title: 'Done', order: 3, task_ids: [] },
    ],
    tasks: {
      t1: {
        id: 't1',
        title: 'Draft launch announcement',
        owner_persona: 'business-agent',
        depends_on: [],
        status: 'todo',
        created_at: NOW,
        updated_at: NOW,
      },
    },
    created_at: NOW,
    updated_at: NOW,
  }
}

function makeInput(overrides?: Partial<ProxyInput>): ProxyInput {
  return {
    board: makeBoard(),
    hermes_version: '0.13.4',
    ...overrides,
  }
}

const customerAlwaysExists: CustomerExistsCheck = async () => true
const customerNeverExists: CustomerExistsCheck = async () => false

type WriteCall = { board_id: string; customer_id: string; task_count: number }
function makeWriter(): { writer: BoardMirrorWriter; calls: WriteCall[] } {
  const calls: WriteCall[] = []
  const writer: BoardMirrorWriter = async (row) => {
    calls.push({
      board_id: row.board.id,
      customer_id: row.board.customer_id,
      task_count: Object.keys(row.board.tasks).length,
    })
    return { ok: true, board_id: row.board.id, task_count: Object.keys(row.board.tasks).length }
  }
  return { writer, calls }
}

// ─── Validation tests ───────────────────────────────────────────────────

test('rejects null/undefined input', async () => {
  const { writer } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    null as unknown as ProxyInput,
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_input')
  }
})

test('rejects missing board', async () => {
  const { writer } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    { hermes_version: '0.13.4' } as unknown as ProxyInput,
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_board')
  }
})

test('rejects board.id that is not a uuid', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.id = 'not-a-uuid'
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_board_id')
  }
})

test('rejects board.customer_id that is not a uuid', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.customer_id = 'not-a-uuid'
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_customer_id')
  }
})

test('rejects hermes_version outside v0.13.x range', async () => {
  const { writer } = makeWriter()
  for (const bad of ['0.12.99', '0.14.0', '1.0.0', 'v1.13.0', '0.13', 'foo']) {
    const result = await hermesKanbanProxyHandler(
      makeInput({ hermes_version: bad }),
      customerAlwaysExists,
      writer,
    )
    assert.equal(result.ok, false, `expected ${bad} to be rejected`)
    if (!result.ok) {
      assert.equal(result.status, 400)
      assert.equal(result.error, 'invalid_hermes_version')
    }
  }
})

test('accepts hermes_version inside v0.13.x range (with or without v prefix)', async () => {
  const { writer } = makeWriter()
  for (const ok of ['0.13.0', '0.13.4', '0.13.99', 'v0.13.0', 'v0.13.4']) {
    const result = await hermesKanbanProxyHandler(
      makeInput({ hermes_version: ok }),
      customerAlwaysExists,
      writer,
    )
    assert.equal(result.ok, true, `expected ${ok} to be accepted`)
  }
})

test('rejects empty board.title', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.title = '   '
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_title')
  }
})

test('rejects task with invalid owner_persona', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.tasks.t1.owner_persona = 'made-up-persona' as never
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_task_persona')
    assert.equal(result.detail, 't1')
  }
})

test('rejects task with invalid status', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.tasks.t1.status = 'pending' as never
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_task_status')
    assert.equal(result.detail, 't1')
  }
})

test('rejects task whose id mismatches its key in the tasks record', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.tasks.t1.id = 'mismatched'
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'task_id_mismatch')
  }
})

test('rejects column.task_ids referring to a missing task', async () => {
  const { writer } = makeWriter()
  const board = makeBoard()
  board.columns[0].task_ids.push('ghost-task')
  const result = await hermesKanbanProxyHandler(
    makeInput({ board }),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'dangling_task_ref')
    assert.equal(result.detail, 'ghost-task')
  }
})

// ─── Customer existence ────────────────────────────────────────────────

test('returns 404 customer_not_found when customer does not exist', async () => {
  const { writer, calls } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    makeInput(),
    customerNeverExists,
    writer,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 404)
    assert.equal(result.error, 'customer_not_found')
  }
  assert.equal(calls.length, 0, 'writer should not be invoked for unknown customer')
})

// ─── Happy path ────────────────────────────────────────────────────────

test('upserts board + returns 200 ok with task_count on happy path', async () => {
  const { writer, calls } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    makeInput(),
    customerAlwaysExists,
    writer,
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
    assert.equal(result.body.mirrored, true)
    assert.equal(result.body.board_id, VALID_BOARD_ID)
    assert.equal(result.body.task_count, 1)
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].board_id, VALID_BOARD_ID)
  assert.equal(calls[0].customer_id, VALID_CUSTOMER_ID)
  assert.equal(calls[0].task_count, 1)
})

test('idempotent — same board snapshot calls writer with same board_id', async () => {
  const { writer, calls } = makeWriter()
  await hermesKanbanProxyHandler(makeInput(), customerAlwaysExists, writer)
  await hermesKanbanProxyHandler(makeInput(), customerAlwaysExists, writer)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].board_id, calls[1].board_id)
})

test('writer failure surfaces as 500 with detail', async () => {
  const failingWriter: BoardMirrorWriter = async () => ({
    ok: false,
    error: 'pg connection lost',
  })
  const result = await hermesKanbanProxyHandler(
    makeInput(),
    customerAlwaysExists,
    failingWriter,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 500)
    assert.equal(result.error, 'mirror_write_failed')
    assert.equal(result.detail, 'pg connection lost')
  }
})

// ─── HERMES_VERSION_RANGE_RE consistency ──────────────────────────────

test('handler version regex matches services/hermes-kanban-client/src/types.ts', async () => {
  // Defensive: keep handler in sync with the typed contract package.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const contractPath = path.resolve(
    process.cwd(),
    'services/hermes-kanban-client/src/types.ts',
  )
  const contractSource = fs.readFileSync(contractPath, 'utf8')
  const m = contractSource.match(
    /HERMES_VERSION_RANGE_RE\s*=\s*\/\^(.+?)\/[a-z]*/,
  )
  assert.ok(m, 'expected HERMES_VERSION_RANGE_RE export in types.ts')
  // The handler should mirror this exact pattern: ^v?0\.13\.\d+$
  assert.equal(m![1], 'v?0\\.13\\.\\d+$')
})
