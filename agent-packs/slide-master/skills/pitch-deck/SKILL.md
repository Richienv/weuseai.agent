---
skill_kind: playbook
name: pitch-deck
bundle: slide-master
flow_state_playbook_id: pitch-deck
total_steps: 6
use_cases:
  - "Pitch deck untuk investor — round size, traction, dan ask jadi satu deck siap presentasi"
  - "Customer-facing pitch — konteks audience plus offering jadi deck yang fokus pada outcome"
  - "Internal review deck dengan struktur yang kamu approve dulu sebelum semua slide ditulis"
  - "Deck panjang yang kamu mau lihat kerangkanya dulu, bukan terima 12 slide sekaligus"
prerequisites:
  - "Kamu bisa cerita siapa company atau produk yang mau dipresentasikan"
  - "Kamu tahu audience deck ini (investor, customer, board, atau tim internal)"
  - "Data angka dari kamu — playbook ini tidak mengarang traction atau market size"
escalation_to: customer
---

# pitch-deck — slide-master playbook

Playbook ini menyusun pitch deck dari nol sampai siap kirim dalam enam langkah berurutan: intake, riset fakta pendukung, kerangka cerita, checkpoint approval, draft semua slide, lalu polish dan export.

Bedanya dengan `narrative-arc-deck-builder` yang sekali jalan: playbook ini berhenti di tengah untuk minta kamu approve kerangkanya. Kamu tidak menerima 12 slide jadi yang ternyata strukturnya salah. Kamu lihat alurnya dulu, baru aku tulis tiap slide.

## Kapan dipakai

Trigger phrases:

- "bikin pitch deck dari awal"
- "deck investor, tapi aku mau lihat outline-nya dulu"
- "susun deck step by step"
- "deck buat fundraising"
- "tolong riset dulu baru bikin deck"
- "deck panjang, jangan langsung jadi semua"

Kalau customer minta deck cepat sekali jadi tanpa checkpoint, itu bukan playbook ini — pakai `narrative-arc-deck-builder` (story arc) atau `template-deck-builder` (template library).

## Cara kerja

Playbook ini punya state yang bertahan antar pesan. Progress disimpan di flow-state engine, jadi flow tidak hilang walau ada jeda berhari-hari antar pesan customer.

Kontrak flow-state:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers:
  X-CID: <customer_id>
  Content-Type: application/json
Body: { "customer_id", "playbook_id": "pitch-deck", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi: `start` (mulai atau restart — butuh `total_steps`, reset ke langkah 1, status `in_progress`), `get` (baca run aktif — current_step, status, state_data), `advance` (catat output langkah ini via `step_output` yang di-shallow-merge ke state_data, geser cursor +1, opsional `set_status`), `complete`, `abort`.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer), `escalated` (parkir di gerbang keras — butuh approval eksplisit customer), `completed`, `aborted`.

Loop runtime:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 6`.
2. Setiap pesan customer berikutnya → panggil `get` dulu. Baca `current_step` plus `state_data` yang sudah terkumpul. Jalankan langkah itu. Lalu `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → `advance` dengan `set_status` `awaiting_customer` (checkpoint lunak) atau `escalated` (gerbang keras). Sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer balas, invokasi berikutnya `get` lagi, lihat status parkir, dan lanjut dari situ.
5. Langkah 6 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

## Langkah-langkah

### Langkah 1 — Intake brief  ·  estimasi 3-5 menit

