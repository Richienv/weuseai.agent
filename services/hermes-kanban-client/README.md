# @weuseai/hermes-kanban-client

Typed contract for **Hermes v0.13.x native kanban API**. Used by:

- Project Conductor's `kanban-orchestrator` skill on customer VPS (consumes the contract via `IHermesKanbanClient` interface; runtime is upstream Hermes, not this package).
- Platform-side proxy / dashboard (Phase 4-5b — schema mirror live as of `20260510120000_phase_4_5b_hermes_kanban_mirror.sql`; proxy handler Edge Function still pending).
- Tests across the repo that need to simulate kanban behavior without spinning up Hermes.

## Why this exists

Per CLAUDE.md "Yang kita NGGAK kerjain: Tool calling, prompt engineering, agent loop logic — itu Hermes core." We don't fork or modify Hermes upstream. The kanban API itself is provided by Hermes v0.13.0+; this package is purely:

1. **Type contract** — documents the request/response shapes so skill code on customer VPS can compose calls type-safely.
2. **Mock implementation** — `MockHermesKanbanClient` for unit tests of the orchestration layer.
3. **Constants** — default columns, persona-owner defaults, version-range regex.

## Locked decisions (per Phase 4 spec)

- **Q6=C: Pin `v0.13.x` range.** Patch updates auto-accepted; minor bumps require manual review. Enforced via `HERMES_VERSION_RANGE_RE` (`/^v?0\.13\.\d+$/`) — the test suite asserts `services/provisioning/src/setup-script.ts`'s `DEFAULT_HERMES_VERSION` constant matches.

## Usage

### Type contract (customer VPS skill code)

```ts
import type { IHermesKanbanClient, Board, Task, PersonaSlug } from '@weuseai/hermes-kanban-client'

// Hermes injects the real client at skill invocation time.
async function planProductLaunch(client: IHermesKanbanClient, customerId: string) {
  const board = await client.createBoard({
    title: 'Product Launch — Q3',
    customer_id: customerId,
  })
  await client.addTask({
    board_id: board.id,
    task: {
      title: 'Riset kompetitor',
      owner_persona: 'deep-researcher',
      depends_on: [],
    },
  })
  // ... etc
}
```

### Mock (tests)

```ts
import { MockHermesKanbanClient, seedBoardWithTasks } from '@weuseai/hermes-kanban-client'

const client = new MockHermesKanbanClient()
const { board, created_tasks } = await seedBoardWithTasks(client, 'cust-1', 'Test board', [
  { title: 'A', owner_persona: 'doc-expert' },
  { title: 'B', owner_persona: 'web-master', depends_on: [] },
])

// All methods return cloned objects so test mutations don't bleed.
```

## Architecture diagram

```
Customer VPS                         Platform
─────────────                        ────────
Hermes v0.13.x runtime               (Phase 4-5b — deferred)
  │                                  hermes-kanban-proxy-handler
  │                                  /functions/v1/hermes-kanban-proxy
  │                                  ↓
  ├─ kanban-orchestrator skill ────→ POST kanban_state for mirror
  │   └─ uses this package's        ↓
  │      typed contract             hermes_kanban_boards mirror table
  │                                  ↑
  ├─ multi-agent-router skill        platform UI dashboard reads
  │   └─ spawns child sessions       across customers (founder view)
  │      per task.owner_persona
  │
  └─ progress-monitor skill
      └─ weekly digest from board state
         (delivered via Telegram)
```

## What ships in Phase 4-5 (this PR)

✅ This package — typed contract, mock, constants.
✅ Version-pin guard — test asserts `DEFAULT_HERMES_VERSION` matches `v0.13.x` range.
✅ Documentation — this README + Phase 4 spec annotations.

## Deferred to Phase 4-5b

✅ `hermes_kanban_boards` + `hermes_kanban_tasks` schema migration — applied via Management API 2026-05-10 (file: `supabase/migrations/20260510120000_phase_4_5b_hermes_kanban_mirror.sql`). RLS enabled, `v0.13.x` version pin enforced as a CHECK constraint, partial index on overdue active tasks for founder dashboard "what's stuck" query.
🕐 `hermes-kanban-proxy-handler` Edge Function — POSTs board snapshots into the mirror tables on customer-VPS update.
🕐 Platform dashboard for cross-customer kanban view.
🕐 Real Hermes integration test (live VPS) — once founder runs first kanban end-to-end.

## Testing

```bash
npm test
```

Pure-logic tests cover the mock client's behavior + constants. No real Hermes invocation.

## Status

Phase 4-5 — typed contract + mock + version-pin guard (PR #15). Phase 4-5b — schema mirror applied 2026-05-10; proxy handler Edge Function pending.
