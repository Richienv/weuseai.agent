---
skill_kind: playbook
name: campaign-execution
bundle: social-conductor
flow_state_playbook_id: campaign-execution
total_steps: 8
use_cases:
  - "Jalankan satu campaign multi-minggu dari plan sampai semua slot terposting dan engagement tertangani"
  - "Product launch dengan fase Tease, Reveal, Reinforce, Close yang diantar slot per slot — bukan diserahkan jadi sekaligus"
  - "Content series berjalan yang butuh reminder H-2 per slot dan draft siap copy-paste tiap kali"
  - "Seasonal push (Lebaran, Harbolnas) yang dipantau dari plan sampai recap engagement harian"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Voice profile sudah locked lewat skill voice-locker — draft per slot menyandar ke profil ini untuk fit-score"
  - "Customer bisa cerita tipe campaign, durasi, objective, dan platform target — atau bisa diklarifikasi di Langkah 1"
  - "Customer tahu posting tetap kamu yang submit ke platform — playbook ini draft, kamu copy-paste"
escalation_to: customer
---

# campaign-execution — social-conductor playbook

Playbook ini menjalankan satu campaign sosial media dari plan sampai semua slot terposting dan engagement tertangani. Empat skill Social Conductor yang sebelumnya berjalan terpisah — campaign-planner, content-calendar-builder, post-drafter, voice-consistency-checker — ditambah engagement-log-tracker untuk fase pasca-posting, dirangkai jadi satu alur berurutan dengan dua titik henti yang terkonvensi.

Bedanya dengan memakai kelima skill itu satu per satu: di sini state-machine menjaga posisi langkah, jadi alur tetap utuh walau campaign berlangsung berminggu-minggu. Reminder H-2 sebelum tiap slot adalah titik henti formal, bukan janji yang gampang lewat. Posting tetap kamu yang submit ke platform — aku draft, kamu copy-paste.

## Kapan dipakai

Customer minta dijalankan satu campaign utuh, bukan sekadar plan-nya saja atau satu draft saja. Trigger phrases:

- "jalankan campaign launch sampai selesai"
- "ambil alih content series ini, urus dari plan sampai posting"
- "campaign 4 minggu, urus dari awal sampai engagement-nya"
- "plan plus draft plus reminder per slot — semua dalam satu alur"
- "seasonal push Lebaran, urus dari plan sampai recap engagement"
- "launch produk, aku mau diingatkan H-2 tiap slot"

Kalau customer cuma minta satu langkah — "bikin plan saja", "draft satu post saja", "log engagement hari ini saja" — pakai skill tunggal yang sesuai (`campaign-planner`, `post-drafter`, `engagement-log-tracker`), bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau campaign berjalan berminggu-minggu dengan jeda berhari-hari antar pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "campaign-execution", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 8`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer di checkpoint), `escalated` (parkir di gerbang keras — menunggu approval eksplisit customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 8`. Kalau sudah ada run berjalan, lanjut dari cursor-nya — jangan `start` ulang, karena `start` mereset run ke Langkah 1 dan menghapus `state_data` yang sudah terkumpul. Campaign yang sedang berjalan punya plan, slot, dan draft yang tersimpan di `state_data`; reset akan menghilangkan semuanya.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (checkpoint lunak), sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 8 selesai → panggil `complete`.

### Langkah reminder H-2 adalah loop di dalam satu langkah, berulang per slot

Langkah keenam (checkpoint reminder H-2 per slot) tidak seperti langkah lain. Engine `advance` menggeser cursor tepat satu kali, jadi langkah ini dimodelkan sebagai satu langkah yang berulang di dalam dirinya sendiri — sekali per slot di kalender campaign.

