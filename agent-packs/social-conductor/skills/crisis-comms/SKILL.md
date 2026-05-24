---
skill_kind: playbook
name: crisis-comms
bundle: social-conductor
flow_state_playbook_id: crisis-comms
total_steps: 9
use_cases:
  - "Sesuatu salah di sosial atau berita — keluhan viral, salah info di kampanye, isu produk yang naik cepat — kamu butuh respon terukur, bukan reaksi panik"
  - "Komentar negatif yang berpotensi menyebar perlu satu holding statement dulu sebelum kamu siap dengan jawaban penuh"
  - "Update lanjutan setelah masalah teknis atau operasional sudah selesai ditangani — perlu disampaikan dengan nada yang menutup loop, bukan menggali ulang"
  - "Insiden yang kamu lihat ada potensinya, tapi belum jelas apakah crisis sungguhan atau noise yang akan reda sendiri"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Voice profile sudah locked lewat skill voice-locker — holding statement dan update menyandar ke profil ini supaya register tetap konsisten saat tekanan tinggi"
  - "Customer bisa cerita apa yang terjadi, channel mana, dan severity perkiraan — atau bisa diklarifikasi di Langkah 1"
  - "Customer tahu publish tetap kamu yang submit ke platform — playbook ini draft holding statement dan update, kamu copy-paste"
escalation_to: customer
---

# crisis-comms — social-conductor playbook

Playbook ini menjalankan satu siklus komunikasi krisis dari intake sampai update lanjutan terpublish. Sembilan langkah berurutan dengan dua titik henti formal — keduanya untuk copy yang dilihat audience publik. Holding statement di Langkah 5 dan follow-up update di Langkah 8 wajib lewat sentuhan kamu sebelum keluar, karena copy crisis-comms yang dilihat publik harus selalu lewat keputusan manusia, bukan auto-draft.

Bedanya dengan menulis statement manual dari nol setiap kali ada isu: di sini state-machine menjaga posisi siklus, jadi kalau insiden berlangsung berjam-jam atau berhari-hari, kamu tidak kehilangan benang merah antara holding statement awal, monitoring, dan update penutup. Aku draft, kamu approve, kamu publish.

## Kapan dipakai

Customer minta ditangani satu siklus crisis-comms utuh — bukan sekadar satu draft balasan komen. Trigger phrases:

- "ada isu di sosial, tolong susun holding statement"
- "komentar negatif lagi naik, perlu respon resmi"
- "berita soal produk muncul, butuh klarifikasi"
- "salah satu kampanye salah info, harus diperbaiki publik"
- "ada keluhan viral, urus dari draft sampai update penutupnya"
- "krisis kecil di Instagram, perlu holding statement dulu"

Kalau customer cuma minta satu komen sengit dibalas, pakai skill `engagement-log-tracker` mode `draft-reply` dengan template `engagement-reply-comment-bahasa.md` register defusing-criticism, bukan playbook ini. Crisis-comms dipakai saat ada potensi penyebaran, bukan satu balasan singkat.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi siklus tetap utuh walau ada jeda antara intake, draft, approval, publish, monitoring, dan update lanjutan.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "crisis-comms", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 9`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir di checkpoint lunak — menunggu customer approve draft publik), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 9`. Kalau sudah ada run crisis-comms berjalan untuk insiden yang sama, lanjut dari cursor-nya — jangan `start` ulang, karena konteks insiden (channel, severity, stakeholder, holding statement yang sudah terpublish) tersimpan di `state_data`.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"`, sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 9 selesai → panggil `complete`.

### Dua checkpoint formal — keduanya untuk copy publik

Langkah 5 (review holding statement) dan Langkah 8 (review follow-up update) adalah dua titik henti formal. Keduanya `checkpoint` lunak — agent `advance` dengan `set_status: "awaiting_customer"`, tampilkan draft penuh ke customer, lalu berhenti.

