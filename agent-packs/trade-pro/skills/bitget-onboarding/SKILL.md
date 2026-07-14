---
skill_kind: playbook
name: bitget-onboarding
bundle: trade-pro
flow_state_playbook_id: bitget-onboarding
total_steps: 8
use_cases:
  - "Customer mau pasang Bitget biar Trade Pro bisa surface portfolio, P&L, dan funding rate"
  - "Customer baru pertama kali generate API key Bitget dan butuh dipandu langkah per langkah"
  - "Customer sudah punya akun Bitget tapi belum tahu cara batasi scope ke read-only"
  - "Customer minta jaminan eksplisit bahwa Trade Pro tidak akan bisa execute trade atau withdraw"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer punya akun Bitget aktif, sudah lulus KYC, dan punya akses ke Settings → API Management"
  - "Customer punya akses ke dashboard weuseai untuk paste API key di kolom yang disediakan"
escalation_to: customer
---

# bitget-onboarding — trade-pro playbook

Playbook untuk memandu customer memasang Bitget API key dengan scope read-only saja, lalu memverifikasi scope itu di sisi platform sebelum membuka akses surface portofolio. Aksesnya tidak pernah dibuka berdasar omongan saja — scope diverifikasi via panggilan ke Bitget dulu, baru `bitget-readonly` aktif. Kalau scope-nya keliru, akses ditahan dan customer diminta regenerate key.

## Kapan dipakai

Customer minta dipasang integrasi Bitget supaya Trade Pro bisa baca portofolio mereka. Trigger phrases:

- "pasang Bitget"
- "setup API key Bitget"
- "connect akun Bitget aku"
- "biar Trade Pro bisa lihat portfolio Bitget"
- "aktivasi Bitget integration"
- "Bitget onboarding"

Kalau customer sudah pasang API key dan cuma minta surface data ("cek balance Bitget", "P&L hari ini") — pakai skill tunggal `bitget-readonly`, bukan playbook ini. Playbook ini khusus untuk proses pemasangan awal sekali per customer.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam atau berhari-hari antara pesan customer (mis. customer perlu buka tab Bitget, generate key, dan balik lagi).

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "bitget-onboarding", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 8`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer di gerbang lunak), `escalated` (parkir di gerbang keras — menunggu aksi customer di luar chat dan verifikasi platform-side), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 8`. Kalau sudah ada run berjalan, lanjut dari cursor-nya — jangan `start` ulang, karena `start` mereset run ke Langkah 1 dan menghapus `state_data` (termasuk catatan IP VPS dan flag scope yang sudah terkumpul).
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (gerbang lunak) atau `set_status: "escalated"` (gerbang keras), sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 8 selesai → panggil `complete`.

### Gerbang keras tanpa baris approval terpisah

Langkah 2 adalah gerbang lunak (`checkpoint`) — customer cuma perlu mengangguk. Langkah 7 adalah gerbang keras — tapi gerbang ini berbeda dari pola `compliance-cycle` atau `pt-perorangan-registration`. Di sini gerbang **tidak membuka baris `approval_requests`** dan tidak menunggu approval timestamp dari customer.

Alasannya: yang gerbang ini jaga bukan keputusan customer yang bisa expire (mis. tanda tangan kontrak 14 hari), tapi state platform Bitget itu sendiri — apakah API key yang customer pasang punya scope yang benar (read-only saja). Bitget yang jadi ledger otoritatif; respons permissions endpoint adalah signal durable-nya. Kalau scope keliru, gerbang reject inline platform-side: aku sampaikan ke customer apa yang salah, mereka regenerate key, paste ulang, dan Langkah 6 re-fires. Tidak ada timestamp yang menua, tidak ada baris approval yang perlu di-cleanup.

Konsekuensinya untuk runtime: di Langkah 7 run parkir di `escalated` dengan instruksi customer-facing yang jelas ("regenerate key dengan scope read-only saja, paste ulang di dashboard, balas saat sudah selesai"). Setelah customer membalas, agent `get`, kembali ke Langkah 6, dan menjalankan ulang panggilan permissions. Looping ini terjadi sebanyak yang dibutuhkan — gerbang baru lolos saat respons platform menunjukkan scope read-only bersih.

