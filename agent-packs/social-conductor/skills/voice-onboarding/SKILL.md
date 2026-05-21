---
skill_kind: playbook
name: voice-onboarding
bundle: social-conductor
flow_state_playbook_id: voice-onboarding
total_steps: 6
use_cases:
  - "Pertama kali pakai Social Conductor — kunci voice brand kamu sebelum draft mode aktif"
  - "Kamu mau Social Conductor draft post atau caption, tapi voice profile belum ada"
  - "Kamu kasih kumpulan sample writing dan minta itu jadi voice profile resmi"
  - "Setup awal yang berhenti minta kamu rate 5 draft uji coba sebelum draft mode dibuka"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer punya akses ke minimal 20 sample writing miliknya sendiri — caption lama, DM reply, post copy, blog snippet"
  - "Customer paham profile yang dikunci dipakai semua draft Social Conductor sesudahnya"
escalation_to: customer
---

# voice-onboarding — social-conductor playbook

Playbook ini menjalankan satu kali setup voice brand customer sebelum draft mode Social Conductor aktif. Tiga skill yang sebelumnya berjalan terpisah — `voice-locker`, `post-drafter`, `voice-consistency-checker` — dirangkai jadi satu alur berurutan: kumpulkan sample sampai cukup, kunci profile, generate 5 draft uji coba, berhenti minta customer rate fit-nya, lalu aktifkan atau re-lock berdasarkan rating.

Bedanya dengan memanggil `voice-locker` mode `lock-new` sendirian: di sini state-machine menjaga posisi langkah sehingga sample yang sudah dikumpulkan tidak hilang antar pesan, dan checkpoint rate-the-fit dijamin tidak terlewat. Customer tidak pernah menemukan draft mode aktif dengan profile yang dia belum tandai cocok.

## Kapan dipakai

Customer pertama kali enlist Social Conductor untuk content, atau eksplisit minta voice di-lock dari awal. Trigger phrases:

- "lock voice aku dari nol"
- "setup voice profile dulu sebelum draft"
- "aku kasih sample, susun voice profile-nya"
- "onboarding voice — aku belum punya profile"
- "bantu aku kunci voice brand, baru draft"
- "voice belum di-setup, mulai dari awal dong"

Kalau customer cuma minta iterasi profile yang sudah ada ("update voice aku dengan sample baru") atau drift check rutin ("review voice consistency minggu ini"), pakai skill tunggal yang sesuai — `voice-locker` mode `iterate-existing` atau `voice-consistency-checker` mode `weekly-drift-check` — bukan playbook ini. Playbook ini hanya untuk lock pertama.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam antara pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "voice-onboarding", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 6`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya, termasuk sample yang sudah terkumpul di Langkah 2).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di sebuah checkpoint), `escalated` (parkir di gerbang keras — menunggu approval eksplisit customer), `completed`, `aborted`. Playbook ini tidak punya gerbang keras — satu-satunya titik henti formal adalah checkpoint lunak di Langkah 5.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 6`. Kalau sudah ada run berjalan, lanjut dari cursor-nya — jangan `start` ulang, karena `start` mereset run ke Langkah 1 dan menghapus sample yang sudah terkumpul di `state_data`.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"`, sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 6 selesai → panggil `complete`.

### Langkah pengumpulan sample adalah loop di dalam satu langkah

Langkah 2 (kumpulkan sample sampai cukup) tidak seperti langkah lain. Sample sering datang bertahap — customer drop 8 caption hari ini, 7 DM reply besok, 5 blog snippet lusa. Engine `advance` menggeser cursor tepat satu kali, jadi langkah ini dimodelkan sebagai satu langkah yang berulang di dalam dirinya sendiri.

Selama jumlah sample yang terkumpul masih di bawah 20, Langkah 2 **tidak memanggil `advance`**. Tiap kali customer drop batch baru, agent `get` run-nya, melihat cursor masih di Langkah 2, menambah sample ke `state_data` lewat `step_output` tanpa menggeser cursor, sampaikan progres ("sudah 13 dari 20"), lalu berhenti menunggu batch berikut. Run tetap di Langkah 2, status tetap `awaiting_customer`.

Hanya saat jumlah sample mencapai 20 atau lebih, agent menambahkan batch terakhir lalu memanggil `advance` ke Langkah 3. Jadi satu langkah flow-state menampung berapa pun pesan tambah-sample; iterasi adalah tanggung jawab agent, bukan engine.