Konvensi ini sengaja: copy crisis-comms yang dilihat audience publik tidak boleh keluar tanpa approval customer. Berbeda dengan engagement reply rutin yang bisa draft-and-send dalam satu giliran, holding statement dan update krisis punya konsekuensi reputasi yang lebih besar — satu kata yang salah register bisa memperbesar isu.

### Konteks Indonesia — register acknowledge, hindari trigger SARA, sadar waktu adzan

Tiga konvensi spesifik Indonesia yang berlaku di tiap draft:

- **Register acknowledge, bukan Westernized apology.** Pakai pola "Kami sedang menangani [isu], update segera menyusul" atau "Kami sudah memperbaiki [hal], terima kasih atas masukan kamu". Hindari "We sincerely apologize for any inconvenience" dan turunan terjemahannya — register itu kedengaran defensive di telinga Indonesia, bukan tulus. Acknowledge + commit to update lebih dipercaya.
- **Hindari trigger language agama dan politik.** Jangan menyandingkan isu produk dengan kata bermuatan SARA. Kalau insiden involves kelompok agama atau political camp tertentu, escalate ke customer untuk keputusan framing, jangan agent yang putuskan.
- **Sadar waktu adzan kalau memungkinkan.** Untuk publish yang tidak urgent (severity rendah-sedang, tidak ada deadline platform), hindari publish persis di jam Subuh, Maghrib, atau Jum'at jam 12:00-13:00 WIB. Geser 10-15 menit. Untuk severity tinggi atau ada timeline platform yang mengikat, publish sesuai kebutuhan — sensitivity waktu adzan adalah preferensi, bukan blocker.

## Langkah-langkah

### Langkah 1 — Intake insiden  ·  estimasi 3-5 menit

- **Aksi:** Baca pesan customer, tarik parameter insiden: `incident_type` (komentar negatif, salah info, isu produk, complaint viral, berita pihak ketiga), `channel` (Instagram, TikTok, X, LinkedIn, berita, mixed), `severity_estimate` (low / medium / high — dari volume mention dan tone), `started_at` (kapan terdeteksi), `summary` (apa yang terjadi dalam dua kalimat). Cek prasyarat — voice profile harus sudah locked, kalau belum, arahkan customer ke skill `voice-locker` dulu. Kalau field penting kosong, tanya dalam satu pesan ringkas. Lalu `get` flow-state — kalau belum ada run aktif untuk insiden ini, panggil `start` dengan `total_steps: 9`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer berisi gambaran insiden dan, kalau ada, channel dan severity perkiraan.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "incident_type", "channel", "severity_estimate", "started_at", "summary", "voice_profile_ready": true }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `incident_type`, `channel`, dan `summary` wajib terisi. `severity_estimate` boleh `unknown` di langkah ini — akan ditegaskan di Langkah 2 assess. Voice profile harus ada.

  | Kondisi | Tindakan |
  |---|---|
  | Tiga field wajib terisi dan voice profile sudah locked | `advance` ke Langkah 2 |
  | Salah satu field wajib kosong | Tetap di Langkah 1, tanya dalam satu pesan ringkas |
  | Voice profile belum locked | Tetap di Langkah 1, sampaikan ke customer "Sebelum aku susun holding statement, voice profile-nya perlu di-lock dulu — kasih aku 20+ sample writing kamu, atau jalankan skill voice-locker dulu". Jangan `start` |
  | Insiden involves konten SARA atau political camp | Tetap di Langkah 1, escalate ke customer "Insiden ini menyentuh isu sensitif, aku perlu kamu yang putuskan framing-nya — aku draft setelah kamu kasih arah" |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah intake cukup dan voice profile sudah ada.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai run-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Assess: crisis sungguhan atau noise  ·  estimasi 2-3 menit