- **Aksi:** Kumpulkan konteks dasar deck dari customer — audience, goal presentasi, dan fakta company atau produk. Kalau customer belum sebut salah satu, tanyakan dalam satu pesan ringkas, jangan satu pertanyaan per giliran.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start` (`total_steps: 6`), lalu `advance` di akhir langkah.
- **Input yang diharapkan:** Pesan customer berisi deskripsi company atau produk. Idealnya juga audience dan goal.
- **Output yang diharapkan:** `step_output` berisi `{ audience, goal, company_facts, duration_minutes? }`. `audience` salah satu dari investor, customer, board, internal-team. `goal` kalimat singkat tujuan deck.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | `audience` plus `goal` plus `company_facts` lengkap | `advance`, lanjut Langkah 2 |
  | Salah satu kosong | Tanya field yang kurang dalam satu pesan, tunggu balasan, ulangi Langkah 1 |

- **Gerbang eskalasi:** `none`. Langkah ini auto-advance begitu tiga field terisi.
- **Error handling:** Kalau `start` gagal, coba ulang `start` sekali. Kalau masih gagal, sampaikan ke customer bahwa playbook belum bisa dimulai dan minta dia kirim ulang sebentar lagi. Jangan lanjut ke Langkah 2 tanpa run aktif.

### Langkah 2 — Riset fakta pendukung  ·  estimasi 5-10 menit

- **Aksi:** Kumpulkan fakta dan angka yang menopang cerita deck — market size, konteks kompetitor, tren industri. Pakai web search untuk konteks publik. Angka traction dan metrik internal tetap dari customer, bukan dari web.
- **Tautan/endpoint:** Hermes web-search built-in. Output tidak punya endpoint eksternal lain.
- **Input yang diharapkan:** `state_data.company_facts` dan `state_data.audience` dari Langkah 1. Data angka tambahan dari customer kalau dia kirim.
- **Output yang diharapkan:** `step_output` berisi `{ research_notes, data_points }`. `research_notes` daftar fakta dengan source. `data_points` array angka, tiap item ditandai `source: customer` atau `source: research` atau `source: needed`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Fakta cukup untuk menopang klaim utama deck | `advance`, lanjut Langkah 3 |
  | Ada klaim yang butuh angka tapi customer belum kasih | Tandai item itu `source: needed`, lanjut — slide-nya nanti pakai label `[data needed]` |

- **Gerbang eskalasi:** `none`. Tapi kalau customer minta angka yang tidak ada source-nya (misal "growth 200% YoY" tanpa data), jangan karang. Tandai `source: needed` dan teruskan.
- **Error handling:** Kalau web search gagal atau hasil kosong, ulang search sekali dengan query lebih luas. Kalau masih kosong, lanjut dengan fakta dari customer saja dan catat keterbatasan ini di `research_notes`. Jangan ulang seluruh playbook.

### Langkah 3 — Susun kerangka cerita  ·  estimasi 5-8 menit

- **Aksi:** Susun kerangka deck slide-by-slide pakai story arc problem → solution → market → traction → ask. Tiap slide dapat judul singkat dan satu baris key visual brief. Belum tulis speaker notes, belum isi detail.
- **Tautan/endpoint:** `hermes-skill:narrative-arc-deck-builder` — pinjam logika story arc-nya untuk struktur 12 slide.
- **Input yang diharapkan:** `state_data` dari Langkah 1 dan 2 — audience, goal, company_facts, research_notes, data_points.
- **Output yang diharapkan:** `step_output` berisi `{ outline }`. `outline` array slide, tiap item `{ slide_no, title, arc_act, visual_brief }`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Outline mencakup kelima act dan jumlah slide sesuai durasi | Lanjut ke Langkah 4 untuk checkpoint |
  | Outline lebih dari 15 slide tanpa permintaan eksplisit | Rapikan ke 12-15 slide dulu sebelum checkpoint |

- **Gerbang eskalasi:** `none`. Kerangka belum ditunjukkan ke customer di langkah ini — itu tugas Langkah 4.
- **Error handling:** Kalau outline tidak bisa disusun karena `state_data` kurang, kembali ke Langkah 1 atau 2 untuk field yang hilang, bukan abort. Setelah field lengkap, ulang Langkah 3.

### Langkah 4 — Checkpoint approval kerangka  ·  estimasi tergantung customer

- **Aksi:** Tunjukkan kerangka dari Langkah 3 ke customer — daftar slide dengan judul dan key visual brief. Minta dia approve atau kasih revisi sebelum aku draft semua slide. Ini titik berhenti utama playbook.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`.
- **Input yang diharapkan:** `state_data.outline` dari Langkah 3.
- **Output yang diharapkan:** Setelah customer balas — `step_output` berisi `{ outline_approved: true }` atau `{ outline: <revisi>, outline_approved: true }`.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | Customer setuju ("oke", "lanjut", "approve") | `advance` dengan `outline_approved: true`, lanjut Langkah 5 |
  | Customer minta revisi | Terapkan revisi ke outline, tunjukkan versi baru, parkir lagi `awaiting_customer` |
  | Customer belum balas | Run tetap di `awaiting_customer`, tidak ada aksi |

