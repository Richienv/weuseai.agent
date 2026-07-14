---
skill_kind: playbook
name: weekly-recap-cycle
bundle: project-conductor
flow_state_playbook_id: weekly-recap-cycle
total_steps: 7
use_cases:
  - "Recap mingguan project yang sedang berjalan — highlight, blocker, prioritas minggu depan"
  - "Jumat sore otomatis menyusun recap dari aktivitas kanban tujuh hari terakhir"
  - "Recap siap kirim ke stakeholder atau bahan diskusi 1-on-1 dengan manager"
  - "Recap pribadi untuk refleksi sendiri yang langsung sampai tanpa lewat persetujuan"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Sudah ada satu kanban board aktif yang dipantau project-conductor"
  - "Customer bisa menyebut audience recap kalau bukan untuk dirinya sendiri"
escalation_to: customer
---

# weekly-recap-cycle — project-conductor playbook

Playbook ini menjalankan satu siklus recap mingguan dari project yang sedang berjalan — dari agregasi aktivitas tujuh hari, surface blocker, deteksi scope creep, sampai recap final sampai ke audience yang tepat. Mode `weekly-recap` yang sebelumnya berdiri sendiri di `progress-monitor` dirangkai jadi alur berurutan dengan satu titik henti yang **hanya aktif kalau audience-nya bukan diri sendiri**.

Bedanya dengan memanggil `progress-monitor` mode `weekly-recap` langsung: di sini alurnya utuh dengan satu titik henti kondisional. Untuk audience `self`, recap auto-deliver. Untuk `stakeholder` atau `1on1-manager`, aku berhenti minta kamu review dulu sebelum recap diteruskan — supaya recap yang dilihat orang lain selalu lewat sentuhan kamu.

## Kapan dipakai

Customer minta recap mingguan, atau cron Jumat sore otomatis fires kalau weekly auto-recap diaktifkan. Trigger phrases:

- "kasih weekly recap"
- "rangkuman minggu ini"
- "recap project [nama]"
- "susun recap buat stakeholder"
- "bahan 1-on-1 manager minggu ini"
- "recap minggu ini, kirim langsung aja"

Kalau customer cuma minta satu surface — "kasih dashboard sekarang", "list blocker aktif" — pakai `progress-monitor` mode `dashboard-url` atau `blocker-list` langsung, bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda antara aktivitas kanban, panggilan cron, dan balasan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "weekly-recap-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 7`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer), `escalated` (parkir di gerbang keras — menunggu approval eksplisit customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama atau cron fire → panggil `start` dengan `total_steps: 7`. Tiap siklus mingguan adalah run baru — jangan re-use run minggu lalu. Run minggu lalu yang belum `completed` ditandai stale di Langkah 1.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (checkpoint lunak), sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 7 selesai → panggil `complete`.

### Trigger dari cron, bukan parkir multi-minggu

Run weekly-recap-cycle berumur satu minggu. Cron Jumat 16:00 WIB memanggil `start` baru tiap minggu — tidak `get` + `advance` ke run minggu lalu. Kalau run minggu lalu masih `in_progress` atau `awaiting_customer` saat cron fire, run itu tetap di-`abort` dulu (atau ditandai stale dan dibiarkan, sesuai pilihan customer), lalu run baru di-`start`. Begini supaya recap minggu ini tidak terkontaminasi state minggu lalu yang ditinggalkan.

### Gerbang kondisional di Langkah 6

Langkah 6 adalah gerbang kondisional — tipe gerbangnya ditentukan oleh `state_data.audience` yang tercatat di Langkah 1. Konvensi ini baru di Phase 3 dan ditulis eksplisit di sini supaya pembaca SKILL.md di masa depan tidak salah baca.

- Kalau `state_data.audience == "self"` → tipe gerbang efektif `none`. Agent `advance` langsung ke Langkah 7 tanpa parkir. Recap pribadi tidak butuh approval orang lain — refleksi sendiri yang ditahan-tahan kehilangan momentum.
- Kalau `state_data.audience == "stakeholder"` atau `"1on1-manager"` → tipe gerbang efektif `checkpoint`. Agent `advance` dengan `set_status: "awaiting_customer"`, tampilkan draft recap ke customer, lalu berhenti dan tunggu customer meneruskan atau merevisi.