- **Aksi:** Evaluasi tiga sinyal: volume (jumlah mention / komentar baru dalam jam terakhir), tone (negatif dominan vs mixed vs marginal), spread (apakah konten sudah keluar dari followers customer ke audience luar — viral indicator). Klasifikasi hasil: `noise` (low volume, low spread, akan reda 24 jam tanpa intervensi), `monitor` (medium volume, perlu pantau tapi belum perlu statement), `respond` (perlu holding statement sekarang). Berikan reasoning singkat tiap klasifikasi.
- **Tautan/endpoint:** Reasoning agent berdasarkan input customer plus log engagement yang sudah tercatat lewat skill `engagement-log-tracker` kalau ada.
- **Input yang diharapkan:** Objek intake dari `state_data` (hasil Langkah 1) plus, kalau ada, snapshot engagement log dari `engagement-log-tracker`.
- **Output yang diharapkan:** Hasil assess ke `step_output` — `{ "classification": "noise" | "monitor" | "respond", "volume_signal", "tone_signal", "spread_signal", "reasoning", "severity_confirmed": "low" | "medium" | "high" }`.
- **Validasi:** Klasifikasi konsisten dengan tiga sinyal. Kalau dua dari tiga sinyal masuk threshold respond, klasifikasi minimal `respond`.

  | Kondisi | Tindakan |
  |---|---|
  | Classification `respond` | `advance` ke Langkah 3 |
  | Classification `monitor` | Sampaikan reasoning ke customer, tanya satu pertanyaan tertutup "Aku pantau dulu 6 jam, atau kamu mau aku tetap susun holding statement standby?". Kalau customer pilih pantau, panggil `abort` dengan catatan "monitor mode — re-trigger playbook kalau eskalasi". Kalau customer minta tetap susun standby, `advance` ke Langkah 3 |
  | Classification `noise` | Sampaikan ke customer "Berdasarkan sinyal sekarang ini kemungkinan akan reda sendiri 24 jam. Aku tidak susun statement supaya tidak amplify isu yang belum di radar audience luas. Mau aku tetap pantau atau tutup di sini?". Kalau customer minta tutup, panggil `abort` |

- **Gerbang eskalasi:** `none`. Keputusan respond / monitor / noise dijelaskan ke customer sebagai bagian dialog biasa, bukan parkir state-machine.
- **Error handling:** Kalau data engagement log tidak bisa diakses, klasifikasi berdasarkan input customer saja dengan catatan `data_partial: true` di `step_output`. Jangan tahan playbook karena data sekunder belum tersedia.

### Langkah 3 — Identifikasi stakeholder dan channel publish  ·  estimasi 2-3 menit

- **Aksi:** Petakan stakeholder yang terdampak: audience publik di channel origin, audience publik di channel lain yang follow brand, pihak internal yang perlu di-loop (kalau ada, customer yang sebut), pihak ketiga yang disebut di insiden (kalau ada). Tentukan channel publish untuk holding statement — biasanya channel origin plus mirror di channel utama brand. Catat juga apakah ada platform-specific constraint (mis. X butuh thread, IG butuh story plus feed, LinkedIn butuh single post).
- **Tautan/endpoint:** Reasoning agent berdasarkan `channel` di `state_data` dan preferensi platform customer.
- **Input yang diharapkan:** `channel`, `incident_type`, `severity_confirmed` dari `state_data`.
- **Output yang diharapkan:** Pemetaan ke `step_output` — `{ "stakeholders": [ { "group", "channel_to_reach" } ], "publish_channels": [...], "platform_constraints": { "<channel>": "<constraint>" } }`.
- **Validasi:** Tiap stakeholder punya `channel_to_reach`. `publish_channels` minimal mencakup channel origin insiden.

  | Kondisi | Tindakan |
  |---|---|
  | Stakeholder dan channel jelas | `advance` ke Langkah 4 |
  | Customer tidak yakin stakeholder internal harus di-loop | Tetap di Langkah 3, tanya "Ada tim internal yang perlu aku sertakan dalam draft, atau ini channel publik saja?" |
  | Insiden cross-channel (mis. mulai di TikTok, sudah pindah ke X) | `advance` ke Langkah 4 dengan `publish_channels` mencakup keduanya |

