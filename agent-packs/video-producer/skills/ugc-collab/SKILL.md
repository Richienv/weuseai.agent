---
skill_kind: playbook
name: ugc-collab
bundle: video-producer
flow_state_playbook_id: ugc-collab
total_steps: 8
use_cases:
  - "Brand mau engage creator UGC Indonesia untuk satu kampanye — dari shortlist sampai final asset approval"
  - "Customer perlu draft outreach + kontrak siap kirim ke creator, bukan cuma daftar nama"
  - "Tim brand mau alur konsisten tiap rekrut creator baru, tanpa nego ulang flow tiap kali"
  - "Kolaborasi UGC pakai contract terms peer-to-peer Indonesia (IDR, usage rights time-bounded, do's & don'ts lokal)"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer bisa menyebut brand context, produk, target audience, dan budget range"
  - "Customer punya legal capacity menandatangani kontrak UGC atas nama brand"
escalation_to: customer
---

# ugc-collab — video-producer playbook

Playbook ini menjalankan satu siklus kolaborasi UGC creator dari brief awal sampai final usage approval. Shortlist creator, outreach drafts, kontrak terms, kickoff brief, dan asset review dirangkai berurutan dengan satu titik henti untuk pilih creator dan satu titik henti untuk approve usage akhir.

Bedanya dengan rekrut creator manual: di sini struktur kontrak peer-to-peer Indonesia tertata sejak Langkah 4 — IDR breakdown, usage rights time-bounded (default 6 bulan in-platform + 3 bulan out-of-platform), do's & don'ts kalibrasi Indonesia. Customer tetap pegang keputusan siapa yang dipilih dan kapan asset disetujui untuk dipakai.

## Kapan dipakai

Customer mau engage UGC creator Indonesia untuk kampanye brand. Trigger phrases:

- "carikan creator UGC buat kampanye ini"
- "mau collab sama micro-influencer Indonesia"
- "rangkai outreach + kontrak buat 3 creator"
- "bantuin rekrut talent UGC, draft kontraknya juga"
- "kolaborasi UGC dari shortlist sampai final asset"

Kalau customer cuma minta satu surface — "kasih daftar creator aja", "draft kontrak buat 1 creator yang udah aku pilih" — pakai surface tunggal yang sesuai, bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berhari-hari antara outreach, balasan creator, dan delivery asset.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "ugc-collab", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai: `start`, `get`, `advance`, `complete`, `abort`. Status run: `in_progress`, `awaiting_customer`, `escalated`, `completed`, `aborted`.

Dua gerbang aktif — Langkah 5 (checkpoint creator selection) dan Langkah 8 (checkpoint usage approval). Tidak ada kontrak yang dikirim sebelum customer pilih, tidak ada asset yang dipakai sebelum customer approve.

## Langkah-langkah

### Langkah 1 — Intake brand brief  ·  estimasi 2-3 menit

