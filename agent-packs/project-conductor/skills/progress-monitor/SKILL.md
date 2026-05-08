# progress-monitor — Hermes skill

Bundle: project-conductor (v2)
Tier: pro+
Handler: `hermes-skill:progress-monitor` (renders dashboard HTML + composes weekly recap markdown)

## Kapan dipakai

Customer minta lihat status atau weekly recap. Trigger phrases:

- "kasih dashboard project"
- "status board sekarang"
- "weekly recap"
- "rangkuman minggu ini"
- "progress update"

Juga: cron-triggered tiap hari Jumat sore (jam 16:00 WIB) kalau customer enable weekly auto-recap.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `mode` | enum: dashboard-url \| weekly-recap \| blocker-list \| timeline-view | ya | Default dashboard-url kalau ambigu |
| `board_id` | string | tidak | Default = current active board |
| `audience` | enum: self \| stakeholder \| 1on1-manager | tidak | Informs tone for weekly-recap mode |

## Yang dilakukan

### dashboard-url mode

1. Render kanban state ke HTML — column layout, task cards dengan owner avatars, blocker indicators, ETA, dependency arrows.
2. Save ke `/home/weuseai/.hermes/kanban/<board_id>.html`.
3. Surface URL via Telegram. Auto-refresh kalau customer reload.

### weekly-recap mode

1. Aggregate kanban activity selama 7 hari terakhir:
   - Tasks moved to Done (count + titles)
   - Tasks moved to Blocked (count + titles + reasons)
   - Tasks added (new scope)
   - Milestones reached (kalau ada milestone tags)
   - Specialist agent outputs (synthesis dari multi-agent-router)
2. Compose markdown structured: Highlights / In-Progress / Blockers / Next Week Priorities.
3. Tone adjustment per `audience`:
   - **self:** raw + honest, include doubts/uncertainties
   - **stakeholder:** professional + outcome-focused, surface decisions-needed front
   - **1on1-manager:** balanced, lead with progress + concrete asks
4. Output siap kirim langsung atau di-edit customer.

### blocker-list mode

1. Filter tasks where status='Blocked' atau dependencies unmet > 3 days.
2. Per blocker: blocker description + owner + dependency + suggested resolution.

### timeline-view mode

1. Render Gantt-like view dari kanban — start_date dari task creation, end_date dari ETA, current marker.
2. Highlight slips vs original ETA.

## Output

Persona-voice wrapper untuk weekly-recap (audience=stakeholder):

> "Weekly recap [date_range] — Project [name]:
>
> **Highlights minggu ini:**
> - Selesai: kompetitor research (Deep Researcher), brand voice check (The Pro), landing page draft (Web Creator).
> - Milestone: kick-off complete + Phase 1 deliverables on track.
>
> **In progress:**
> - Press release draft (Doc Expert, 60% complete, ETA: Senin)
> - Pricing strategy (Trade Pro, blocked — butuh kamu approve target margin)
>
> **Blockers — perlu decision kamu:**
> - Pricing target margin: stick at 30% atau kompetitif lower 25%? Aku butuh ini sebelum Trade Pro lanjut.
>
> **Minggu depan focus:**
> 1. Unblock pricing → spawn Trade Pro complete
> 2. Visual deck untuk PR launch (Slide Master)
> 3. TikTok video script + first cut (Video Producer)
>
> Dashboard: [URL]"

## Decline criteria

- **Recap untuk project yang ngga di-conduct.** Aku surface kalau project_id tidak ditemukan, tawarkan create-board.
- **Real-time monitoring sub-second.** 1-min polling default. Kalau butuh sub-second alert, surface limitation.

## Decline kalau missing context

Kalau "kasih dashboard" tanpa context — surface board list (kalau customer punya multi-project) atau default ke active board.
