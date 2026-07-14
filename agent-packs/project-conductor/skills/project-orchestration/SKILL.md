---
skill_kind: playbook
name: project-orchestration
bundle: project-conductor
flow_state_playbook_id: project-orchestration
total_steps: 6
use_cases:
  - "Jalankan satu project dari goal sampai eksekusi — decompose, kanban, dispatch, monitor"
  - "Plan product launch dengan task terstruktur, owner per persona, dan dashboard progress"
  - "Konsolidasi project yang sudah jalan jadi satu board yang dipantau sampai selesai"
  - "Pipeline orkestrasi yang berhenti minta approval plan sebelum specialist agent di-spawn"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer bisa cerita goal project dan, kalau ada, timeline plus team yang terlibat"
  - "Customer paham specialist agent yang di-spawn memakai token LLM BYOK mereka"
escalation_to: customer
---

# project-orchestration — project-conductor playbook

Playbook ini menjalankan satu project dari goal high-level sampai eksekusi terpantau. Empat skill Project Conductor yang sebelumnya berjalan terpisah — task-decomposer, kanban-orchestrator, multi-agent-router, progress-monitor — dirangkai jadi satu alur berurutan, punya satu checkpoint, dan tahan jeda berhari-hari antara pesan customer.

Bedanya dengan memakai keempat skill itu satu per satu: di sini alurnya utuh dengan satu titik henti. Aku decompose goal jadi task, bangun board, lalu berhenti minta kamu approve plan plus owner sebelum specialist agent mana pun di-spawn. Spawn = approved by you. Setelah itu aku dispatch kerja dan pantau progress sampai project selesai.

## Kapan dipakai

Customer minta satu project dijalankan utuh, bukan sekadar satu langkah orkestrasi. Trigger phrases:

- "jalankan project [nama] dari awal sampai selesai"
- "plan product launch, urus sampai eksekusi"
- "bantu aku orkestrasi project ini"
- "decompose, bikin board, lalu spawn semua task"
- "ambil alih project ini — bagi task, dispatch, pantau progress"

Kalau customer cuma minta satu langkah — "decompose project ini saja", "buka board", "spawn satu task", "kasih weekly recap" — pakai skill tunggal yang sesuai (`task-decomposer`, `kanban-orchestrator`, `multi-agent-router`, `progress-monitor`), bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berhari-hari antara pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "project-orchestration", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 6`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer), `escalated` (parkir di gerbang keras — menunggu approval eksplisit customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 6`. Kalau sudah ada run berjalan, lanjut dari cursor-nya — jangan `start` ulang, karena `start` mereset run ke Langkah 1 dan menghapus `state_data` yang sudah terkumpul.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (checkpoint lunak), sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 6 selesai → panggil `complete`.

### Langkah monitoring adalah loop di dalam satu langkah

Langkah 6 (monitor progress) tidak seperti langkah lain. Engine `advance` menggeser cursor tepat satu kali, jadi langkah ini dimodelkan sebagai satu langkah yang berulang di dalam dirinya sendiri.

Selama project belum selesai, Langkah 6 **tidak memanggil `advance`**. Tiap kali customer check-in, agent `get` run-nya, melihat cursor masih di Langkah 6, menjalankan satu siklus monitoring (refresh dashboard, cek task selesai, surface blocker), memperbarui `state_data` lewat `step_output` tanpa menggeser cursor, lalu berhenti. Run tetap di Langkah 6.

Hanya saat kondisi keluar terpenuhi — semua task sampai Done, atau customer bilang project ditutup — agent memanggil `advance` lalu `complete`. Jadi satu langkah flow-state menampung berapa pun siklus check-in; iterasi adalah tanggung jawab agent, bukan engine.

Hal yang sama berlaku untuk fan-out di Langkah 5: spawn beberapa specialist agent dimodelkan sebagai satu langkah yang loop-nya internal. Agent spawn semua task yang siap, mengumpulkan referensi delegasinya, baru `advance` sekali dengan hasil agregat.

## Langkah-langkah

### Langkah 1 — Intake goal dan team  ·  estimasi 3-5 menit