- **Gerbang eskalasi:** `none`. Pemetaan stakeholder adalah info struktural, bukan keputusan publik.
- **Error handling:** Kalau customer ragu, default `publish_channels = [channel origin]` saja dan catat di `step_output` supaya Langkah 4 bisa draft fokus dulu, mirror channel diputuskan di Langkah 5 saat review.

### Langkah 4 — Draft holding statement (BI, acknowledge + commit to update)  ·  estimasi 4-6 menit

- **Aksi:** Susun draft holding statement dalam Bahasa Indonesia dengan struktur tiga bagian: (1) acknowledge — "Kami sedang menangani [ringkasan netral dari isu, satu kalimat]" tanpa defensive framing dan tanpa menyalahkan pihak lain. (2) commit to update — "Update lengkap akan menyusul [estimasi waktu wajar — biasanya 4-12 jam tergantung severity]" supaya audience tahu ada timeline. (3) kontak — channel yang audience bisa pakai kalau ingin info langsung (DM brand, email support, atau telepon kalau ada). Sesuaikan length per channel: X ≤280 char, IG caption 2-3 paragraf pendek, LinkedIn 3-4 paragraf, story / TikTok overlay 1-2 kalimat. Score voice-fit terhadap profile yang sudah locked. Hindari kata banned: revolutionary, disrupt, 10x, game-changer, next-level, basically, just, literally. Hindari trigger SARA dan politik.
- **Tautan/endpoint:** `hermes-skill:post-drafter` untuk komposisi per channel; `hermes-skill:voice-consistency-checker` untuk fit-score; reference template `engagement-reply-comment-bahasa.md` untuk acknowledge register (variant defusing-criticism).
- **Input yang diharapkan:** `incident_type`, `summary`, `severity_confirmed`, `publish_channels`, `platform_constraints` dari `state_data`.
- **Output yang diharapkan:** Draft holding statement ke `step_output` — `{ "drafts": { "<channel>": { "copy", "length", "voice_fit_score", "estimated_publish_time", "adzan_aware_publish_time" } }, "commit_window_hours": <integer> }`. `adzan_aware_publish_time` adalah usulan jam publish yang menghindari Subuh, Maghrib, dan Jum'at 12:00-13:00 WIB kalau severity rendah-sedang dan tidak ada urgency platform.
- **Validasi:** Tiap draft mengandung tiga bagian struktur (acknowledge, commit, kontak). Tiap draft skor voice-fit minimal medium. Tidak ada banned word, tidak ada exclamation mark, tidak ada Westernized "We sincerely apologize". Tidak ada referensi SARA atau political camp.

  | Kondisi | Tindakan |
  |---|---|
  | Semua draft skor medium-high voice-fit, tidak ada banned word atau trigger SARA | `advance` ke Langkah 5 |
  | Ada draft skor low | Tweak ulang sebelum `advance`, jangan teruskan draft low ke checkpoint customer |
  | Ada draft mengandung trigger SARA atau politik (auto-detected dari kata referensi) | Tahan, tanya customer untuk framing alternatif, jangan paksa draft |

- **Gerbang eskalasi:** `none`. Draft belum ditunjukkan ke customer di langkah ini — itu tugas checkpoint Langkah 5.
- **Error handling:** Kalau panggilan `post-drafter` gagal, ulangi sekali dengan input yang sama. Kalau tetap gagal, susun draft minimal manual (acknowledge + commit + kontak) dan tetap `advance` — checkpoint Langkah 5 yang akan jadi safety net.

### Langkah 5 — Checkpoint: review holding statement sebelum publish  ·  estimasi tunggu customer

