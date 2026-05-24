---
skill_kind: playbook
name: contract-review-cycle
bundle: doc-expert
flow_state_playbook_id: contract-review-cycle
total_steps: 6
use_cases:
  - "Customer terima draft kontrak dari klien atau mitra dan butuh review awal sebelum tanda tangan"
  - "Customer mau identifikasi klausul red-flag pakai konteks KUHPerdata Indonesia"
  - "Customer mau dapat versi mark-up dengan saran counter-language untuk negosiasi"
prerequisites:
  - "Customer tier Pro atau Studio"
  - "Customer punya akses ke draft kontrak dalam format text, PDF, atau DOCX yang bisa di-parse"
  - "Customer paham hasil review BUKAN nasihat hukum dan tetap perlu konfirmasi advokat sebelum tanda tangan"
escalation_to: customer
---

# contract-review-cycle — doc-expert playbook

Playbook ini menjalankan satu siklus review kontrak yang customer terima dari pihak lain. Alurnya: parse dokumen, identifikasi klausul red-flag dengan konteks KUHPerdata Indonesia (Pasal 1320 syarat sah perjanjian, Pasal 1338 asas kebebasan berkontrak, Pasal 1266/1267 waiver pembatalan), susun daftar risiko, saran counter-language, checkpoint review customer, lalu kembalikan versi mark-up siap negosiasi.

Bedanya dengan template `kontrak-freelance-bahasa` atau `surat-perjanjian-sewa`: di sini posisinya kontrak datang dari luar dan customer butuh review pakai lens hukum Indonesia, bukan draft fresh dari template. Output WAJIB diverifikasi advokat sebelum tanda tangan — playbook ini draft awal, bukan opini hukum.

## Kapan dipakai

Customer dapat draft kontrak dari klien, vendor, atau mitra dan minta review sebelum tanda tangan. Trigger phrases:

- "review kontrak ini"
- "cek klausul kontrak"
- "ada red flag di kontrak ini"
- "bantuin negosiasi kontrak"
- "kontrak dari klien, aman atau tidak"

Kalau customer mau bikin kontrak fresh, bukan review draft yang masuk, pakai template kontrak di mode generator.

## Cara kerja

Playbook dijalankan engine `flow-state` yang sama dengan playbook lain. Engine menyimpan posisi langkah dan output tiap langkah supaya alur tetap utuh walau ada jeda antara analisis dan review customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "contract-review-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai: `start`, `get`, `advance`, `complete`, `abort` — sama dengan playbook lain.

## Langkah-langkah

### Langkah 1 — Intake kontrak dan parse ke struktur klausul  ·  estimasi 2-4 menit