## Langkah-langkah

### Langkah 1 — Intake dan jelaskan kontrak read-only  ·  estimasi 2-3 menit

- **Aksi:** Baca pesan trigger customer, konfirmasi mereka sudah punya akun Bitget aktif dengan KYC lulus. Jelaskan kontrak read-only secara eksplisit: Trade Pro hanya akan membaca balance, posisi, P&L, dan funding rate — tidak akan pernah execute trade, withdraw, atau transfer. Sebutkan bahwa nanti aku akan verifikasi scope ini dari sisi Bitget, bukan cuma percaya omongan. Lalu `get` flow-state — kalau belum ada run, panggil `start` dengan `total_steps: 8`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer berisi minat memasang integrasi Bitget.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "has_bitget_account": true, "kyc_done": true, "readonly_contract_explained": true }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Customer konfirmasi punya akun aktif dan KYC selesai | `advance` ke Langkah 2 |
  | Customer belum punya akun atau KYC belum selesai | Tetap di Langkah 1, kasih panduan ringkas: daftar di app Bitget, lulus KYC level dasar dulu, baru balik ke sini |
  | Customer ragu soal kontrak read-only | Tetap di Langkah 1, jelaskan ulang dan tegaskan verifikasi scope dilakukan di Langkah 6 lewat panggilan platform |

- **Gerbang eskalasi:** `none`. Klarifikasi di sini adalah dialog pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah customer konfirmasi siap lanjut dan paham kontrak read-only.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai run-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Checkpoint: generate key dengan scope read-only saja  ·  estimasi tunggu customer

- **Aksi:** Tampilkan instruksi ringkas ke customer: buka Bitget app atau web → Settings → API Management → Create API Key. Di kolom scope, centang **Read-only** untuk Spot dan Futures (View saja). **Jangan centang** Trade, Withdraw, atau Transfer. Sebut field yang akan dihasilkan: API Key, Secret, Passphrase. Minta customer balas saat key sudah jadi. Panggil `advance` dengan `set_status: "awaiting_customer"`, lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`. URL eksternal customer-facing: `https://www.bitget.com/account/newapi` (di-surface sebagai instruksi, bukan link agent klik).
- **Input yang diharapkan:** Konfirmasi dari `state_data` Langkah 1 bahwa customer punya akun aktif.
- **Output yang diharapkan:** Saat customer balas, rekam keputusan ke `step_output` — `{ "key_generated": true, "scope_set_to_readonly_by_customer": true }`. Lalu cursor lanjut ke Langkah 3.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | "sudah", "selesai", "key-nya udah jadi" | Rekam, `advance` ke Langkah 3 |
  | Customer bingung di salah satu langkah Bitget UI | Tetap di Langkah 2, jawab pertanyaan spesifik mereka, jaga status `awaiting_customer` |
  | Customer bilang sudah centang Trade atau Withdraw juga | Tetap di Langkah 2, sampaikan "Mohon batalkan dulu — scope harus read-only saja. Kalau sudah terlanjur jadi, regenerate key dengan scope baru" |

- **Gerbang eskalasi:** `checkpoint`. Gerbang lunak — bukan parkir uang atau eksekusi, cuma menunggu aksi UI Bitget yang customer lakukan sendiri. Yang aku sampaikan saat memarkir: tiga step Bitget UI di atas plus konfirmasi tegas bahwa Trade dan Withdraw tidak boleh dicentang. Setelah itu aku berhenti dan menunggu balasan customer.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap kirim instruksi ke customer dan minta mereka balas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi cursor.

### Langkah 3 — Advisory IP whitelist dengan IP VPS customer  ·  estimasi 1-2 menit