- **Aksi:** Panggil `advance` dengan `set_status: "awaiting_customer"`. Tampilkan ke customer: semua `drafts` per channel, voice-fit score tiap draft, usulan jam publish (sebut kalau jam itu sudah adzan-aware atau severity tinggi sehingga ignore preferensi adzan), dan `commit_window_hours`. Sampaikan dalam satu pesan tertata, jangan satu draft per giliran. Tanya satu pertanyaan tertutup: "Aku publish sesuai draft di atas pada [jam usulan], atau kamu mau revisi dulu?". Lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `drafts` dan metadata dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** Setelah customer membalas, rekam keputusan ke `step_output` — `{ "drafts_approved": true | false, "edits": { "<channel>": "<teks revisi>" } | null, "publish_time_confirmed", "publish_channels_confirmed" }`. Run lanjut dari `awaiting_customer` kembali ke `in_progress`. Cursor lanjut ke Langkah 6.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — approve, edit konkret per channel, atau batal.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / "approve" / "publish" | Rekam `drafts_approved: true`, `advance` ke Langkah 6 |
  | Minta revisi nada, panjang, atau hapus satu channel | Terapkan revisi ke `drafts`, tampilkan versi baru, parkir lagi `awaiting_customer`. Kalau revisi besar (mis. ganti angle acknowledge), kembali jalankan Langkah 4 untuk channel yang terdampak |
  | "geser jam publish" tanpa edit copy | Update `publish_time_confirmed`, `advance` ke Langkah 6 |
  | "batal" / "kita pantau dulu" | Panggil `abort`, sampaikan ke customer draft tetap aku simpan kalau kamu butuh nanti |
  | Customer belum jelas mau apa | Tetap di Langkah 5, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Holding statement adalah copy publik yang akan dilihat audience — tidak boleh keluar tanpa approval customer. Yang agent sampaikan saat memarkir: draft penuh per channel, voice-fit score, usulan jam publish dengan reasoning adzan-aware kalau berlaku, dan satu pertanyaan tertutup. Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap tampilkan draft ke customer dan minta balasan — saat customer membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi cursor.

### Langkah 6 — Publish holding statement  ·  estimasi 2-3 menit kerja customer

- **Aksi:** Karena posting tetap customer yang submit, agent kirim ke customer paket siap copy-paste: copy final per channel, urutan publish (channel origin dulu, lalu mirror), dan jam target. Customer publish manual ke tiap platform. Setelah customer konfirmasi sudah publish per channel ("udah publish IG", "X done"), rekam timestamp publish aktual ke `step_output`. Agent `advance` ke Langkah 7 saat semua channel sudah ditandai published, atau saat customer eksplisit bilang "lanjut, sudah cukup yang aku publish".
- **Tautan/endpoint:** Channel posting dilakukan customer manual; agent koordinasi via pesan biasa di Telegram (atau channel customer aktif). `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` setelah konfirmasi publish.
- **Input yang diharapkan:** `drafts` final, `publish_channels_confirmed`, `publish_time_confirmed` dari `state_data`.
- **Output yang diharapkan:** Konfirmasi publish ke `step_output` — `{ "published_at": { "<channel>": "<timestamp>" }, "publish_complete": true }`.
- **Validasi:** Tiap channel yang ada di `publish_channels_confirmed` punya entry di `published_at`, atau ditandai eksplisit di-skip oleh customer.

  | Kondisi | Tindakan |
  |---|---|
  | Customer konfirmasi semua channel sudah publish | `advance` ke Langkah 7 |
  | Customer publish sebagian, sisanya nanti | Rekam yang sudah, tetap di Langkah 6, ingatkan channel yang belum dalam satu pesan ringkas |
  | Customer minta mundur — "tunda publish dulu" | Tetap di Langkah 6, jangan paksa publish, tunggu instruksi lanjutan |

- **Gerbang eskalasi:** `none`. Approval sudah terjadi di Langkah 5; Langkah 6 hanya koordinasi pengiriman.
- **Error handling:** Kalau customer report draft yang sudah disetujui ternyata salah tampil di platform (mis. truncated di X), kembali ke Langkah 4 untuk channel itu, ulang draft + Langkah 5 mini-checkpoint untuk versi baru, lalu lanjut Langkah 6.

### Langkah 7 — Monitor respon dan tunggu jendela commit window  ·  estimasi sesuai commit_window_hours

