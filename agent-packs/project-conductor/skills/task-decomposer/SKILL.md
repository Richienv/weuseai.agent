# task-decomposer — Hermes skill

Bundle: project-conductor (v2)
Tier: pro+
Handler: `hermes-skill:task-decomposer` (Hermes uses customer's BYOK LLM to reason over project goal → decompose to actionable tasks)

## Kapan dipakai

Customer punya project goal high-level dan butuh breakdown jadi tasks. Trigger phrases:

- "bagi project ini jadi task"
- "decompose ke task-task"
- "breakdown plan launch"
- "kasih plan eksekusi"
- "structure project"

Juga: triggered automatically dari `kanban-orchestrator` saat `create-board` + project_goal supplied.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `project_goal` | string | ya | High-level — "plan product launch", "organize team retreat", "ship Q4 dashboard redesign" |
| `timeline` | string | tidak | Mis. "2 minggu", "Q4 2025", "by 15 Nov". Informs task ETA |
| `team_size` | int | tidak | Default 1-3 (solo founder + 1-2 collaborators); larger informs parallelization |
| `constraints` | array string | tidak | Mis. "budget < Rp 50jt", "tim cuma 1 designer", "harus include legal review" |

## Yang dilakukan

1. Apply Indonesian-context heuristics — "product launch" → include kompetitor research, brand voice check, IDR pricing strategy, Indonesian channel mix (Instagram, TikTok, WhatsApp Business).
2. Susun task list 6-12 items by default (capped at 15 — kalau lebih, split jadi sub-projects).
3. Per task: { id, title, description, suggested_owner_persona, dependencies[], estimated_hours, milestone_tag }.
4. Suggest owner_persona dari catalog: The Pro, Deep Researcher, Web Creator, Doc Expert, Slide Master, Trade Pro, Business Director, Video Producer, Social Conductor.
5. Build dependency graph — flag critical path + parallelization opportunities.
6. Output JSON-structured task list ready for `kanban-orchestrator` to ingest.

## Output

Persona-voice wrapper:

> "Project '[goal]' aku bagi jadi 8 task:
>
> 1. Riset kompetitor + market sizing (Deep Researcher, ~6 jam) — no deps
> 2. Brand voice check + tone consistency (The Pro, ~2 jam) — no deps
> 3. Landing page draft (Web Creator, ~4 jam) — depends on 1
> 4. Press release + email blast draft (Doc Expert, ~3 jam) — depends on 1, 2
> 5. Pricing strategy + Indonesian payment gateway pick (Trade Pro, ~3 jam) — depends on 1
> 6. Visual deck untuk PR / partner pitch (Slide Master, ~3 jam) — depends on 4
> 7. TikTok launch video script (Video Producer, ~2 jam) — depends on 2
> 8. Social media calendar 30 hari (Social Conductor, ~2 jam) — depends on 4, 7
>
> Critical path: 1 → 4 → 6 (~12 jam). Task 2, 5, 7 bisa parallel.
>
> Approve plan ini, atau adjust dulu?"

## Decline criteria

- **Decompose request yang ambigu.** Tanya satu pertanyaan klarifikasi — "Goal-nya soft launch atau hard launch? Audience B2B atau B2C?"
- **Project yang scope-nya terlalu besar untuk 1 sprint.** Tawarkan split jadi multi-phase dengan checkpoint approval per phase.
- **Task yang require human-only judgement** (mis. "negosiasi kontrak vendor"). Tag sebagai owner=human, no agent assignment.

## Decline kalau missing context

Kalau cuma "decompose" — tanya: "Project apa yang mau di-decompose?"