- **Aksi:** Surface IP VPS customer (yang sudah kita ketahui dari provisioning record) dan tawarkan supaya customer paste IP itu ke field IP Whitelist di Bitget API Management. Sebut bahwa langkah ini opsional tapi disarankan — IP whitelist menambah lapis pertahanan kalau key bocor. Kalau customer pilih skip, lanjut tanpa flag. Kalau customer pilih pasang, kasih instruksi: di Bitget API Management page → Edit API Key → IP Whitelist → paste IP → save.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** IP VPS customer dari konteks deployment (`vps_ip`), tersedia di profil customer di dashboard.
- **Output yang diharapkan:** `step_output` berisi `{ "ip_whitelist_choice": "added" | "skipped", "ip_advised": "<ip>" }` — masuk ke `state_data`.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | "pasang" / "tambahin" | Rekam `ip_whitelist_choice: "added"`, `advance` ke Langkah 4 |
  | "skip" / "nggak usah" | Rekam `ip_whitelist_choice: "skipped"`, `advance` ke Langkah 4 |
  | Customer butuh bantuan paste IP di Bitget UI | Tetap di Langkah 3, jawab pertanyaannya, lalu lanjut |

- **Gerbang eskalasi:** `none`. Pilihan whitelist tidak menahan playbook — apa pun pilihannya, lanjut ke paste key.
- **Error handling:** Kalau IP VPS customer tidak bisa diambil dari profil mereka, sampaikan "Aku belum bisa ambil IP VPS kamu sekarang, kita skip IP whitelist untuk sementara. Kamu bisa pasang nanti dari Settings dashboard." Lanjut ke Langkah 4 dengan `ip_whitelist_choice: "skipped"`.

### Langkah 4 — Customer paste 3 field di dashboard  ·  estimasi tunggu customer

- **Aksi:** Arahkan customer buka tab dashboard weuseai, masuk ke Settings → Integrations → Bitget, lalu paste tiga field: API Key, Secret, Passphrase. Tegaskan bahwa nilai tiga field itu di-handle di dashboard, **bukan di chat ini** — customer jangan paste key ke pesan Telegram. Saat customer bilang sudah paste, lanjut. Aksi paste-nya sendiri terjadi di luar chat — aku tidak polling dashboard.
- **Tautan/endpoint:** URL eksternal customer-facing: dashboard weuseai (link yang customer biasa pakai untuk akses Settings → Integrations).
- **Input yang diharapkan:** Konfirmasi pesan customer bahwa tiga field sudah di-paste di dashboard.
- **Output yang diharapkan:** `step_output` berisi `{ "credentials_pasted_in_dashboard": true, "pasted_at": "<ISO timestamp dari pesan customer>" }` — masuk ke `state_data`. Tidak ada nilai key, secret, atau passphrase yang masuk ke `state_data` — `state_data` cuma menyimpan flag bahwa paste sudah terjadi.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | "udah paste" / "selesai" | Rekam flag, `advance` ke Langkah 5 |
  | Customer paste nilai key di chat Telegram (bukan dashboard) | Tetap di Langkah 4, minta customer **hapus pesan itu di Telegram** lalu paste di dashboard. Jangan rekam nilai apa pun ke `state_data`. Sampaikan bahwa nilai itu sudah dianggap kompromi — minta customer regenerate key baru dan paste yang baru di dashboard |
  | Customer bingung di mana kolom paste-nya | Tetap di Langkah 4, jawab pertanyaan navigation dashboard mereka |

- **Gerbang eskalasi:** `none`. Aksi paste-nya di luar chat. Aku menunggu konfirmasi customer sebagai signal untuk lanjut, bukan polling dashboard.
- **Error handling:** Kalau customer terlanjur paste nilai key di chat, treat key itu sebagai kompromi — minta customer kembali ke Bitget API Management, **hapus key itu**, generate yang baru dengan scope read-only, lalu paste yang baru di dashboard. Run mundur ke Langkah 2 dengan catatan kompromi di `state_data` (`{ "compromise_event": "key_pasted_in_chat", "at": "<timestamp>" }`).

### Langkah 5 — Platform terima dan simpan credentials terenkripsi  ·  estimasi 30 detik

