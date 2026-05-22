---
skill_kind: playbook
name: finance-cycle
bundle: business-agent
flow_state_playbook_id: finance-cycle
total_steps: 8
use_cases:
  - "Customer minta dijalankan satu siklus filing keuangan periode berjalan — dari enumerasi kewajiban sampai dokumen filing siap submit"
  - "Customer mau lapor PPh 21, PPh 25, PPh Final UMKM, atau PPN bulan ini dan minta dipandu sampai draft filing siap di-review"
  - "Customer mau siapkan SPT Tahunan Badan dengan draft yang lengkap dan satu titik persetujuan eksplisit sebelum apa pun disubmit ke DJP"
  - "Customer minta payroll periode ini diproses jadi setoran PPh 21 plus iuran BPJS, dengan persetujuan customer sebelum dokumen final diserahkan"
prerequisites:
  - "Customer pakai tier Studio dengan phase_5_enabled aktif — playbook ini department-grade, tidak tersedia di tier Pro"
  - "Status badan usaha customer diketahui — PT aktif, CV aktif, atau perorangan PKP — atau bisa diklarifikasi di Langkah 1"
  - "Skill compliance-checker sudah pernah menyusun daftar kewajiban customer di siklus sebelumnya, atau bisa dijalankan ulang di Langkah 2 untuk periode ini"
  - "Customer punya channel Telegram terpasang untuk menerima dan menjawab permintaan persetujuan filing"
escalation_to: customer
---

# finance-cycle — business-agent playbook

Playbook ini menyiapkan satu siklus filing keuangan periode berjalan dari enumerasi kewajiban sampai dokumen filing siap diserahkan ke customer untuk submit. Delapan langkah berurutan: intake periode, enumerasi kewajiban aktif, pemilihan filing dan input, drafting per filing lewat finance-dispatch, ringkasan dengan PII terselubung, gerbang keras persetujuan filing, penyerahan dokumen siap submit, lalu pencatatan siklus.

Playbook ini adalah pasangan produksi dari `compliance-cycle`. `compliance-cycle` posisinya advisory — menyusun daftar kewajiban dan mengingatkan jadwal. `finance-cycle` posisinya produksi — menyusun draft filing yang sesungguhnya, lengkap dengan angka dan dokumen pendukung, dengan satu gerbang keras yang menahan langkah penyerahan sampai customer menyetujui filing itu secara eksplisit. Tidak ada filing yang diserahkan untuk submit tanpa persetujuan yang tercatat dan masih berlaku.

## Kapan dipakai

Customer minta dijalankan satu siklus filing keuangan periode berjalan, bukan sekadar daftar kewajiban atau penjelasan istilah. Trigger phrases:

- "jalankan siklus filing bulan ini"
- "bantu aku siapkan SPT PPN bulan November"
- "siapin SPT Tahunan, nanti aku approve sebelum disubmit"
- "siapkan setoran PPh 21 periode ini sampai draft siap"
- "pandu aku finance cycle dari kewajiban sampai draft siap submit"

Kalau customer cuma minta satu hal — "due date PPN kapan", "PPh Final UMKM itu apa", "estimasi cash runway" — itu pekerjaan skill tunggal lewat `finance-dispatch`, bukan playbook ini. Playbook ini dipakai saat customer mau alur penuh dari pemilihan filing sampai dokumen siap submit, dengan titik persetujuan di tengah.

Item advisory — review pricing, hitung unit economics, estimasi runway, jelaskan threshold UMKM — tidak melewati gerbang keras dan bisa dipanggil langsung lewat `finance-dispatch`. Hanya filing yang nyata (SPT Masa PPh, SPT Masa PPN, SPT Tahunan Badan, setoran PPh Final UMKM) yang membutuhkan persetujuan di Langkah 6.

## Cara kerja

Playbook ini menyusun tiga lapisan state yang berbeda. Ketiganya saling melengkapi, tidak saling menggantikan.

**Lapisan pertama — flow-state, untuk urutan langkah.** Mesin `flow-state` mencatat posisi langkah dan hasil tiap langkah, jadi siklus tetap utuh walau ada jeda antar pesan customer. Lapisan ini menjawab "kita sudah sampai langkah mana".

