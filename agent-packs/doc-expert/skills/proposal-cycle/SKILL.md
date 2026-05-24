---
skill_kind: playbook
name: proposal-cycle
bundle: doc-expert
flow_state_playbook_id: proposal-cycle
total_steps: 7
use_cases:
  - "Customer dapat brief dari calon klien dan butuh kirim proposal layanan yang rapi"
  - "Customer mau standardisasi flow proposal supaya tiap deal punya cover letter, scope, timeline, pricing, dan terms"
  - "Customer mau track proposal yang sudah dikirim — sudah dibuka belum, ada respon belum"
prerequisites:
  - "Customer tier Pro atau Studio"
  - "Sudah ada minimal satu template proposal default yang dipilih customer — proposal-services atau proposal-fixed-bid"
  - "Customer punya rate card atau price list yang bisa direferensi untuk seksi pricing IDR"
escalation_to: customer
---

# proposal-cycle — doc-expert playbook

Playbook ini menjalankan satu siklus pengiriman proposal layanan dari intake brief klien sampai tracking respon. Alurnya: catat brief, riset cepat profil klien, draft proposal lengkap (cover letter, scope, timeline, pricing IDR, terms), checkpoint review untuk customer, final polish, kirim, lalu pasang tracker open dan respon.

Bedanya dengan memanggil template `proposal-services` langsung: di sini alurnya menggabungkan riset klien, checkpoint review, dan tracking. Untuk render proposal cepat tanpa siklus, pakai template langsung.

## Kapan dipakai

Customer dapat lead baru yang minta proposal, atau mau standardisasi flow proposal supaya tidak ad-hoc. Trigger phrases:

- "bikin proposal untuk klien X"
- "draft proposal layanan"
- "buatkan proposal harga tetap"
- "kirim proposal ke prospek"
- "track proposal yang sudah dikirim"

Kalau customer cuma minta render satu seksi tanpa proses penuh, pakai template langsung di mode generator.

## Cara kerja

Playbook dijalankan engine `flow-state` yang sama dengan playbook lain. Engine menyimpan posisi langkah dan output tiap langkah supaya alur tetap utuh walau ada jeda antara draft, review customer, dan pengiriman.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "proposal-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai: `start`, `get`, `advance`, `complete`, `abort` — sama dengan playbook lain.

## Langkah-langkah

### Langkah 1 — Intake brief proposal dan tujuan klien  ·  estimasi 2-3 menit

- **Aksi:** Catat brief dari customer — nama calon klien, industri, kebutuhan inti, scope yang diminta, budget range kalau disebut, deadline pengiriman. Konfirmasi template default mana yang dipakai (`proposal-services` untuk konsultatif, `proposal-fixed-bid` untuk scope-jelas dengan milestone). Panggil `start` flow-state dengan `total_steps: 7`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan customer berisi brief — minimal nama klien, kebutuhan, dan target deadline.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "client_name", "client_industry", "client_need", "scope_requested", "budget_range_idr"?, "deadline", "template_default": "proposal-services"|"proposal-fixed-bid" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** Brief minimal punya nama klien, kebutuhan, dan deadline yang masuk akal. `template_default` salah satu dari dua nilai enum.

  | Kondisi | Tindakan |
  |---|---|
  | Brief lengkap dengan template default tersedia | Lanjut, `advance` ke Langkah 2 |
  | Brief kurang detail kebutuhan | Tetap di Langkah 1, tanya satu pertanyaan tertutup ke customer untuk melengkapi |
  | Customer belum pilih template default | Tetap di Langkah 1, tanya "Kamu mau pakai proposal-services (konsultatif) atau proposal-fixed-bid (scope dengan milestone)?" |

- **Gerbang eskalasi:** `none`. Pertanyaan pelengkap brief adalah pembuka biasa, bukan parkir state-machine.

### Langkah 2 — Riset cepat profil klien dan konteks industri  ·  estimasi 3-5 menit

- **Aksi:** Lakukan riset ringan untuk konteks penyusunan proposal — info publik klien (website, LinkedIn, berita terbaru), ukuran tim, produk utama. Catat 2-3 poin yang bisa dijahit ke cover letter untuk menunjukkan kamu paham klien. Jangan lebih dari 5 menit — riset ini supaya tone proposal pas, bukan untuk due diligence.
- **Tautan/endpoint:** `hermes-skill:web-research` mode `quick-profile`
- **Input yang diharapkan:** `client_name` dan `client_industry` dari `state_data`.
- **Output yang diharapkan:** Profil ringkas ke `step_output` — `{ "client_summary": "string ≤200 kata", "talking_points": ["point 1", "point 2", "point 3"], "sources": ["url1", "url2"] }`. Talking points dipakai di Langkah 3 untuk personalisasi cover letter.
- **Validasi:** Talking points spesifik ke klien, bukan generic. Sources punya minimal satu URL yang bisa diverifikasi.

  | Kondisi | Tindakan |
  |---|---|
  | Profil ketemu | `advance` ke Langkah 3 |
  | Profil minim publik | `advance` ke Langkah 3 dengan `talking_points: []`, cover letter pakai tone netral profesional |
  | Klien punya kontroversi recent | `advance` ke Langkah 3 dengan flag, customer diberitahu di Langkah 4 supaya bisa decide lanjut atau tidak |