- **Aksi:** Tarik konteks dari pesan customer. Identifikasi `brand_name`, `product_or_campaign`, `target_audience` (demographic, geo, niche), `format_preferred` (TikTok / Reels / Shorts), `budget_range_idr` (min-max per creator), `usage_scope` (in-platform / out-of-platform / both), dan `timeline_target`. Kalau salah satu field belum jelas, tanya satu pertanyaan tertutup. Panggil `start` dengan `total_steps: 8`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan customer berisi brand brief — minimal produk, target audience, dan budget range.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "brand_name", "product_or_campaign", "target_audience", "format_preferred", "budget_range_idr", "usage_scope", "timeline_target" }`.
- **Validasi:** `budget_range_idr` masuk akal untuk format (UGC creator Indonesia tier micro umumnya Rp 500rb - Rp 5jt per video, tier mid Rp 5jt - Rp 25jt). `usage_scope` salah satu nilai enum.
- **Gerbang eskalasi:** `none`. Klarifikasi field intake adalah pertanyaan pembuka biasa, bukan parkir state-machine.

### Langkah 2 — Susun creator shortlist  ·  estimasi 3-5 menit

- **Aksi:** Susun shortlist 5-10 creator yang fit kriteria — Indonesia-relevant (audience demographic, bahasa konten), format-fit (mereka memang produksi di `format_preferred`), budget-fit (rate card mereka di dalam atau dekat `budget_range_idr`). Surface info publik creator (handle, follower count range, niche, contoh konten terakhir). Bukan scraping — surface yang customer bisa verifikasi sendiri di platform.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** Objek intake dari `state_data` — `target_audience`, `format_preferred`, `budget_range_idr`, `usage_scope`.
- **Output yang diharapkan:** Shortlist ke `step_output` — `{ "shortlist": [ { "handle", "platform", "follower_range", "niche", "estimated_rate_idr", "fit_note", "sample_content_url" } ], "total_candidates", "filter_summary" }`. `filter_summary` menjelaskan kriteria yang dipakai supaya customer bisa minta adjust.
- **Validasi:** Tiap entry punya minimal handle dan fit_note. Tidak ada klaim "verified influencer" atau angka follower presisi yang tidak bisa dicek.
- **Gerbang eskalasi:** `none`. Shortlist dibawa ke Langkah 3 untuk draft outreach paralel.

### Langkah 3 — Draft outreach per creator  ·  estimasi 2-4 menit

- **Aksi:** Susun draft pesan outreach untuk tiap entry shortlist. Tone peer-to-peer (bukan talent-for-hire korporat), Bahasa Indonesia casual yang fit register creator, sebut nama spesifik mereka, satu hook personal dari konten terakhir mereka, dan ringkasan brief proyek (brand, durasi engagement, budget range, timeline). Tidak include kontrak penuh di outreach — itu Langkah 4.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** `shortlist` dari `state_data`, `brand_name` dan `product_or_campaign` dari Langkah 1.
- **Output yang diharapkan:** Outreach drafts ke `step_output` — `{ "outreach_drafts": [ { "creator_handle", "channel": "dm"|"email", "message_text", "tone_note" } ] }`.
- **Validasi:** Tiap draft personal ke creator yang dimaksud — bukan template copy-paste. Tidak ada banned words brand voice. Tidak ada exclamation marks.
- **Gerbang eskalasi:** `none`. Outreach drafts dibawa ke Langkah 5 untuk customer pilih siapa yang ditembak.

### Langkah 4 — Susun contract terms summary  ·  estimasi 2-3 menit

- **Aksi:** Susun ringkasan kontrak UGC pakai template `indonesia/creator-brief-ugc-id.md`. Struktur — payment breakdown IDR (script fee / production fee / usage rights fee, format titik thousand), usage rights time-bounded (default 6 bulan in-platform + 3 bulan out-of-platform sesuai `usage_scope`), revision rounds (default 1 round), delivery deadline, do's & don'ts kalibrasi Indonesia (agama / politik / disclosure / attribution convention), termination clauses. Contract berlaku sebagai dokumen base — variant per-creator menyesuaikan rate masing-masing.
- **Tautan/endpoint:** Template `indonesia/creator-brief-ugc-id.md`
- **Input yang diharapkan:** `budget_range_idr`, `usage_scope`, `timeline_target` dari `state_data` (Langkah 1), `shortlist` dari Langkah 2 untuk reference rate masing-masing.
- **Output yang diharapkan:** Contract terms ke `step_output` — `{ "contract_base": { "payment_structure", "usage_rights_terms", "revision_policy", "delivery_terms", "dos_donts", "termination_clauses" }, "per_creator_rate_variants": [ { "creator_handle", "negotiated_rate_idr" } ], "template_used": "indonesia/creator-brief-ugc-id.md" }`.
- **Validasi:** Payment breakdown mencakup tiga komponen (script / production / usage rights). Usage rights time-bounded dengan tanggal eksplisit. Do's & don'ts include disclosure convention Indonesia (label `#kerjasama` atau `#ad` per regulasi UU PDP relevan).
- **Gerbang eskalasi:** `none`. Contract base dibawa ke Langkah 5 sebagai bagian paket yang ditampilkan customer.

### Langkah 5 — Checkpoint creator selection  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `shortlist`, `outreach_drafts`, dan `contract_base` ke customer sebagai satu paket. `advance` dengan `set_status: "awaiting_customer"` dan tanya pertanyaan tertutup — "Dari shortlist ini, mana yang mau aku tembak duluan? Bisa pilih semua, beberapa, atau adjust shortlist dulu." Berhenti dan tunggu balasan.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `shortlist`, `outreach_drafts`, `contract_base` dari `state_data`.
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan ke `step_output` — `{ "selected_creators": [ "<handle>", ... ], "outreach_sent_count", "shortlist_adjusted": true|false }`. Kalau customer adjust shortlist, ulangi Langkah 2 dengan kriteria baru sebelum kembali ke Langkah 5.
- **Validasi:** `selected_creators` adalah subset dari `shortlist` handles. Customer memberikan keputusan eksplisit per creator.
- **Gerbang eskalasi:** `checkpoint`. Aku tidak kirim outreach atas keputusan sendiri — pemilihan creator selalu di tangan customer. Yang aku sampaikan saat memarkir: shortlist plus draft outreach plus ringkasan kontrak, lalu satu pertanyaan tertutup.

### Langkah 6 — Kirim kickoff brief ke creator terpilih  ·  estimasi 2-3 menit