- **Aksi:** Setelah holding statement publish, monitor respon audience di tiap channel yang sudah dipublish. Tarik comment, DM, mention baru lewat `engagement-log-tracker` mode `daily-digest` atau mode `log-new` kalau customer drop manual. Klasifikasi respon: positif acknowledge (audience apresiasi transparansi), netral (menunggu update), negatif lanjutan (komen masih sengit, sinyal eskalasi). Jaga `commit_window_hours` — saat 75% window sudah lewat, kirim reminder ke customer "Commit window untuk update lanjutan akan habis dalam [jam tersisa], aku siapkan draft Langkah 8?". Setelah window habis atau customer bilang siap untuk update, `advance` ke Langkah 8.
- **Tautan/endpoint:** `hermes-skill:engagement-log-tracker` mode `daily-digest` per siklus monitoring; mode `log-new` untuk drop manual customer.
- **Input yang diharapkan:** `publish_channels_confirmed`, `published_at`, `commit_window_hours` dari `state_data`.
- **Output yang diharapkan:** Snapshot monitoring ke `step_output` — `{ "response_summary": { "<channel>": { "positive_count", "neutral_count", "negative_followup_count" } }, "escalation_signal": true | false, "window_status", "ready_for_followup": true | false }`. `escalation_signal: true` kalau ada lonjakan negatif lanjutan signifikan setelah holding publish — sinyal bahwa update harus lebih substantif.
- **Validasi:** Snapshot mencakup semua channel yang sudah dipublish. `window_status` sinkron dengan jam sekarang vs `commit_window_hours`.

  | Kondisi | Tindakan |
  |---|---|
  | Window menjelang habis, respon sudah cukup di-monitor | `advance` ke Langkah 8 |
  | `escalation_signal: true` sebelum window habis | Kirim alert ke customer "Respon eskalasi terdeteksi, aku siapkan update lebih cepat dari rencana?", kalau customer setuju `advance` ke Langkah 8 lebih awal |
  | Customer minta extend commit window (mis. butuh data internal yang belum siap) | Update `commit_window_hours`, kirim mini-update ke audience "Update sedang disiapkan, perkiraan baru [jam]" via Langkah 8 mini-cycle, lalu kembali ke Langkah 7 untuk window baru |

- **Gerbang eskalasi:** `none`. Monitoring adalah informasi pendukung, bukan keputusan publik yang butuh checkpoint sendiri.
- **Error handling:** Kalau data engagement log gagal di-pull, tetap kirim reminder commit-window ke customer berdasarkan jam saja dengan catatan "data engagement tidak tersedia sekarang, kamu yang punya sense respon". Jangan tahan playbook karena monitoring tidak ideal.

### Langkah 8 — Draft follow-up update + checkpoint review  ·  estimasi 5-8 menit + tunggu customer