Selama masih ada slot yang belum melewati H-2 + customer-approve + posted-marked, Langkah 6 **tidak memanggil `advance`**. Tiap pemicu reminder H-2 (dari cron yang membaca `state_data.calendar_slots`), agent `get` run-nya, melihat cursor masih di Langkah 6, ambil slot berikutnya yang due, kirim draft + voice-fit score ke customer, parkir status `awaiting_customer`, lalu berhenti. Saat customer membalas approve untuk slot itu, agent memperbarui `state_data.slots_approved` lewat `step_output` tanpa menggeser cursor, lalu kembali parkir `awaiting_customer` menunggu reminder H-2 slot berikutnya.

Cursor di Langkah 6 jalan satu slot sekaligus, satu approve sekaligus. Engine cursor tetap di Langkah 6 sampai semua slot di `calendar_slots` terapprove dan ditandai posted. Hanya saat semua slot tuntas, baru agent `advance` ke Langkah 7. Jadi satu langkah flow-state menampung berapa pun siklus reminder; iterasi per slot adalah tanggung jawab agent, bukan engine.

Pola yang sama dipakai di Langkah 4 (stage tiap slot kalender) dan Langkah 5 (pre-draft per slot + score) untuk fan-out internal — agent kerjakan seluruh batch, baru `advance` sekali setelah hasil agregat tercatat. Langkah 8 juga berulang internal: digest engagement harian sampai customer menutup campaign.

### Cron memicu langkah reminder dan langkah digest, bukan customer poll

Reminder H-2 per slot dipicu oleh cron yang membaca `state_data.calendar_slots`, bukan oleh customer mengetik. Cron adalah pemanggil `get` biasa yang membandingkan jam sekarang dengan jadwal slot, lalu menjalankan satu siklus Langkah 6 saat ada slot yang masuk jendela H-2.

Hal yang sama untuk digest engagement harian di Langkah 8 — cron memicu satu siklus digest per hari, agent membaca log baru, kirim ringkasan ke customer, perbarui `state_data` tanpa `advance`. Run tetap di Langkah 8 sampai customer eksplisit menutup campaign.

## Langkah-langkah

### Langkah 1 — Intake campaign  ·  estimasi 3-5 menit

- **Aksi:** Baca pesan customer, tarik parameter campaign: `campaign_type` (product-launch, content-series, seasonal-push, brand-build, audience-grow), `duration_weeks`, `objective` (conversion, awareness, engagement, list-build), `platforms`, dan `key_dates` (launch day, sale start, anchor dates). Cek prasyarat — voice profile harus sudah locked, kalau belum, arahkan customer ke skill `voice-locker` dulu sebelum playbook ini bisa lanjut. Kalau ada field penting yang kosong dan customer mau lanjut, tanya dalam satu pesan ringkas, jangan satu pertanyaan per giliran. Lalu `get` flow-state — kalau belum ada run yang bisa dilanjutkan, panggil `start` dengan `total_steps: 8`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer berisi tipe campaign dan, kalau ada, durasi, objective, platform target, dan tanggal anchor.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "campaign_type", "duration_weeks", "objective", "platforms", "key_dates", "voice_profile_ready": true }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `campaign_type`, `duration_weeks`, dan `objective` wajib terisi. `platforms` boleh kosong — default-nya nanti diambil dari preferensi kalender customer di Langkah 4. Voice profile harus ada — kalau belum, tahan playbook.

  | Kondisi | Tindakan |
  |---|---|
  | Tiga field wajib terisi dan voice profile sudah locked | Lanjut, `advance` ke Langkah 2 |
  | Salah satu dari tiga field wajib kosong | Tetap di Langkah 1, tanya field yang kurang dalam satu pesan ringkas |
  | Voice profile belum locked | Tetap di Langkah 1, sampaikan ke customer "Sebelum aku jalankan campaign, voice profile-nya perlu di-lock dulu — kasih aku 20+ sample writing kamu, atau jalankan skill voice-locker dulu. Setelah itu campaign ini bisa kita mulai." Jangan `start` |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah parameter cukup dan voice profile sudah ada.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai run campaign-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Susun plan campaign  ·  estimasi 5-10 menit

