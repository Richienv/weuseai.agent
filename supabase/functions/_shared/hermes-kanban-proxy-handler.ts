// Phase 4-5b: hermes-kanban-proxy pure handler.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-5b proxy handler)
// Schema: supabase/migrations/20260510120000_phase_4_5b_hermes_kanban_mirror.sql
//
// Customer VPS Hermes runtime POSTs board snapshots here on update. We:
//   1. Validate input shape (board structure, persona enum, status enum,
//      hermes_version pin v0.13.x).
//   2. Confirm customer exists (multi-tenant gate).
//   3. Upsert hermes_kanban_boards + hermes_kanban_tasks via the writer.
//
// MVP auth: customer_id existence check only (matches bundle-pull-record).
// Per-customer signed token deferred to Phase 4-5c.
//
// Pure handler — no IO. Caller (Deno entry) injects:
//   * `customerExists`: customers row lookup
//   * `writer`: atomic upsert of board + tasks

// ─── Type contract — mirrors services/hermes-kanban-client/src/types.ts ─

export const PERSONA_SLUGS = [
  'the-pro',
  'deep-researcher',
  'web-app-builder',
  'doc-expert',
  'slide-master',
  'trade-pro',
  'project-conductor',
  'all-in-one-business-agent',
  'video-producer',
  'social-conductor',
] as const
export type PersonaSlug = (typeof PERSONA_SLUGS)[number]

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'review',
  'done',
  'blocked',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type Task = {
  id: string
  title: string
  description?: string
  owner_persona: PersonaSlug
  depends_on: string[]
  due_date?: string
  effort?: string
  status: TaskStatus
  acceptance?: string
  created_at: string
  updated_at: string
}

export type Column = {
  id: string
  title: string
  order: number
  task_ids: string[]
}

export type Board = {
  id: string
  title: string
  columns: Column[]
  tasks: Record<string, Task>
  customer_id: string
  created_at: string
  updated_at: string
}

export type ProxyInput = {
  board: Board
  hermes_version: string
  /** Phase 5-3.c: optional bearer token from Authorization header.
   *  Validated against board.customer_id via verifyToken dep when
   *  present. Backward-compat: handlers without verifyToken ignore. */
  bearer_token?: string | null
}

// ─── Result envelope ───────────────────────────────────────────────────

export type ProxyOk = {
  ok: true
  status: 200
  body: { mirrored: true; board_id: string; task_count: number }
}

export type ProxyErr = {
  ok: false
  status: 400 | 401 | 404 | 500
  error: string
  detail?: string
}

export type ProxyResult = ProxyOk | ProxyErr

// ─── Injected dependencies ─────────────────────────────────────────────

export type CustomerExistsCheck = (customer_id: string) => Promise<boolean>

export type BoardMirrorWriter = (row: {
  board: Board
  hermes_version: string
}) =>
  | Promise<{ ok: true; board_id: string; task_count: number }>
  | Promise<{ ok: false; error: string }>

/** Phase 5-3.c: optional HMAC token verifier. When the Edge Function
 *  has HERMES_INSTANCE_HMAC_KEY configured, it injects a verifier that
 *  proves the caller knows the shared secret AND claims to be the
 *  customer matching board.customer_id. When omitted, the handler
 *  falls back to the customer_id existence check (backward compat). */
export type CustomerTokenVerifier = (
  claimed_customer_id: string,
  bearer_token: string | null,
) => Promise<boolean>

// ─── Validation ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mirror of HERMES_VERSION_RANGE_RE in services/hermes-kanban-client/src/types.ts.
// Drift tested in tests/hermes-kanban-proxy-handler.spec.ts.
const HERMES_VERSION_RANGE_RE = /^v?0\.13\.\d+$/

const PERSONA_SET = new Set<string>(PERSONA_SLUGS)
const STATUS_SET = new Set<string>(TASK_STATUSES)

// ─── Handler ────────────────────────────────────────────────────────────

export async function hermesKanbanProxyHandler(
  input: ProxyInput,
  customerExists: CustomerExistsCheck,
  writer: BoardMirrorWriter,
  verifyToken?: CustomerTokenVerifier,
): Promise<ProxyResult> {
  // ── Shape ────────────────────────────────────────────────────────
  if (!input || typeof input !== 'object') {
    return { ok: false, status: 400, error: 'invalid_input' }
  }
  if (!input.board || typeof input.board !== 'object') {
    return { ok: false, status: 400, error: 'invalid_board' }
  }
  if (typeof input.hermes_version !== 'string') {
    return { ok: false, status: 400, error: 'invalid_hermes_version' }
  }
  if (!HERMES_VERSION_RANGE_RE.test(input.hermes_version)) {
    return { ok: false, status: 400, error: 'invalid_hermes_version' }
  }

  const board = input.board

  // ── Board id / customer id / title ──────────────────────────────
  if (typeof board.id !== 'string' || !UUID_RE.test(board.id)) {
    return { ok: false, status: 400, error: 'invalid_board_id' }
  }
  if (
    typeof board.customer_id !== 'string' ||
    !UUID_RE.test(board.customer_id)
  ) {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (typeof board.title !== 'string' || board.title.trim() === '') {
    return { ok: false, status: 400, error: 'invalid_title' }
  }

  // ── Tasks ──────────────────────────────────────────────────────
  if (!board.tasks || typeof board.tasks !== 'object') {
    return { ok: false, status: 400, error: 'invalid_tasks' }
  }
  for (const [key, task] of Object.entries(board.tasks)) {
    if (!task || typeof task !== 'object') {
      return { ok: false, status: 400, error: 'invalid_task', detail: key }
    }
    if (task.id !== key) {
      return {
        ok: false,
        status: 400,
        error: 'task_id_mismatch',
        detail: `${key} != ${task.id}`,
      }
    }
    if (!PERSONA_SET.has(task.owner_persona)) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_task_persona',
        detail: key,
      }
    }
    if (!STATUS_SET.has(task.status)) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_task_status',
        detail: key,
      }
    }
  }

  // ── Columns ────────────────────────────────────────────────────
  if (!Array.isArray(board.columns)) {
    return { ok: false, status: 400, error: 'invalid_columns' }
  }
  for (const col of board.columns) {
    if (!Array.isArray(col.task_ids)) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_column',
        detail: col.id,
      }
    }
    for (const taskId of col.task_ids) {
      if (!(taskId in board.tasks)) {
        return {
          ok: false,
          status: 400,
          error: 'dangling_task_ref',
          detail: taskId,
        }
      }
    }
  }

  // ── Phase 5-3.c HMAC token check (when configured) ──────────────
  // Runs BEFORE customer existence check so we never leak whether a
  // customer_id maps to a real row to unauthenticated callers.
  if (verifyToken) {
    const ok = await verifyToken(board.customer_id, input.bearer_token ?? null)
    if (!ok) {
      return { ok: false, status: 401, error: 'unauthorized' }
    }
  }

  // ── Customer existence (multi-tenant gate) ─────────────────────
  const exists = await customerExists(board.customer_id)
  if (!exists) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }

  // ── Mirror write ───────────────────────────────────────────────
  const written = await writer({
    board,
    hermes_version: input.hermes_version,
  })
  if (!written.ok) {
    return {
      ok: false,
      status: 500,
      error: 'mirror_write_failed',
      detail: written.error,
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      mirrored: true,
      board_id: written.board_id,
      task_count: written.task_count,
    },
  }
}
