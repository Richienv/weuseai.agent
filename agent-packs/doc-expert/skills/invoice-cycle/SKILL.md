---
skill_kind: playbook
name: invoice-cycle
bundle: doc-expert
flow_state_playbook_id: invoice-cycle
total_steps: 7
use_cases:
  - "Customer punya beberapa project selesai akhir bulan dan butuh batch invoice ke klien"
  - "Cron tanggal 1 setiap bulan fires untuk customer aktif yang punya project Done belum di-invoice"
  - "Customer mau follow-up invoice aging yang sudah lewat jatuh tempo"
prerequisites:
  - "Customer tier Pro atau Studio"
  - "Sudah ada minimal satu invoice template default yang dipilih customer — PPN 11% atau UMKM Non-PPN"
  - "Customer punya minimal satu klien dengan data lengkap (nama, alamat, NPWP kalau PPN)"
escalation_to: customer
---

# invoice-cycle — doc-expert playbook

Playbook ini menjalankan satu siklus invoicing bulanan dari customer — dari agregasi project selesai, match ke klien yang bersangkutan, draft invoice pakai template PPN atau UMKM yang sudah dipilih, sampai pengiriman ke klien dan logging ke receivables tracker. Ada satu checkpoint kondisional sebelum kirim — aktif kalau batch invoice lebih dari tiga atau total nominal lewat ambang yang customer set.

Bedanya dengan memanggil `invoice-generator` langsung: di sini alurnya utuh untuk batch bulanan dengan logging ke receivables, bukan single-invoice ad-hoc. Untuk satu invoice cepat tanpa batch, pakai `invoice-generator` saja.

## Kapan dipakai

Customer minta batch invoice akhir bulan, atau cron tanggal 1 fires kalau auto-invoice diaktifkan. Trigger phrases:

- "bikin invoice bulan ini"
- "invoice semua project yang selesai"
- "batch invoice klien"
- "tagihan akhir bulan"
- "follow-up invoice yang belum dibayar"

Kalau customer cuma minta satu invoice untuk satu klien spesifik, pakai `invoice-generator` mode langsung, bukan playbook ini.

## Cara kerja

Playbook dijalankan engine `flow-state` yang sama dengan playbook lain. Engine menyimpan posisi langkah dan output tiap langkah supaya alur tetap utuh walau ada jeda antara draft, review customer, dan pengiriman.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "invoice-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai: `start`, `get`, `advance`, `complete`, `abort` — sama dengan playbook lain.

## Langkah-langkah

### Langkah 1 — Intake siklus invoicing dan tarik project selesai  ·  estimasi 1-2 menit

- **Aksi:** Identifikasi trigger — pesan customer atau cron tanggal 1 setiap bulan. Tarik daftar project berstatus Done yang belum di-invoice dalam periode `billing_period` (default bulan kalender berjalan). Catat juga `template_default` yang sudah customer pilih (PPN 11% atau UMKM Non-PPN). Panggil `start` flow-state dengan `total_steps: 7`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer atau payload cron berisi `billing_period` opsional dan `customer_id`.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "billing_period_start", "billing_period_end", "projects_done": [...], "template_default", "trigger": "cron"|"customer" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `billing_period` punya rentang yang masuk akal (28-31 hari). `template_default` salah satu dari dua nilai enum. `projects_done` berisi project yang memang berstatus Done dan belum punya invoice di periode ini.

  | Kondisi | Tindakan |
  |---|---|
  | Ada project Done dan template tersedia | Lanjut, `advance` ke Langkah 2 |
  | Tidak ada project Done bulan ini | `advance` ke Langkah 2 dengan `projects_done: []`, biar Langkah 7 yang memutuskan pesan "bulan sepi" |
  | Customer belum pilih template default | Tetap di Langkah 1, tanya "Kamu mau pakai template PPN 11% atau UMKM Non-PPN sebagai default invoice?" |

- **Gerbang eskalasi:** `none`. Pemilihan template default adalah pertanyaan pembuka biasa, bukan parkir state-machine.

### Langkah 2 — Match project ke data klien  ·  estimasi 2-3 menit

- **Aksi:** Untuk tiap project di `projects_done`, ambil data klien yang bersangkutan — nama, alamat, NPWP (wajib kalau template PPN), email kontak, payment terms. Validasi data klien lengkap sebelum lanjut. Tandai klien yang datanya kurang (mis. NPWP kosong padahal template PPN).
- **Tautan/endpoint:** `hermes-skill:client-lookup` mode `match-by-project`
- **Input yang diharapkan:** `projects_done` dari `state_data` dan `template_default` dari `state_data`.
- **Output yang diharapkan:** Daftar match ke `step_output` — `{ "matched": [ { "project_id", "client_id", "client_data", "ready": true|false } ], "missing_data": [...] }`. `ready` true kalau data klien cukup untuk template yang dipilih.
- **Validasi:** Tiap project sukses dimatchkan ke satu klien. Klien dengan `ready: false` punya catatan eksplisit field apa yang kurang.

  | Kondisi | Tindakan |
  |---|---|
  | Semua project punya klien siap | `advance` ke Langkah 3 |
  | Ada klien data kurang | `advance` ke Langkah 3 dengan flag, lalu Langkah 3 hanya draft invoice untuk klien yang `ready: true` |
  | Ada project tanpa klien yang match | Tetap di Langkah 2, sampaikan ke customer project mana yang belum punya klien terdaftar |