- **Aksi:** Resolusi `campaign_type` dan `duration_weeks` jadi empat fase standar — Tease, Reveal, Reinforce, Close — dengan target output per fase, KPI hook, dan engagement trigger. Untuk product-launch 4 minggu, default: Tease minggu 1-2, Reveal minggu 2-3, Reinforce minggu 3-4, Close minggu terakhir. Kalau durasi beda, sesuaikan proporsi fase. Susun ringkasan plan yang bisa dibaca customer di satu pesan.
- **Tautan/endpoint:** `hermes-skill:campaign-planner`
- **Input yang diharapkan:** Objek intake dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** Plan campaign ke `step_output` sebagai `{ "phases": [ { "phase_name", "week_range", "target_output_count", "platform_mix", "kpi_hook", "engagement_trigger" } ], "total_slot_estimate" }`. `total_slot_estimate` adalah perkiraan jumlah slot kalender yang akan distage di Langkah 4.
- **Validasi:** Plan mencakup keempat fase standar, atau gabungan yang masuk akal untuk durasi pendek (mis. campaign 1 minggu boleh skip Reinforce). Tiap fase punya KPI hook konkret yang customer bisa log manual.

  | Kondisi | Tindakan |
  |---|---|
  | Plan empat fase lengkap dengan KPI hook dan engagement trigger | `advance` ke Langkah 3 |
  | Durasi pendek (1-2 minggu), plan jadi 2-3 fase | `advance` ke Langkah 3 dengan catatan fase yang di-skip |
  | Campaign type ambigu (mis. "campaign biasa") | Tetap di Langkah 2, tanya satu pertanyaan klarifikasi, jangan paksa map ke product-launch default |

- **Gerbang eskalasi:** `none`. Plan belum ditunjukkan ke customer di langkah ini — itu tugas checkpoint Langkah 3.
- **Error handling:** Kalau plan gagal disusun karena `state_data` kurang, kembali ke Langkah 1 untuk field yang hilang, bukan abort. Setelah field lengkap, ulang Langkah 2 dengan intake yang sama.

### Langkah 3 — Checkpoint: customer approve plan dan KPI  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer plan lengkap dari Langkah 2 — empat fase dengan week range, target output, platform mix, KPI hook, dan engagement trigger. Minta customer approve atau menyesuaikan plan dan KPI sebelum slot kalender distage dan draft pre-generate. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** Plan campaign dari `state_data` (hasil Langkah 2).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "plan_approved": true|false, "phase_adjustments", "kpi_overrides", "platform_overrides" }`. Lalu cursor lanjut ke Langkah 4.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — approve, atau penyesuaian yang konkret.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / "approve" / setuju | Rekam `plan_approved: true`, `advance` ke Langkah 4 |
  | Minta geser fase, ubah KPI, atau ganti platform | Terapkan penyesuaian ke plan, tunjukkan versi baru, parkir lagi `awaiting_customer` |
  | Customer belum jelas mau apa | Tetap di Langkah 3, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Stage slot kalender dan pre-draft per slot menghabiskan token dan menyiapkan banyak konten yang nanti customer akan baca satu per satu di H-2, jadi agent berhenti di sini supaya customer mengoreksi arah dulu. Yang agent sampaikan ke customer: ringkasan plan per fase, KPI hook yang diusulkan, lalu satu pertanyaan tertutup — "Aku lanjut stage slot dan pre-draft dengan plan ini, atau kamu mau adjust fase atau KPI dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan plan ke customer dan minta mereka membalas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi.

### Langkah 4 — Stage slot kalender per fase  ·  estimasi 3-6 menit