- **Gerbang eskalasi:** `none`. Riset ringan tidak butuh review customer di tahap ini.

### Langkah 3 — Draft semua seksi proposal pakai template default  ·  estimasi 5-8 menit

- **Aksi:** Untuk template yang dipilih, render lima seksi inti — cover letter (jahit talking points dari Langkah 2), scope (breakdown deliverable), timeline (fase dengan estimasi minggu), pricing IDR (line items dengan total, format `Rp 1.250.000` titik thousand tanpa desimal), terms (payment terms, IP, force majeure singkat). Pastikan pricing pakai rate card customer kalau ada.
- **Tautan/endpoint:** `edge-fn:doc-expert-handler` mode `proposal-draft`
- **Input yang diharapkan:** `state_data` lengkap dari Langkah 1-2 plus rate card customer dari profile.
- **Output yang diharapkan:** Draft proposal ke `step_output` — `{ "cover_letter_md", "scope_md", "timeline_md", "pricing_md", "pricing_total_idr", "terms_md", "html_url", "pdf_url"? }`.
- **Validasi:** Lima seksi semua terisi. Pricing total cocok dengan jumlah line items. Format IDR konsisten (titik thousand). Cover letter menyebut minimal satu talking point spesifik klien.

  | Kondisi | Tindakan |
  |---|---|
  | Lima seksi sukses dirender | `advance` ke Langkah 4 |
  | Pricing line items tidak match dengan rate card | Ulangi render seksi pricing dengan referensi rate card yang benar |
  | Cover letter terdengar generic | Regenerate cover letter dengan instruksi eksplisit pakai talking points |

- **Gerbang eskalasi:** `none`. Draft dibawa ke Langkah 4 untuk review customer.

### Langkah 4 — Checkpoint review draft proposal ke customer  ·  estimasi tunggu customer

- **Aksi:** Kirim ringkasan draft ke customer — judul, total pricing IDR, link preview HTML, daftar 3 poin yang mungkin perlu adjust (mis. budget di luar range klien, timeline ketat, terms keras). `advance` dengan `set_status: "awaiting_customer"`. Tunggu balasan customer berisi approve, edit, atau batal.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** Draft lengkap dari `state_data` (hasil Langkah 3).
- **Output yang diharapkan:** Saat parkir, `step_output` berisi `{ "review_sent_at" }`. Saat customer balas, rekam `{ "review_approved": true|false, "edits": [...] }` dan lanjut sesuai jalur.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — approve, request edit dengan detail field yang mau diubah, atau batal.

  | Balasan customer | Tindakan |
  |---|---|
  | "approve" / "kirim" / "lanjut" | Rekam `review_approved: true`, `advance` ke Langkah 5 |
  | Minta revisi (mis. turun pricing, geser timeline, ubah scope) | Terapkan revisi ke draft yang relevan, tampilkan versi baru, parkir lagi `awaiting_customer` |
  | "batal" | Panggil `abort`, draft tetap tersimpan sebagai history |

- **Gerbang eskalasi:** `checkpoint` selalu aktif. Proposal yang keluar pintu tidak bisa ditarik balik diam-diam. Yang agent sampaikan saat memarkir: ringkasan draft plus satu pertanyaan tertutup — "Aku kirim proposal ini ke klien, atau ada yang mau kamu adjust dulu?".

### Langkah 5 — Final polish dan render versi pengiriman  ·  estimasi 2-3 menit