- **Aksi:** Konfirmasi ke customer bahwa platform sudah menerima tiga field dari dashboard dan menyimpannya terenkripsi di .env VPS pribadi mereka. Sebut bahwa nilai-nya tidak pernah disimpan di database platform pusat — hanya di VPS customer. Lanjut langsung ke Langkah 6 untuk verifikasi scope. Customer tidak perlu melakukan apa-apa di langkah ini.
- **Tautan/endpoint:** Konfirmasi internal bahwa credentials sudah masuk ke `.env` VPS customer (path: `/home/weuseai/.hermes/.env`, key: `BITGET_API_KEY`, `BITGET_API_SECRET`, `BITGET_PASSPHRASE`).
- **Input yang diharapkan:** Flag `credentials_pasted_in_dashboard: true` dari `state_data` Langkah 4.
- **Output yang diharapkan:** `step_output` berisi `{ "credentials_stored_on_vps": true, "stored_at": "<ISO timestamp>" }` — masuk ke `state_data`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Credentials terkonfirmasi tersimpan di VPS | `advance` ke Langkah 6 |
  | Credentials belum sampai ke VPS (paste belum sync) | Tetap di Langkah 5, tunggu 30 detik, coba sekali lagi. Kalau masih belum, balik ke Langkah 4 dan minta customer cek apakah paste sudah disimpan di dashboard |

- **Gerbang eskalasi:** `none`. Langkah ini sambungan otomatis dari paste — customer-facing-nya cuma konfirmasi singkat dari aku.
- **Error handling:** Kalau platform menolak credentials karena format salah (mis. spasi ekstra, character non-ASCII), sampaikan ke customer field mana yang bermasalah dan minta paste ulang. Kembali ke Langkah 4 tanpa men-`start` ulang playbook.

### Langkah 6 — Verifikasi scope via panggilan Bitget permissions  ·  estimasi 30-60 detik

- **Aksi:** Panggil Bitget API permissions endpoint pakai credentials yang barusan tersimpan. Baca scope yang dikembalikan platform — daftar permission yang aktif di key itu (mis. `spot_read`, `futures_read`, `spot_trade`, `withdraw`, `transfer`). Klasifikasi: scope **bersih read-only** (cuma `*_read` permission, tidak ada write) atau **scope keliru** (ada `trade`, `withdraw`, `transfer`, atau permission setara). Sebelum lanjut ke Langkah 7, panggilan ini harus berhasil dan respons-nya harus terbaca — aku tidak boleh menebak scope dari nilai key apa pun.
- **Tautan/endpoint:** Bitget REST: `GET /api/v2/spot/account/info` plus `GET /api/v2/mix/account/account` untuk mencerminkan scope yang sebenarnya. Atau endpoint permissions setara bila tersedia di versi API yang dipakai.
- **Input yang diharapkan:** Credentials di .env VPS customer (dari Langkah 5).
- **Output yang diharapkan:** `step_output` berisi `{ "scope_check_called_at": "<ISO timestamp>", "scope_returned": ["spot_read", "futures_read", ...], "scope_clean_readonly": true | false }` — masuk ke `state_data`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Panggilan sukses, scope mengandung hanya `*_read` permission | Rekam `scope_clean_readonly: true`, `advance` ke Langkah 7 (langkah 7 akan auto-lolos) |
  | Panggilan sukses, scope mengandung permission write apa pun | Rekam `scope_clean_readonly: false`, `advance` ke Langkah 7 (langkah 7 akan tahan run di gerbang keras) |
  | Panggilan gagal — credentials ditolak Bitget (401) | Lihat Error handling |
  | Panggilan gagal — rate-limited (429) | Tunggu 30 detik, ulang sekali. Kalau masih rate-limited, sampaikan ke customer dan ulang dalam 2 menit |

- **Gerbang eskalasi:** `none`. Klasifikasi terjadi di sini, tindakan gerbang keras-nya di Langkah 7.
- **Error handling:** Distingsikan tiga mode gagal:
  - **Credentials ditolak (401):** key, secret, atau passphrase salah ketik atau tidak match. Balik ke Langkah 4, minta customer cek tiga field di dashboard dan paste ulang yang benar.
  - **Rate-limited (429):** retry sekali setelah 30 detik. Kalau persisten, kasih tahu customer dan jadwalkan ulang dalam 2 menit.
  - **Network atau Bitget down (5xx, timeout):** sampaikan "Bitget lagi tidak responsif, aku coba lagi sebentar lagi." Retry max 3x dengan back-off 30s/60s/120s. Setelah itu jangan lanjut — minta customer ulang trigger nanti.

