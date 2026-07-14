---
skill_kind: playbook
name: script-to-publish
bundle: video-producer
flow_state_playbook_id: script-to-publish
total_steps: 8
use_cases:
  - "Customer minta video baru dari brief sampai siap publish — TikTok, Reels, atau Shorts"
  - "Brand mau drop konten mingguan dengan alur yang sama tiap kali, tanpa nego ulang struktur"
  - "Creator solo perlu draft script + shot list + caption + hashtag jadi satu bundle siap rekam"
  - "Video format TikTok-ID otomatis pakai template 7s-hook supaya pacing sesuai audience Indonesia"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer bisa menyebut topik, target audience, dan platform tujuan minimal salah satu"
  - "Brand voice sudah ada di SOUL.md atau customer siap menyebut nada yang dipakai"
escalation_to: customer
---

# script-to-publish — video-producer playbook

Playbook ini menjalankan satu siklus produksi video dari brief sampai bundle siap publish. Script, shot list, caption, dan hashtag dirangkai berurutan dengan dua titik henti — satu untuk review script sebelum produksi, satu untuk approval sebelum publish.

Bedanya dengan memanggil `tiktok-script-builder` langsung: di sini alurnya utuh. Script tidak berdiri sendiri — dia ditarik ke shot list, caption, dan hashtag sebagai satu paket koheren. Untuk format TikTok, script draft otomatis pakai template `script-template-tiktok-id-7sec-hook` supaya pacing sesuai audience Indonesia.

## Kapan dipakai

Customer minta video baru dengan alur lengkap, bukan cuma satu surface. Trigger phrases:

- "bikinin video buat [topik]"
- "draftin TikTok soal [niche]"
- "aku mau publish Reels minggu ini, susunin dari script"
- "video produksi lengkap, brief sampai siap upload"
- "rangkai konten dari ide sampai caption"

Kalau customer cuma minta satu surface — "kasih caption aja", "hashtag buat post ini" — pakai `caption-optimizer` atau `hashtag-research` langsung, bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda antara brief, review script, dan approval publish.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "script-to-publish", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai: `start`, `get`, `advance`, `complete`, `abort`. Status run: `in_progress`, `awaiting_customer`, `escalated`, `completed`, `aborted`.

Dua gerbang aktif — Langkah 3 (checkpoint script review) dan Langkah 8 (checkpoint publish approval). Tidak ada publish otomatis tanpa keputusan customer.

## Langkah-langkah

### Langkah 1 — Intake brief video  ·  estimasi 1-2 menit

