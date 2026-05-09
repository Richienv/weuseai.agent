// Hermes v0.13.x native kanban API — type contract.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-5, Q6=C
// v0.13.x range pin).
//
// The runtime is upstream NousResearch/hermes-agent v0.13.x. We do
// NOT fork or modify Hermes (per CLAUDE.md). This package is purely:
//
//   1. Typed contract — documents the expected request/response
//      shapes so Project Conductor's kanban-orchestrator skill can
//      compose calls type-safely on the customer VPS.
//   2. Mock implementation — used by handler tests so we can verify
//      orchestration logic without spinning up a Hermes runtime.
//   3. Future basis for the platform-side proxy (Phase 4-5b, deferred
//      until SUPABASE_ACCESS_TOKEN is available for the schema
//      migration).
//
// Sourcing: types mirror the documented API at
// https://github.com/NousResearch/hermes-agent/blob/v0.13.0/docs/kanban.md
// (verified at spec lock 2026-05-09).

// ─── Domain types ────────────────────────────────────────────────────

export type ColumnId = string

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'

export type PersonaSlug =
  | 'the-pro'
  | 'deep-researcher'
  | 'web-master'
  | 'doc-expert'
  | 'slide-master'
  | 'trade-pro'
  | 'project-conductor'
  | 'business-director'
  | 'video-producer'
  | 'social-conductor'

export type Task = {
  id: string
  title: string
  description?: string
  /** Persona expected to execute this task. multi-agent-router skill
   *  uses this to dispatch to the right child session. */
  owner_persona: PersonaSlug
  /** Tasks this depends on — must complete before this one starts. */
  depends_on: string[]
  /** ISO 8601 — optional deadline. */
  due_date?: string
  /** Estimated effort label, free-form. */
  effort?: string
  /** Status; column membership derived from this in default kanban. */
  status: TaskStatus
  /** Customer-supplied notes / acceptance criteria. */
  acceptance?: string
  created_at: string
  updated_at: string
}

export type Column = {
  id: ColumnId
  /** Display title — e.g. 'To Do', 'In Progress', 'Review', 'Done'. */
  title: string
  /** Insertion order — affects board rendering left-to-right. */
  order: number
  /** Tasks in this column, ordered top-to-bottom. */
  task_ids: string[]
}

export type Board = {
  id: string
  /** Project goal — board title. */
  title: string
  /** Columns in render order. */
  columns: Column[]
  /** All tasks indexed by id (denormalized — columns reference task_ids). */
  tasks: Record<string, Task>
  /** Customer who owns this board (resolves to customers.id). */
  customer_id: string
  created_at: string
  updated_at: string
}

// ─── API surface ─────────────────────────────────────────────────────

/** Hermes v0.13.x native kanban primitives. The kanban-orchestrator
 *  skill on customer VPS calls these directly via Hermes' built-in
 *  skill registry. */
export interface IHermesKanbanClient {
  /** Create a new board with default or custom columns. */
  createBoard(input: {
    title: string
    customer_id: string
    columns?: { title: string; order: number }[]
  }): Promise<Board>

  /** Get an existing board (and its tasks). */
  getBoard(input: { board_id: string }): Promise<Board>

  /** List all boards for a customer. */
  listBoards(input: { customer_id: string }): Promise<Board[]>

  /** Add a task to a board's "To Do" (or first) column. */
  addTask(input: {
    board_id: string
    task: Omit<Task, 'id' | 'status' | 'created_at' | 'updated_at'> & {
      status?: TaskStatus
    }
  }): Promise<Task>

  /** Update task fields (title, description, owner_persona, depends_on,
   *  due_date, effort, acceptance). Status changes go through moveTask. */
  updateTask(input: {
    task_id: string
    patch: Partial<
      Pick<
        Task,
        'title' | 'description' | 'owner_persona' | 'depends_on' | 'due_date' | 'effort' | 'acceptance'
      >
    >
  }): Promise<Task>

  /** Move a task between columns (status change). */
  moveTask(input: {
    task_id: string
    to_status: TaskStatus
  }): Promise<Task>

  /** Delete a task — also removes from any depends_on lists. */
  deleteTask(input: { task_id: string }): Promise<void>

  /** Read raw board snapshot for the platform-side mirror sync.
   *  Returned shape is identical to getBoard but the call signals
   *  "this is for archival, please dehydrate fully" for the
   *  Phase 4-5b proxy use case. */
  exportBoard(input: { board_id: string }): Promise<{
    board: Board
    /** Hermes version at export time — used to detect post-export
     *  schema drift if customer's Hermes upgraded mid-export. */
    hermes_version: string
  }>
}

// ─── Constraints + version pin ──────────────────────────────────────

/** Per Q6=C locked: pin Hermes to v0.13.x range. The provisioning
 *  service's DEFAULT_HERMES_VERSION must match this regex. The
 *  enforcement test in tests/version-pin.spec.ts walks
 *  services/provisioning/src/setup-script.ts and asserts the default
 *  is v0.13.x. */
export const HERMES_VERSION_RANGE_RE = /^v?0\.13\.\d+$/

/** Default columns when create-board is called without overrides. */
export const DEFAULT_COLUMNS: { title: string; order: number }[] = [
  { title: 'To Do', order: 1 },
  { title: 'In Progress', order: 2 },
  { title: 'Review', order: 3 },
  { title: 'Done', order: 4 },
]

/** Persona owner default mapping — persona-suggester for task-decomposer
 *  output. Mirrors the suggested specialist mapping from
 *  agent-packs/business-director/skills/department-task-spawner/SKILL.md. */
export const TASK_OWNER_DEFAULTS: Partial<Record<string, PersonaSlug>> = {
  // Marketing / brand
  'launch announcement': 'social-conductor',
  'press release': 'doc-expert',
  'landing page': 'web-master',
  'pitch deck': 'slide-master',
  // Tech / build
  'spec document': 'doc-expert',
  'web app': 'web-master',
  // Strategy / coordination
  'project plan': 'project-conductor',
  'kpi tracking': 'business-director',
  // Default fallback
  'research': 'deep-researcher',
  'briefing': 'the-pro',
}