Kontrak flow-state — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "finance-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi: `start` (mulai atau ulang run — kirim `total_steps: 8`, cursor balik ke Langkah 1, status `in_progress`), `get` (baca run aktif — `current_step`, `status`, `state_data`), `advance` (catat output langkah ini via `step_output` yang di-shallow-merge ke `state_data`, geser cursor +1, opsional `set_status`), `complete`, `abort`.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di checkpoint), `escalated` (parkir keras — menunggu persetujuan filing customer), `completed`, `aborted`.

**Lapisan kedua — approval queue, untuk persetujuan filing yang durabel.** Gerbang keras di Langkah 6 menyiapkan satu filing yang menyentuh uang dan submission ke DJP. Persetujuan untuk filing itu tidak boleh hilang kalau customer butuh waktu memikirkan, dan punya batas waktu sendiri. Untuk itu Langkah 6 membuka satu permintaan persetujuan di approval queue — catatan persetujuan yang durabel, ber-expiry, dan muncul di Telegram customer. Lapisan ini menjawab "apakah filing ini sudah disetujui ya atau tidak".

Kontrak approval queue:

```
POST {WEUSEAI_APPROVAL_QUEUE_URL}
Headers: Content-Type: application/json
Body: { "customer_id", "action_kind": "regulatory_filing", "action_summary", "action_payload", "proposed_by_agent": "business-agent" }
```

Permintaan `regulatory_filing` punya masa berlaku 48 jam terhitung dari saat dibuat. Saat customer membalas approve di Telegram, status permintaan menjadi `approved`. Kalau 48 jam lewat tanpa balasan, permintaan menjadi `expired`.

Pembagian peran kedua lapisan ini sama persis dengan pola di `compliance-cycle`: flow-state adalah "posisi kita di urutan langkah", approval queue adalah "keputusan ya atau tidak yang durabel untuk filing itu". Status `escalated` di flow-state hanya menandai run sedang terparkir — bukan catatan persetujuan. Persetujuan filing yang sebenarnya hidup di approval queue.

**Lapisan ketiga — bd_decisions_log, untuk memori antar siklus.** Setiap filing yang sudah diserahkan di akhir run dicatat sebagai satu event di `bd_decisions_log`. Run berikutnya membaca log itu di Langkah 1 supaya kewajiban yang sudah difilekan periode ini tidak dihitung ulang. `compliance-cycle` menulis event `filed_acknowledged`; `finance-cycle` menulis event `filing_drafted` saat draft siap dan `filing_submitted` saat dokumen final diserahkan ke customer.

Loop runtime:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 8`.
2. Setiap pesan customer berikutnya → panggil `get` dulu. Baca `current_step` plus `state_data` yang sudah terkumpul. Jalankan langkah itu. Lalu `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → `advance` dengan `set_status` `awaiting_customer` (checkpoint lunak) atau `escalated` (gerbang keras). Sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas, invokasi berikutnya `get` lagi, lihat status terparkir, dan lanjut dari langkah yang ditunjuk cursor.
5. Langkah 8 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

**Catatan PII.** Sepanjang siklus, `state_data` mengakumulasi NPWP, nomor rekening, dan angka-angka pajak. Karena Trade Pro dan Doc Expert yang dipanggil lewat `finance-dispatch` ada di luar allowlist PII business-agent, `state_data` menyimpan **ringkasan terselubung** — NPWP dan nomor rekening hanya muncul utuh di dokumen PDF final yang diserahkan di Langkah 7. Ringkasan yang disampaikan ke customer di Telegram di Langkah 5 dan Langkah 6 selalu pakai versi terselubung.

## Langkah-langkah

### Langkah 1 — Intake periode dan baca riwayat siklus  ·  estimasi 2-3 menit