- **Aksi:** Terima dokumen dari customer dalam format text, PDF, atau DOCX. Parse menjadi struktur klausul — judul, para pihak, definisi, scope, fee dan termin pembayaran, IP, force majeure, terminasi, dispute resolution, durasi, governing law, lampiran. Catat jenis kontrak (services, sewa, NDA, kerja sama, kemitraan). Panggil `start` flow-state dengan `total_steps: 6`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start` plus `hermes-skill:doc-parser` mode `contract-structure`
- **Input yang diharapkan:** File kontrak yang customer attach atau paste, plus konteks ringkas siapa pihak lawan (klien, vendor, mitra).
- **Output yang diharapkan:** Struktur klausul ke `step_output` — `{ "contract_type", "parties": [...], "clauses": [ { "section", "title", "text" } ], "annexes": [...], "page_count" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** Parse menemukan minimal para pihak, scope inti, fee, dan terminasi. Kalau kurang dari empat dari komponen ini ketemu, kontrak terlalu skeletal untuk direview.

  | Kondisi | Tindakan |
  |---|---|
  | Parse sukses dengan struktur lengkap | Lanjut, `advance` ke Langkah 2 |
  | Parse menemukan kontrak skeletal (klausul inti hilang) | Tetap di Langkah 1, sampaikan ke customer bahwa kontrak butuh dilengkapi dulu sebelum direview |
  | File rusak atau format tidak dikenali | Tetap di Langkah 1, minta customer kirim ulang dalam text atau PDF dengan teks ter-OCR |

- **Gerbang eskalasi:** `none`. Permintaan ulang file adalah pembuka biasa.

### Langkah 2 — Identifikasi klausul red-flag pakai lens KUHPerdata  ·  estimasi 5-8 menit

- **Aksi:** Audit tiap klausul terhadap checklist red-flag konvensi Indonesia. Cek apakah syarat sah perjanjian (Pasal 1320 KUHPerdata — sepakat, cakap, hal tertentu, sebab halal) terpenuhi di permukaan. Tandai pelanggaran asas kebebasan berkontrak (Pasal 1338) seperti klausul one-sided non-negotiable atau pengikatan tidak wajar. Khusus waiver Pasal 1266/1267 — kalau kontrak punya klausul "pengakhiran tanpa perlu putusan pengadilan", flag tinggi karena impact-nya menghilangkan perlindungan pembatalan via pengadilan. Cek juga klausul governing law non-Indonesia, dispute di arbitrase luar negeri, IP grab total, force majeure terlalu sempit, dan termin pembayaran tidak realistis.
- **Tautan/endpoint:** `hermes-skill:contract-analyzer` mode `red-flag-scan`
- **Input yang diharapkan:** `clauses` dari `state_data` dan `contract_type`.
- **Output yang diharapkan:** Daftar red-flag ke `step_output` — `{ "red_flags": [ { "clause_section", "issue", "severity": "high"|"medium"|"low", "kuhperdata_ref"?, "impact": "string ≤100 kata" } ], "summary_risk_level": "high"|"medium"|"low" }`.
- **Validasi:** Tiap red-flag punya section reference yang bisa ditemukan di `clauses`. Severity `high` muncul kalau ada waiver Pasal 1266/1267 atau pelanggaran syarat sah Pasal 1320. `summary_risk_level` konsisten dengan distribusi severity (mayoritas high → summary high).

  | Kondisi | Tindakan |
  |---|---|
  | Red-flag ditemukan | `advance` ke Langkah 3 untuk susun counter-language |
  | Kontrak bersih (no red-flag) | `advance` ke Langkah 3 dengan `red_flags: []`, Langkah 3 hanya pasang catatan positif |
  | Kontrak punya >10 red-flag high | `advance` ke Langkah 3 dengan flag eskalasi visual, customer diberitahu di Langkah 5 bahwa kontrak ini disarankan ditolak total |

- **Gerbang eskalasi:** `none`. Analisis ini agent-side, customer review di Langkah 5.

### Langkah 3 — Susun counter-language untuk tiap red-flag  ·  estimasi 4-6 menit

- **Aksi:** Untuk tiap red-flag, susun saran perubahan klausul — kasih draft alternatif yang lebih balanced dan jelaskan rasionalnya satu kalimat. Untuk waiver Pasal 1266/1267, default counter adalah "menghapus klausul waiver dan tetap mengacu pada syarat pembatalan via putusan pengadilan sesuai KUHPerdata Pasal 1266". Untuk klausul one-sided non-negotiable, saran reciprocal language. Untuk governing law luar negeri, saran ganti ke hukum Indonesia atau minimal dispute di arbitrase BANI Jakarta.
- **Tautan/endpoint:** `hermes-skill:contract-analyzer` mode `counter-language`
- **Input yang diharapkan:** `red_flags` dari `state_data`.
- **Output yang diharapkan:** Counter-language ke `step_output` — `{ "counters": [ { "clause_section", "original_text", "suggested_text", "rationale" } ] }`.
- **Validasi:** Tiap red-flag severity `high` atau `medium` punya counter. Counter language tidak menambah klausul yang justru bias ke customer (review ini fair-balanced, bukan adversarial).

  | Kondisi | Tindakan |
  |---|---|
  | Counter sukses disusun | `advance` ke Langkah 4 |
  | Ada red-flag yang tidak punya counter natural | Catat sebagai "rekomendasi: hapus klausul ini" tanpa counter text |

- **Gerbang eskalasi:** `none`. Counter dibawa ke Langkah 4 untuk render.

### Langkah 4 — Render versi mark-up dengan komentar  ·  estimasi 3-5 menit

- **Aksi:** Render dua artefak — (a) ringkasan review berisi daftar red-flag dengan severity, kuhperdata reference, dan saran counter; (b) versi mark-up dari kontrak asli dengan highlight pada klausul bermasalah dan inline comment berisi counter-language. Format mark-up: HTML dengan highlight warna per severity (high merah, medium kuning, low biru muda) plus PDF mirror.
- **Tautan/endpoint:** `edge-fn:doc-expert-handler` mode `contract-markup-render`
- **Input yang diharapkan:** `clauses`, `red_flags`, `counters` dari `state_data`.
- **Output yang diharapkan:** Artefak ke `step_output` — `{ "summary_html_url", "summary_pdf_url", "markup_html_url", "markup_pdf_url", "high_severity_count", "medium_severity_count", "low_severity_count" }`.
- **Validasi:** Mark-up berhasil dirender dengan highlight terlihat. Counter language muncul di inline comment, bukan terpotong. PDF mirror match dengan HTML.

  | Kondisi | Tindakan |
  |---|---|
  | Render sukses | `advance` ke Langkah 5 |
  | Render gagal sebagian (mis. PDF mirror error) | Ulangi render bagian yang gagal sekali, kalau tetap gagal kirim hanya HTML dengan catatan |

- **Gerbang eskalasi:** `none`. Artefak dibawa ke Langkah 5 untuk review customer.

### Langkah 5 — Checkpoint review hasil dengan customer  ·  estimasi tunggu customer

- **Aksi:** Kirim ringkasan dan link artefak ke customer — total red-flag per severity, satu kalimat rekomendasi overall (sign as-is, negotiate, atau decline), link summary dan mark-up. Kalau ada >10 red-flag severity high, eksplisit sampaikan rekomendasi "disarankan decline kontrak ini" plus alasan utama dalam tiga kalimat. `advance` dengan `set_status: "awaiting_customer"`. Tunggu customer decide langkah berikutnya.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** Artefak dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** Saat parkir, `step_output` berisi `{ "review_sent_at", "recommendation": "sign-as-is"|"negotiate"|"decline" }`. Saat customer balas, rekam `{ "customer_decision": "..." }`.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — kirim balik ke pihak lawan dengan mark-up, decline kontrak, atau tahan untuk konsultasi advokat.

  | Balasan customer | Tindakan |
  |---|---|
  | "kirim mark-up ke klien" | Rekam `customer_decision: "send-markup"`, `advance` ke Langkah 6 |
  | "decline kontrak ini" | Rekam `customer_decision: "decline"`, `advance` ke Langkah 6 dengan jalur decline |
  | "aku konsultasi advokat dulu" | Rekam `customer_decision: "await-lawyer"`, `complete` tanpa Langkah 6, artefak tersimpan di history |

- **Gerbang eskalasi:** `checkpoint` selalu aktif. Aksi balik ke pihak lawan tidak terjadi tanpa keputusan customer. Yang agent sampaikan saat memarkir: ringkasan red-flag plus pengingat eksplisit — "Hasil review ini draft awal, bukan opini hukum. Untuk kontrak yang akan ditandatangani, konfirmasi advokat dulu."

### Langkah 6 — Kembalikan artefak final dan tutup siklus  ·  estimasi 1-2 menit

- **Aksi:** Kalau customer decide kirim mark-up, susun email ke pihak lawan dengan attachment mark-up plus kalimat pembuka netral ("Berikut catatan kami atas draft kontrak..."). Kalau customer decide decline, susun email penolakan profesional pakai template `email-formal.md`. Pasang entry tracker review — `client_name`, `contract_type`, `decision`, `red_flag_count`, `reviewed_at`. Kirim ringkasan ke Telegram customer. Panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:email-sender` mode `contract-response`, lalu `hermes-skill:contract-tracker` mode `record`, lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** Seluruh `state_data` plus `customer_decision` dari Langkah 5.
- **Output yang diharapkan:** Ringkasan final ke `step_output` — `{ "email_sent_at"?, "tracker_id", "summary_sent_at", "decision_taken", "red_flag_count" }`. Run berstatus `completed`.
- **Validasi:** Email terkirim kalau customer pilih kirim. Tracker entry punya ID unik. Ringkasan terkirim ke Telegram customer dengan reminder bahwa hasil tetap perlu konfirmasi advokat.

  | Kondisi | Tindakan |
  |---|---|
  | Aksi customer dieksekusi dan ringkasan terkirim | `complete`, siklus selesai |
  | Email ke pihak lawan gagal kirim | Tetap di Langkah 6, sampaikan ke customer untuk retry atau kirim manual |
  | Customer pilih await-lawyer di Langkah 5 | Langkah 6 di-skip (sudah `complete` di Langkah 5), artefak tetap accessible di history |

- **Gerbang eskalasi:** `none`. Langkah penutup.

## Voice signature

- Bahasa Indonesia primer
- "kamu", bukan "Anda"
- Tidak ada nama backend terlihat oleh customer
- Kalimat pendek, satu ide per kalimat
- Nada hati-hati dan precise — bicara dalam framing risiko, klausul, dan rekomendasi
- Zero exclamation marks
- Selalu ada reminder eksplisit: review ini draft awal, bukan opini hukum

## Decline criteria

- **Review kontrak yang sudah ditandatangani.** Kalau kontrak sudah berlaku, posisinya bukan review pra-sign — sampaikan ke customer untuk konsultasi advokat untuk renegosiasi atau pembatalan.
- **Klaim "kontrak ini aman, silakan tanda tangan".** Aku tidak pernah kasih konfirmasi final tanda tangan. Hasil playbook ini selalu disclaim sebagai draft awal yang butuh konfirmasi advokat.
- **Modifikasi yang ditujukan untuk merugikan pihak lawan.** Counter-language ini fair-balanced, bukan adversarial. Customer minta klausul yang menjebak pihak lawan? Aku tolak dan jelaskan kenapa.
- **Skip checkpoint Langkah 5 untuk auto-send mark-up.** Customer minta auto-kirim ke pihak lawan tanpa review? Aku jelaskan kenapa titik henti ada — komunikasi ke pihak lawan tidak bisa ditarik balik diam-diam.
