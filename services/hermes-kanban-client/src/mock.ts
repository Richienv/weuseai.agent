// Mock IHermesKanbanClient — used by handler tests to simulate Hermes
// kanban without a real runtime. In-memory board store; deterministic.

import type {
  Board,
  Column,
  IHermesKanbanClient,
  Task,
  TaskStatus,
  PersonaSlug,
} from './types.ts'
import { DEFAULT_COLUMNS } from './types.ts'

export class MockHermesKanbanClient implements IHermesKanbanClient {
  private boards = new Map<string, Board>()
  private tasks = new Map<string, { task: Task; board_id: string }>()
  private idCounter = 0

  /** Test knobs. */
  public hermesVersion = 'v0.13.0'
  public failNextCall: keyof IHermesKanbanClient | null = null

  private maybeFail(method: keyof IHermesKanbanClient): void {
    if (this.failNextCall === method) {
      this.failNextCall = null
      throw new Error(`mock kanban: simulated failure on ${method}`)
    }
  }

  private nextId(prefix: string): string {
    this.idCounter++
    return `${prefix}-${this.idCounter}`
  }

  async createBoard(input: {
    title: string
    customer_id: string
    columns?: { title: string; order: number }[]
  }): Promise<Board> {
    this.maybeFail('createBoard')
    const now = new Date().toISOString()
    const cols = (input.columns ?? DEFAULT_COLUMNS)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c): Column => ({
        id: this.nextId('col'),
        title: c.title,
        order: c.order,
        task_ids: [],
      }))
    const board: Board = {
      id: this.nextId('board'),
      title: input.title,
      columns: cols,
      tasks: {},
      customer_id: input.customer_id,
      created_at: now,
      updated_at: now,
    }
    this.boards.set(board.id, board)
    return clone(board)
  }

  async getBoard(input: { board_id: string }): Promise<Board> {
    this.maybeFail('getBoard')
    const board = this.boards.get(input.board_id)
    if (!board) throw new Error(`board not found: ${input.board_id}`)
    return clone(board)
  }

  async listBoards(input: { customer_id: string }): Promise<Board[]> {
    this.maybeFail('listBoards')
    const out: Board[] = []
    for (const b of this.boards.values()) {
      if (b.customer_id === input.customer_id) out.push(clone(b))
    }
    return out
  }

  async addTask(input: {
    board_id: string
    task: Omit<Task, 'id' | 'status' | 'created_at' | 'updated_at'> & {
      status?: TaskStatus
    }
  }): Promise<Task> {
    this.maybeFail('addTask')
    const board = this.boards.get(input.board_id)
    if (!board) throw new Error(`board not found: ${input.board_id}`)
    const now = new Date().toISOString()
    const status = input.task.status ?? 'todo'
    const task: Task = {
      id: this.nextId('task'),
      title: input.task.title,
      description: input.task.description,
      owner_persona: input.task.owner_persona,
      depends_on: input.task.depends_on,
      due_date: input.task.due_date,
      effort: input.task.effort,
      status,
      acceptance: input.task.acceptance,
      created_at: now,
      updated_at: now,
    }
    board.tasks[task.id] = task
    const targetCol = pickColumnForStatus(board, status)
    targetCol.task_ids.push(task.id)
    board.updated_at = now
    this.tasks.set(task.id, { task, board_id: board.id })
    return clone(task)
  }

  async updateTask(input: {
    task_id: string
    patch: Partial<
      Pick<
        Task,
        'title' | 'description' | 'owner_persona' | 'depends_on' | 'due_date' | 'effort' | 'acceptance'
      >
    >
  }): Promise<Task> {
    this.maybeFail('updateTask')
    const ref = this.tasks.get(input.task_id)
    if (!ref) throw new Error(`task not found: ${input.task_id}`)
    const board = this.boards.get(ref.board_id)
    if (!board) throw new Error(`board missing for task ${input.task_id}`)
    const now = new Date().toISOString()
    const next: Task = { ...ref.task, ...input.patch, updated_at: now }
    board.tasks[next.id] = next
    board.updated_at = now
    this.tasks.set(next.id, { task: next, board_id: board.id })
    return clone(next)
  }

  async moveTask(input: { task_id: string; to_status: TaskStatus }): Promise<Task> {
    this.maybeFail('moveTask')
    const ref = this.tasks.get(input.task_id)
    if (!ref) throw new Error(`task not found: ${input.task_id}`)
    const board = this.boards.get(ref.board_id)
    if (!board) throw new Error(`board missing for task ${input.task_id}`)
    // Remove from current column.
    for (const c of board.columns) {
      const idx = c.task_ids.indexOf(input.task_id)
      if (idx >= 0) c.task_ids.splice(idx, 1)
    }
    const target = pickColumnForStatus(board, input.to_status)
    target.task_ids.push(input.task_id)
    const now = new Date().toISOString()
    const next: Task = { ...ref.task, status: input.to_status, updated_at: now }
    board.tasks[next.id] = next
    board.updated_at = now
    this.tasks.set(next.id, { task: next, board_id: board.id })
    return clone(next)
  }

  async deleteTask(input: { task_id: string }): Promise<void> {
    this.maybeFail('deleteTask')
    const ref = this.tasks.get(input.task_id)
    if (!ref) return
    const board = this.boards.get(ref.board_id)
    if (board) {
      for (const c of board.columns) {
        const idx = c.task_ids.indexOf(input.task_id)
        if (idx >= 0) c.task_ids.splice(idx, 1)
      }
      delete board.tasks[input.task_id]
      // Strip from depends_on of other tasks.
      for (const t of Object.values(board.tasks)) {
        t.depends_on = t.depends_on.filter((d) => d !== input.task_id)
      }
      board.updated_at = new Date().toISOString()
    }
    this.tasks.delete(input.task_id)
  }

  async exportBoard(input: { board_id: string }): Promise<{
    board: Board
    hermes_version: string
  }> {
    this.maybeFail('exportBoard')
    const board = await this.getBoard({ board_id: input.board_id })
    return { board, hermes_version: this.hermesVersion }
  }
}