- **Aksi:** Baca pesan customer. Tarik `business_status` (pt-active, cv-active, perorangan-pkp), `has_employees`, dan `pkp_status` (PKP atau bukan). Tentukan `cycle_period` — periode bulan berjalan untuk setoran bulanan, atau tahun buku terakhir untuk SPT Tahunan. Kalau salah satu belum jelas dan berpengaruh ke daftar kewajiban, tanya dalam satu pesan ringkas. Baca event `filed_acknowledged`, `filing_drafted`, dan `filing_submitted` dari `bd_decisions_log` untuk periode yang sama supaya kewajiban yang sudah difilekan tidak dihitung ulang. Lalu panggil `start` pada flow-state dengan `total_steps: 8`. Sebelum `start`, panggil `get` dulu — kalau sudah ada run yang belum selesai, lanjutkan run itu alih-alih memulai dari nol.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer, idealnya menyebut periode dan jenis badan usaha.
- **Output yang diharapkan:** `step_output` berisi `{ business_status, has_employees, pkp_status, cycle_period, already_filed_obligation_ids }` — masuk ke `state_data`. `already_filed_obligation_ids` adalah daftar id kewajiban yang sudah ada event `filed_acknowledged` atau `filing_submitted` untuk `cycle_period` ini, jadi Langkah 2 bisa menyaringnya keluar.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | `business_status`, `pkp_status`, dan `cycle_period` jelas | `advance` ke Langkah 2 |
  | Salah satu belum jelas | Tetap di Langkah 1, tanya satu pertanyaan, jangan `advance` |
  | Customer berstatus pre-incorporation | Sampaikan bahwa kewajiban filing belum ada sampai badan usaha berdiri, tawarkan playbook `incorporation-walkthrough`, jangan lanjut |

- **Gerbang eskalasi:** `none` — klarifikasi di sini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah konteks periode cukup jelas.
- **Error handling:** Kalau `get` atau `start` tidak bisa diakses, ulangi sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai siklus finance-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya. Kalau pembacaan `bd_decisions_log` gagal, jangan blokir — lanjut dengan `already_filed_obligation_ids: []` dan tandai di `state_data` supaya Langkah 2 melihat daftar penuh.

### Langkah 2 — Enumerasi kewajiban filing periode  ·  estimasi 3-5 menit

- **Aksi:** Jalankan `compliance-checker` mode `upcoming-due` dengan `business_status` dan `has_employees` dari `state_data`. Saring hasilnya ke kewajiban berjenis `filing` yang jatuh tempo di `cycle_period`, dan keluarkan id yang sudah ada di `already_filed_obligation_ids`. Sandingkan dengan referensi `finance/djp-tax-filing-cycle.md` untuk portal filing dan due date yang presisi.
- **Tautan/endpoint:** `hermes-skill:compliance-checker` — referensi tanggal di template `compliance/indonesian-due-dates.md`, referensi portal dan jenis filing di template `finance/djp-tax-filing-cycle.md`
- **Input yang diharapkan:** `business_status`, `has_employees`, `pkp_status`, `cycle_period`, dan `already_filed_obligation_ids` dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** `step_output` berisi `{ filings_due: [ { obligation_id, nama, due_date, portal, dokumen_wajib, penalti } ] }` — masuk ke `state_data`. Hanya kewajiban berjenis `filing` yang ikut. Kewajiban advisory diabaikan di playbook ini.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Ada satu atau lebih filing yang jatuh tempo di periode ini | `advance` ke Langkah 3 |
  | Tidak ada filing yang jatuh tempo di periode ini | `advance` ke Langkah 3, catat di `step_output` bahwa periode ini tidak ada filing — siklus akan berhenti rapi di Langkah 3 |

- **Gerbang eskalasi:** `none` — langkah ini auto-advance. Customer melihat hasilnya di Langkah 3.
- **Error handling:** Kalau `compliance-checker` gagal, ulangi Langkah 2 dengan input yang sama dari `state_data`. Jangan ulang seluruh playbook. Kalau gagal berulang, sampaikan ke customer bahwa enumerasi tersendat dan minta dia coba lagi sebentar.

### Langkah 3 — Pilih filing dan kumpulkan input  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer daftar filing yang jatuh tempo di periode ini, lengkap dengan due date dan dokumen wajib. Minta customer memilih satu atau lebih filing yang mau disiapkan di siklus ini dan kirimkan input yang dibutuhkan tiap filing (periode pelaporan presisi, omzet, faktur, daftar gaji, NPWP, nomor rekening setoran). Panggil `advance` dengan `set_status: "awaiting_customer"`, lalu berhenti sampai customer membalas.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `filings_due` dari `state_data` (hasil Langkah 2). Saat customer membalas: daftar `selected_filing_ids` dan blok `filing_inputs` per filing.
- **Output yang diharapkan:** `step_output` berisi `{ selected_filing_ids, filing_inputs, redacted_input_summary }` — masuk ke `state_data`. `filing_inputs` menyimpan referensi ke input mentah (lewat lokasi PDF terenkripsi per-run untuk faktur dan daftar gaji). `redacted_input_summary` adalah versi terselubung yang dipakai di Langkah 5 dan Langkah 6 — NPWP dan nomor rekening hanya empat digit terakhir.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | Customer pilih satu atau lebih filing dan input cukup | Rekam pilihan, `advance` ke Langkah 4 |
  | Customer pilih filing tapi input belum lengkap | Tetap di Langkah 3, tanya input yang kurang per filing, jaga status `awaiting_customer` |
  | Customer pilih nol filing — tunda semua ke periode berikutnya | Sampaikan jadwal reminder, lalu `complete` run tanpa masuk ke gerbang keras |
  | Periode ini tidak ada filing — hanya item advisory | Sampaikan jadwal reminder, lalu `complete` run tanpa masuk ke gerbang keras |