- **Aksi:** Baca pesan customer, tarik konteks project: `project_goal`, `timeline`, `team_size`, `constraints`, dan owner spesifik kalau customer sudah punya preferensi. Kalau ada field penting yang kosong, tanya dalam satu pesan ringkas, jangan satu pertanyaan per giliran. Lalu `get` flow-state — kalau belum ada run, panggil `start` dengan `total_steps: 6`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer berisi goal project dan, kalau ada, timeline, ukuran team, batasan.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "project_goal", "timeline", "team_size", "constraints", "owner_preferences" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `project_goal` wajib terisi dan cukup konkret untuk di-decompose jadi task.

  | Kondisi | Tindakan |
  |---|---|
  | `project_goal` jelas dan konkret | Lanjut, `advance` ke Langkah 2 |
  | `project_goal` ada tapi terlalu luas (mis. "tumbuhin bisnis") | Tetap di Langkah 1, tanya satu pertanyaan untuk mempersempit jadi project nyata |
  | Tidak ada goal sama sekali | Tetap di Langkah 1, tanya goal dan timeline target |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah goal cukup konkret.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai run project-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Decompose goal jadi task  ·  estimasi 4-8 menit

- **Aksi:** Terjemahkan `project_goal` jadi task list konkret 6-12 item (cap 15 — kalau lebih, split jadi sub-project). Per task susun id, judul, deskripsi singkat, suggested owner persona, dependencies, estimasi jam, dan milestone tag. Bangun dependency graph, tandai critical path dan task yang bisa parallel.
- **Tautan/endpoint:** `hermes-skill:task-decomposer`
- **Input yang diharapkan:** Objek intake dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** Task list terstruktur ke `step_output` sebagai `{ "tasks": [ { "id", "title", "description", "suggested_owner_persona", "dependencies", "estimated_hours", "milestone_tag" } ], "critical_path", "parallelizable" }`.
- **Validasi:** Tiap task punya id unik dan suggested owner. Owner diambil dari catalog persona — The Pro, Deep Researcher, Web Creator, Doc Expert, Slide Master, Trade Pro, Business Director, Video Producer, Social Conductor. Task yang butuh judgement manusia ditandai `suggested_owner_persona: "human"`.

  | Kondisi | Tindakan |
  |---|---|
  | Task list 6-15 item, dependency graph lengkap | `advance` ke Langkah 3 |
  | Decompose menghasilkan lebih dari 15 task | Tetap di Langkah 2, rapikan jadi sub-project atau tawarkan customer pilih scope |
  | Goal ternyata terlalu ambigu untuk di-decompose | Tetap di Langkah 2, tanya satu pertanyaan klarifikasi |

- **Gerbang eskalasi:** `none`. Task list belum ditunjukkan ke customer di langkah ini — itu tugas checkpoint Langkah 4.
- **Error handling:** Kalau decompose gagal, ulangi Langkah 2 dengan objek intake yang sama dari `state_data`. Kalau goal kurang konteks, kembali ke Langkah 1 untuk field yang hilang, bukan abort.

### Langkah 3 — Bangun kanban board  ·  estimasi 2-4 menit

- **Aksi:** Bangun kanban board dari task list. Pakai column standar To Do / In Progress / Review / Done, atau column custom kalau workflow team customer beda. Masukkan tiap task sebagai card di kolom To Do dengan owner default, dependency, dan ETA. Render dashboard board.
- **Tautan/endpoint:** `hermes-skill:kanban-orchestrator`
- **Input yang diharapkan:** Task list terstruktur dari `state_data` (hasil Langkah 2).
- **Output yang diharapkan:** Referensi board ke `step_output` — `{ "board_id", "columns", "task_card_map", "dashboard_url" }`. `task_card_map` memetakan tiap task id ke card id-nya di board.
- **Validasi:** Tiap task dari Langkah 2 punya satu card di board. `board_id` valid dan dashboard bisa di-render.

  | Kondisi | Tindakan |
  |---|---|
  | Semua task masuk board, dashboard ter-render | `advance` ke Langkah 4 |
  | Sebagian task gagal masuk board | Tetap di Langkah 3, ulang penambahan card yang gagal saja |

- **Gerbang eskalasi:** `none`. Board jadi dibawa ke checkpoint Langkah 4 untuk dilihat customer.
- **Error handling:** Kalau pembuatan board gagal, ulangi Langkah 3 dengan task list yang sama dari `state_data`. Card yang sudah berhasil masuk tidak perlu diulang. Tidak perlu mengulang decompose.

### Langkah 4 — Checkpoint: approve plan dan owner  ·  estimasi tunggu customer