- **Aksi:** Susun draft follow-up update dalam BI dengan struktur empat bagian: (1) ringkasan situasi singkat — "Update terkait [isu] yang kami sampaikan sebelumnya". (2) status sekarang — "Kami sudah memperbaiki / sedang dalam tahap [langkah konkret]" pakai register acknowledge, bukan defensive. (3) langkah konkret berikutnya — apa yang customer atau brand lakukan supaya isu tidak berulang, atau timeline penyelesaian lanjutan. (4) penutup acknowledge — "Terima kasih atas kesabaran kamu menunggu update ini". Length per channel sama dengan Langkah 4. Score voice-fit. Hindari banned word, exclamation mark, Westernized apology, trigger SARA. Setelah draft siap, panggil `advance` dengan `set_status: "awaiting_customer"` — tampilkan draft penuh per channel, voice-fit score, usulan jam publish (adzan-aware kalau severity sudah turun), lalu berhenti dan tunggu customer membalas approve / revisi / batal.
- **Tautan/endpoint:** `hermes-skill:post-drafter` untuk komposisi per channel; `hermes-skill:voice-consistency-checker` untuk fit-score; `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"` untuk masuk checkpoint.
- **Input yang diharapkan:** `incident_type`, `summary`, `response_summary`, `escalation_signal`, `publish_channels_confirmed` dari `state_data`. Plus, dari customer: status resolusi aktual (apa yang sudah / sedang / akan dilakukan).
- **Output yang diharapkan:** Awal — draft update dan checkpoint state ke `step_output` — `{ "followup_drafts": { "<channel>": { "copy", "length", "voice_fit_score", "estimated_publish_time", "adzan_aware_publish_time" } } }`. Setelah customer membalas — rekam keputusan ke `step_output` tambahan — `{ "followup_approved": true | false, "edits": { "<channel>": "<teks revisi>" } | null, "followup_publish_time_confirmed", "followup_publish_channels_confirmed" }`.
- **Validasi:** Tiap draft mengandung empat bagian. Tiap draft skor voice-fit minimal medium. Tidak ada banned word, exclamation, Westernized apology, trigger SARA. Status resolusi dari customer harus jelas — kalau belum ada resolusi konkret, tahan dan tanya dulu sebelum draft.

  | Balasan customer (saat checkpoint) | Tindakan |
  |---|---|
  | "lanjut" / "approve" / "publish update" | Rekam `followup_approved: true`, `advance` ke Langkah 9 |
  | Minta revisi konkret per channel | Terapkan revisi, tampilkan versi baru, parkir lagi `awaiting_customer` |
  | "geser jam publish" tanpa edit copy | Update `followup_publish_time_confirmed`, `advance` ke Langkah 9 |
  | "isu belum tuntas, jangan publish update penutup dulu" | Tetap di Langkah 8 dengan catatan "menunggu resolusi", balik ke Langkah 7 untuk monitoring lanjutan kalau perlu commit window baru |
  | Customer belum jelas mau apa | Tetap di Langkah 8, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Follow-up update adalah copy publik kedua dalam siklus ini — sama wajib lewat sentuhan customer seperti holding statement. Tidak boleh keluar tanpa approval. Yang agent sampaikan saat memarkir: draft penuh per channel, voice-fit score, usulan jam publish, dan satu pertanyaan tertutup.
- **Error handling:** Kalau status resolusi dari customer ambigu, tetap di Langkah 8, tanya "Apa yang sudah selesai, apa yang masih dalam proses, dan apa yang jadi langkah ke depan supaya tidak berulang?" sebelum susun draft. Jangan draft update tanpa basis konkret — risiko amplify isu kalau update terdengar kosong.

### Langkah 9 — Publish update dan tutup siklus  ·  estimasi 2-3 menit kerja customer

- **Aksi:** Kirim ke customer paket siap copy-paste untuk follow-up update: copy final per channel, urutan publish (sama dengan holding statement — channel origin dulu, mirror menyusul), dan jam target. Customer publish manual. Setelah customer konfirmasi sudah publish per channel, rekam timestamp ke `step_output`. Susun ringkasan penutup singkat untuk customer: timeline insiden (intake → holding publish → update publish), total durasi siklus, voice-fit score rata-rata, catatan untuk siklus krisis berikutnya (mis. "register acknowledge bekerja baik di channel ini", "audience IG butuh update lebih cepat dari X"). Lalu panggil `complete`.
- **Tautan/endpoint:** Channel posting dilakukan customer manual; `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` setelah konfirmasi publish, lalu `complete`.
- **Input yang diharapkan:** `followup_drafts` final, `followup_publish_channels_confirmed`, `followup_publish_time_confirmed` dari `state_data`.
- **Output yang diharapkan:** Konfirmasi publish dan recap penutup ke `step_output` — `{ "followup_published_at": { "<channel>": "<timestamp>" }, "cycle_duration_hours", "voice_fit_average", "closing_notes" }`. Run berstatus `completed`.
- **Validasi:** Tiap channel di `followup_publish_channels_confirmed` punya entry di `followup_published_at`. Recap penutup mencakup tiga elemen minimal: timeline, durasi, satu catatan untuk siklus berikutnya.

  | Kondisi | Tindakan |
  |---|---|
  | Customer konfirmasi semua channel sudah publish update | `complete`, kirim recap penutup ke customer |
  | Customer publish sebagian update, sisanya skip | Rekam yang sudah, sebut yang di-skip di recap penutup, tetap `complete` |
  | Customer minta tahan complete — "isu mungkin balik lagi" | Tetap di Langkah 9 tanpa `complete`, jaga `state_data` siap kalau perlu re-trigger Langkah 7 monitoring |