### Langkah 7 — Gerbang keras: scope harus read-only sebelum akses dibuka  ·  estimasi 0 detik atau tunggu customer regenerate

- **Aksi:** Baca `scope_clean_readonly` dari `state_data` Langkah 6. Kalau `true`, lanjut auto ke Langkah 8 tanpa parkir — gerbang lolos. Kalau `false`, panggil `advance` dengan `set_status: "escalated"`, sampaikan ke customer scope yang keliru (sebut permission write spesifik yang terdeteksi), dan minta mereka regenerate key dengan scope read-only saja. Berhenti dan tunggu customer balas. **Tidak ada baris `approval_requests` yang dibuka di langkah ini** — gerbang ini bukan menunggu keputusan customer yang bisa di-cleanup di kemudian hari; gerbang ini menunggu state platform Bitget berubah (key di-regenerate dengan scope yang benar), dan respons permissions Bitget itu sendiri yang jadi ledger durable.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"` (hanya kalau scope keliru).
- **Input yang diharapkan:** `scope_clean_readonly` dan `scope_returned` dari `state_data` Langkah 6.
- **Output yang diharapkan:**
  - Kalau scope bersih: `step_output` berisi `{ "gate_decision": "passed_inline", "passed_at": "<ISO timestamp>" }`, cursor langsung ke Langkah 8.
  - Kalau scope keliru: tidak ada `step_output` baru sampai customer membalas dengan konfirmasi sudah regenerate. Saat customer balas, jangan langsung lolos — `get` flow-state, set cursor balik ke Langkah 6, jalankan ulang panggilan permissions, dan biarkan Langkah 7 evaluasi ulang.
- **Validasi:** Akses ke surface `bitget-readonly` (Langkah 8) **hanya boleh dibuka** kalau `scope_clean_readonly: true` di `state_data`. Bendera ini wajib datang dari panggilan permissions Bitget yang sukses — bukan dari pernyataan customer.

  | Kondisi | Tindakan |
  |---|---|
  | `scope_clean_readonly: true` | Auto-`advance` ke Langkah 8, surface ke customer: "Scope sudah aku verifikasi — read-only bersih, akses dibuka." |
  | `scope_clean_readonly: false` | `advance` dengan `set_status: "escalated"`. Sampaikan ke customer: "Scope key kamu masih mengandung [permission yang terdeteksi]. Aku belum buka akses. Tolong regenerate key di Bitget API Management — buang centang Trade, Withdraw, dan Transfer — lalu paste yang baru di dashboard. Balas saat selesai." Setelah customer balas, balik ke Langkah 6 untuk verifikasi ulang. Loop ini berulang sebanyak yang diperlukan |
  | Customer minta lolos meski scope keliru ("paksain aja, aku percaya kamu") | Tetap tolak. Sampaikan jelas: "Kontrak read-only aku jaga di sisi platform, bukan di sisi promise. Kalau scope-nya belum read-only, aku tidak buka akses — ini supaya kalau key kamu bocor, dampaknya nol di sisi trading." Tetap di `escalated` |

- **Gerbang eskalasi:** `hard-gate` (tanpa `approval_requests`). Ini gerbang keras inline platform-side. Trade Pro tidak meng-eksekusi atau membuka akses surface mana pun sebelum scope diverifikasi bersih oleh Bitget. Yang aku sampaikan ke customer saat memarkir: permission write spesifik yang terdeteksi, instruksi regenerate, dan kalimat eksplisit "akses belum dibuka". Berbeda dari pola `compliance-cycle` atau `pt-perorangan-registration` — di sini tidak ada baris `approval_requests`, tidak ada timer expiry, dan tidak ada timestamp approval. Yang jadi durable signal adalah respons permissions Bitget berikutnya. Loop antara Langkah 7 ↔ Langkah 6 berlanjut sampai scope bersih.
- **Error handling:** Kalau panggilan `advance` ke `escalated` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan ke customer scope yang salah dan instruksi regenerate — saat customer balas, `get` berikutnya akan menyinkronkan posisi.