- **Aksi:** Untuk tiap fase di plan yang sudah di-approve, stage slot kalender konkret ke `content-calendar-builder` — tema mingguan, jenis konten, platform, dan due date drafting. Ini langkah fan-out: beberapa slot dalam satu langkah. Loop-nya internal — agent stage seluruh slot yang ditunjuk plan, baru `advance` sekali setelah seluruh batch tercatat. Kalender persisted di local DB, bukan di platform pihak ketiga.
- **Tautan/endpoint:** `hermes-skill:content-calendar-builder` mode `build-new`
- **Input yang diharapkan:** Plan campaign final dari `state_data` (setelah penyesuaian Langkah 3) plus `platforms` dari intake.
- **Output yang diharapkan:** Daftar slot kalender ke `step_output` sebagai `{ "calendar_slots": [ { "slot_id", "scheduled_at", "platform", "phase_name", "tema", "content_type", "status": "staged" } ], "calendar_id" }`. `scheduled_at` adalah waktu posting target, dipakai cron di Langkah 6 untuk menghitung H-2.
- **Validasi:** Jumlah slot terjadwal sesuai `total_slot_estimate` di Langkah 2 plus penyesuaian Langkah 3. Tiap slot punya `scheduled_at` yang berada di dalam `duration_weeks` campaign.

  | Kondisi | Tindakan |
  |---|---|
  | Semua slot ter-stage, jadwal jatuh dalam durasi campaign | `advance` ke Langkah 5 |
  | Sebagian slot bentrok jadwal di kalender existing | Geser slot bentrok ke hari berikut yang tersedia, catat di `step_output`, lanjut `advance` |
  | Stage gagal di tengah | Tetap di Langkah 4, ulang stage slot yang belum berhasil, jangan ulang slot yang sudah berhasil |

- **Gerbang eskalasi:** `none`. Plan sudah di-approve di Langkah 3, jadi stage jalan tanpa berhenti.
- **Error handling:** Kalau stage gagal total karena kalender DB tidak bisa diakses, ulang Langkah 4 dengan plan yang sama dari `state_data`. Slot yang sudah berhasil ter-stage tetap tercatat. Tidak perlu mengulang penyusunan plan.

### Langkah 5 — Pre-draft per slot dan skor voice-fit  ·  estimasi 8-15 menit

- **Aksi:** Untuk tiap slot di `calendar_slots`, generate draft post pakai `post-drafter` dengan voice profile yang sudah locked, lalu skor fit-nya pakai `voice-consistency-checker`. Ini langkah fan-out kedua: satu draft plus satu skor per slot, dalam satu langkah. Loop-nya internal — agent generate seluruh batch, baru `advance` sekali setelah hasil agregat tercatat. Draft di tahap ini adalah pre-draft yang akan customer-review di H-2 per slot — kalau skor low, kasih saran tweak siap dipakai customer atau diregenerate.
- **Tautan/endpoint:** `hermes-skill:post-drafter` per slot, lalu `hermes-skill:voice-consistency-checker` mode `score-draft` per draft
- **Input yang diharapkan:** Daftar `calendar_slots` dari `state_data` (hasil Langkah 4) plus referensi voice profile (locked sejak prasyarat).
- **Output yang diharapkan:** Set draft ke `step_output` — `{ "drafts": [ { "slot_id", "draft_text", "platform", "voice_fit": "high"|"medium"|"low", "tweak_suggestions" } ], "drafts_low_fit_count" }`. `drafts_low_fit_count` dipakai sebagai sinyal awal kalau voice drift terlihat.
- **Validasi:** Tiap slot di `calendar_slots` punya tepat satu draft di `drafts`. Draft yang skor low ditandai dengan `tweak_suggestions` konkret, tidak dikirim ke customer apa adanya.

  | Kondisi | Tindakan |
  |---|---|
  | Semua slot punya draft dan skor | `advance` ke Langkah 6 |
  | Mayoritas draft skor low (≥50%) | `advance` ke Langkah 6 tapi catat di `step_output` "voice drift signal" — saat reminder H-2 pertama di Langkah 6, sampaikan ke customer bahwa voice profile mungkin perlu refresh |
  | Satu atau dua draft gagal generate | Ulang draft slot yang gagal saja, slot yang sudah berhasil tidak diulang |