- **Aksi:** Terapkan edit terakhir dari Langkah 4 ke draft, jalankan voice consistency check (bahasa profesional, zero exclamation marks, no banned words), render versi final ke PDF siap kirim. Catat versi final supaya bisa dilampirkan di email.
- **Tautan/endpoint:** `hermes-skill:doc-polish` mode `proposal-final`
- **Input yang diharapkan:** Draft post-Langkah 4 dengan `edits` yang sudah diterapkan.
- **Output yang diharapkan:** Versi final ke `step_output` — `{ "final_html_url", "final_pdf_url", "version_tag": "v1"|"v2"|..., "polish_notes": [...] }`.
- **Validasi:** PDF render tanpa error. Voice check tidak menemukan exclamation mark atau banned word. Pricing IDR konsisten antara HTML dan PDF.

  | Kondisi | Tindakan |
  |---|---|
  | Final sukses dirender dan lolos voice check | `advance` ke Langkah 6 |
  | Voice check menemukan banned word atau exclamation | Auto-fix instance yang ketangkap, regenerate seksi yang terdampak, ulang voice check |
  | PDF gagal render | Ulangi render sekali, lalu kirim HTML link saja kalau tetap gagal dengan catatan |

- **Gerbang eskalasi:** `none`. Review sudah dilakukan di Langkah 4, polish ini administrative.

### Langkah 6 — Kirim proposal ke klien via email  ·  estimasi 2-3 menit

- **Aksi:** Kirim email ke klien dengan attachment PDF proposal dan link preview HTML. Pakai template `email-formal.md` register profesional. Isi subject dengan format "Proposal [layanan] untuk [client_name] — [versi]". Catat `sent_at` dan `email_to`.
- **Tautan/endpoint:** `hermes-skill:email-sender` mode `proposal-delivery`
- **Input yang diharapkan:** Final dari `state_data` (post Langkah 5) plus email kontak klien dari brief.
- **Output yang diharapkan:** Konfirmasi pengiriman ke `step_output` — `{ "sent_at", "email_to", "subject", "tracking_pixel_id"? }`. Tracking pixel opsional — hanya kalau customer enable di setting.
- **Validasi:** Pengiriman sukses dengan timestamp valid. Email klien terformat benar dan bisa diverifikasi syntax.

  | Kondisi | Tindakan |
  |---|---|
  | Kirim sukses | `advance` ke Langkah 7 |
  | Email klien bounce | Tetap di Langkah 6, sampaikan ke customer untuk konfirmasi email yang benar |
  | Customer minta kirim via channel lain (WhatsApp, LinkedIn) | Catat ke `step_output.delivery_channel`, customer kirim manual, `advance` dengan flag |

- **Gerbang eskalasi:** `none`. Pengiriman sudah disetujui di Langkah 4.

### Langkah 7 — Track open dan respon, tutup siklus  ·  estimasi 1-2 menit

- **Aksi:** Pasang entry tracker proposal — `client_name`, `version_tag`, `sent_at`, `pricing_total_idr`, `status: "sent"`, `follow_up_due` (default 5 hari kerja dari sent). Kirim konfirmasi ringkasan ke customer via Telegram berisi link tracker dan reminder jadwal follow-up. Panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:proposal-tracker` mode `record-and-summarize`, lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** Seluruh `state_data` — hasil Langkah 1 sampai 6.
- **Output yang diharapkan:** Ringkasan final ke `step_output` — `{ "tracker_id", "summary_sent_at", "follow_up_due", "version_tag", "pricing_total_idr" }`. Run berstatus `completed`.
- **Validasi:** Tracker entry punya ID unik. Ringkasan terkirim ke Telegram customer.

  | Kondisi | Tindakan |
  |---|---|
  | Tracker dan ringkasan sukses | `complete`, siklus selesai |
  | Ringkasan gagal kirim | Jangan `complete`, tahan summary di `state_data`, retry channel berikutnya |
  | Klien sudah balas sebelum tracker pasang | Catat respon awal ke tracker, set `status: "responded"`, lanjut `complete` |

- **Gerbang eskalasi:** `none`. Langkah penutup.

## Voice signature

- Bahasa Indonesia primer
- "kamu", bukan "Anda"
- Tidak ada nama backend terlihat oleh customer
- Kalimat pendek, satu ide per kalimat
- Nada konsultatif-profesional — bicara dalam framing layanan, scope, dan kesepakatan
- Zero exclamation marks

## Decline criteria

- **Proposal dengan pricing di bawah cost customer.** Kalau pricing yang diminta menutup kurang dari cost-base customer, aku tanya dulu sebelum render. Margin negatif bukan keputusan otomatis.
- **Klaim layanan yang tidak match dengan kapasitas customer.** Aku tidak menulis scope yang customer belum bisa deliver. Konfirmasi kapasitas dulu sebelum draft scope ambisius.
- **Cover letter dengan klaim klien yang belum diverifikasi.** Talking points harus punya source di Langkah 2. Tidak ada bagging "kami tahu industri Anda mendalam" tanpa bukti.
- **Skip checkpoint Langkah 4 untuk batch besar.** Customer minta auto-send tanpa review? Aku jelaskan kenapa review ada — proposal yang sampai klien tidak bisa ditarik balik diam-diam.