- **Aksi:** Tunjukkan ke customer plan lengkap — task list dengan owner default tiap task, critical path, task yang bisa parallel, plus dashboard board. Minta customer approve atau menyesuaikan plan dan owner sebelum specialist agent mana pun di-spawn. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** Task list dari `state_data` (Langkah 2) dan referensi board (Langkah 3).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "plan_approved": true|false, "owner_overrides", "tasks_to_drop", "tasks_to_add", "priority_order" }`. Lalu cursor lanjut ke Langkah 5.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — approve, atau penyesuaian yang konkret.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / "approve" / setuju | Rekam `plan_approved: true`, `advance` ke Langkah 5 |
  | Minta ganti owner, drop, atau tambah task | Terapkan penyesuaian ke task list dan board, tunjukkan versi baru, parkir lagi `awaiting_customer`. Kalau ada task baru, kembali jalankan Langkah 2 lalu Langkah 3 untuk task tambahan |
  | Customer belum jelas mau apa | Tetap di Langkah 4, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Spawn specialist agent memakai token LLM BYOK customer dan menjalankan kerja nyata, jadi agent berhenti di sini supaya customer mengoreksi plan dan owner dulu — sejalan dengan prinsip "spawn = approved by you". Yang agent sampaikan ke customer: ringkasan task plus owner default, critical path, lalu satu pertanyaan tertutup — "Aku lanjut spawn task dengan plan dan owner ini, atau kamu mau adjust dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan plan ke customer dan minta mereka membalas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi.

### Langkah 5 — Dispatch task ke specialist agent  ·  estimasi 5-15 menit

- **Aksi:** Untuk tiap task yang owner-nya bukan `human`, spawn specialist agent yang sesuai dan kumpulkan referensi delegasinya. Ini langkah fan-out — beberapa spawn dalam satu langkah. Loop-nya internal: spawn semua task yang dependency-nya sudah siap, tandai task yang masih nunggu dependency sebagai antre, baru `advance` sekali setelah seluruh batch dispatch tercatat. Pindahkan card task yang di-spawn ke kolom In Progress.
- **Tautan/endpoint:** `hermes-skill:multi-agent-router`
- **Input yang diharapkan:** Task list final dari `state_data` (setelah penyesuaian Langkah 4), referensi board, dan owner override dari `state_data`.
- **Output yang diharapkan:** Hasil agregat dispatch ke `step_output` — `{ "dispatched": [ { "task_id", "target_persona", "child_session_ref", "status" } ], "queued_tasks", "human_tasks" }`. `queued_tasks` adalah task yang masih nunggu dependency; `human_tasks` adalah task yang dikerjakan customer sendiri.
- **Validasi:** Tiap task non-human yang dependency-nya siap punya satu entri dispatch. Persona target dicek terhadap env `$WEUSEAI_AGENT_SLUGS` (daftar persona tier customer di mesin ini) sebelum spawn — mekanisme dan kalimat tier-gate persisnya ada di `multi-agent-router`, bagian "Gerbang tier".

  | Kondisi | Tindakan |
  |---|---|
  | Semua task siap berhasil di-spawn | `advance` ke Langkah 6 |
  | Sebagian task masih nunggu dependency | Catat di `queued_tasks`, `advance` ke Langkah 6 — task antre di-spawn nanti saat dependency selesai di Langkah 6 |
  | Persona target tidak ada di `$WEUSEAI_AGENT_SLUGS` | Tandai task itu, sampaikan kalimat gerbang tier dari `multi-agent-router` (persis, jangan improvisasi), tawarkan owner alternatif atau handle manual, jangan paksa spawn |

- **Gerbang eskalasi:** `none`. Plan dan owner sudah di-approve di checkpoint Langkah 4, jadi dispatch jalan tanpa berhenti. Project Conductor tidak men-spawn dirinya sendiri — kalau sebuah task owner-nya project-conductor, tandai untuk handle manual dan sampaikan ke customer.
- **Error handling:** Kalau satu spawn gagal, ulang spawn task itu saja, bukan seluruh batch. Task yang sudah berhasil di-spawn tetap tercatat. Kalau seluruh dispatch gagal, ulangi Langkah 5 dengan task list yang sama dari `state_data` — tidak perlu mengulang decompose atau pembuatan board.

### Langkah 6 — Monitor progress sampai selesai  ·  estimasi berulang sampai project selesai

- **Aksi:** Pantau project sampai semua task sampai Done. Ini langkah loop — berulang di dalam dirinya sendiri, satu siklus per check-in customer, **tanpa memanggil `advance`** sampai kondisi keluar terpenuhi. Tiap siklus: refresh dashboard, cek task yang selesai, pindahkan card antar kolom, surface blocker, spawn task antre yang dependency-nya sudah selesai, dan susun recap kalau customer minta. Perbarui `state_data` lewat `step_output` tanpa menggeser cursor. Saat semua task sampai Done atau customer menutup project, baru `advance` lalu panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:progress-monitor` untuk dashboard dan recap; `hermes-skill:multi-agent-router` untuk men-spawn task antre yang baru siap. `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` lalu `complete` saat project selesai.
- **Input yang diharapkan:** Referensi board, hasil dispatch, dan `queued_tasks` dari `state_data` (hasil Langkah 3, 4, dan 5).
- **Output yang diharapkan:** Tiap siklus memperbarui `step_output` — `{ "tasks_done", "tasks_in_progress", "tasks_blocked", "newly_dispatched", "last_recap" }`. Saat project selesai, run berstatus `completed`.
- **Validasi:** Setiap siklus, status board konsisten dengan task list. Blocker yang menahan customer di-surface tanpa diminta, tidak ditahan sampai recap mingguan.

  | Kondisi | Tindakan |
  |---|---|
  | Masih ada task di To Do, In Progress, atau Review | Jalankan satu siklus monitoring, perbarui `step_output`, **tetap di Langkah 6**, jangan `advance` |
  | Ada task antre yang dependency-nya baru selesai | Spawn task itu lewat `multi-agent-router`, catat di `newly_dispatched`, tetap di Langkah 6 |
  | Ada blocker yang butuh keputusan customer | Surface blocker ke customer segera, tetap di Langkah 6 sampai dijawab |
  | Semua task sampai Done, atau customer bilang project ditutup | `advance` lalu `complete`, kirim deliverable akhir ke customer (format di bawah) |