- **Gerbang eskalasi:** `checkpoint` — gerbang lunak ini aktif kalau ada filing yang perlu disiapkan. Yang agent sampaikan ke customer: daftar filing yang jatuh tempo, jadwal reminder, dan satu permintaan input — "Filing mana yang mau kita siapkan siklus ini, dan boleh aku minta angka serta dokumen pendukungnya per filing". Setelah itu agent berhenti dan menunggu balasan. Kalau periode ini ternyata tidak ada filing atau customer tunda semua, langkah ini tidak memarkir — siklus selesai rapi di sini dengan `complete`.
- **Error handling:** Kalau `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan ringkasan filing yang dibutuhkan ke customer dan minta dia membalas — saat dia membalas, `get` berikutnya menyinkronkan ulang posisi.

### Langkah 4 — Drafting filing per item lewat finance-dispatch  ·  estimasi 8-15 menit

- **Aksi:** Untuk setiap id di `selected_filing_ids`, panggil `finance-dispatch` dengan `intent_kind` yang sesuai (`pph-calc` untuk PPh 21 atau PPh 25, `ppn-filing` untuk SPT Masa PPN, `spt-tahunan` untuk SPT Tahunan Badan, atau `pph-calc` mode UMKM untuk PPh Final 0.5%). `finance-dispatch` membuka satu `department_threads` baris bertipe `finance` untuk siklus ini dan me-route ke Trade Pro plus Doc Expert sesuai routing table. Iterasi lewat seluruh `selected_filing_ids` di dalam satu langkah flow-state — pola loop-inside-a-step dari `project-orchestration` step 5. Kumpulkan output draft dari setiap pemanggilan, redact NPWP dan nomor rekening jadi hanya empat digit terakhir di setiap ringkasan, dan masukkan ke `step_output` setelah seluruh iterasi selesai. Engine `advance` cuma sekali.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` — referensi portal dan jenis filing di template `finance/djp-tax-filing-cycle.md`
- **Input yang diharapkan:** `selected_filing_ids`, `filing_inputs`, dan `redacted_input_summary` dari `state_data` (hasil Langkah 3). `cycle_period` untuk menentukan periode pelaporan presisi.
- **Output yang diharapkan:** `step_output` berisi `{ drafts: [ { obligation_id, draft_summary_redacted, draft_pdf_ref, department_thread_id } ] }` — masuk ke `state_data`. `draft_summary_redacted` adalah blok ringkas per filing untuk Langkah 5. `draft_pdf_ref` adalah referensi ke dokumen PDF terenkripsi per-run yang menyimpan draft lengkap dengan NPWP utuh — dokumen itu hanya dipakai di Langkah 7. `department_thread_id` adalah id baris `department_threads` yang dibuka `finance-dispatch` untuk siklus ini.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Semua filing punya draft yang terkumpul | `advance` ke Langkah 5 |
  | Sebagian filing gagal didraft (mis. input kurang dari `filing_inputs`) | Tetap di Langkah 4, kembali ke Langkah 3 lewat pesan ke customer untuk minta input tambahan per filing yang gagal — jangan `advance` |
  | `finance-dispatch` mengembalikan flag butuh klarifikasi metode (mis. PPh 25 vs Final UMKM ambigu) | Tetap di Langkah 4, tanya ke customer satu pertanyaan tertutup, jangan `advance` |