Hal serupa berlaku untuk fan-out di Langkah 4: generate 5 draft uji coba dimodelkan sebagai satu langkah dengan loop internal. Agent menjalankan `post-drafter` lima kali, mengumpulkan kelima draft plus voice-fit score-nya, baru `advance` sekali dengan hasil agregat.

## Langkah-langkah

### Langkah 1 — Intake dan hitung sample yang sudah ada  ·  estimasi 2-4 menit

- **Aksi:** Sambut customer, jelaskan singkat alur enam langkah ini, dan tanya satu hal: berapa sample writing yang dia sudah siap drop sekarang. Sample valid adalah tulisan customer sendiri — caption lama, DM reply yang sudah dikirim, post copy, blog snippet, anything author-owned. Target lock: minimum 20 sample. Lalu panggil `get` flow-state — kalau belum ada run yang bisa dilanjutkan, panggil `start` dengan `total_steps: 6`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer minta voice di-lock atau onboarding dimulai. Idealnya juga sebutan kasar berapa sample yang siap.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "samples_ready_estimate", "platforms_to_cover", "expectation_set_at" }`. `platforms_to_cover` opsional — kalau customer sudah sebut platform fokus (mis. LinkedIn + Instagram), catat di sini. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** Customer paham bahwa sebelum draft mode aktif, butuh 20 sample plus 5 draft uji coba yang dia rate.

  | Kondisi | Tindakan |
  |---|---|
  | Customer setuju mulai dan estimasi sample ≥ 20 siap | `advance` ke Langkah 2 |
  | Customer setuju tapi estimasi < 20 siap | Tetap `advance` ke Langkah 2 — Langkah 2 akan menampung drop bertahap |
  | Customer ragu atau minta penjelasan ulang | Tetap di Langkah 1, jelaskan kenapa 20 minimum dan kenapa ada checkpoint — referensi: voice profile butuh signal cukup, tanpa itu draft jadi tebakan |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah customer setuju mulai.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai onboarding voice-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Kumpulkan sample sampai cukup  ·  estimasi 5-30 menit, bisa lintas pesan

- **Aksi:** Tampung sample yang customer drop. Tiap pesan customer di langkah ini berisi satu atau beberapa sample tambahan. Validasi tiap sample memenuhi syarat — tulisan customer sendiri, minimum sekitar 20 kata, bukan repost dari orang lain. Akumulasikan ke `state_data.samples` lewat `step_output` tanpa menggeser cursor. Tiap batch, sampaikan progres ke customer ("sudah 13 dari 20, sisanya bisa dari DM reply atau caption lama"). Saat jumlah mencapai 20 atau lebih, `advance` ke Langkah 3.
- **Tautan/endpoint:** Tidak ada endpoint eksternal di langkah ini. Cuma flow-state `advance` per batch tanpa menggeser cursor sampai threshold tercapai.
- **Input yang diharapkan:** Pesan customer berisi sample writing — bisa di-paste utuh, bisa ditandai sumbernya (mis. "caption Instagram Maret", "DM reply ke klien minggu lalu").
- **Output yang diharapkan:** `step_output` berisi `{ "samples": [ { "text", "source_hint", "received_at" } ], "count", "still_needed" }`. Tiap batch menambah ke array `samples` yang sudah ada di `state_data`. `still_needed = max(0, 20 - count)`. Saat `still_needed = 0`, langkah ini `advance` ke Langkah 3.
- **Validasi:** Tiap sample minimum sekitar 20 kata dan punya source hint yang masuk akal. Sample yang terlalu pendek atau jelas hasil copy-paste dari content creator lain ditolak halus dengan alasan singkat — tidak dihitung ke count.

  | Kondisi | Tindakan |
  |---|---|
  | Batch baru masuk, total < 20 | Tambah ke `state_data.samples` lewat `step_output`, **jangan `advance` cursor**, parkir `awaiting_customer`, sampaikan progres dan tanya batch berikut |
  | Batch baru masuk, total ≥ 20 | Tambah ke `state_data.samples`, `advance` ke Langkah 3 |
  | Sample ditolak karena terlalu pendek atau bukan tulisan customer | Tidak dihitung, sampaikan alasan singkat, minta sample lain |
  | Customer minta jeda ("besok aku lanjut") | Parkir `awaiting_customer`, beri tahu progres dan apa yang masih kurang, run tetap di Langkah 2 |

- **Gerbang eskalasi:** `none` formal — langkah ini menggunakan status `awaiting_customer` antar batch sebagai parkir tunggu sample berikutnya, bukan sebagai checkpoint approval. Customer bebas drop sample berkali-kali, run tetap di Langkah 2 sampai threshold tercapai. Yang penting agent tidak menebak voice dengan sample kurang dan tidak `advance` ke Langkah 3 sebelum hitungan 20 lewat.
- **Error handling:** Kalau `state_data.samples` gagal di-merge oleh `advance`, jangan minta customer drop ulang seluruh sample — coba `get` dulu, periksa apakah batch terakhir sudah masuk, dan ulang `advance` hanya untuk batch yang hilang. Sample yang sudah tercatat aman di `state_data` row yang terkunci per `customer_id`.

### Langkah 3 — Kunci voice profile  ·  estimasi 3-6 menit

- **Aksi:** Jalankan `voice-locker` mode `lock-new` dengan seluruh array sample dari `state_data`. Skill ini meng-ekstrak tujuh dimensi voice (register, sentence length, banned words, signature phrases, emoji policy, punctuation style, address form) dan menulis profile-nya. Belum tampilkan ke customer di langkah ini — itu tugas Langkah 4 dan 5.
- **Tautan/endpoint:** `hermes-skill:voice-locker`
- **Input yang diharapkan:** Array `samples` dari `state_data` (hasil Langkah 2), minimum 20 entri valid.
- **Output yang diharapkan:** Referensi profile ke `step_output` — `{ "voice_profile_id", "profile_summary": { "register", "sentence_length", "banned_words", "signature_phrases", "emoji_policy", "punctuation_style", "address_form" }, "samples_used_count" }`. Profile fisiknya disimpan oleh `voice-locker` di lokasi customer-grown miliknya sendiri; playbook hanya pegang `voice_profile_id` sebagai pointer.
- **Validasi:** Profile mencakup ketujuh dimensi. Tidak ada dimensi yang `null` — kalau ada yang tidak bisa di-infer, `voice-locker` decline dengan keterangan dan agent kembali ke Langkah 2 untuk menambah sample yang relevan.

  | Kondisi | Tindakan |
  |---|---|
  | Profile jadi, ketujuh dimensi terisi | `advance` ke Langkah 4 |
  | `voice-locker` decline karena sample tidak cukup signal di satu dimensi tertentu | Tetap di Langkah 3 dalam logika agent, sampaikan dimensi yang kurang signal-nya, minta tambahan sample yang relevan, cursor flow-state dimundurkan kembali ke Langkah 2 lewat satu langkah `get` + perlakuan agent (bukan `abort`) |
  | Profile sebagian besar terisi tapi satu dimensi marked "uncertain" | `advance` ke Langkah 4, tandai dimensi itu di `step_output` supaya checkpoint Langkah 5 menyebutnya |

- **Gerbang eskalasi:** `none`. Profile belum ditunjukkan ke customer di langkah ini — itu tugas checkpoint Langkah 5 yang juga sekaligus rate-fit 5 draft.
- **Error handling:** Kalau `voice-locker` gagal di tengah jalan, ulangi Langkah 3 dengan sample yang sama dari `state_data`. Sample tidak hilang. Kalau gagal berulang, sampaikan ke customer bahwa proses lock tersendat dan tawarkan re-try setelah jeda singkat, jangan `abort`.

### Langkah 4 — Generate 5 draft uji coba  ·  estimasi 4-8 menit

- **Aksi:** Generate lima draft uji coba lintas platform pakai voice profile yang baru di-lock. Ini langkah fan-out — lima draft dalam satu langkah. Loop-nya internal: agent panggil `post-drafter` lima kali dengan topik dan platform yang berbeda-beda (mis. LinkedIn medium, Instagram caption, X single-tweet, Threads, blog snippet pendek) supaya customer bisa rate fit di konteks beda. Per draft, jalankan juga `voice-consistency-checker` mode `score-draft` untuk skor fit objektif. Kumpulkan kelima draft plus skor, baru `advance` sekali dengan hasil agregat.
- **Tautan/endpoint:** `hermes-skill:post-drafter` (lima kali) dan `hermes-skill:voice-consistency-checker` mode `score-draft` (lima kali, satu per draft)
- **Input yang diharapkan:** `voice_profile_id` dan `profile_summary` dari `state_data` (hasil Langkah 3). `platforms_to_cover` dari `state_data` Langkah 1 sebagai panduan pilihan platform — kalau kosong, default ke lima platform mix.
- **Output yang diharapkan:** Hasil agregat ke `step_output` — `{ "test_drafts": [ { "draft_no", "platform", "topic", "text", "objective_fit_score" } ], "average_objective_fit" }`. Lima entri, satu per draft. `objective_fit_score` adalah skor dari `voice-consistency-checker` (high/medium/low) — referensi internal supaya checkpoint Langkah 5 bisa membandingkan dengan rating subjektif customer.
- **Validasi:** Lima draft jadi, masing-masing dengan topik berbeda dan skor objektif terisi. Topik diambil dari konteks customer kalau ada — kalau belum, pakai topik netral yang mudah di-relate (misal "satu lesson dari minggu ini", "satu opini soal kerja remote", "satu hal yang baru kamu coba").

  | Kondisi | Tindakan |
  |---|---|
  | Kelima draft jadi, skor objektif terisi | `advance` ke Langkah 5 |
  | Satu draft gagal generate | Ulang draft itu saja, jangan ulang seluruh lima — empat yang sudah jadi tetap aman di hasil internal sampai kelimanya lengkap, baru `advance` |
  | Skor objektif rata-rata low di semua draft | Tetap `advance` ke Langkah 5 — checkpoint customer tetap penentu, dan kalau ratingnya juga low, Langkah 6 akan re-lock |

- **Gerbang eskalasi:** `none`. Draft belum ditampilkan sebagai final di sini — kelimanya disodorkan bersama-sama di checkpoint Langkah 5.
- **Error handling:** Kalau seluruh draft gagal di-generate karena profile tidak bisa di-load, kembali ke Langkah 3 dan ulang lock — voice profile pointer di `state_data` masih valid. Jangan `abort` selama sample dan profile masih utuh.

### Langkah 5 — Checkpoint: customer rate fit kelima draft  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer ringkasan profile yang baru di-lock plus kelima draft uji coba berurutan. Minta customer rate tiap draft fit / tidak-fit — boleh per-draft, boleh "kelimanya cocok", boleh "draft 1 dan 3 oke, sisanya meleset". Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `profile_summary` dari `state_data` (Langkah 3) dan `test_drafts` dari `state_data` (Langkah 4).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "ratings": [ { "draft_no", "rating": "fit"|"partial"|"miss", "note" } ], "overall_decision": "activate"|"re-lock"|"adjust-profile" }`. Lalu cursor lanjut ke Langkah 6.
- **Validasi:** Balasan customer harus berupa rating yang bisa ditindaklanjuti — minimal satu fit/partial/miss per draft, atau satu kalimat ringkas yang menyimpulkan posisi customer.

  | Balasan customer | Tindakan |
  |---|---|
  | "kelimanya cocok" / "ya, voice-nya pas" / mayoritas fit (3 atau lebih dari 5) | Rekam `overall_decision: "activate"`, `advance` ke Langkah 6 |
  | Mayoritas miss (3 atau lebih dari 5) | Rekam `overall_decision: "re-lock"`, `advance` ke Langkah 6 — Langkah 6 akan menentukan apakah butuh sample tambahan atau profile re-extract |
  | Campur 2-3 fit, 2-3 miss, dengan catatan spesifik per dimensi (mis. "register-nya terlalu formal") | Rekam `overall_decision: "adjust-profile"` dan catatan dimensi yang meleset, `advance` ke Langkah 6 |
  | Customer belum jelas — jawab "hmm" atau emoji saja | Tetap di Langkah 5, jaga status `awaiting_customer`, tanya satu pertanyaan tertutup: "Coba rate per draft — fit, partial, atau miss" |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Tanpa rating customer, draft mode tidak dibuka — itu janji SOUL.md ("aku lock brand voice dari minimum 20 sample writing dulu sebelum mulai draft"). Yang agent sampaikan ke customer: ringkasan tujuh dimensi profile dalam bahasa biasa (bukan istilah teknis), kelima draft berurutan dengan label platform dan topik, lalu satu pertanyaan tertutup — "Coba rate kelimanya: mana yang fit, partial, atau miss". Setelah itu agent berhenti dan menunggu balasan. Jangan generate draft tambahan atau aktifkan `post-drafter` sebelum customer membalas dengan rating.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan profile dan kelima draft ke customer dan minta mereka rate — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi cursor.