Engine tidak punya cabang khusus untuk ini — agent yang membaca `state_data.audience` dan memilih jalur. Yang penting: keputusan ini ditulis ke `step_output` sebagai `gate_taken: "checkpoint"` atau `gate_taken: "none"` supaya audit trail menunjukkan alasan agent mem-parkir atau tidak.

## Langkah-langkah

### Langkah 1 — Intake siklus dan tentukan audience  ·  estimasi 1-2 menit

- **Aksi:** Identifikasi trigger — cron Jumat 16:00 WIB, atau pesan customer. Tarik konteks recap: `board_id` (default board aktif), `audience` (`self` / `stakeholder` / `1on1-manager`), `date_range` (default tujuh hari terakhir sampai sekarang). Kalau audience tidak disebut dan trigger-nya pesan customer, tanya satu pertanyaan tertutup — "Recap ini buat kamu sendiri, buat stakeholder, atau bahan 1-on-1 manager?". Kalau trigger-nya cron, default `audience: "self"`. Lalu panggil `start` flow-state dengan `total_steps: 7`. Kalau run minggu sebelumnya belum `completed`, tandai stale dan tetap mulai run baru.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer atau payload cron berisi `board_id` opsional dan `audience` opsional.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "board_id", "audience", "date_range_start", "date_range_end", "trigger": "cron"|"customer" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `board_id` menunjuk board yang nyata dan masih dipantau. `audience` salah satu dari tiga nilai enum.

  | Kondisi | Tindakan |
  |---|---|
  | `board_id` valid dan `audience` jelas | Lanjut, `advance` ke Langkah 2 |
  | `audience` belum disebut dan trigger pesan customer | Tetap di Langkah 1, tanya satu pertanyaan tertutup |
  | Tidak ada board aktif | Tetap di Langkah 1, sampaikan ke customer "Belum ada project yang dipantau — mau aku set up board dulu?" |

- **Gerbang eskalasi:** `none`. Klarifikasi `audience` di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah `audience` terisi.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai recap-nya, coba lagi sebentar" dan jangan lanjut. Untuk trigger cron, log percobaan dan tunggu siklus minggu depan, jangan retry agresif.

### Langkah 2 — Agregasi aktivitas tujuh hari  ·  estimasi 2-4 menit

- **Aksi:** Tarik aktivitas kanban dalam `date_range` — task yang pindah ke Done, task yang pindah ke Blocked, task baru yang masuk, milestone yang tercapai, dan output specialist agent yang relevan. Susun ringkasan terstruktur.
- **Tautan/endpoint:** `hermes-skill:progress-monitor` mode `weekly-recap`
- **Input yang diharapkan:** Objek intake dari `state_data` — `board_id`, `date_range_start`, `date_range_end`, `audience`.
- **Output yang diharapkan:** Ringkasan terstruktur ke `step_output` — `{ "highlights", "in_progress", "milestones_reached", "tasks_added", "specialist_outputs" }`. `highlights` daftar task selesai dengan judul plus owner persona. `in_progress` task yang masih bergerak dengan persen perkiraan. `milestones_reached` milestone yang tercentang minggu ini, kalau ada.
- **Validasi:** Jumlah entri konsisten dengan aktivitas kanban yang tercatat. Task tanpa pergerakan minggu ini tidak masuk recap.

  | Kondisi | Tindakan |
  |---|---|
  | Ada aktivitas yang bisa di-recap | `advance` ke Langkah 3 |
  | Tidak ada aktivitas sama sekali minggu ini | `advance` ke Langkah 3 dengan `highlights: []`, biar Langkah 5 yang memutuskan apakah recap tetap dikirim atau diganti pesan "minggu sepi" singkat |

- **Gerbang eskalasi:** `none`. Hasil agregasi belum ditunjukkan ke customer di langkah ini — dibawa ke Langkah 5 untuk komposisi, lalu Langkah 6 untuk gerbang kondisional.
- **Error handling:** Kalau agregasi gagal di tengah, ulangi Langkah 2 dengan `date_range` yang sama dari `state_data`. Tidak perlu mengulang Langkah 1. Kalau data board tidak bisa diakses, sampaikan ke customer dan tetap di Langkah 2.

### Langkah 3 — Surface blocker aktif  ·  estimasi 1-3 menit