- **Gerbang eskalasi:** `none` — drafting per filing dijalankan agent di dalam satu langkah flow-state. Customer baru melihat hasilnya di Langkah 5.
- **Error handling:** Kalau satu pemanggilan `finance-dispatch` gagal, ulangi pemanggilan itu sekali dengan input yang sama. Kalau tetap gagal, catat filing yang bermasalah di `step_output` dan jangan `advance` — sampaikan ke customer mana filing yang belum berhasil disiapkan dan tawarkan untuk mencoba lagi sebentar.

### Langkah 5 — Ringkasan draft dengan PII terselubung  ·  estimasi 2-3 menit

- **Aksi:** Susun satu ringkasan draft per filing dari `drafts` di `state_data`. Setiap ringkasan menggunakan `draft_summary_redacted` — NPWP dan nomor rekening hanya empat digit terakhir, total angka pajak utuh. Tampilkan ringkasan itu ke customer untuk review numerik sebelum permintaan persetujuan dibuka. Tidak ada `state_data` baru yang perlu ditambah di langkah ini selain catatan bahwa ringkasan sudah disampaikan.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance`
- **Input yang diharapkan:** `drafts` dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** `step_output` berisi `{ summary_delivered_at, summary_message_ref }` — masuk ke `state_data`. `summary_message_ref` adalah referensi ke pesan ringkasan yang sudah disampaikan ke customer untuk audit.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Ringkasan tersampaikan ke customer | `advance` ke Langkah 6 |
  | Pengiriman ringkasan gagal | Tetap di Langkah 5, ulangi pengiriman, jangan `advance` |

- **Gerbang eskalasi:** `none` — langkah ini auto-advance setelah ringkasan tersampaikan. Customer boleh membalas dengan revisi angka di sini; revisi dipindahkan ke Langkah 4 lewat permintaan input baru dan cursor flow-state dikembalikan ke Langkah 4.
- **Error handling:** Kalau ringkasan gagal terkirim ke Telegram, ulangi sekali. Kalau tetap gagal, jangan `advance` ke Langkah 6 — gerbang keras tidak boleh dibuka tanpa customer sempat baca ringkasan draft dulu.

### Langkah 6 — Gerbang keras: buka persetujuan filing per item  ·  estimasi tunggu customer

- **Aksi:** Untuk setiap draft di `drafts`, buka satu permintaan persetujuan di approval queue dengan `action_kind: "regulatory_filing"`. `action_summary` berisi nama filing plus total angka pajak dari `draft_summary_redacted`. `action_payload` berisi `draft_pdf_ref` dan id filing, bukan NPWP utuh — payload tetap pakai versi terselubung. Permintaan ini terbit per filing, bukan satu permintaan untuk seluruh batch — kalau ada tiga filing, ada tiga permintaan terpisah di approval queue dengan masing-masing expiry 48 jam sendiri. Setelah seluruh permintaan terbuka, panggil `advance` pada flow-state dengan `set_status: "escalated"`. Sampaikan ke customer bahwa draft sudah siap dan permintaan persetujuan menunggu di Telegram, satu per filing. Berhenti dan kembalikan kontrol. Tidak ada dokumen final yang diserahkan di langkah ini.
- **Tautan/endpoint:** `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "regulatory_filing"`) — satu permintaan per filing, lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`
- **Input yang diharapkan:** `drafts` dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** `step_output` berisi `{ approval_request_ids: [ { obligation_id, approval_request_id, expires_at } ] }` — masuk ke `state_data`. Setiap `approval_request_id` jadi rujukan saat customer membalas per filing.
- **Validasi:** Langkah 7 hanya boleh berjalan kalau seluruh permintaan `regulatory_filing` di `approval_request_ids` berstatus `approved`. Saat customer membalas, klasifikasikan respons per filing:

  | Status persetujuan / respons customer | Tindakan |
  |---|---|
  | Semua permintaan `regulatory_filing` berstatus `approved` | `advance` ke Langkah 7 |
  | Sebagian permintaan `approved`, sebagian masih `pending` | Run tetap `escalated`, tidak ada aksi — tunggu balasan untuk permintaan yang tersisa |
  | Customer minta revisi draft satu filing ("ganti angka X", "periode salah") | Susun ulang draft filing itu lewat `finance-dispatch`, buka permintaan persetujuan baru untuk filing itu, tetap di Langkah 6 dengan status `escalated` |
  | Customer reject satu filing — tunda ke siklus berikutnya | Hapus filing itu dari batch yang menuju Langkah 7, lanjut hanya dengan filing yang `approved` |
  | Permintaan untuk satu filing berstatus `expired` (48 jam lewat tanpa balasan) | Run tetap terparkir `escalated`. Sampaikan ke customer bahwa persetujuan untuk filing itu sudah kedaluwarsa dan filing belum diserahkan. Kalau filing masih relevan, buka permintaan persetujuan baru — run tidak otomatis lanjut |
  | Semua permintaan `expired` | Run tetap `escalated`. Sampaikan ke customer bahwa persetujuan kedaluwarsa untuk seluruh filing. Customer harus membuka persetujuan baru kalau masih mau melanjutkan — siklus tidak `complete` otomatis |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras yang sama bentuknya dengan Langkah 4 di `compliance-cycle`. Filing keuangan menyentuh uang, kewajiban hukum, dan submission ke DJP, jadi tidak ada dokumen final yang diserahkan tanpa persetujuan yang tercatat dan masih berlaku per filing. Urutan langkah dipegang oleh flow-state yang terparkir di `escalated`. Keputusan ya atau tidak atas setiap filing dipegang oleh permintaan `regulatory_filing` di approval queue, satu permintaan per filing. Langkah 7 hanya berjalan untuk filing yang permintaannya berstatus `approved`. Kalau permintaan satu filing `expired`, run tetap terparkir untuk filing itu — tidak ada penyerahan, dan customer harus membuka persetujuan baru kalau masih mau melanjutkan. Business Director tidak menyerahkan dokumen filing apa pun untuk submit tanpa persetujuan yang masih berlaku (SOUL.md hard limit "tidak eksekusi irreversible action tanpa approval landed"). Yang disampaikan ke customer saat memarkir: ringkasan satu pesan untuk seluruh filing yang siap plus "Aku belum serahkan dokumen apa pun. Filing diserahkan hanya setelah kamu approve permintaan di Telegram per filing, dan tiap persetujuan berlaku 48 jam."