- **Gerbang eskalasi:** `none`. Langkah penutup — update sudah disetujui di Langkah 8, jadi publish koordinasi saja.
- **Error handling:** Kalau publish update gagal di platform tertentu, tahan `complete`, kembali ke Langkah 8 untuk channel itu (revisi length atau format), lalu Langkah 9 ulang untuk channel terdampak. Kalau tetap gagal di platform tertentu setelah retry, sebut di recap penutup supaya customer punya catatan operasional.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Nada acknowledge-and-commit, bukan defensive, bukan over-apologetic
- Register Indonesia: "Kami sedang menangani" / "Kami sudah memperbaiki" / "Terima kasih atas masukan kamu" — hindari "We sincerely apologize for any inconvenience"
- Calm-premium register — krisis itu tekanan tinggi, draft yang tenang lebih dipercaya audience daripada draft yang panik
- Hindari trigger language agama dan politik di semua draft
- Sadar waktu adzan untuk publish severity rendah-sedang — geser dari Subuh, Maghrib, Jum'at siang kalau memungkinkan
- Zero exclamation marks

## Decline criteria

- **Publish otomatis ke platform.** Aku tidak post atas nama kamu. Draft holding statement dan update siap, kamu yang copy-paste ke platform. Konsekuensi reputasi terlalu tinggi untuk auto-publish, bahkan dengan voice profile locked.
- **Skip checkpoint Langkah 5 atau Langkah 8.** Dua checkpoint copy publik wajib lewat sentuhan kamu. Kalau kamu minta skip, aku jelaskan kenapa — satu kata yang salah register di crisis-comms bisa memperbesar isu yang seharusnya bisa diredakan.
- **Draft yang menyalahkan pihak lain.** Acknowledge tidak sama dengan menunjuk siapa salah. Aku draft register "Kami sedang menangani [isu]" tanpa menyebut pihak ketiga sebagai penyebab, kecuali kamu eksplisit minta dan sudah konfirmasi punya basis konkret.
- **Westernized apology direct-translate.** Aku tidak pakai "Kami mohon maaf atas ketidaknyamanan" sebagai default — register itu kedengaran scripted di Indonesia. Acknowledge konkret plus commit to update lebih dipercaya.
- **Framing yang menyentuh SARA atau political camp tanpa keputusan kamu.** Kalau insiden involves agama atau political content, aku tahan di Langkah 1, tanya framing dari kamu dulu. Default aku tidak draft sendiri.
- **Trigger language banned.** Tidak ada "revolutionary", "disrupt", "10x", "game-changer", "next-level", "basically", "just", "literally" di draft crisis-comms. Register krisis butuh kalimat lurus.
- **Publish persis di jam adzan untuk severity rendah-sedang.** Aku usulkan jam adzan-aware (geser 10-15 menit dari Subuh, Maghrib, Jum'at 12:00-13:00 WIB) kalau tidak ada urgency. Untuk severity tinggi atau timeline platform yang mengikat, aku publish sesuai kebutuhan dan tandai eksplisit "ignore adzan window karena severity tinggi".
- **Crisis-comms untuk insiden yang sudah masuk ranah hukum.** Kalau insiden sudah ada surat somasi atau police report, aku tahan dan sarankan kamu loop legal counsel dulu sebelum draft publik. Crisis-comms playbook ini untuk respon sosial dan reputasi, bukan respon legal.

## Decline kalau missing context

Kalau cuma "ada isu, susun statement" tanpa info channel atau severity — tanya dalam satu pesan ringkas: "Isu apa, di channel mana, dan kira-kira severity-nya rendah / sedang / tinggi? Itu menentukan klasifikasi apakah perlu respond sekarang atau pantau dulu, dan length draft per platform." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