- **Aksi:** Tarik daftar blocker — task berstatus Blocked atau dependency yang macet lebih dari tiga hari. Per blocker, catat deskripsi, owner, dependency, dan suggested resolution kalau ada.
- **Tautan/endpoint:** `hermes-skill:progress-monitor` mode `blocker-list`
- **Input yang diharapkan:** `board_id` dari `state_data` dan `date_range` dari `state_data` (Langkah 1).
- **Output yang diharapkan:** Daftar blocker ke `step_output` — `{ "blockers": [ { "task_id", "title", "owner", "dependency", "stuck_since", "suggested_resolution", "needs_customer_decision" } ] }`. Field `needs_customer_decision` true kalau blocker hanya bisa diatasi oleh keputusan customer.
- **Validasi:** Tiap blocker punya `task_id` valid dan `stuck_since` tercatat. Blocker yang sudah resolved tapi belum di-update card-nya tidak masuk daftar.

  | Kondisi | Tindakan |
  |---|---|
  | Ada blocker yang butuh perhatian | `advance` ke Langkah 4 |
  | Tidak ada blocker minggu ini | `advance` ke Langkah 4 dengan `blockers: []` |

- **Gerbang eskalasi:** `none`. Blocker yang butuh keputusan customer tetap di-surface di Langkah 5 sebagai bagian recap, tidak di-parkir di sini.
- **Error handling:** Kalau pengambilan blocker gagal, ulangi Langkah 3. Kalau tetap gagal, lanjut ke Langkah 4 dengan `blockers: []` dan catatan "blocker list tidak tersedia minggu ini" supaya recap tetap bisa jadi.

### Langkah 4 — Deteksi scope creep dalam tujuh hari  ·  estimasi 1-2 menit

- **Aksi:** Bandingkan task list minggu ini dengan plan original dari run `project-orchestration` yang sama (kalau ada). Tandai task yang ditambahkan minggu ini tanpa lewat checkpoint plan-approval sebagai indikasi scope creep. Tarik juga task hasil rerun `task-decomposer` yang muncul di luar siklus plan-approval.
- **Tautan/endpoint:** `hermes-skill:task-decomposer` mode `diff-vs-plan` untuk membandingkan task list aktual dengan plan original
- **Input yang diharapkan:** `board_id` dari `state_data`, daftar task minggu ini dari `state_data` (hasil Langkah 2).
- **Output yang diharapkan:** Hasil deteksi ke `step_output` — `{ "scope_creep_detected": true|false, "new_tasks_outside_plan": [...], "estimated_extra_hours" }`. Kalau tidak ada plan original yang bisa dibandingkan, isi `scope_creep_detected: false` dengan catatan `comparison_unavailable: true`.
- **Validasi:** Daftar `new_tasks_outside_plan` hanya berisi task yang benar-benar baru minggu ini — task lama yang baru pindah kolom tidak masuk.

  | Kondisi | Tindakan |
  |---|---|
  | Tidak ada scope creep terdeteksi | `advance` ke Langkah 5 |
  | Ada scope creep | `advance` ke Langkah 5, tandai supaya Langkah 5 memasukkan ke recap |
  | Plan original tidak tersedia | `advance` ke Langkah 5 dengan `comparison_unavailable: true` |

- **Gerbang eskalasi:** `none`. Scope creep ditampilkan di recap final, bukan dijadikan gerbang sendiri — keputusan apa yang dilakukan ada di customer.
- **Error handling:** Kalau perbandingan gagal, ulangi Langkah 4 sekali. Kalau tetap gagal, lanjut dengan `scope_creep_detected: false` dan catatan teknis di `step_output`.

### Langkah 5 — Susun recap sesuai audience  ·  estimasi 2-4 menit

- **Aksi:** Susun recap final dari `state_data` dengan tone yang sesuai `audience`. Struktur tetap — Highlights / In-Progress / Blockers / Scope changes / Next week priorities — tapi nada menyesuaikan. `self`: jujur, sertakan keraguan dan ketidakpastian. `stakeholder`: profesional dan outcome-focused, taruh decisions-needed di depan. `1on1-manager`: seimbang, mulai dari progress lalu concrete asks.
- **Tautan/endpoint:** `hermes-skill:progress-monitor` mode `weekly-recap` (komposisi final dengan tone wrapper sesuai `audience`)
- **Input yang diharapkan:** Seluruh `state_data` — `audience`, agregasi Langkah 2, blocker list Langkah 3, scope creep Langkah 4.
- **Output yang diharapkan:** Draft recap final ke `step_output` — `{ "recap_markdown", "audience", "delivery_channel", "decisions_needed_count" }`. `recap_markdown` adalah teks final siap kirim. `decisions_needed_count` jumlah blocker yang `needs_customer_decision: true` plus jumlah scope creep yang butuh keputusan.
- **Validasi:** Recap mencakup semua section yang ada datanya. Section yang kosong (mis. tidak ada blocker minggu ini) ditandai eksplisit "Tidak ada blocker minggu ini" daripada dilewati diam-diam.

  | Kondisi | Tindakan |
  |---|---|
  | Recap lengkap, semua section terisi atau ditandai kosong | `advance` ke Langkah 6 |
  | Data minggu ini kosong total | `advance` ke Langkah 6 dengan recap singkat "Minggu sepi — tidak ada pergerakan di board" |