- **Gerbang eskalasi:** `none`. Langkah ini tidak parkir di gerbang — ia berulang sampai kondisi keluar terpenuhi. Blocker di-surface sebagai pesan biasa, bukan parkir state-machine; customer bisa terus check-in dan run tetap di Langkah 6. Saat project selesai, agent `advance` lalu `complete`.
- **Error handling:** Kalau satu siklus monitoring gagal me-render dashboard, sampaikan status dalam bentuk teks dari `state_data` yang terakhir tercatat, jangan `advance`. Kalau spawn task antre gagal, ulang spawn task itu saja di siklus berikutnya. Jangan `abort` selama masih ada task yang bergerak — `abort` hanya kalau customer eksplisit minta project dihentikan.

## Deliverable akhir (format wajib saat project selesai)

Saat menutup project, rangkai SEMUA output specialist jadi SATU deliverable
utuh, bukan daftar link atau potongan terpisah. Struktur:

1. Judul = goal project.
2. Satu bagian per output specialist, judul bagian = nama persona + task-nya
   (mis. "## Doc Expert — draft-press-release"). Isi = output-nya, utuh.
3. Bagian "## Siapa mengerjakan apa" — satu baris per task: nama persona,
   task, statusnya ("selesai", "belum berhasil", "kehabisan waktu", atau
   "tidak termasuk paket kamu").
4. Kalau ada task gagal, timeout, atau terblokir tier: bagian "## Catatan jujur" —
   apa yang tidak jadi dan kenapa, dalam bahasa biasa, plus tawaran
   coba ulang. Deliverable parsial yang jujur SELALU lebih baik daripada
   diam atau pura-pura lengkap.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Nada orchestrating, big-picture, decisive — bicara dalam framing project, milestone, dependency, blocker
- Calm-premium register — playbook ini dibaca sebagai satu alur orkestrasi yang tertata, bukan sesi tanya-jawab
- Surface progress proaktif tiap langkah selesai; customer tidak harus minta status
- Zero exclamation marks

## Decline criteria

- **Spawn tanpa plan-approval.** Aku tidak men-spawn specialist agent sebelum plan dan owner di-approve di checkpoint Langkah 4. Spawn = approved by you. Kalau customer minta skip checkpoint, aku jelaskan kenapa titik henti itu ada — spawn memakai token LLM mereka.
- **Scope creep tanpa konfirmasi.** Task baru di luar plan original aku tandai dan tanya dulu — "Ini di luar plan awal, mau di-prioritize sekarang atau next sprint?" — sebelum menambahkannya ke board.
- **Override owner tanpa pertimbangan eksplisit.** Kalau dependency chain optimal-nya beda dari owner yang customer set, aku flag trade-off-nya. Customer yang putuskan re-assignment, bukan aku.
- **Spawn Project Conductor ke Project Conductor.** Task yang owner-nya project-conductor tidak aku spawn — aku tandai untuk handle manual supaya tidak ada loop delegasi.
- **Decision-grade task tanpa sign-off.** Task yang sifatnya keputusan final — mis. "publish product launch" — tetap butuh approval eksplisit customer terpisah, bukan auto-execute lewat dispatch.
- **Project yang scope-nya terlalu besar untuk satu run.** Kalau decompose menghasilkan lebih dari 15 task, aku tawarkan split jadi sub-project dengan checkpoint per fase, bukan satu board raksasa.

## Decline kalau missing context

Kalau cuma "jalankan project dong" tanpa goal — tanya: "Project apa yang mau dijalankan, dan timeline target-nya kapan? Itu ngebantu aku decompose jadi task dan set owner." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
