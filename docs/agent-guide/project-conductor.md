# Project Conductor

Kanban orchestrator pakai Hermes v0.13.0 native — bagi project jadi task, spawn specialist agents per task, monitor dashboard, weekly recap. Renamed dari Macro Strategist di v2.

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **Kanban orchestrator** — bikin board dari project goal. Standard column To Do / In Progress / Review / Done. Customer custom column kalau team workflow beda.
- **Task decomposer** — terjemahkan project goal high-level (mis. "plan product launch") jadi task konkret + dependencies + owner default per persona library.
- **Specialist spawner** — assign task ke persona yang relevant. Mis. "draft pitch deck" → Slide Master; "set up payment gateway" → Web Master.
- **Weekly recap** — every Monday 8 WIB, recap last week (apa selesai, apa stuck, blocker), dan preview minggu ini.

---

## Sample tasks

- "Plan product launch B2C edutech, target 30 hari" — dia bikin board, decompose ke 15-20 task, assign default owner per persona.
- "Status board aku gimana?" — recap kanban: 8 task selesai, 3 in progress, 2 stuck (kasih reason), 4 backlog.
- "Task X ada blocker, gimana unblock-nya" — dia analyze dependency tree, suggest decomposition lebih kecil atau assign ke persona berbeda.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `kanban-orchestrator` | Pro+ | Hermes v0.13.0 native kanban board |
| `task-decomposer` | Pro+ | Goal high-level → task konkret + dep + owner |
| `specialist-spawner` | Pro+ | Assign task ke persona relevant |
| `weekly-recap` | Pro+ | Monday 8 WIB summary + preview |

---

## Hermes v0.13.0 native kanban

Phase 4-5 ship typed contract + mock client untuk Hermes v0.13.x kanban API. Phase 5 atau Phase 5.5 wire ke real Hermes (saat upstream release v0.13.x final).

Kanban data persisted di Hermes side (di VPS kamu), bukan di platform kita — kamu kontrol sepenuhnya.

Standard columns:

- **To Do** — task siap di-pick up
- **In Progress** — agent atau kamu lagi kerjain
- **Review** — output siap kamu review sebelum approve
- **Done** — selesai

Custom column? Kamu bilang "tambah column 'Blocked'" — orchestrator add ke board kamu.

---

## Owner default per task

Project Conductor punya mapping default task type → persona:

| Task type | Default owner |
|---|---|
| Pitch deck / presentation | Slide Master |
| Landing page / website | Web Master |
| Invoice / dokumen formal | Doc Expert |
| Content social media | Social Conductor |
| Video content | Video Producer |
| Market / competitor research | Deep Researcher |
| Tax / compliance / incorporation | Business Director |
| Trade / financial monitoring | Trade Pro |
| Daily ops / general | The Pro |

Bisa override per task — kalau kamu mau Doc Expert handle slide instead of Slide Master, bilang aja.

---

## Limitasi

- **Phase 1:** Hermes v0.13.x belum live sebagai upstream stable. Project Conductor pakai mock client. Real wire-up landing setelah upstream release.
- **Bukan project manager human** — dia coordinate AI specialist, tidak coordinate human team-mate kamu. Buat hybrid (kamu + agent), kamu yang bridge.
- **Multi-week project** — kanban tetep accurate, tapi context-window LLM kamu mungkin compress sumarik untuk task >2 minggu lalu. Detail tersimpan di Hermes DB tapi referenced.

---

## Kapan switch ke persona lain

Project Conductor adalah orchestrator, bukan executor. Kalau task spesifik:

- Eksekusi langsung **deck** → [Slide Master](./slide-master.md).
- Eksekusi langsung **konten** → [Social Conductor](./social-conductor.md) atau [Video Producer](./video-producer.md).
- **Strategy + roadmap business** → [Business Director](./business-director.md).