- **Gerbang eskalasi:** `none`. Recap dibawa ke Langkah 6 untuk gerbang kondisional, bukan langsung dikirim.
- **Error handling:** Kalau komposisi gagal, ulangi Langkah 5 dengan data yang sama dari `state_data`. Tidak perlu mengulang agregasi.

### Langkah 6 — Gerbang kondisional: review sebelum kirim ke audience  ·  estimasi tunggu customer atau langsung lanjut

- **Aksi:** Baca `state_data.audience`. Kalau `audience == "self"`, langsung `advance` ke Langkah 7 tanpa parkir — recap pribadi sampai tanpa lewat persetujuan. Kalau `audience == "stakeholder"` atau `"1on1-manager"`, `advance` dengan `set_status: "awaiting_customer"`, tampilkan `recap_markdown` ke customer, sebut audience target dan `delivery_channel` yang dimaksud, lalu berhenti. Tulis keputusan jalur ke `step_output` sebagai `gate_taken: "checkpoint"` atau `gate_taken: "none"` supaya audit trail jelas.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"` (hanya kalau gerbang aktif)
- **Input yang diharapkan:** `recap_markdown` dan `audience` dari `state_data` (hasil Langkah 5).
- **Output yang diharapkan:** Saat audience `self`, `step_output` langsung berisi `{ "gate_taken": "none", "recap_approved": true }` dan cursor lanjut ke Langkah 7. Saat audience non-self, `step_output` awal berisi `{ "gate_taken": "checkpoint" }` lalu run parkir; saat customer membalas, rekam keputusan ke `step_output` — `{ "recap_approved": true|false, "edits": "<teks revisi kalau ada>", "delivery_channel_confirmed" }`. Lalu cursor lanjut ke Langkah 7.
- **Validasi:** Balasan customer (kalau gerbang aktif) harus berupa keputusan yang bisa ditindaklanjuti — approve, edit konkret, atau batal.

  | Balasan customer (gerbang aktif) | Tindakan |
  |---|---|
  | "lanjut" / "approve" / "kirim" | Rekam `recap_approved: true`, `advance` ke Langkah 7 |
  | Minta revisi nada, isi, atau hapus section | Terapkan revisi ke `recap_markdown`, tampilkan versi baru, parkir lagi `awaiting_customer`. Kalau revisi besar butuh data baru, kembali jalankan Langkah 2-5 untuk bagian yang perlu di-refresh |
  | "batal" / "ngga jadi kirim" | Panggil `abort`, sampaikan ke customer recap-nya tetap aku simpan kalau berubah pikiran |
  | Customer belum jelas mau apa | Tetap di Langkah 6, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint kalau state_data.audience != "self" · none kalau state_data.audience == "self"`. Gerbang ini kondisional terhadap `state_data.audience` yang tercatat di Langkah 1. Untuk audience `self`, recap pribadi auto-deliver karena refleksi sendiri tidak butuh approval orang lain. Untuk audience `stakeholder` atau `1on1-manager`, gerbang aktif sebagai checkpoint lunak — recap yang dilihat orang lain selalu lewat sentuhan customer dulu. Yang agent sampaikan saat memarkir: draft recap penuh plus audience target plus delivery channel, lalu satu pertanyaan tertutup — "Aku kirim recap ini ke [audience], atau kamu mau adjust dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal saat gerbang aktif, ulangi sekali. Kalau tetap gagal, tetap tampilkan recap ke customer dan minta mereka membalas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi. Untuk jalur `none`, kalau `advance` gagal, ulangi sekali sebelum lanjut ke Langkah 7.

### Langkah 7 — Kirim recap dan tutup siklus  ·  estimasi 1-2 menit

- **Aksi:** Kirim `recap_markdown` versi final ke `delivery_channel` — Telegram untuk audience `self`, channel yang customer sebut untuk audience non-self (default Telegram juga kalau tidak disebut). Setelah terkirim, panggil `complete`.
- **Tautan/endpoint:** Channel terhubung customer (Telegram default) lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** `recap_markdown` final dan `delivery_channel` dari `state_data` (hasil Langkah 5 dan 6, plus edit dari Langkah 6 kalau ada).
- **Output yang diharapkan:** Konfirmasi pengiriman ke `step_output` — `{ "sent_at", "channel", "audience" }`. Run berstatus `completed`.
- **Validasi:** Channel pengiriman terhubung dan recap final ada isinya.

  | Kondisi | Tindakan |
  |---|---|
  | Pengiriman sukses | `complete`, konfirmasi singkat ke customer kalau audience non-self ("Recap sudah aku kirim ke [audience]") |
  | Pengiriman gagal | Jangan `complete`. Sampaikan "Recap-nya belum berhasil terkirim, mau aku coba lagi?" dan tahan recap di `state_data` |
  | Channel tujuan tidak terhubung | Jangan kirim ke channel lain — sebut ke customer channel mana yang perlu disiapkan, tahan recap, jangan `complete` |

- **Gerbang eskalasi:** `none`. Langkah penutup — recap sudah disetujui di Langkah 6 (atau auto-approved untuk audience `self`), jadi pengiriman tidak butuh gerbang lagi.
- **Error handling:** Kalau pengiriman gagal, jangan `abort` — tahan recap di `state_data` dan tawarkan retry. Recap yang sudah disusun tidak hilang. Kalau retry tetap gagal setelah beberapa kali, sampaikan ke customer recap-nya tersedia untuk disalin manual dari pesan ini.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Nada orchestrating, big-picture, decisive — bicara dalam framing project, milestone, blocker, prioritas minggu depan
- Calm-premium register — recap dibaca sebagai dokumen status yang tertata, bukan stream of consciousness
- Surface decisions-needed di depan untuk audience `stakeholder` dan `1on1-manager`; sertakan keraguan dan ketidakpastian untuk audience `self`
- Zero exclamation marks

## Decline criteria

- **Recap untuk project yang tidak dipantau.** Aku tidak menyusun recap dari board yang tidak ada atau yang `project-conductor` belum pernah orkestrasi. Kalau customer minta, aku tawarkan set up board dulu.
- **Kirim ke stakeholder tanpa review customer.** Untuk audience `stakeholder` dan `1on1-manager`, aku selalu berhenti di Langkah 6 untuk review. Kalau customer minta skip checkpoint, aku jelaskan kenapa titik henti itu ada — recap yang dilihat orang lain selalu lewat sentuhan kamu.
- **Recap yang menyimpulkan lebih dari yang data dukung.** Kalau minggu ini sepi, recap-nya bilang minggu ini sepi. Aku tidak menambal dengan generalisasi atau klaim progress yang tidak tercatat di board.
- **Edit recap untuk menghilangkan blocker yang harus di-surface.** Kalau customer minta blocker yang butuh decision dihilangkan dari recap stakeholder, aku tanya dulu — menyembunyikan blocker dari stakeholder yang punya wewenang biasanya memperpanjang siklus, bukan memperpendek.
- **Auto-recap untuk audience non-self lewat cron.** Cron default fires dengan audience `self`. Recap untuk `stakeholder` atau `1on1-manager` butuh trigger eksplisit dari customer — supaya gerbang Langkah 6 selalu lewat keputusan sadar, bukan tergeser cron.
- **Run recap minggu lalu yang ditinggalkan.** Tiap siklus mingguan adalah run baru. Run minggu lalu yang belum `completed` ditandai stale di Langkah 1 dan tidak dilanjutkan — supaya recap minggu ini tidak terkontaminasi state lama.

## Decline kalau missing context

Kalau cuma "kasih recap" tanpa context — tanya: "Recap ini buat kamu sendiri, buat stakeholder, atau bahan 1-on-1 manager? Itu menentukan nada dan apakah aku berhenti minta review dulu sebelum kirim." Klarifikasi ini terjadi di Langkah 1 sebelum run dilanjutkan.