function pickColumnForStatus(board: Board, status: TaskStatus): Column {
  const titleByStatus: Record<TaskStatus, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
    blocked: 'Blocked',
  }
  const wantedTitle = titleByStatus[status]
  const exact = board.columns.find((c) => c.title === wantedTitle)
  if (exact) return exact
  // Fall back to the FIRST column that matches by title prefix
  // (e.g. 'To Do (Sprint 5)' still matches 'To Do').
  const fuzzy = board.columns.find((c) =>
    c.title.toLowerCase().startsWith(wantedTitle.toLowerCase()),
  )
  if (fuzzy) return fuzzy
  // Phase 4-5 v0: default to first column when nothing matches.
  // Phase 4.5+: emit a friendlier error / let customer choose mapping.
  return board.columns[0]
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

/** Helper used by tests: walk a list of task suggestions (e.g. from
 *  task-decomposer output) and add them all to a fresh board. */
export async function seedBoardWithTasks(
  client: IHermesKanbanClient,
  customer_id: string,
  title: string,
  tasks: Array<{
    title: string
    owner_persona: PersonaSlug
    depends_on?: string[]
    description?: string
  }>,
): Promise<{ board: Board; created_tasks: Task[] }> {
  const board = await client.createBoard({ title, customer_id })
  const created: Task[] = []
  for (const t of tasks) {
    const created_t = await client.addTask({
      board_id: board.id,
      task: {
        title: t.title,
        description: t.description,
        owner_persona: t.owner_persona,
        depends_on: t.depends_on ?? [],
      },
    })
    created.push(created_t)
  }
  const fresh = await client.getBoard({ board_id: board.id })
  return { board: fresh, created_tasks: created }
}