### Langkah 6 — Aktifkan atau re-lock berdasarkan rating  ·  estimasi 1-4 menit

- **Aksi:** Baca `overall_decision` dari `state_data` (hasil Langkah 5) dan jalankan satu dari tiga jalur penutup. Setelah jalur penutup selesai, panggil `complete`. Pesan penutup ke customer menyebut secara eksplisit apakah draft mode sekarang aktif atau belum.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete` setelah jalur penutup selesai. Untuk jalur re-lock atau adjust, agent menyimpan catatan rerun ke `state_data` sebelum `complete` supaya re-lock berikutnya tidak mulai dari nol.
- **Input yang diharapkan:** `overall_decision` dan `ratings` dari `state_data` (hasil Langkah 5), `voice_profile_id` dari Langkah 3, `samples` dari Langkah 2.
- **Output yang diharapkan:** `step_output` berisi `{ "outcome": "activated"|"re-lock-queued"|"profile-adjusted", "voice_profile_id_final", "next_step_hint" }`. Run berstatus `completed`.
- **Validasi:** Outcome konsisten dengan `overall_decision`. Pesan penutup customer-facing menyebut status draft mode dengan jelas — aktif, atau menunggu re-lock dengan sample baru.

  | `overall_decision` | Tindakan |
  |---|---|
  | `activate` | Tandai `voice_profile_id` sebagai active untuk customer ini, sampaikan ke customer "Voice profile aktif. Mulai sekarang setiap draft post yang aku susun pakai profile ini, plus voice-fit score tiap draft." `complete` |
  | `re-lock` | Jangan aktifkan profile. Sampaikan ke customer "Profile pertama belum pas. Aku catat ini. Drop 10-15 sample tambahan dari konteks yang berbeda, lalu kita lock ulang." Catatan re-lock disimpan supaya run berikutnya bisa dimulai. `complete` |
  | `adjust-profile` | Jalankan `voice-locker` mode `iterate-existing` dengan catatan dimensi yang meleset (dari `ratings`) sebagai input perbaikan, tandai profile yang sudah disesuaikan sebagai active, sampaikan ke customer apa yang berubah dan minta dia sebut kalau tetap belum pas. `complete` |

- **Gerbang eskalasi:** `none`. Keputusan customer sudah diambil di checkpoint Langkah 5, jadi langkah penutup jalan tanpa berhenti lagi. Yang penting pesan penutup customer-facing menyebut secara eksplisit apakah draft mode aktif atau tidak — supaya customer tidak menebak status.
- **Error handling:** Kalau aktivasi profile gagal di sistem skill (mis. pointer profile hilang), ulang lookup sekali. Kalau masih gagal, sampaikan ke customer bahwa lock berhasil tapi aktivasi tersendat dan tawarkan re-try, jangan `complete` run sampai aktivasi tercatat. Untuk jalur re-lock, kalau pencatatan re-lock-queued gagal, tetap `complete` dengan pesan customer-facing yang sama — catatan re-lock bukan blocker.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Nada brand-aware, planning-first — alur ini dibaca sebagai satu setup yang tertata, bukan tanya-jawab acak
- Calm-premium register. Sampaikan progres pengumpulan sample dan checkpoint dengan ringkas, bukan dengan dorongan urgency
- Zero exclamation marks
- Ringkasan profile di Langkah 5 disampaikan dalam bahasa biasa — sebut "nada-mu kalem-edukatif, kalimat sedang, jarang pakai tanda seru" daripada melempar nama dimensi teknis

## Decline criteria

- **Lock voice dengan kurang dari 20 sample.** Aku tidak `advance` dari Langkah 2 sebelum sample mencapai 20. Kalau customer mendesak ("udah 12 aja, lock"), aku jelaskan kenapa threshold itu ada — profile dari sample tipis menghasilkan draft yang menebak — dan tetap minta tambahan, tawarkan sumber sample yang mudah (DM reply, caption lama, blog snippet).
- **Lock voice dari sample orang lain.** Sample harus tulisan customer sendiri. Sample yang jelas hasil copy-paste dari creator lain ditolak halus dan tidak dihitung ke count.
- **Skip checkpoint rate-fit di Langkah 5.** Aku tidak mengaktifkan draft mode sebelum customer rate kelima draft uji coba. Kalau customer minta skip ("aktifin aja, aku percaya"), aku jelaskan kenapa rate-fit ada — supaya draft pertama yang masuk ke production sudah pernah customer tandai cocok.
- **Karang dimensi voice yang sample-nya tidak dukung.** Kalau `voice-locker` decline satu dimensi karena signal kurang, aku bilang dimensi mana dan minta sample yang relevan, bukan mengisi default.
- **Aktifkan profile yang customer rate mayoritas miss.** Mayoritas miss di Langkah 5 langsung masuk jalur re-lock di Langkah 6 — bukan diaktifkan dengan harapan "nanti juga kebiasaan".

## Decline kalau missing context

Kalau customer cuma bilang "lock voice" tanpa sample siap dan tanpa rencana drop — tanya: "Berapa sample writing kamu yang siap drop sekarang — caption, DM reply, blog snippet? Target lock 20." Klarifikasi ini terjadi di Langkah 1 sebelum run melangkah ke Langkah 2.