- **Gerbang eskalasi:** `none`. Data kurang di-surface ke customer di Langkah 6 sebagai bagian summary batch.

### Langkah 3 — Draft invoice pakai template default  ·  estimasi 3-5 menit

- **Aksi:** Untuk tiap klien yang `ready: true`, draft invoice pakai template default — `invoice-ppn-11pct.html` atau `invoice-umkm-non-ppn.html`. Isi line items dari project deliverable, hitung subtotal, PPN (kalau PPN), total. Render ke HTML siap PDF.
- **Tautan/endpoint:** `edge-fn:invoice-generator-handler` mode `batch-draft`
- **Input yang diharapkan:** `matched` dari `state_data` (klien yang `ready: true`), `template_default` dari `state_data`, line items dari project deliverable.
- **Output yang diharapkan:** Daftar draft invoice ke `step_output` — `{ "drafts": [ { "invoice_number", "client_id", "subtotal_idr", "ppn_idr", "total_idr", "html_url", "pdf_url" } ], "batch_total_idr" }`.
- **Validasi:** Tiap draft punya nomor invoice unik dalam periode ini. Subtotal cocok dengan jumlah line items. PPN 11% dihitung benar untuk template PPN.

  | Kondisi | Tindakan |
  |---|---|
  | Semua draft sukses dirender | `advance` ke Langkah 4 |
  | Ada draft gagal render (template error) | Ulangi render untuk draft yang gagal sekali, lalu lanjut kalau tetap gagal dengan catatan |

- **Gerbang eskalasi:** `none`. Draft dibawa ke Langkah 4 untuk gerbang kondisional review.

### Langkah 4 — Gerbang kondisional: review batch sebelum kirim  ·  estimasi tunggu customer atau langsung lanjut

- **Aksi:** Baca jumlah draft di `state_data.drafts` dan `state_data.batch_total_idr`. Kalau jumlah draft lebih dari tiga atau `batch_total_idr` lewat ambang yang customer set (default Rp 50jt), `advance` dengan `set_status: "awaiting_customer"`, tampilkan ringkasan batch ke customer, lalu berhenti. Kalau batch kecil dan di bawah ambang, langsung `advance` ke Langkah 5 tanpa parkir. Tulis keputusan jalur ke `step_output` sebagai `gate_taken: "checkpoint"` atau `gate_taken: "none"`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"` (hanya kalau gerbang aktif)
- **Input yang diharapkan:** `drafts` dan `batch_total_idr` dari `state_data` (hasil Langkah 3).
- **Output yang diharapkan:** Saat batch kecil, `step_output` berisi `{ "gate_taken": "none", "batch_approved": true }` dan cursor lanjut ke Langkah 5. Saat batch besar, `step_output` awal berisi `{ "gate_taken": "checkpoint" }` lalu run parkir; saat customer membalas, rekam `{ "batch_approved": true|false, "edits": [...] }`.
- **Validasi:** Balasan customer (kalau gerbang aktif) harus berupa keputusan yang bisa ditindaklanjuti — approve, edit, atau batal.

  | Balasan customer (gerbang aktif) | Tindakan |
  |---|---|
  | "lanjut" / "approve" / "kirim" | Rekam `batch_approved: true`, `advance` ke Langkah 5 |
  | Minta revisi nominal atau line item | Terapkan revisi ke draft yang relevan, tampilkan versi baru, parkir lagi `awaiting_customer` |
  | "batal" | Panggil `abort`, draft tetap tersimpan sebagai history |

- **Gerbang eskalasi:** `checkpoint kalau drafts.length > 3 atau batch_total_idr > ambang · none kalau di bawah ambang`. Gerbang kondisional terhadap ukuran batch. Yang agent sampaikan saat memarkir: ringkasan batch berisi jumlah invoice, total nominal IDR, dan satu pertanyaan tertutup — "Aku kirim batch invoice ini, atau ada yang mau kamu adjust dulu?".

### Langkah 5 — Kirim invoice via email ke klien  ·  estimasi 2-4 menit