- **Gerbang eskalasi:** `none`. Pre-draft belum ditampilkan ke customer di langkah ini — itu tugas Langkah 6 saat reminder H-2 per slot tiba.
- **Error handling:** Kalau generasi gagal di tengah, ulang Langkah 5 untuk slot yang belum punya draft. Draft yang sudah berhasil tetap aman di `state_data`, tidak perlu di-regenerate.

### Langkah 6 — Checkpoint berulang per slot di H-2 sebelum posting  ·  estimasi tunggu customer tiap slot

- **Aksi:** Ini langkah loop — berulang di dalam dirinya sendiri, satu siklus per slot, **tanpa memanggil `advance`** sampai semua slot di `calendar_slots` terapprove dan ditandai posted. Tiap siklus dipicu oleh cron yang membaca `state_data.calendar_slots` dan membandingkan jam sekarang dengan `scheduled_at` tiap slot. Saat sebuah slot masuk jendela H-2 (dua jam sebelum jadwal posting), agent `get` run-nya, ambil draft slot itu dari `state_data.drafts`, sampaikan ke customer dengan voice-fit score dan tweak suggestions kalau ada, lalu parkir `awaiting_customer`. Saat customer membalas approve atau revisi, agent memperbarui `state_data.slots_approved` lewat `step_output` tanpa menggeser cursor — slot itu ditandai approved, posted (saat customer bilang "udah aku post"), atau revised. Lalu agent kembali parkir `awaiting_customer` menunggu reminder H-2 slot berikutnya.

  Hanya saat semua slot di `calendar_slots` punya status `posted` di `slots_approved`, baru agent `advance` ke Langkah 7.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"` tiap siklus reminder H-2. `hermes-skill:post-drafter` kalau customer minta revisi draft.
- **Input yang diharapkan:** `calendar_slots` dari `state_data` (Langkah 4) plus `drafts` dari `state_data` (Langkah 5). Cron menyuplai pemicu jam.
- **Output yang diharapkan:** Tiap siklus memperbarui `step_output` — `{ "slots_approved": [ { "slot_id", "decision": "approved"|"revised"|"posted", "approved_at", "revised_draft_text"? } ], "slots_pending_count" }`. Saat semua slot ber-status `posted`, run lanjut ke Langkah 7.
- **Validasi:** Reminder H-2 fire tepat sekali per slot. Satu slot tidak diapprove dua kali. Tiap balasan customer harus berupa keputusan yang bisa ditindaklanjuti.

  | Balasan customer per siklus | Tindakan |
  |---|---|
  | "kirim", "approve", "oke pakai ini" | Tandai slot `approved`, sampaikan "Draft siap kamu copy-paste ke [platform]. Reply 'udah' setelah posted ya." Tetap di Langkah 6 |
  | "udah aku post" / "posted" | Tandai slot `posted`, perbarui `slots_pending_count`. Kalau masih ada slot pending → tetap di Langkah 6, jangan `advance`. Kalau semua slot sudah posted → `advance` ke Langkah 7 |
  | "ganti X" / "ubah nada" / minta revisi | Regenerate draft slot itu lewat `post-drafter`, skor ulang, tampilkan versi baru, tetap parkir `awaiting_customer` untuk slot itu. Slot lain tidak terpengaruh |
  | "skip slot ini" | Tandai slot `skipped`, perbarui `slots_pending_count` tanpa menunggu posted. Lanjut menunggu slot berikutnya |
  | Customer belum balas saat slot terlewat jadwal | Sampaikan saat pemicu berikutnya: "Slot [tema] kemarin jam [waktu] terlewat tanpa kabar. Mau kita ulang, geser, atau skip?" Tetap di Langkah 6 |

