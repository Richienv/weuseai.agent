/**
 * Mock kanban client behavioral tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MockHermesKanbanClient,
  seedBoardWithTasks,
  DEFAULT_COLUMNS,
} from '../src/index.ts'

// ─── createBoard ────────────────────────────────────────────────────

test('createBoard: default columns To Do / In Progress / Review / Done', async () => {
  const client = new MockHermesKanbanClient()
  const board = await client.createBoard({ title: 'Test', customer_id: 'cust-1' })
  assert.equal(board.columns.length, 4)
  assert.deepEqual(
    board.columns.map((c) => c.title),
    ['To Do', 'In Progress', 'Review', 'Done'],
  )
})

test('createBoard: respects custom columns', async () => {
  const client = new MockHermesKanbanClient()
  const board = await client.createBoard({
    title: 'Custom',
    customer_id: 'c',
    columns: [
      { title: 'Backlog', order: 1 },
      { title: 'Sprint', order: 2 },
      { title: 'Live', order: 3 },
    ],
  })
  assert.deepEqual(
    board.columns.map((c) => c.title),
    ['Backlog', 'Sprint', 'Live'],
  )
})

test('createBoard: columns sorted by order before persistence', async () => {
  const client = new MockHermesKanbanClient()
  const board = await client.createBoard({
    title: 'Out-of-order',
    customer_id: 'c',
    columns: [
      { title: 'Z', order: 3 },
      { title: 'A', order: 1 },
      { title: 'M', order: 2 },
    ],
  })
  assert.deepEqual(board.columns.map((c) => c.title), ['A', 'M', 'Z'])
})

test('createBoard: tasks dict starts empty', async () => {
  const client = new MockHermesKanbanClient()
  const board = await client.createBoard({ title: 't', customer_id: 'c' })
  assert.deepEqual(board.tasks, {})
})

// ─── addTask + moveTask ─────────────────────────────────────────────

test('addTask: lands in To Do by default', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const task = await client.addTask({
    board_id: b.id,
    task: { title: 'X', owner_persona: 'doc-expert', depends_on: [] },
  })
  const fresh = await client.getBoard({ board_id: b.id })
  assert.equal(task.status, 'todo')
  const todoCol = fresh.columns.find((c) => c.title === 'To Do')
  assert.ok(todoCol?.task_ids.includes(task.id))
})

test('moveTask: To Do → In Progress shifts task_ids between columns', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const task = await client.addTask({
    board_id: b.id,
    task: { title: 'X', owner_persona: 'web-master', depends_on: [] },
  })
  await client.moveTask({ task_id: task.id, to_status: 'in_progress' })
  const fresh = await client.getBoard({ board_id: b.id })
  const todo = fresh.columns.find((c) => c.title === 'To Do')!
  const inProg = fresh.columns.find((c) => c.title === 'In Progress')!
  assert.equal(todo.task_ids.includes(task.id), false)
  assert.equal(inProg.task_ids.includes(task.id), true)
  assert.equal(fresh.tasks[task.id].status, 'in_progress')
})

test('moveTask: status update reflected on returned task', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const t = await client.addTask({
    board_id: b.id,
    task: { title: 'X', owner_persona: 'the-pro', depends_on: [] },
  })
  const moved = await client.moveTask({ task_id: t.id, to_status: 'done' })
  assert.equal(moved.status, 'done')
})

// ─── updateTask ─────────────────────────────────────────────────────

test('updateTask: patches title + owner_persona', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const t = await client.addTask({
    board_id: b.id,
    task: { title: 'old', owner_persona: 'doc-expert', depends_on: [] },
  })
  const updated = await client.updateTask({
    task_id: t.id,
    patch: { title: 'new', owner_persona: 'web-master' },
  })
  assert.equal(updated.title, 'new')
  assert.equal(updated.owner_persona, 'web-master')
})

test('updateTask: depends_on patch propagates', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const a = await client.addTask({
    board_id: b.id,
    task: { title: 'A', owner_persona: 'the-pro', depends_on: [] },
  })
  const c2 = await client.addTask({
    board_id: b.id,
    task: { title: 'C', owner_persona: 'the-pro', depends_on: [] },
  })
  const updated = await client.updateTask({
    task_id: c2.id,
    patch: { depends_on: [a.id] },
  })
  assert.deepEqual(updated.depends_on, [a.id])
})

// ─── deleteTask ─────────────────────────────────────────────────────

test('deleteTask: removes from board + columns + other tasks depends_on', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const a = await client.addTask({
    board_id: b.id,
    task: { title: 'A', owner_persona: 'the-pro', depends_on: [] },
  })
  const c2 = await client.addTask({
    board_id: b.id,
    task: { title: 'C', owner_persona: 'the-pro', depends_on: [a.id] },
  })
  await client.deleteTask({ task_id: a.id })
  const fresh = await client.getBoard({ board_id: b.id })
  // A gone from board.tasks
  assert.equal(fresh.tasks[a.id], undefined)
  // A gone from To Do column
  const todo = fresh.columns.find((co) => co.title === 'To Do')!
  assert.equal(todo.task_ids.includes(a.id), false)
  // C's depends_on stripped of A
  assert.deepEqual(fresh.tasks[c2.id].depends_on, [])
})

test('deleteTask: idempotent (deleting twice does not throw)', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const t = await client.addTask({
    board_id: b.id,
    task: { title: 'X', owner_persona: 'the-pro', depends_on: [] },
  })
  await client.deleteTask({ task_id: t.id })
  await client.deleteTask({ task_id: t.id })   // no-op, no throw
})

// ─── listBoards ─────────────────────────────────────────────────────

test('listBoards: scoped by customer_id', async () => {
  const client = new MockHermesKanbanClient()
  await client.createBoard({ title: 'A1', customer_id: 'cust-1' })
  await client.createBoard({ title: 'A2', customer_id: 'cust-1' })
  await client.createBoard({ title: 'B1', customer_id: 'cust-2' })
  const a = await client.listBoards({ customer_id: 'cust-1' })
  const b = await client.listBoards({ customer_id: 'cust-2' })
  assert.equal(a.length, 2)
  assert.equal(b.length, 1)
})

// ─── exportBoard ────────────────────────────────────────────────────

test('exportBoard: returns board + hermes_version', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  const ex = await client.exportBoard({ board_id: b.id })
  assert.equal(ex.board.id, b.id)
  assert.match(ex.hermes_version, /^v?0\.13\.\d+$/)
})

// ─── error paths ────────────────────────────────────────────────────

test('getBoard: missing → throws', async () => {
  const client = new MockHermesKanbanClient()
  await assert.rejects(
    () => client.getBoard({ board_id: 'nope' }),
    /board not found/,
  )
})

test('failNextCall knob simulates kanban API failure', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  client.failNextCall = 'addTask'
  await assert.rejects(
    () =>
      client.addTask({
        board_id: b.id,
        task: { title: 'X', owner_persona: 'the-pro', depends_on: [] },
      }),
    /simulated failure/,
  )
  // After failure, knob clears; next call succeeds.
  await client.addTask({
    board_id: b.id,
    task: { title: 'Y', owner_persona: 'the-pro', depends_on: [] },
  })
})

// ─── seedBoardWithTasks helper ──────────────────────────────────────

test('seedBoardWithTasks: bulk-creates a board with N tasks', async () => {
  const client = new MockHermesKanbanClient()
  const { board, created_tasks } = await seedBoardWithTasks(
    client,
    'cust-1',
    'Plan launch',
    [
      { title: 'Spec', owner_persona: 'doc-expert' },
      { title: 'Landing page', owner_persona: 'web-master' },
      { title: 'Deck', owner_persona: 'slide-master' },
    ],
  )
  assert.equal(created_tasks.length, 3)
  // All tasks landed in To Do column.
  const todo = board.columns.find((c) => c.title === 'To Do')!
  assert.equal(todo.task_ids.length, 3)
})

test('clone-on-return: mutations to returned board do not affect store', async () => {
  const client = new MockHermesKanbanClient()
  const b = await client.createBoard({ title: 't', customer_id: 'c' })
  ;(b as { title: string }).title = 'mutated'
  const fresh = await client.getBoard({ board_id: b.id })
  assert.equal(fresh.title, 't', 'mutation must not bleed back into store')
})

// ─── DEFAULT_COLUMNS constant ───────────────────────────────────────

test('DEFAULT_COLUMNS exported with locked 4 columns', () => {
  assert.deepEqual(
    DEFAULT_COLUMNS.map((c) => c.title),
    ['To Do', 'In Progress', 'Review', 'Done'],
  )
})