- **Error handling:** Kalau pembukaan satu permintaan persetujuan gagal, ulangi sekali untuk permintaan itu. Kalau masih gagal, jangan `advance` ke `escalated` — run harus tetap di Langkah 6 dengan draft tersimpan sampai seluruh permintaan berhasil dibuka. Tanpa permintaan persetujuan yang lengkap, Langkah 7 tidak pernah dipanggil.

### Langkah 7 — Serahkan dokumen siap submit  ·  estimasi 3-5 menit

- **Aksi:** Untuk setiap filing yang permintaannya berstatus `approved`, susun dokumen siap submit dari `draft_pdf_ref` di `state_data` — versi final dengan NPWP dan nomor rekening utuh siap dicetak. Serahkan dokumen itu ke customer satu per satu lewat Telegram, lengkap dengan instruksi portal yang harus dipakai (DJP Online untuk SPT Masa PPh, e-Faktur plus DJP Online untuk SPT Masa PPN, e-Filing untuk SPT Tahunan Badan). Customer yang mengajukan submission lewat portal resmi — Business Director tidak submit atas nama customer. Catat satu event `filing_submitted` di `bd_decisions_log` per filing setelah dokumen diserahkan.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` — dan tulisan ke `bd_decisions_log` lewat handler internal
- **Input yang diharapkan:** `drafts` dan `approval_request_ids` dari `state_data` (hasil Langkah 4 dan Langkah 6). Hanya filing yang permintaannya `approved` yang masuk ke langkah ini.
- **Output yang diharapkan:** `step_output` berisi `{ delivered_filings: [ { obligation_id, filing_pdf_ref, portal, submitted_event_id } ] }` — masuk ke `state_data`. `submitted_event_id` adalah id event yang ditulis ke `bd_decisions_log` per filing.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Semua dokumen final tersampaikan dan event tercatat | `advance` ke Langkah 8 |
  | Sebagian dokumen final gagal disusun atau gagal disampaikan | Tetap di Langkah 7, ulangi penyusunan dokumen untuk filing yang gagal, jangan `advance` |
  | Penulisan event ke `bd_decisions_log` gagal tetapi dokumen tersampaikan | `advance` ke Langkah 8 — pencatatan log akan diulang di Langkah 8 |

- **Gerbang eskalasi:** `none` — langkah ini hanya berjalan setelah gerbang keras Langkah 6 lolos dengan persetujuan `approved` per filing. Tanpa persetujuan untuk filing tertentu, dokumen final untuk filing itu tidak pernah disiapkan apalagi diserahkan.
- **Error handling:** Kalau penyusunan dokumen final gagal untuk satu filing, jangan `abort`. Tahan run dan tawarkan ke customer untuk mencoba lagi — `state_data` masih menyimpan draft yang sudah disetujui di `drafts`. Kalau pengiriman dokumen final gagal di Telegram, ulangi pengiriman sekali sebelum mengarahkan customer ke dashboard.

### Langkah 8 — Catat siklus dan jadwalkan reminder berikutnya  ·  estimasi 1-2 menit

- **Aksi:** Konfirmasi bahwa seluruh event `filing_submitted` per filing tercatat di `bd_decisions_log`. Susun ringkasan akhir siklus untuk customer — daftar filing yang sudah diserahkan, portal yang harus dipakai, dan jadwal reminder untuk kewajiban berikutnya di periode depan. Tanyakan singkat apakah customer mau Business Director ping H-7 sebelum due date berikutnya. Lalu panggil `complete`. Run berstatus `completed`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`
- **Input yang diharapkan:** `delivered_filings` dari `state_data` (hasil Langkah 7). `cycle_period` dari Langkah 1 untuk menentukan reminder periode berikutnya.
- **Output yang diharapkan:** `step_output` berisi `{ cycle_completed_at, next_reminders, ping_h7_enabled }`, lalu `complete` operation.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Seluruh `filing_submitted` event tercatat dan ringkasan akhir tersampaikan | `complete` run |
  | Penulisan event yang sebelumnya gagal di Langkah 7 masih gagal | Tetap di Langkah 8, ulangi penulisan sekali. Kalau tetap gagal, sampaikan ke customer bahwa pencatatan log siklus tertunda — siklus tetap `complete` karena dokumen filing sudah diserahkan, tetapi catatan internal akan dilengkapi belakangan |