- **Aksi:** Untuk tiap draft yang sudah approved, kirim email ke klien dengan attachment PDF invoice. Email pakai template `email-formal.md` register profesional. Catat `sent_at` per invoice.
- **Tautan/endpoint:** `hermes-skill:email-sender` mode `invoice-batch`
- **Input yang diharapkan:** `drafts` final dari `state_data` (post Langkah 4 dengan edit kalau ada), data kontak klien dari `state_data.matched`.
- **Output yang diharapkan:** Konfirmasi pengiriman ke `step_output` — `{ "sent": [ { "invoice_number", "client_id", "email_to", "sent_at" } ], "failed": [...] }`.
- **Validasi:** Tiap pengiriman sukses punya `sent_at` valid. Pengiriman gagal masuk `failed` dengan alasan.

  | Kondisi | Tindakan |
  |---|---|
  | Semua kirim sukses | `advance` ke Langkah 6 |
  | Ada yang gagal kirim | `advance` ke Langkah 6 dengan daftar `failed`, Langkah 7 sampaikan ke customer untuk retry manual |

- **Gerbang eskalasi:** `none`. Pengiriman sudah disetujui di Langkah 4 (atau auto-approved untuk batch kecil), tidak butuh gerbang lagi.

### Langkah 6 — Log ke receivables tracker  ·  estimasi 1-2 menit

- **Aksi:** Catat tiap invoice yang sudah terkirim ke receivables tracker — `invoice_number`, `client_id`, `total_idr`, `sent_at`, `due_date`, `status: "outstanding"`. Tracker ini yang nantinya dipakai untuk follow-up aging.
- **Tautan/endpoint:** `hermes-skill:receivables-tracker` mode `record-batch`
- **Input yang diharapkan:** `sent` dari `state_data` (hasil Langkah 5) dan payment terms per klien dari `state_data.matched`.
- **Output yang diharapkan:** Konfirmasi log ke `step_output` — `{ "recorded": [...], "due_dates_set": [...] }`. Tiap invoice punya `due_date` dihitung dari `sent_at` + payment terms klien (default Net 30).
- **Validasi:** Jumlah `recorded` cocok dengan jumlah `sent` dari Langkah 5. Tiap entry punya `due_date` yang masuk akal.

  | Kondisi | Tindakan |
  |---|---|
  | Semua sukses log | `advance` ke Langkah 7 |
  | Log gagal sebagian | Ulangi log untuk entry yang gagal sekali, lalu lanjut |

- **Gerbang eskalasi:** `none`. Logging adalah langkah administrative, tidak butuh review customer.

### Langkah 7 — Tutup siklus dan susun ringkasan untuk customer  ·  estimasi 1-2 menit

- **Aksi:** Susun ringkasan siklus invoicing — jumlah invoice terkirim, total nominal, klien dengan data kurang yang perlu di-follow-up, invoice yang gagal kirim. Kirim ringkasan ke Telegram customer. Panggil `complete`.
- **Tautan/endpoint:** Telegram delivery via Hermes outgoing message, lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** Seluruh `state_data` — hasil Langkah 1 sampai 6.
- **Output yang diharapkan:** Ringkasan final ke `step_output` — `{ "summary_sent_at", "invoices_sent_count", "batch_total_idr", "clients_data_missing_count", "failed_sends_count" }`. Run berstatus `completed`.
- **Validasi:** Channel Telegram customer terhubung dan ringkasan terkirim.

  | Kondisi | Tindakan |
  |---|---|
  | Ringkasan sukses terkirim | `complete`, siklus selesai |
  | Pengiriman ringkasan gagal | Jangan `complete`, sampaikan via channel lain kalau ada, tahan summary di `state_data` |
  | Batch sepi (`projects_done: []` dari Langkah 1) | Tetap `complete` dengan ringkasan "Bulan ini belum ada project Done untuk di-invoice" |

- **Gerbang eskalasi:** `none`. Langkah penutup.

## Voice signature

- Bahasa Indonesia primer
- "kamu", bukan "Anda"
- Tidak ada nama backend terlihat oleh customer
- Kalimat pendek, satu ide per kalimat
- Nada administrative-precise — bicara dalam framing tagihan, nominal, jatuh tempo
- Zero exclamation marks

## Decline criteria

- **Invoice untuk klien yang datanya belum lengkap.** Aku tidak bikin invoice PPN tanpa NPWP klien. Customer harus melengkapi data dulu di Langkah 2.
- **Edit nominal yang tidak match dengan line item project.** Kalau customer minta nominal invoice beda dari deliverable, aku tanya alasan dan minta konfirmasi tertulis — bukan diam-diam diubah.
- **Kirim batch besar tanpa review.** Untuk batch lebih dari tiga invoice atau total di atas ambang, gerbang Langkah 4 selalu aktif. Customer minta skip checkpoint? Aku jelaskan kenapa titik henti itu ada — invoice yang keluar pintu tidak bisa ditarik diam-diam.
- **Auto-invoice via cron untuk customer yang belum pernah confirm template default.** Cron hanya fires untuk customer yang sudah pilih template — supaya tidak ada invoice ngambang dengan template salah.