- **Gerbang eskalasi:** `checkpoint`. Pemicu: kerangka deck sudah jadi dan siap di-draft. Aku berhenti dan kirim ke customer:

  > Kerangka deck-nya sudah jadi: [N] slide, story arc problem → solution → market → traction → ask. Tiap slide ada judul dan key visual brief di bawah. Sebelum aku tulis isi semua slide, mau aku lanjut dengan struktur ini, atau ada slide yang mau kamu geser dulu?

  Setelah pesan ini, kembalikan kontrol. Jangan draft slide apa pun sampai customer approve.
- **Error handling:** Kalau `advance` dengan `set_status` gagal, ulang sekali. Kalau masih gagal, tetap kirim kerangka ke customer dan minta dia balas — saat dia balas, `get` akan tetap menunjukkan Langkah 4 dan checkpoint bisa diselesaikan.

### Langkah 5 — Draft semua slide  ·  estimasi 10-15 menit

- **Aksi:** Tulis isi tiap slide sesuai outline yang sudah di-approve — support bullet, key visual, dan speaker notes 50-80 kata per slide. Pakai template deck yang dipilih customer kalau ada; default story-arc 12 slide.
- **Tautan/endpoint:** `hermes-skill:narrative-arc-deck-builder` untuk mode story-arc, atau `hermes-skill:template-deck-builder` kalau customer pilih template tertentu dari library.
- **Input yang diharapkan:** `state_data.outline` (sudah approved), `state_data.data_points`, `state_data.research_notes`.
- **Output yang diharapkan:** `step_output` berisi `{ deck_draft_path, slide_count }`. Markdown deck ditulis ke `/tmp/slide-master-out/deck-pitch-<slug>-<timestamp>.md`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Semua slide punya judul, visual brief, speaker notes | `advance`, lanjut Langkah 6 |
  | Ada slide yang butuh data customer | Isi placeholder `[data needed]`, tetap `advance` — polish di Langkah 6 |

- **Gerbang eskalasi:** `none`. Outline sudah di-approve di Langkah 4, jadi draft jalan tanpa berhenti.
- **Error handling:** Kalau generasi gagal di tengah, ulang Langkah 5 saja — outline approved sudah aman di `state_data`, tidak perlu ulang dari Langkah 1. Kalau satu slide gagal, draft ulang slide itu, bukan seluruh deck.

### Langkah 6 — Polish dan export  ·  estimasi 5-8 menit

- **Aksi:** Rapikan visual hierarchy, konsistensi tone, dan chart brief. Export deck ke format yang customer mau — PowerPoint, Keynote, Google Slides, atau Markdown. Kirim file final ke customer.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete` setelah file terkirim.
- **Input yang diharapkan:** `state_data.deck_draft_path` dari Langkah 5, plus preferensi format dari customer.
- **Output yang diharapkan:** `step_output` berisi `{ final_deck_path, export_format }`. File final di `/tmp/slide-master-out/`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | File final jadi dan path valid | `complete`, kirim deck ke customer |
  | Export ke format spesifik gagal | Kirim versi Markdown sebagai fallback, jelaskan ke customer cara convert via Pandoc |

- **Gerbang eskalasi:** `none`. Langkah penutup — setelah file terkirim, panggil `complete`.
- **Error handling:** Kalau export gagal, jangan abort playbook. Kirim Markdown deck yang sudah jadi dari Langkah 5 sebagai hasil, lalu `complete`. Customer tetap dapat deck-nya.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Zero exclamation marks
- Calm-premium. Aku surface progress tiap langkah selesai, bukan diam lalu kirim deck jadi sekaligus

## Decline criteria

- **Data fabrication.** Kalau customer minta chart dari angka yang tidak ada source-nya, aku decline. Slide-nya pakai placeholder `[data needed]` sampai customer kasih data.
- **Misleading claims.** Tidak nge-frame data dengan cara yang menyesatkan — truncated y-axis, cherry-picked time window. Aku flag kalau request menyiratkan ini.
- **Lewati checkpoint.** Aku tidak draft semua slide sebelum kerangka di-approve di Langkah 4. Kalau customer minta skip checkpoint, arahkan ke `narrative-arc-deck-builder` yang memang sekali jalan.
- **Lebih dari 25 slide tanpa permintaan eksplisit.** Default cap 12-15 slide. Lebih dari itu butuh konfirmasi customer.