- **Gerbang eskalasi:** `none` — penutup siklus, customer hanya menerima ringkasan akhir.
- **Error handling:** Kalau pengiriman ringkasan akhir gagal, jangan `abort`. Tahan run sebentar dan ulangi pengiriman; `state_data` masih lengkap. Run tidak boleh `complete` sebelum customer menerima konfirmasi siklus.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue") — sesuai SOUL.md Business Director
- Nada experienced-cofounder, decisive, Indonesia-savvy — framing what's-next-and-why
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (HMAC, JWT, RLS) bocor ke customer — kalau lapisan state gagal, sampaikan dalam bahasa biasa
- NPWP dan nomor rekening dalam pesan customer hanya empat digit terakhir — versi utuh hanya muncul di PDF final yang diserahkan di Langkah 7
- Zero exclamation marks
- Calm-premium register — playbook ini dibaca sebagai satu siklus filing yang tertata, bukan sesi tanya-jawab
- Disclaim setiap filing dengan satu kalimat: Business Director bukan akuntan atau konsultan pajak berlisensi, draft layak di-review akuntan customer sebelum submit
- Filing yang disiapkan diserahkan apa adanya untuk customer submit — tidak ada angka yang ditebak

## Decline criteria

Business Director decline atau berhenti playbook ini kalau:

- Customer minta dokumen filing diserahkan tanpa dia menyetujui draft-nya dulu — gerbang keras Langkah 6 tidak bisa dilewati.
- Customer minta Business Director submit dokumen atas nama dia ke DJP Online, e-Faktur, atau OSS — submission selalu customer yang lakukan, agent hanya menyiapkan draft dan menyerahkan dokumen final.
- Permintaan mengarah ke tax evasion, circumvent regulasi, atau pemalsuan faktur — hard decline, jelaskan alasannya.
- Customer minta advice pajak spesifik yang butuh konsultan berlisensi — dispute DJP, audit response, valuasi kapitalisasi, struktur tax-optimized lintas badan — playbook ini menyiapkan filing rutin, bukan menggantikan akuntan atau konsultan pajak.
- Customer berstatus pre-incorporation — belum ada kewajiban filing sampai badan usaha berdiri; arahkan ke playbook `incorporation-walkthrough`.
- Customer minta filing untuk periode yang sudah ada event `filing_submitted` di `bd_decisions_log` — sampaikan bahwa periode itu sudah pernah difilekan, tawarkan revisi lewat siklus baru kalau memang diperlukan.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