- **Gerbang eskalasi:** `checkpoint` — berulang per slot. Gerbang ini fire setiap kali cron mendeteksi slot masuk jendela H-2, satu kali per slot. Customer punya jendela kecil untuk review draft sebelum jam posting target. Yang agent sampaikan tiap kali memarkir: nama tema slot, platform target, jam posting target, draft penuh, voice-fit score, dan kalau perlu tweak suggestions — lalu satu pertanyaan tertutup: "Approve untuk kamu copy-paste, atau ada yang mau diubah?". Setelah itu agent berhenti.
- **Error handling:** Kalau cron pemicu gagal menjangkau run, slot bisa terlewat tanpa reminder. Saat pemicu berikut berhasil, agent surface slot yang terlewat ke customer dengan opsi ulang / geser / skip — jangan diam-diam tandai posted. Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap kirim draft ke customer dan minta mereka balas — `get` berikutnya akan menyinkronkan posisi.

### Langkah 7 — Tandai siklus posting selesai dan transisi ke engagement  ·  estimasi 1-2 menit

- **Aksi:** Setelah semua slot di `calendar_slots` ber-status `posted` atau `skipped` di Langkah 6, susun ringkasan singkat untuk customer — jumlah slot posted, slot skipped, jumlah draft yang sempat revised. Sampaikan ke customer bahwa fase posting selesai dan playbook lanjut ke pemantauan engagement harian sampai customer eksplisit menutup campaign. Lalu `advance` ke Langkah 8.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance`
- **Input yang diharapkan:** `slots_approved` dari `state_data` (hasil Langkah 6).
- **Output yang diharapkan:** Ringkasan transisi ke `step_output` — `{ "posting_phase_summary": { "slots_posted_count", "slots_skipped_count", "slots_revised_count", "posting_completed_at" } }`. Run berstatus `in_progress` di Langkah 8.
- **Validasi:** Semua slot di `calendar_slots` punya status final (`posted`, `skipped`) di `slots_approved`. Tidak boleh ada slot yang masih `approved` tanpa `posted` di sini.

  | Kondisi | Tindakan |
  |---|---|
  | Semua slot final, ringkasan tersusun | `advance` ke Langkah 8 |
  | Ada slot yang masih `approved` tanpa `posted` (bug Langkah 6) | Kembali ke Langkah 6, tanya customer status posting slot itu, jangan paksa `advance` |

- **Gerbang eskalasi:** `none`. Transisi otomatis dari fase posting ke fase pemantauan engagement.
- **Error handling:** Kalau ringkasan gagal disusun, kirim daftar slot apa adanya ke customer dan tetap `advance`. Ringkasan adalah courtesy, bukan blocker.

### Langkah 8 — Digest engagement harian sampai customer tutup campaign  ·  estimasi berulang per hari

- **Aksi:** Ini langkah loop — berulang di dalam dirinya sendiri, satu siklus digest per hari, **tanpa memanggil `advance`** sampai customer eksplisit menutup campaign. Tiap siklus dipicu cron sekali per hari di jam yang customer pilih (default pagi WIB). Agent ambil engagement log baru sejak digest terakhir lewat `engagement-log-tracker` mode `daily-digest`, surface ringkasan ke customer: jumlah comment / DM / mention baru per slot, item prioritas tinggi yang belum kamu balas, KPI count terhadap hook yang customer set di Langkah 2-3. Customer terus drop engagement baru manual; agent draft reply siap kirim manual lewat skill yang sama. Saat customer bilang "tutup campaign" atau sejenisnya, `advance` lalu panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:engagement-log-tracker` mode `daily-digest` per siklus, mode `draft-reply` per item prioritas. `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` lalu `complete` saat customer menutup campaign.
- **Input yang diharapkan:** `calendar_slots` dan `slots_approved` dari `state_data` untuk konteks per-slot; `phases.kpi_hook` dari `state_data.phases` untuk membandingkan engagement vs KPI; engagement log baru yang customer drop manual atau forward.
- **Output yang diharapkan:** Tiap siklus memperbarui `step_output` — `{ "digest_count", "last_digest_at", "high_priority_pending", "kpi_progress": { "metric", "current", "target" } }`. Saat customer menutup campaign, run berstatus `completed`.
- **Validasi:** Satu digest per hari, tidak duplikat. Item prioritas tinggi tidak hilang antar digest sampai customer tandai replied. KPI progress dibandingkan terhadap `kpi_hook` yang customer approve di Langkah 3.

  | Kondisi | Tindakan |
  |---|---|
  | Digest harian siap dikirim | Jalankan siklus, kirim ringkasan ke customer, perbarui `step_output`, **tetap di Langkah 8**, jangan `advance` |
  | Customer drop engagement baru di luar digest | Log lewat `engagement-log-tracker` mode `log-new`, kalau prioritas tinggi draft reply, tetap di Langkah 8 |
  | Customer bilang "tutup campaign" / "udah cukup" / "wrap up" | `advance` lalu `complete`, kirim recap penutup ke customer berisi total engagement, KPI achievement, dan catatan untuk campaign berikutnya |
  | Customer diam berhari-hari tanpa engagement | Tetap kirim digest harian dengan "Belum ada engagement baru hari ini" — jangan auto-tutup, customer yang putuskan kapan campaign ditutup |

