# kanban-orchestrator — Hermes skill

Bundle: project-conductor (v2 — REPLACE+RENAME from macro-strategist)
Tier: pro+
Handler: `hermes-skill:kanban-orchestrator` (Hermes v0.13.0 native kanban — column ops, task lifecycle)

## Kapan dipakai

Customer minta bikin / view / modify kanban board untuk project. Trigger phrases:

- "bikin kanban project X"
- "buka board"
- "tunjukkan status project"
- "tambah task X di kanban"
- "move task A ke In Progress"
- "kanban view"

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `action` | enum: create-board \| add-task \| move-task \| update-task \| view-board \| custom-columns | ya | Tanyakan kalau ambigu |
| `board_id` | string | ya untuk view/add/move | Customer bisa punya banyak project; resolve via fuzzy-match nama |
| `project_goal` | string | hanya untuk create-board | High-level goal — masuk sebagai board title |
| `columns` | array string | hanya untuk custom-columns | Default ['To Do', 'In Progress', 'Review', 'Done'] |
| `task_payload` | object | hanya untuk add/update | { title, description, owner, due_date, dependencies[] } |

## Yang dilakukan

1. Resolve action → call Hermes v0.13.0 kanban primitives:
   - `create-board(title, columns)` → returns board_id
   - `add-task(board_id, task_payload)` → returns task_id; auto-detect dependencies via task_decomposer kalau create-board fresh
   - `move-task(task_id, new_column)` → returns updated task
   - `view-board(board_id)` → returns kanban state (columns, tasks, owners, blockers)
2. Untuk create-board, biasanya chain dengan `task-decomposer` skill untuk auto-populate task list dari project_goal.
3. Untuk view-board, surface dashboard URL (rendered HTML at customer's VPS at /home/weuseai/.hermes/kanban/<board_id>.html).
4. Tag tasks dengan persona owner default (Deep Researcher, Doc Expert, dst.) — customer bisa override.

## Output

Persona-voice wrapper untuk view-board:

> "Project [name] — kanban view per [timestamp]:
> - **To Do (3):** Riset kompetitor (Deep Researcher), Draft press release (Doc Expert), Set up landing page (Web Creator).
> - **In Progress (2):** Spec dokumen produk (Doc Expert), Brand voice guidelines (The Pro). 1 blocker: spec butuh approval kamu sebelum lanjut.
> - **Review (1):** Pricing strategy (sudah aku surface kemarin, nunggu kamu approve).
> - **Done (4):** Project plan, timeline, team RACI, kick-off email.
>
> Dashboard URL: [link]. Mau aku lanjutkan task tertentu, atau spawn yang masih di To Do?"

## Decline criteria

- **Auto-execute task tanpa plan-approval.** Spawn = approved by customer.
- **Lebih dari 30 task tanpa decompose.** Aku flag overload, tawarkan break ke sub-projects.

## Decline kalau missing context

Kalau "bikin kanban" tanpa project_goal — tanya: "Project apa yang mau di-kanban-kan? Kasih tahu goal high-level + timeline target."