- **Aksi:** Tarik konteks dari pesan customer. Identifikasi `topic`, `platform` (TikTok / Reels / Shorts / YouTube), `target_audience`, `duration_target` (detik), `cta_intent` (save / share / link / follow), dan `brand_voice_note` kalau ada. Kalau customer belum sebut platform, tanya satu pertanyaan tertutup — "Buat platform apa, TikTok atau Reels?". Panggil `start` dengan `total_steps: 8`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan customer berisi brief — minimal topik dan tujuan video.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "topic", "platform", "target_audience", "duration_target", "cta_intent", "brand_voice_note", "uses_tiktok_id_template": true|false }`. Field `uses_tiktok_id_template` true kalau `platform == "TikTok"` dan target audience Indonesia.
- **Validasi:** `platform` salah satu nilai enum. `duration_target` masuk akal untuk platform (TikTok 15-90s, Reels 15-90s, Shorts 15-60s).
- **Gerbang eskalasi:** `none`. Klarifikasi platform di sini adalah pertanyaan pembuka biasa, bukan parkir state-machine.

### Langkah 2 — Draft script awal  ·  estimasi 3-5 menit

- **Aksi:** Susun draft script dari brief. Kalau `uses_tiktok_id_template == true`, pakai template `indonesia/script-template-tiktok-id-7sec-hook.md` — struktur 7-second-hook, register BI casual TikTok-ID. Kalau bukan TikTok-ID, pakai template script generik per platform. Script tetap mengikuti `brand_voice_note` dan target durasi.
- **Tautan/endpoint:** `hermes-skill:tiktok-script-builder` (untuk TikTok-ID atau TikTok generik) atau template script-pack lain sesuai platform
- **Input yang diharapkan:** Objek intake dari `state_data` — `topic`, `platform`, `duration_target`, `cta_intent`, `brand_voice_note`, `uses_tiktok_id_template`.
- **Output yang diharapkan:** Draft script ke `step_output` — `{ "script_draft": { "hook", "body", "payoff", "cta" }, "estimated_duration_sec", "template_used" }`. `template_used` mencatat nama template supaya audit trail jelas.
- **Validasi:** Hook ada dan masuk window pacing platform. Total estimasi durasi dalam batas toleransi 20 persen dari `duration_target`.
- **Gerbang eskalasi:** `none`. Draft dibawa ke Langkah 3 untuk review customer.

### Langkah 3 — Checkpoint review script  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `script_draft` lengkap ke customer dengan format yang mudah dibaca — hook / body / payoff / CTA tertata. Sebut template yang dipakai. `advance` dengan `set_status: "awaiting_customer"` dan tanya satu pertanyaan tertutup — "Script ini siap aku lanjut ke shot list dan caption, atau ada revisi dulu?". Berhenti dan tunggu balasan.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `script_draft` dan `template_used` dari `state_data`.
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan ke `step_output` — `{ "script_approved": true|false, "script_edits_applied": "<ringkas revisi kalau ada>", "final_script" }`. `final_script` adalah versi yang dipakai langkah berikutnya.
- **Validasi:** Balasan customer harus actionable — approve, revisi konkret, atau batal. Kalau revisi besar, ulangi Langkah 2 dengan brief yang sudah diperbarui sebelum kembali ke Langkah 3.
- **Gerbang eskalasi:** `checkpoint`. Script adalah pondasi shot list dan caption — kalau lanjut tanpa approval, semua langkah berikutnya berdiri di atas asumsi yang belum diverifikasi customer.

### Langkah 4 — Assemble shot list  ·  estimasi 2-3 menit

- **Aksi:** Susun shot list dari `final_script` per scene. Tarik shot type (wide / medium / close / insert), camera move, duration per shot, subject, dan note produksi. Kalau brief menyebut talent berhijab atau setting warung Indonesia, pakai template Indonesia yang relevan (`shot-list-hijab-aware-framing.md` atau `shot-list-warung-makan-product.md`).
- **Tautan/endpoint:** Template `production/shot-list.md` atau template Indonesia spesifik kalau cocok
- **Input yang diharapkan:** `final_script` dari `state_data`, `platform` dan `duration_target` dari Langkah 1.
- **Output yang diharapkan:** Shot list ke `step_output` — `{ "shot_list": [ { "scene_id", "shot_type", "camera_move", "duration_sec", "subject", "notes" } ], "total_shots", "coverage_check_passed" }`. `coverage_check_passed` true kalau 3-shot rule terpenuhi per scene.
- **Validasi:** Setiap scene punya minimal satu shot. Total durasi shot list konsisten dengan `estimated_duration_sec` script.
- **Gerbang eskalasi:** `none`. Shot list adalah artefak teknis yang ikut bundle final — dibawa ke Langkah 8.

### Langkah 5 — Draft caption  ·  estimasi 1-2 menit

- **Aksi:** Susun caption sesuai platform dan brand voice. TikTok ~150 char, Reels ~125 char, Shorts ~100 char. CTA terselip natural, bukan `follow us` generik. Caption mencerminkan hook script tapi berdiri sendiri tanpa nonton dulu.
- **Tautan/endpoint:** `hermes-skill:caption-optimizer`
- **Input yang diharapkan:** `final_script` dan `platform` dari `state_data`, `brand_voice_note` dari Langkah 1, `cta_intent` dari Langkah 1.
- **Output yang diharapkan:** Caption ke `step_output` — `{ "caption_text", "character_count", "cta_phrase", "tone_note" }`.
- **Validasi:** `character_count` di bawah batas platform. CTA selaras dengan `cta_intent` Langkah 1.
- **Gerbang eskalasi:** `none`. Caption dibawa ke Langkah 8 sebagai bagian bundle.

### Langkah 6 — Research hashtag mix  ·  estimasi 2-3 menit

- **Aksi:** Tarik mix hashtag per niche dan topik. Pakai 30/50/20 rule default — emerging tags volume rendah upside tinggi, peak tags saturated, branded tags. Sesuaikan kalau `target_audience` punya hashtag etalase yang lebih spesifik.
- **Tautan/endpoint:** `hermes-skill:hashtag-research`
- **Input yang diharapkan:** `topic`, `platform`, `target_audience` dari `state_data`.
- **Output yang diharapkan:** Hashtag mix ke `step_output` — `{ "hashtags": [ { "tag", "stage": "emerging"|"peak"|"branded" } ], "total_count", "primary_tag" }`. `primary_tag` adalah satu tag utama untuk surface di awal caption kalau perlu.
- **Validasi:** Total hashtag dalam batas platform (TikTok 5-10 efektif, Reels 5-15, Shorts 3-5). Mix mencerminkan rule 30/50/20 atau variant yang disebut customer.
- **Gerbang eskalasi:** `none`. Hashtag dibawa ke Langkah 7 untuk assembly bundle.

### Langkah 7 — Assemble publish-ready bundle  ·  estimasi 1 menit

- **Aksi:** Rangkai semua artefak jadi satu bundle terstruktur — `final_script`, `shot_list`, `caption_text`, `hashtags`, plus metadata (`platform`, `duration_target`, `cta_intent`). Format bundle siap copy-paste atau export sesuai workflow customer.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** Seluruh `state_data` — output Langkah 3, 4, 5, 6.
- **Output yang diharapkan:** Bundle final ke `step_output` — `{ "bundle": { "script", "shot_list", "caption", "hashtags", "metadata" }, "bundle_format": "markdown"|"json" }`. Default `markdown` untuk dibaca customer, `json` kalau customer minta ekspor terstruktur.
- **Validasi:** Bundle mencakup semua section tanpa kosong. Cross-check — caption CTA selaras script CTA, hashtag primer menyebut topik utama.
- **Gerbang eskalasi:** `none`. Bundle dibawa ke Langkah 8 untuk approval akhir.

### Langkah 8 — Checkpoint approval sebelum publish  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `bundle` lengkap ke customer dengan format ringkas — section per artefak. `advance` dengan `set_status: "awaiting_customer"` dan tanya satu pertanyaan tertutup — "Bundle ini siap kamu publish, atau ada yang mau di-adjust dulu?". Berhenti dan tunggu balasan. Saat customer approve, panggil `complete`. Kalau customer minta revisi pada satu artefak, kembali ke langkah yang relevan (Langkah 4 untuk shot list, Langkah 5 untuk caption, Langkah 6 untuk hashtag) dan re-assemble di Langkah 7.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`, lalu `complete` saat customer approve
- **Input yang diharapkan:** `bundle` final dari `state_data` (Langkah 7).
- **Output yang diharapkan:** Konfirmasi approval ke `step_output` — `{ "bundle_approved": true, "notes_for_publish": "<catatan customer kalau ada>" }`. Run berstatus `completed`. Aku tidak publish sendiri — publish dilakukan customer di platform.
- **Validasi:** Customer memberikan keputusan eksplisit. Kalau customer batal, panggil `abort` dan tahan bundle di `state_data` supaya bisa di-resume kalau berubah pikiran.
- **Gerbang eskalasi:** `checkpoint`. Aku tidak pernah publish video atas nama customer — keputusan upload selalu di tangan customer. Yang aku sampaikan saat memarkir: bundle penuh plus pengingat "publish-nya kamu yang pencet upload, ya".

## Voice signature

- Bahasa Indonesia primer
- "kamu" bukan "Anda"
- Tidak ada nama backend terlihat customer
- Kalimat pendek, satu ide per kalimat
- Nada produksi, terstruktur — bicara dalam framing brief, script, shot, caption, hashtag
- Calm-premium register
- Zero exclamation marks

## Decline criteria

- **Publish atas nama customer.** Aku tidak punya akses upload ke akun customer dan tidak akan minta. Bundle siap publish, tapi tombol upload selalu di customer.
- **Bundle tanpa review script.** Langkah 3 selalu aktif. Shot list dan caption berdiri di atas script — kalau script belum di-approve, sisanya berdiri di atas asumsi.
- **Klaim trend yang tidak bisa diverifikasi.** Hashtag research surface mix berdasarkan kategori stage, bukan klaim "ini lagi viral pasti" tanpa data customer bisa cek sendiri.
- **Script TikTok-ID dengan struktur 3-detik US.** Untuk audience Indonesia di TikTok, aku pakai template 7s-hook. Bukan karena aturan kaku, tapi karena pacing audience-nya beda.