### Langkah 8 — Akses dibuka dan kirim snapshot portofolio pertama  ·  estimasi 1-2 menit

- **Aksi:** Buka akses ke surface `bitget-readonly` (flag `bitget_readonly_enabled: true` di profil customer). Panggil `bitget-readonly` mode `balance` untuk snapshot pertama — tampilkan balance spot dan futures customer ke chat. Tutup dengan ringkasan singkat: integrasi aktif, scope read-only, contoh trigger phrase berikutnya yang customer bisa pakai ("cek portfolio Bitget", "P&L hari ini", "funding rate BTCUSDT"). Lalu panggil `complete`.
- **Tautan/endpoint:** `external:bitget-readonly` mode `balance` untuk snapshot pertama. `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` lalu `complete`.
- **Input yang diharapkan:** `scope_clean_readonly: true` dan `credentials_stored_on_vps: true` dari `state_data`.
- **Output yang diharapkan:** `step_output` berisi `{ "access_unlocked_at": "<ISO timestamp>", "first_snapshot_delivered": true }`, lalu `complete` operation. Pesan ke customer: snapshot balance plus kalimat penutup yang merangkum apa yang sudah aktif dan trigger berikutnya.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Snapshot pertama berhasil ditarik dan dikirim | `complete` run, kirim ringkasan penutup ke customer |
  | Snapshot pertama gagal padahal scope sudah bersih (mis. balance call timeout) | Jangan `complete`. Sampaikan "Akses sudah dibuka, tapi snapshot pertama belum berhasil ditarik. Aku coba lagi sebentar." Retry max 2x dengan jeda 30s |

- **Gerbang eskalasi:** `none`. Langkah penutup — gerbang keras Langkah 7 sudah lolos sebelum sampai sini, jadi tidak ada parkir lagi.
- **Error handling:** Kalau snapshot pertama gagal terus-menerus padahal scope bersih, sampaikan ke customer "Integrasi sudah aktif, tapi snapshot pertama belum bisa ditarik sekarang. Kamu sudah bisa pakai trigger 'cek portfolio Bitget' kapan saja — aku akan coba lagi saat itu." Tetap panggil `complete` — onboarding selesai walau snapshot pertama tertunda, karena hambatan ada di availability Bitget bukan di status integrasi.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Nada protective, decisive, ringkas — seperti specialist yang menjaga hard limit sambil tetap responsif
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (JWT, HMAC) bocor ke customer di pesan customer-facing — kode internal (401, 429) boleh muncul di Error handling SKILL.md, tapi customer-facing-nya sampaikan dalam bahasa biasa ("credentials ditolak", "Bitget lagi banyak request")
- Zero exclamation marks
- Setiap penolakan di gerbang keras dikemas sebagai proteksi customer, bukan birokrasi platform — "akses belum dibuka" disertai alasan dan jalan keluar

## Decline criteria

Trade Pro decline atau berhenti playbook ini kalau:

- Customer minta scope key dibuka lebih dari read-only ("biar bisa execute trade juga sekalian"). Phase 4 OAuth + execute scope yang akan menjawab itu — sekarang explicit decline, gerbang keras Langkah 7 tidak bisa di-bypass.
- Customer minta aku skip verifikasi scope ("aku jamin udah read-only, langsung buka aja"). Verifikasi scope adalah kontrak yang aku jaga di sisi platform, bukan di sisi trust.
- Customer paste API key di chat Telegram dan menolak regenerate setelah diingatkan. Key yang sudah tampil di chat dianggap kompromi.
- Customer minta playbook diteruskan tanpa punya akun Bitget aktif atau tanpa KYC lulus. Langkah 1 tidak bisa di-bypass.
- Customer minta deposit pertama atau aksi withdraw via Trade Pro. Tidak — playbook ini cuma membuka akses baca; deposit, withdraw, dan order placement customer lakukan langsung di app Bitget.

Saat decline, sampaikan alasannya singkat dan jelaskan jalur yang sesuai hard limits. Disclaim "ini bukan financial advice" tetap berlaku di setiap output yang menyangkut angka portofolio.