- **Gerbang eskalasi:** `none`. Langkah ini tidak parkir di gerbang — ia berulang sampai customer eksplisit menutup. Digest adalah pesan biasa, bukan parkir state-machine; customer bisa terus drop engagement dan reply siap pakai antar siklus.
- **Error handling:** Kalau satu siklus digest gagal mengakses log baru, kirim status terakhir dari `state_data.digest_count` ke customer dan jangan `advance`. Jangan `abort` selama campaign masih dipantau — `abort` hanya kalau customer eksplisit minta campaign dibatalkan, bukan diselesaikan.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan — kalau flow-state atau kalender gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Nada brand-aware, planning-first, voice-locked — playbook ini dibaca sebagai satu alur campaign yang tertata, bukan blast reminder satu per satu
- Reminder H-2 selalu menyertakan voice-fit score apa adanya, tidak disembunyikan
- Calm-premium register — campaign berminggu-minggu, jaga ritme yang tenang dan terus jalan
- Zero exclamation marks

## Decline criteria

- **Posting otomatis ke platform.** Aku tidak post atas nama kamu. Draft siap, kamu yang copy-paste ke platform. Kalau ada Hermes versi mendatang dengan integrasi posting langsung, masih wajib approval per push.
- **Scraping platform untuk engagement.** Engagement log isinya dari kamu — drop manual, forward dari notifikasi, atau paste dari platform. Aku tidak auto-pull dari TikTok, Instagram, X, atau LinkedIn.
- **Skip checkpoint Langkah 3.** Plan approval adalah titik henti yang menjaga supaya stage slot dan pre-draft tidak berjalan ke arah yang salah. Kalau kamu minta skip, aku jelaskan kenapa titik henti itu ada — stage menghabiskan token dan menyiapkan banyak konten yang nanti kamu baca satu per satu.
- **Skip reminder H-2 per slot.** Setiap slot punya satu titik review formal sebelum jam posting target. Kalau kamu minta auto-approve semua draft, aku decline — voice-fit bisa drift antar slot dan kamu tetap perlu satu kali baca tiap draft sebelum keluar ke audience.
- **Draft yang skor voice-fit low dikirim apa adanya.** Aku flag setiap draft skor low dengan tweak suggestions. Kalau mayoritas draft skor low, aku surface "voice drift signal" — voice profile mungkin perlu refresh lewat skill `voice-locker` sebelum campaign berikutnya.
- **Engage dengan trolls atau political content.** Default escalate ke kamu per case, tidak auto-draft reply.
- **Campaign tanpa voice profile locked.** Tidak ada "best guess" voice — voice profile harus sudah ada sejak prasyarat. Kalau belum, playbook tahan di Langkah 1 sampai voice locked dulu.

## Decline kalau missing context

Kalau cuma "jalankan campaign dong" tanpa tipe atau objective — tanya: "Campaign untuk apa, durasi berapa minggu, dan KPI utamanya apa? Itu ngebantu aku susun plan empat fase dan stage slot kalender." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