- **Aksi:** Setelah customer pilih, susun kickoff brief per creator terpilih — gabung outreach Langkah 3 dengan kontrak Langkah 4 yang sudah disesuaikan rate creator masing-masing. Brief mencakup: ringkasan brand dan produk, deliverable spesifik (jenis konten, jumlah, format), creative direction (do's & don'ts plus reference), payment terms, timeline dengan milestone, dan kontak customer untuk Q&A. Kalau customer minta aku kirim langsung via channel terhubung (email digest atau DM), aku draft dan tahan untuk customer approve sebelum send.
- **Tautan/endpoint:** Template `indonesia/creator-brief-ugc-id.md` (final assembled version) plus channel terhubung customer kalau dipakai
- **Input yang diharapkan:** `selected_creators` dari Langkah 5, `outreach_drafts` dari Langkah 3, `contract_base` dari Langkah 4.
- **Output yang diharapkan:** Kickoff bundles ke `step_output` — `{ "kickoff_briefs": [ { "creator_handle", "brief_text", "contract_attached": true|false, "send_status": "ready"|"sent"|"customer_holds" } ], "delivery_channel" }`.
- **Validasi:** Tiap brief mencakup deliverable + payment + timeline minimal. Tidak ada brief yang dikirim sebelum customer approve mode pengiriman.
- **Gerbang eskalasi:** `none`. Pengiriman aktual tetap di tangan customer atau via approve eksplisit — playbook tidak auto-send tanpa customer setuju.

### Langkah 7 — Review asset hasil produksi  ·  estimasi 3-5 menit

- **Aksi:** Saat creator deliver asset (video file, caption draft, attribution note), tarik dan susun ringkasan review per asset — apakah memenuhi creative direction Langkah 6, apakah disclosure convention dipakai, apakah do's & don'ts dipatuhi, dan apakah kualitas teknis (resolusi, durasi, audio) sesuai brief. Flag mismatch untuk customer.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** Asset dari creator (link drive, file, atau forward dari customer), `kickoff_briefs` dari `state_data` untuk reference brief asli.
- **Output yang diharapkan:** Review summary ke `step_output` — `{ "asset_reviews": [ { "creator_handle", "asset_url", "brief_compliance_score": "match"|"partial"|"mismatch", "disclosure_present": true|false, "technical_check_passed": true|false, "issues_flagged": [...], "suggested_revision_note" } ] }`.
- **Validasi:** Setiap asset di-review terhadap brief asli, bukan terhadap selera estetik tanpa anchor. Issues flagged spesifik (mis. "disclosure label tidak ada di caption", bukan "asset kurang oke").
- **Gerbang eskalasi:** `none`. Review summary dibawa ke Langkah 8 untuk keputusan final customer.

### Langkah 8 — Checkpoint final usage approval  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `asset_reviews` lengkap ke customer per creator. `advance` dengan `set_status: "awaiting_customer"` dan tanya pertanyaan tertutup — "Asset mana yang kamu approve untuk publish? Mana yang butuh revisi dulu?". Berhenti dan tunggu balasan. Saat customer approve semua atau menyelesaikan revisi cycle, panggil `complete`. Kalau ada revisi yang butuh balikan ke creator, draft revision request ringkas dan tahan untuk customer approve sebelum kirim.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`, lalu `complete` saat semua asset disetujui atau di-decline final
- **Input yang diharapkan:** `asset_reviews` dari `state_data` (Langkah 7), `contract_base` untuk reference usage rights terms.
- **Output yang diharapkan:** Final approval map ke `step_output` — `{ "approval_map": [ { "creator_handle", "asset_url", "status": "approved"|"revision_requested"|"rejected", "usage_window_start", "usage_window_end" } ], "all_assets_resolved": true }`. Run berstatus `completed`. Usage window mengikuti `usage_scope` Langkah 1.
- **Validasi:** Setiap asset punya status eksplisit. Kalau ada revision_requested, alur loop balik ke Langkah 7 setelah creator deliver versi baru, sampai approval_map all_assets_resolved true.
- **Gerbang eskalasi:** `checkpoint`. Aku tidak approve usage atas nama customer — keputusan dipakai-atau-tidak ada di customer. Yang aku sampaikan saat memarkir: review summary plus pengingat usage rights window dari kontrak, lalu satu pertanyaan tertutup.

## Voice signature

- Bahasa Indonesia primer
- "kamu" bukan "Anda"
- Tone peer-to-peer dengan creator, profesional dengan customer
- Tidak ada nama backend terlihat customer atau creator
- Kalimat pendek, satu ide per kalimat
- Calm-premium register
- Zero exclamation marks

## Decline criteria

- **Outreach atas keputusan sendiri.** Langkah 5 selalu aktif. Aku tidak kirim DM atau email ke creator sebelum customer pilih siapa yang ditembak.
- **Usage approval tanpa customer.** Langkah 8 selalu aktif. Aku tidak approve asset untuk dipakai brand atas nama customer — keputusan itu legal dan strategis, bukan tugas saya.
- **Klaim creator metrics yang tidak bisa diverifikasi.** Shortlist surface follower range dan niche, bukan klaim engagement rate presisi tanpa data customer bisa cek di platform sendiri.
- **Kontrak tanpa disclosure convention Indonesia.** Contract terms include label `#kerjasama` atau `#ad` di do's. Kalau customer minta hilangkan, aku tanya dulu — disclosure adalah convention Indonesia yang melindungi brand dan creator dari masalah regulator.
- **Outreach atau brief dalam English ke creator Indonesia.** Default Bahasa Indonesia casual peer-to-peer. Kalau creator sendiri yang switch ke English, aku ikuti — tapi inisiasi tetap BI.
