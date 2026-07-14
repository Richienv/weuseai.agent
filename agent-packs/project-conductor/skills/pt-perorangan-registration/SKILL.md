---
skill_kind: playbook
name: pt-perorangan-registration
bundle: project-conductor
flow_state_playbook_id: pt-perorangan-registration
total_steps: 7
use_cases:
  - "Customer mau buka PT Perorangan dari nol sampai siap aktivasi Xendit produksi"
  - "Customer butuh badan usaha resmi supaya bisa terima pembayaran Xendit, BCA, atau payment gateway lain"
  - "Customer minta dipandu dari pilih nama dan KBLI sampai NIB terbit, lalu disambung ke rekening dan Xendit"
  - "Customer mau alur yang berhenti minta persetujuan sebelum setiap langkah yang menyentuh uang atau identitas hukum"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer berstatus WNI dengan KTP Indonesia yang masih berlaku — PT Perorangan adalah bentuk badan khusus WNI"
  - "Customer punya NPWP pribadi aktif di Coretax — kalau belum, registrasi NPWP pribadi dulu di coretaxdjp.pajak.go.id sebelum playbook ini dijalankan"
  - "Customer punya alamat usaha di Indonesia — alamat rumah dengan surat domisili kelurahan, virtual office, atau coworking dengan layanan alamat"
  - "Customer paham budget realistis — Rp 50 ribu PNBP AHU jalur mandiri, Rp 1,5 juta sampai 2,5 juta jalur jasa, plus Rp 1,5 juta sampai 3 juta per tahun kalau perlu virtual office"
  - "Customer paham timeline realistis — sekitar 10 sampai 18 hari kalender ujung ke ujung, sebagian besar adalah waktu tunggu portal pemerintah dan review Xendit"
  - "Customer punya channel Telegram terpasang untuk menerima dan menjawab permintaan persetujuan tiap gerbang keras"
escalation_to: customer
---

# pt-perorangan-registration — project-conductor playbook

Playbook ini memandu customer membuka PT Perorangan dari nol sampai akun Xendit produksi aktif. Tujuh langkah berurutan: cek kesiapan, kunci keputusan nama dan KBLI, daftar PT di AHU, daftar NPWP badan di Coretax, terbitkan NIB di OSS, urus domisili dan rekening bank, lalu ajukan aktivasi Xendit. Enam dari tujuh langkah adalah gerbang keras karena tiap langkah menyentuh uang, identitas hukum, atau penerbitan dokumen resmi yang tidak bisa dibatalkan dengan rapi.

Bedanya dengan skill `incorporation-advisor` tunggal yang sekali jalan: di sini customer dipandu sampai akun Xendit hidup, dengan satu titik persetujuan di tiap langkah berbiaya. Project Conductor tidak pernah submit dokumen atas nama customer ke portal pemerintah, tidak pernah membayar PNBP atas nama customer, dan tidak pernah memindahkan uang ke rekening manapun. Yang playbook lakukan adalah menyiapkan input lengkap, menjaga urutan tetap rapi walau ada jeda berhari-hari antar langkah, dan menahan tiap langkah berbiaya sampai customer setuju eksplisit.

## Kapan dipakai

Customer minta dibantu membuka PT Perorangan secara utuh, bukan sekadar tanya satu hal soal incorporation. Trigger phrases:

- "bantuin aku buka PT"
- "saya mau daftar PT Perorangan dari awal sampai jadi"
- "urus PT lengkap sampai bisa terima Xendit"
- "perlu badan usaha buat aktivasi Xendit produksi"
- "pandu aku dari pilih nama PT sampai NIB terbit"
- "bantu daftar PT Perorangan supaya bisa buka rekening BCA badan"
- "incorporate PT Perorangan, lalu sambung ke payment gateway"

Kalau customer cuma minta satu hal — "PT vs CV bedanya apa", "estimasi biaya akta saja", "step OSS saja" — itu skill `incorporation-advisor` tunggal, bukan playbook ini. Kalau customer mau tahu kewajiban filing pajak setelah PT berdiri, itu skill `compliance-checker` atau playbook `compliance-cycle` di Business Director, bukan playbook ini.

## Cara kerja

Playbook ini menyusun dua lapisan state yang berbeda. Keduanya saling melengkapi, tidak saling menggantikan.

**Lapisan pertama — flow-state, untuk urutan langkah.** Mesin `flow-state` mencatat posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berhari-hari antara satu langkah dan langkah berikutnya. Lapisan ini menjawab "kita sudah sampai langkah mana".

Kontrak flow-state — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "pt-perorangan-registration", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi: `start` (mulai atau ulang run — kirim `total_steps: 7`, cursor balik ke Langkah 1, status `in_progress`, dan `state_data` dikosongkan), `get` (baca run aktif — `current_step`, `status`, `state_data`), `advance` (catat output langkah ini via `step_output` yang di-shallow-merge ke `state_data`, geser cursor +1, opsional `set_status`), `complete`, `abort`.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di sebuah checkpoint), `escalated` (parkir keras — menunggu persetujuan langkah berbiaya), `completed`, `aborted`.

**Lapisan kedua — approval queue, untuk persetujuan langkah berbiaya yang durabel.** Tiap gerbang keras menyentuh uang, identitas hukum, atau penerbitan dokumen resmi. Persetujuan untuk langkah seperti itu tidak boleh hilang kalau customer butuh waktu menyelesaikan urusan portal pemerintah, dan punya batas waktu sendiri. Untuk itu tiap gerbang keras membuka satu permintaan persetujuan di approval queue — catatan persetujuan yang durabel, ber-expiry, dan muncul di Telegram customer. Lapisan ini menjawab "apakah langkah berbiaya ini sudah disetujui ya atau tidak".

Kontrak approval queue:

```
POST {WEUSEAI_APPROVAL_QUEUE_URL}
Headers: Content-Type: application/json
Body: { "customer_id", "action_kind", "action_summary", "action_payload", "proposed_by_agent": "project-conductor" }
```

Permintaan ber-`action_kind` `incorporate` (dipakai untuk pendirian PT, NPWP badan, NIB, dan aktivasi Xendit) berlaku 14 hari sejak dibuat. Permintaan ber-`action_kind` `regulatory_filing` (dipakai untuk dokumen domisili dan pembukaan rekening) berlaku 48 jam sejak dibuat. Saat customer membalas approve di Telegram, status permintaan menjadi `approved`. Kalau masa berlaku lewat tanpa balasan, permintaan menjadi `expired` dan run tetap terparkir — tidak ada submission, dan customer harus membuka persetujuan baru kalau masih mau melanjutkan.

Pembagian peran kedua lapisan: flow-state adalah "posisi kita di urutan langkah", approval queue adalah "keputusan ya atau tidak yang durabel untuk langkah berbiaya itu". Status `escalated` di flow-state hanya menandai run sedang terparkir — bukan catatan persetujuan. Persetujuan langkah berbiaya yang sebenarnya hidup di approval queue.

**Catatan alur multi-hari.** Playbook ini parkir lebih lama daripada playbook lain. Antara satu gerbang keras dan langkah berikutnya, customer biasanya menunggu portal pemerintah memproses dokumen — 1 sampai 3 hari kerja untuk NPWP badan, sampai satu minggu kalau KBLI bermasalah, 3 sampai 5 hari kerja untuk review Xendit. Total ujung ke ujung sekitar 10 sampai 18 hari kalender. Run flow-state tahan parkir selama itu, dan `state_data` menyimpan semua nomor dokumen yang sudah terbit supaya tidak perlu di-input ulang.

**Catatan reset run.** `start` adalah operasi destruktif — ia mereset cursor ke Langkah 1 dan menghapus `state_data` yang sudah terkumpul. Untuk playbook tujuh langkah multi-hari ini, `start` ulang di tengah run berarti membuang semua nomor dokumen yang sudah dikumpulkan. Karena itu Langkah 1 selalu memanggil `get` dulu — kalau ada run yang masih berjalan, lanjut dari cursor-nya, jangan `start` ulang.

Loop runtime:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, baru panggil `start` dengan `total_steps: 7`. Kalau sudah ada run berjalan, lanjut dari cursor-nya.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (checkpoint lunak) atau `set_status: "escalated"` (gerbang keras). Sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status terparkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Langkah 7 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

## Langkah-langkah

### Langkah 1 — Intake dan cek kesiapan  ·  estimasi 5-10 menit

- **Aksi:** Baca pesan customer. Konfirmasi customer mau bentuk PT Perorangan (sole-shareholder, modal di bawah Rp 5 miliar, omzet di bawah Rp 15 miliar setahun) — bukan PT biasa, CV, atau UD. Cek kesiapan dasar: status WNI, KTP Indonesia masih berlaku, NPWP pribadi aktif di Coretax, ada alamat usaha di Indonesia, dan budget plus timeline realistis. Sebelum `start` flow-state, panggil `get` dulu — kalau sudah ada run yang belum selesai, lanjut dari cursor-nya alih-alih memulai ulang. Kalau tidak ada run aktif, panggil `start` dengan `total_steps: 7`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`; `hermes-skill:incorporation-advisor` mode `pt-vs-cv` kalau customer ragu antara PT Perorangan dan bentuk badan lain.
- **Input yang diharapkan:** Pesan trigger customer. Idealnya menyebut tujuan (aktivasi Xendit, buka rekening, formalisasi bisnis) dan apakah dokumen pribadi sudah siap.
- **Output yang diharapkan:** `step_output` berisi `{ wni_confirmed, ktp_valid, ktp_address_current, personal_npwp_active, business_address_plan ("home"|"family"|"virtual_office"|"coworking"), budget_path ("diy"|"service-assisted"), service_provider_pref, timeline_understanding ("ok"|"too_slow") }` — masuk ke `state_data`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Semua field terisi dan customer adalah WNI dengan KTP berlaku plus NPWP pribadi aktif | `advance` ke Langkah 2 |
  | KTP customer kedaluwarsa atau alamat KTP sudah tidak nyambung dengan kelurahan tempat tinggal | Tetap di Langkah 1, sampaikan KTP harus diperbarui dulu di kelurahan (gratis, 1 sampai 30 hari), tahan run sampai dokumen siap |
  | Customer belum punya NPWP pribadi aktif di Coretax | Tetap di Langkah 1, arahkan customer mendaftar NPWP pribadi dulu di `coretaxdjp.pajak.go.id` (sekitar 15 menit, gratis), tahan run sampai NPWP pribadi terbit |
  | Customer ternyata bukan WNI | Lihat Decline criteria — PT Perorangan hanya untuk WNI, tawarkan alur PMA atau PT biasa lewat `incorporation-advisor` |
  | Customer minta lewati langkah berbiaya supaya lebih cepat atau lebih murah | Lihat Decline criteria — playbook ini tidak melewati gerbang keras |

- **Gerbang eskalasi:** `checkpoint` — kalau ada field penting yang belum jelas atau dokumen pribadi belum siap, `advance` dengan `set_status: "awaiting_customer"` dan tanya dalam satu pesan ringkas. Yang agent sampaikan ke customer di checkpoint ini: ringkasan jalur PT Perorangan (siapa yang cocok, biaya jalur mandiri vs jalur jasa, perkiraan waktu ujung ke ujung), lalu satu pertanyaan tertutup berisi field yang kurang. Berhenti dan tunggu balasan. Setelah jawabannya cukup, lanjut `advance` ke Langkah 2.
- **Error handling:** Kalau `get` atau `start` flow-state gagal, ulangi sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai prosesnya, coba lagi sebentar" dan jangan lanjut. Kalau customer belum punya NPWP pribadi, jangan otomatis mendaftarkan untuk customer — itu langkah yang customer harus jalankan sendiri di portal Coretax, playbook ini hanya memandu.

### Langkah 2 — Kunci keputusan: nama, KBLI, alamat, modal  ·  estimasi 1-4 jam tunggu customer

- **Aksi:** Bantu customer mengunci empat keputusan yang harus tetap sama sepanjang sisa playbook karena akan disalin antar portal (AHU, Coretax, OSS, Xendit). Pertama, **nama PT** — minimum 3 kata, harus diakhiri "Perseroan Perorangan" (auto-ditambah sistem AHU), tidak boleh duplikat PT yang sudah ada, cek availability langsung di `ptp.ahu.go.id` (gratis, tanpa login). Minta customer siapkan 3 nama cadangan kalau pilihan pertama bentrok. Nama English-only seperti "weuseai" borderline — sarankan bentuk Bahasa Indonesia. Kedua, **KBLI** — untuk SaaS dan software primary adalah `62010 (Aktivitas Pemrograman Komputer)`, secondary `62029 (Aktivitas Konsultasi Komputer Lainnya)` kalau ada komponen konsultasi, opsional `63122 (Portal Web dan/atau Platform Digital dengan Tujuan Komersial)` kalau ada komponen platform digital. Pakai KBLI 2025 (PerBPS 7/2025) yang menggantikan KBLI 2020 sejak Desember 2025. Hindari `62090` sebagai primary — terlalu umum, sering di-flag reviewer Xendit. Risk tier `62010` adalah Rendah, NIB cukup tanpa Sertifikat Standar atau Izin tambahan. Ketiga, **alamat usaha** — harus alamat Indonesia yang konsisten dengan zonasi komersial (Perda DKI 1/2014 untuk Jakarta). Tiga pilihan: rumah pribadi atau keluarga dengan surat domisili kelurahan, virtual office di CBD Jakarta sekitar Rp 1,5 sampai 3 juta per tahun (vOffice, Hive Five, CEO Suite reputable), atau coworking dengan layanan alamat. Alamat residensial di Jakarta sering ditolak NIB — kalau ragu, virtual office paling clean. Keempat, **modal** — rekomendasi modal dasar Rp 50 juta dengan modal disetor minimum 25 persen (Rp 12,5 juta). PT Perorangan harus tetap di bawah Rp 5 miliar modal dasar dan Rp 15 miliar omzet tahunan; lewat batas itu wajib konversi ke PT biasa. Setelah keempat keputusan terkunci, buka satu permintaan persetujuan `action_kind: "incorporate"` di approval queue dengan ringkasan keempat keputusan dan opsi pakai jalur jasa (SmartLegal Rp 1,5 juta, Kontrak Hukum Rp 2 juta, Hive Five Rp 2,5 juta) atau jalur mandiri (Rp 50 ribu PNBP saja). Panggil `advance` flow-state dengan `set_status: "escalated"`.
- **Tautan/endpoint:** `https://ptp.ahu.go.id` (cek availability nama, gratis tanpa login); `hermes-skill:incorporation-advisor` mode `oss-walkthrough` untuk panduan KBLI; `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "incorporate"`); lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`.
- **Input yang diharapkan:** Hasil cek availability nama dari customer (3 nama urut prioritas), preferensi business_kind untuk pemilihan KBLI yang akurat, keputusan alamat dari `business_address_plan` di `state_data` Langkah 1, dan pilihan jalur jasa atau mandiri.
- **Output yang diharapkan:** `step_output` berisi `{ chosen_company_name, backup_names: [...], primary_kbli ("62010"), secondary_kbli ([...]), business_address: { line, kelurahan, kecamatan, kota, zoning_type }, modal_dasar_idr, modal_disetor_idr, registration_path ("diy"|"service-assisted"), service_provider, incorporate_approval_request_id }` — masuk ke `state_data`. `incorporate_approval_request_id` adalah id permintaan persetujuan yang menjadi rujukan saat customer membalas approve di Telegram.
- **Validasi:** Langkah 3 hanya boleh berjalan kalau permintaan `incorporate` di Langkah 2 berstatus `approved`. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / respons customer | Tindakan |
  |---|---|
  | Permintaan `incorporate` berstatus `approved` | `advance` ke Langkah 3 |
  | Customer minta ganti nama, KBLI, alamat, atau modal | Susun ulang keputusan, buka permintaan persetujuan baru, tetap di Langkah 2 dengan status `escalated` |
  | Customer belum membalas, permintaan masih `pending` | Run tetap `escalated`, tidak ada aksi — tunggu balasan |
  | Permintaan berstatus `expired` (14 hari lewat tanpa balasan) | Run tetap terparkir `escalated`. Sampaikan ke customer bahwa persetujuan kedaluwarsa dan keputusan belum dikunci. Kalau masih relevan, buka permintaan persetujuan baru — run tidak otomatis lanjut |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras yang paling sering jadi titik gagal seluruh proses. Pemilihan KBLI yang salah menyebabkan 60 persen penolakan NIB di OSS, dan ganti KBLI setelah PT terdaftar berarti mengulangi AHU, Coretax, dan OSS dari nol. Pemilihan nama yang bentrok memaksa pendaftaran ulang AHU dan kehilangan PNBP. Alamat residensial yang ditolak zonasi memaksa pindah ke virtual office di tengah jalan dan refile NIB. Karena itu keempat keputusan dikunci dan disetujui customer secara eksplisit sebelum apa pun didaftarkan ke portal pemerintah. Urutan langkah dipegang oleh flow-state yang terparkir di `escalated`. Keputusan ya atau tidak atas paket keputusan dipegang oleh permintaan `incorporate` di approval queue, berlaku 14 hari. Yang agent sampaikan ke customer saat memarkir: ringkasan keempat keputusan, biaya jalur mandiri vs jalur jasa, tiga alasan gerbang ini ada (penolakan NIB karena KBLI, bentrok nama, penolakan zonasi), plus "Aku belum daftarkan apa pun ke AHU. Pendaftaran jalan hanya setelah kamu approve permintaan di Telegram, dan persetujuan ini berlaku 14 hari."
- **Error handling:** Kalau pembukaan permintaan persetujuan gagal, ulangi sekali. Kalau masih gagal, sampaikan ke customer bahwa permintaan persetujuan belum bisa dibuat dan jangan `advance` ke `escalated` — run harus tetap di Langkah 2 dengan keempat keputusan tersimpan di draft sampai permintaan berhasil dibuka. Kalau cek availability nama menemukan nama pertama sudah dipakai PT lain, jangan otomatis pilih nama cadangan — sampaikan ke customer dan minta dia konfirmasi nama mana yang dipakai sebelum mengunci.

### Langkah 3 — Pendaftaran PT Perorangan di AHU  ·  estimasi 1-2 hari tunggu customer

- **Aksi:** Customer melakukan pendaftaran di `https://ptp.ahu.go.id` memakai keempat keputusan yang sudah dikunci di Langkah 2. Aksi yang customer kerjakan di portal: login dengan NPWP pribadi, mengisi form pendirian (nama, alamat usaha, KBLI, modal dasar, modal disetor, identitas direktur), membayar PNBP Rp 50 ribu lewat Virtual Account atau e-wallet, lalu mengunduh dua dokumen yang otomatis terbit dalam beberapa jam — Pernyataan Pendirian Perseroan Perorangan (PDF) dan Sertifikat Pendaftaran Pendirian Perseroan Perorangan (PDF, berisi nomor SK Kemenkumham). Kalau customer pilih jalur jasa di Langkah 2, jasa provider yang menjalankan langkah ini dan menyerahkan dua PDF tersebut ke customer dalam 3 sampai 7 hari kerja. Apapun jalurnya, Project Conductor tidak login atas nama customer dan tidak membayar PNBP atas nama customer. Sebelum langkah ini, buka satu permintaan persetujuan `action_kind: "incorporate"` di approval queue berisi ringkasan pendaftaran (nama PT, modal, alamat, biaya yang akan dibayar customer) dan instruksi langkah portal. Panggil `advance` flow-state dengan `set_status: "escalated"`. Saat customer balas approve dan kemudian menyerahkan dua PDF beserta nomor SK Kemenkumham, simpan ke `state_data` dan `advance` ke Langkah 4.
- **Tautan/endpoint:** `https://ptp.ahu.go.id` (portal PT Perorangan Ditjen AHU Kemenkumham); `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "incorporate"`); `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`.
- **Input yang diharapkan:** Seluruh `state_data` dari Langkah 2 — `chosen_company_name`, `primary_kbli`, `secondary_kbli`, `business_address`, `modal_dasar_idr`, `modal_disetor_idr`, `registration_path`. Saat customer membalas setelah pendaftaran: dua PDF AHU dan nomor SK Kemenkumham.
- **Output yang diharapkan:** `step_output` berisi `{ ahu_approval_request_id, pernyataan_pendirian_path, sertifikat_pendaftaran_path, sk_kemenkumham_number, pendaftaran_date, pnbp_receipt_ref }` — masuk ke `state_data`. Kedua PDF disimpan secara lokal oleh customer dan di-back-up ke dua tempat (lokal plus cloud) sesuai praktik standar — kehilangan login AHU adalah pemulihan multi-minggu.
- **Validasi:** Langkah 4 hanya boleh berjalan kalau permintaan `incorporate` di Langkah 3 berstatus `approved` dan dua PDF AHU plus nomor SK Kemenkumham sudah masuk ke `state_data`. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / hasil pendaftaran | Tindakan |
  |---|---|
  | Permintaan `incorporate` berstatus `approved` dan customer menyerahkan kedua PDF plus nomor SK | Verifikasi nomor SK terbaca dan QR code di sertifikat utuh (jangan screenshot, harus PDF asli), simpan ke `state_data`, `advance` ke Langkah 4 |
  | Customer balas pendaftaran ditolak AHU karena nama bentrok | Kembali ke Langkah 2 untuk mengunci ulang nama dari `backup_names`, buka permintaan persetujuan baru, lalu balik ke Langkah 3 |
  | Customer balas portal AHU error mid-submission | Tetap di Langkah 3, sampaikan customer bisa lanjut dari draft yang tersimpan di "Daftar Transaksi" portal AHU, jangan ulang Langkah 2 |
  | Permintaan `incorporate` `expired` 14 hari tanpa balasan | Run tetap terparkir `escalated`. Sampaikan persetujuan kedaluwarsa dan pendaftaran belum jalan. Kalau masih relevan, buka permintaan persetujuan baru |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras karena pendaftaran AHU adalah penciptaan badan hukum yang sebenarnya. Setelah PNBP Rp 50 ribu dibayar dan SK Kemenkumham terbit, PT itu sah secara hukum dan tercatat di Ditjen AHU; pembatalan butuh proses likuidasi tersendiri. Project Conductor tidak login ke AHU dan tidak membayar atas nama customer. Persetujuan customer menutup pintu antara "siap daftar" dan "PT sudah terdaftar" — sekali approval ini lolos, langkah pendaftaran jalan dan tidak bisa dibatalkan dengan rapi. Urutan langkah dipegang oleh flow-state `escalated`, keputusan ya atau tidak atas pendaftaran dipegang oleh permintaan `incorporate` 14 hari. Yang agent sampaikan saat memarkir: nama PT yang akan didaftarkan, biaya Rp 50 ribu PNBP yang customer bayar di portal, link `ptp.ahu.go.id`, langkah-langkah portal singkat, plus "Aku belum daftarkan apa pun. Pendaftaran adalah penciptaan badan hukum yang sah dan tidak bisa dibatalkan dengan rapi. Persetujuan ini berlaku 14 hari."
- **Error handling:** Kalau customer membayar PNBP tapi dokumen tidak terbit dalam 24 jam (di luar jeda normal beberapa jam), arahkan customer kontak helpdesk Ditjen AHU di `ahu.go.id` dengan menyertakan referensi PNBP — playbook ini menahan run di Langkah 3 sampai dokumen turun. Kalau QR code sertifikat rusak karena di-screenshot atau dicetak-lalu-dipindai, minta customer mengunduh ulang PDF asli dari menu "Daftar Transaksi" AHU — Xendit memverifikasi PDF lewat QR. Kalau alamat usaha ternyata tertolak waktu submission, kembali ke Langkah 2 untuk mengunci ulang alamat (kemungkinan besar pindah ke virtual office) dan ulangi gerbang keras Langkah 2 sebelum balik ke Langkah 3.

### Langkah 4 — Pendaftaran NPWP Badan di Coretax  ·  estimasi 1-3 hari kerja tunggu customer

- **Aksi:** Customer mendaftarkan NPWP untuk PT yang baru terbit, terpisah dari NPWP pribadi customer. Portal: `https://coretaxdjp.pajak.go.id`. Aksi yang customer kerjakan di portal: login dengan NPWP pribadi, pilih register, pilih "Badan" lalu kategori "Perseroan Terbatas (PT) Perorangan" (jangan pilih "PT" generic — field form-nya beda), masukkan nomor SK Kemenkumham dari `state_data` Langkah 3, unggah `pernyataan_pendirian_path`, isi alamat sesuai AHU dan email plus nomor telepon untuk verifikasi. Submission sekitar 20 menit. Kartu NPWP PDF terbit 1 sampai 3 hari kerja (kadang sama hari) — kartu fisik tidak lagi dikirim, semua digital. DJP mewajibkan pendaftaran NPWP badan dalam 1 bulan sejak PT berdiri; lewat itu bisa kena denda Rp 100 ribu sampai 500 ribu. Sebelum langkah ini, buka satu permintaan persetujuan `action_kind: "incorporate"` di approval queue berisi ringkasan pendaftaran NPWP badan (data yang akan disubmit, deadline 1 bulan DJP). Panggil `advance` flow-state dengan `set_status: "escalated"`. Saat customer balas approve dan menyerahkan kartu NPWP PDF, simpan ke `state_data` dan `advance` ke Langkah 5.
- **Tautan/endpoint:** `https://coretaxdjp.pajak.go.id` (portal DJP Coretax, menggantikan ereg.pajak.go.id sejak Januari 2025); `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "incorporate"`); `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`.
- **Input yang diharapkan:** `sk_kemenkumham_number`, `pernyataan_pendirian_path`, `business_address`, dan `chosen_company_name` dari `state_data` (hasil Langkah 2 dan 3). Saat customer membalas setelah submission: kartu NPWP badan PDF dengan QR code utuh.
- **Output yang diharapkan:** `step_output` berisi `{ npwp_approval_request_id, npwp_badan_number, npwp_badan_card_path, npwp_issue_date }` — masuk ke `state_data`. Kartu NPWP PDF tidak boleh dimodifikasi (QR code dipakai Xendit untuk verifikasi).
- **Validasi:** Langkah 5 hanya boleh berjalan kalau permintaan `incorporate` di Langkah 4 berstatus `approved` dan kartu NPWP badan PDF plus nomor NPWP sudah masuk ke `state_data`. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / hasil submission | Tindakan |
  |---|---|
  | Permintaan `incorporate` berstatus `approved` dan customer menyerahkan kartu NPWP plus nomor | Verifikasi nomor NPWP terbaca dan QR utuh, simpan ke `state_data`, `advance` ke Langkah 5 |
  | Customer balas portal Coretax error mid-submission dan draft hilang | Tetap di Langkah 4, sampaikan customer harus submit ulang dari awal, sarankan screenshot per langkah ke depan, tunggu kartu terbit ulang |
  | Customer balas verifikasi DJP minta dokumen tambahan | Tetap di Langkah 4, bantu siapkan dokumen pendukung dari `state_data`, tunggu DJP menerbitkan kartu |
  | Permintaan `incorporate` `expired` 14 hari tanpa balasan | Run tetap terparkir `escalated`. Sampaikan persetujuan kedaluwarsa dan submission belum jalan. Kalau masih relevan, buka permintaan persetujuan baru |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras karena pendaftaran NPWP badan adalah penciptaan identitas pajak yang melekat ke PT, dan submission ke DJP membawa konsekuensi kewajiban filing pajak (PPh Final UMKM 0,5 persen bulanan, SPT Tahunan tahunan). Project Conductor tidak login Coretax dan tidak submit atas nama customer. Persetujuan customer menutup pintu antara "siap daftar NPWP" dan "NPWP badan terbit dan terhubung ke PT". Yang agent sampaikan saat memarkir: nama PT, nomor SK Kemenkumham yang akan dipakai, deadline 1 bulan DJP dengan penalti telat Rp 100 ribu sampai 500 ribu, link `coretaxdjp.pajak.go.id`, plus "Aku belum daftarkan NPWP badan. Setelah terbit, PT punya kewajiban filing pajak bulanan dan tahunan. Persetujuan ini berlaku 14 hari."
- **Error handling:** Kalau customer pilih kategori "PT" generic alih-alih "Perseroan Terbatas (PT) Perorangan" di Coretax, submission akan minta field yang tidak sesuai PT Perorangan — sampaikan customer untuk batalkan draft dan mulai ulang dengan kategori benar. Kalau Coretax mengalami outage (stabilitas portal masih bermasalah sepanjang 2025-2026), tahan run di Langkah 4 dan minta customer mencoba ulang dalam beberapa jam — jangan `abort`. Kalau customer mendekati deadline 1 bulan dan submission belum berhasil, sampaikan opsi konsultasi langsung ke KPP setempat untuk menghindari denda.

### Langkah 5 — Penerbitan NIB di OSS-RBA  ·  estimasi 1-3 hari kerja tunggu customer

- **Aksi:** Customer menerbitkan NIB (Nomor Induk Berusaha) yang menjadi izin usaha utama dan menggantikan SIUP plus TDP lama. Portal: `https://oss.go.id`. Aksi yang customer kerjakan di portal: login OSS-RBA dengan NPWP pribadi, pilih register pelaku usaha "Badan", masukkan nomor NPWP badan dari `state_data` Langkah 4 dan nomor SK Kemenkumham dari Langkah 3, pilih KBLI primary `primary_kbli` dan secondary `secondary_kbli` dari Langkah 2, isi alamat usaha sama persis dengan yang ada di Pernyataan Pendirian AHU (mismatch = NIB ditolak), deklarasi modal sesuai AHU. Risk tier KBLI `62010` adalah Rendah — NIB cukup tanpa Sertifikat Standar atau Izin tambahan. NIB PDF terbit hari yang sama kalau data clean, sampai 1 minggu kalau OSS flag KBLI. NIB juga menjadi `proof_of_business` di form Xendit (item terpisah tidak diperlukan untuk PT Perorangan). Tidak ada biaya untuk penerbitan NIB. Sebelum langkah ini, buka satu permintaan persetujuan `action_kind: "incorporate"` di approval queue berisi ringkasan data yang akan disubmit (KBLI, alamat, modal — semua dari `state_data`). Panggil `advance` flow-state dengan `set_status: "escalated"`. Saat customer balas approve dan menyerahkan NIB PDF, simpan ke `state_data` dan `advance` ke Langkah 6.
- **Tautan/endpoint:** `https://oss.go.id` (portal OSS-RBA BKPM); `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "incorporate"`); `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`.
- **Input yang diharapkan:** `primary_kbli`, `secondary_kbli`, `business_address`, `modal_dasar_idr`, `chosen_company_name`, `sk_kemenkumham_number`, `npwp_badan_number` dari `state_data` (hasil Langkah 2, 3, 4). Saat customer membalas setelah penerbitan: NIB PDF.
- **Output yang diharapkan:** `step_output` berisi `{ nib_approval_request_id, nib_number, nib_pdf_path, nib_issue_date, risk_tier ("Rendah") }` — masuk ke `state_data`. NIB PDF dipakai dua kali di Xendit (proof of business plus NIB upload).
- **Validasi:** Langkah 6 hanya boleh berjalan kalau permintaan `incorporate` di Langkah 5 berstatus `approved` dan NIB PDF plus nomor NIB sudah masuk ke `state_data`. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / hasil penerbitan | Tindakan |
  |---|---|
  | Permintaan `incorporate` berstatus `approved` dan customer menyerahkan NIB PDF plus nomor | Verifikasi nomor NIB terbaca dan alamat di NIB sama persis dengan AHU, simpan ke `state_data`, `advance` ke Langkah 6 |
  | Customer balas NIB ditolak karena KBLI dianggap tidak cocok bisnis | Sampaikan KBLI mis-selection adalah penyebab 60 persen penolakan NIB. Kembali ke Langkah 2 untuk mengunci ulang KBLI, buka permintaan persetujuan baru, ulangi AHU dan Coretax kalau alamat atau modal juga ikut berubah, baru balik ke Langkah 5 |
  | Customer balas NIB ditolak karena alamat tidak masuk zonasi komersial | Sampaikan zonasi residensial sering ditolak. Kembali ke Langkah 2 untuk pindah alamat ke virtual office, ulangi AHU dan Coretax karena alamat usaha di tiga portal harus sama, baru balik ke Langkah 5 |
  | Customer balas NIB ditolak karena nama atau modal tidak match AHU | Tetap di Langkah 5, sampaikan customer perbaiki field yang salah di form OSS — data master ada di AHU, OSS mengikuti |
  | Permintaan `incorporate` `expired` 14 hari tanpa balasan | Run tetap terparkir `escalated`. Sampaikan persetujuan kedaluwarsa dan penerbitan belum jalan. Kalau masih relevan, buka permintaan persetujuan baru |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras karena NIB adalah izin usaha resmi yang melekat ke PT untuk seluruh operasinya. KBLI yang dipilih punya konsekuensi hukum jangka panjang (kewajiban sektor, tingkat risiko, perizinan tambahan kalau pindah KBLI nanti), dan KBLI mis-selection menyebabkan 60 persen penolakan NIB. Ganti KBLI setelah NIB terbit berarti mengubah perizinan resmi dan refile dengan resiko di-audit. Project Conductor tidak login OSS dan tidak submit atas nama customer. Yang agent sampaikan saat memarkir: KBLI yang akan disubmit dan kenapa dipilih (cocok untuk SaaS, risk tier Rendah, sering diterima reviewer Xendit), alamat dan modal yang harus sama persis dengan AHU, link `oss.go.id`, plus "Aku belum terbitkan NIB. NIB adalah izin usaha resmi PT dan jadi rujukan untuk semua kepatuhan ke depan. Persetujuan ini berlaku 14 hari."
- **Error handling:** Kalau NIB tertahan lebih dari satu minggu tanpa respons OSS, sampaikan customer hubungi helpdesk OSS-RBA via portal — playbook tetap di Langkah 5. Kalau penolakan terjadi karena mismatch nama atau alamat antara form OSS dan PDF AHU, jangan otomatis perbaiki di OSS — minta customer mencocokkan dulu sumber master AHU lalu submit ulang OSS, karena Xendit nanti membandingkan ketiganya (AHU, NPWP, NIB) dan inkonsistensi sekecil apa pun bisa menahan verifikasi Xendit seminggu.

### Langkah 6 — Domisili dan rekening bank badan  ·  estimasi 3-7 hari kerja tunggu customer

- **Aksi:** Customer menyelesaikan dua hal yang menyentuh uang dan dokumen pendukung ke depan. Pertama, **konfirmasi domisili** — kalau di Langkah 2 customer pilih `home` atau `family`, dia mengurus Surat Keterangan Domisili Usaha (SKDU) di kelurahan setempat (RT/RW dulu, lalu kelurahan, biaya administratif minim). Kalau pilih `virtual_office` atau `coworking`, customer membayar tagihan tahunan virtual office (Rp 1,5 sampai 3 juta per tahun) dan menerima surat domisili plus layanan terima surat. Kedua, **buka rekening bank badan** — customer datang langsung ke cabang bank dengan paket dokumen lengkap (KTP, NPWP pribadi, NPWP badan, Pernyataan Pendirian, Sertifikat Pendaftaran AHU, NIB, surat domisili, stempel PT). Bank yang umum dipakai dan widely supported Xendit: BCA (rekomendasi utama), Mandiri, BNI, BRI. Proses sekitar 1 jam di cabang plus 1 sampai 3 hari kerja sampai rekening aktif dan kartu debit terbit. Setoran awal bervariasi (BCA biasanya Rp 1 juta, beberapa bank Rp 500 ribu). Project Conductor tidak menelepon bank atas nama customer, tidak membayar virtual office atas nama customer, dan tidak menyetor uang awal atas nama customer. Sebelum langkah ini, buka satu permintaan persetujuan `action_kind: "regulatory_filing"` di approval queue berisi ringkasan biaya domisili plus biaya pembukaan rekening (setoran awal, paket dokumen, bank yang dipilih). Panggil `advance` flow-state dengan `set_status: "escalated"`. Saat customer balas approve dan menyerahkan nomor surat domisili plus nomor rekening badan, simpan ke `state_data` dan `advance` ke Langkah 7.
- **Tautan/endpoint:** Cabang bank pilihan customer (datang langsung); kantor kelurahan setempat atau penyedia virtual office; `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "regulatory_filing"`); `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`.
- **Input yang diharapkan:** Seluruh paket dokumen dari `state_data` (KTP, NPWP pribadi customer, NPWP badan, dua PDF AHU, NIB PDF). `business_address_plan` dari Langkah 1 menentukan apakah jalur domisili adalah SKDU kelurahan atau virtual office.
- **Output yang diharapkan:** `step_output` berisi `{ domicile_approval_request_id, domicile_letter_ref, domicile_provider ("kelurahan"|"voffice_name"), domicile_annual_cost_idr, bank_name, business_account_number, account_open_date }` — masuk ke `state_data`. Nomor rekening badan jadi tujuan settlement Xendit di Langkah 7.
- **Validasi:** Langkah 7 hanya boleh berjalan kalau permintaan `regulatory_filing` di Langkah 6 berstatus `approved` dan nomor rekening badan plus surat domisili sudah masuk ke `state_data`. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / hasil pembukaan | Tindakan |
  |---|---|
  | Permintaan `regulatory_filing` berstatus `approved` dan customer menyerahkan nomor rekening plus surat domisili | Verifikasi nomor rekening atas nama PT (bukan pribadi customer), simpan ke `state_data`, `advance` ke Langkah 7 |
  | Bank tolak pembukaan rekening karena dokumen kurang | Tetap di Langkah 6, sampaikan dokumen yang kurang dari paket standar, customer kembali ke cabang setelah lengkap |
  | Bank tolak pembukaan rekening karena alamat di NIB tidak match alamat di KTP atau domisili | Sampaikan inkonsistensi alamat. Kalau perlu, kembali ke Langkah 2 untuk mengunci ulang alamat dan refile AHU plus Coretax plus NIB — biaya tinggi, sebaiknya hindari dengan memilih alamat yang konsisten di Langkah 2 |
  | Customer balas virtual office bermasalah (tagihan tidak jelas, layanan terima surat tidak jalan) | Tetap di Langkah 6, sampaikan opsi pindah ke provider virtual office lain (vOffice, Hive Five, CEO Suite reputable) — kalau alamat berubah, hindari karena mahal di hilir |
  | Permintaan `regulatory_filing` `expired` 48 jam tanpa balasan | Run tetap terparkir `escalated`. Sampaikan persetujuan kedaluwarsa dan pembukaan belum jalan. Kalau masih relevan, buka permintaan persetujuan baru |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras karena menyentuh uang nyata (setoran awal bank, biaya tahunan virtual office) dan pembukaan rekening keuangan atas nama badan hukum. Sekali rekening terbuka, PT punya kewajiban tambahan (saldo minimum, biaya admin bulanan, audit trail). Virtual office yang dipilih juga jadi alamat resmi PT — pindah alamat di hilir berarti refile NIB. Project Conductor tidak datang ke cabang bank, tidak menyetor uang, dan tidak menandatangani dokumen rekening atas nama customer. Yang agent sampaikan saat memarkir: ringkasan biaya (setoran awal bank, biaya tahunan virtual office), nama bank yang dipilih dan kenapa (rekomendasi BCA karena widely supported Xendit), paket dokumen yang harus dibawa ke cabang, plus "Aku belum buka rekening dan belum bayar virtual office. Kedua langkah ini mengikat PT untuk biaya bulanan dan tahunan ke depan. Persetujuan ini berlaku 48 jam."
- **Error handling:** Kalau bank menolak karena alamat tidak match, jangan otomatis arahkan ke Langkah 2 untuk refile — sampaikan dulu ke customer beratnya (refile AHU plus Coretax plus NIB, biaya dan waktu) supaya customer bisa mempertimbangkan apakah pakai bank lain dengan toleransi alamat lebih longgar lebih masuk akal. Kalau customer ingin menunda pembukaan rekening (mis. masih cari bank), tahan run di Langkah 6 tanpa `abort` — `state_data` menyimpan semua dokumen yang sudah terbit dan run bisa dilanjutkan saat customer siap.

### Langkah 7 — Aktivasi Xendit Produksi  ·  estimasi 5-10 hari kalender tunggu Xendit

- **Aksi:** Customer log in ke dashboard Xendit dan submit Activation form untuk PT yang baru terbentuk. Customer mengunggah tujuh dokumen: logo bisnis (`weuseai-circle-monogram.png` atau setara, PNG dengan background transparan atau putih, sebaiknya monogram persegi karena logo persegi panjang render buruk di payment pages), foto KTP direktur (depan, color, semua sudut terlihat, tidak ada glare di hologram), selfie pegang KTP (KTP dekat wajah, tidak filter, latar netral), NIB PDF dari `state_data` Langkah 5 (juga dipakai sebagai `proof_of_business`), Pernyataan Pendirian PDF dari Langkah 3, Sertifikat Pendaftaran PDF dari Langkah 3, NPWP badan PDF dari Langkah 4. Field "Company Name" di Xendit harus sama persis huruf-per-huruf dengan nama PT di Pernyataan Pendirian. Field tujuan settlement diisi nomor rekening badan dari Langkah 6. Setelah submit, review Xendit memakan 3 sampai 5 hari kerja (5 sampai 10 hari kalender termasuk akhir pekan). Kalau Xendit minta revisi, customer perbaiki dalam 24 jam dan kirim ulang — tiap putaran menambah 2 sampai 3 hari. Setelah approved, customer beralih dari Test mode ke Live mode dan menjalankan transaksi nyata pertama (mis. Rp 10 ribu dengan kartu sendiri) untuk memverifikasi settlement T+1 ke rekening badan. Project Conductor tidak login ke Xendit dan tidak submit form aktivasi atas nama customer. Sebelum langkah ini, buka satu permintaan persetujuan `action_kind: "incorporate"` di approval queue berisi paket tujuh dokumen yang akan diunggah dan ringkasan field form (Company Name yang harus dimatch, nomor rekening settlement). Panggil `advance` flow-state dengan `set_status: "escalated"`. Saat customer balas approve dan kemudian menyerahkan konfirmasi Xendit approved plus hasil transaksi nyata pertama, simpan ke `state_data` dan panggil `complete`.
- **Tautan/endpoint:** `https://dashboard.xendit.co` (dashboard Xendit, menu Activation); dokumentasi `https://docs.xendit.co/id/getting-started/activate-account` dan `https://help.xendit.co/hc/en-us/articles/10891368765593`; `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "incorporate"`); `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"` lalu `complete` saat selesai.
- **Input yang diharapkan:** Tujuh dokumen yang sudah terkumpul di `state_data` lintas Langkah 1 sampai 6. `business_account_number` dari Langkah 6 untuk field settlement. `chosen_company_name` dari Langkah 2 yang sudah disesuaikan dengan SK AHU di Langkah 3. Saat customer membalas: konfirmasi Xendit approved (atau revisi yang diminta) dan hasil transaksi nyata pertama.
- **Output yang diharapkan:** `step_output` berisi `{ xendit_approval_request_id, xendit_submission_date, xendit_review_result ("approved"|"revisions_requested"|"rejected"), xendit_account_status ("live"|"test"), first_real_transaction_ref, settlement_to_business_account_confirmed: true|false }` — masuk ke `state_data`. Saat `xendit_review_result` `approved` dan `first_real_transaction_ref` ada dan `settlement_to_business_account_confirmed: true`, run dipanggil `complete` dan berstatus `completed`.
- **Validasi:** Run hanya `complete` kalau Xendit approved, mode beralih ke Live, transaksi nyata pertama berhasil, dan settlement T+1 ke rekening badan terkonfirmasi. Saat customer membalas, klasifikasikan respons:

  | Status persetujuan / hasil aktivasi | Tindakan |
  |---|---|
  | Permintaan `incorporate` `approved`, Xendit approved, transaksi pertama settle ke rekening badan | Panggil `complete` flow-state, run berstatus `completed`, sampaikan PT siap menerima pembayaran produksi |
  | Xendit minta revisi (mis. logo tidak persegi, nama company tidak match SK AHU, dokumen blur) | Tetap di Langkah 7, susun ulang paket dokumen dengan revisi, buka permintaan persetujuan baru, submit ulang Xendit |
  | Xendit reject (rare untuk PT Perorangan dengan dokumen lengkap) | Tetap di Langkah 7, sampaikan alasan rejection, susun rencana perbaikan, customer kontak `help@xendit.co` untuk klarifikasi |
  | Customer balas mode masih Test, transaksi nyata belum dicoba | Tetap di Langkah 7, sampaikan langkah switch ke Live mode dan saran transaksi Rp 10 ribu dengan kartu sendiri sebagai validasi T+1 |
  | Settlement T+1 tidak masuk ke rekening badan | Tetap di Langkah 7, sampaikan kontak `help@xendit.co` dengan nomor transaksi — jangan `complete` sampai settlement terkonfirmasi |
  | Permintaan `incorporate` `expired` 14 hari tanpa balasan | Run tetap terparkir `escalated`. Sampaikan persetujuan kedaluwarsa dan submission Xendit belum jalan. Kalau masih relevan, buka permintaan persetujuan baru |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras karena aktivasi Xendit produksi membuka pintu untuk uang nyata customer akhir mengalir lewat infrastruktur pembayaran PT. Sekali Live mode aktif, tiap transaksi membawa kewajiban (fee Xendit, PPh Final UMKM 0,5 persen bulanan, dokumentasi audit) dan tiap mismatch antara dokumen yang diunggah dan SK AHU bisa menahan verifikasi seminggu. Project Conductor tidak login Xendit dan tidak submit form aktivasi atas nama customer. Yang agent sampaikan saat memarkir: paket tujuh dokumen yang akan diunggah, Company Name yang harus persis match SK AHU, nomor rekening settlement, perkiraan waktu review Xendit 5 sampai 10 hari kalender, plus "Aku belum submit aktivasi Xendit. Setelah approved, PT siap terima pembayaran nyata dan tiap transaksi membawa kewajiban pajak bulanan. Persetujuan ini berlaku 14 hari."
- **Error handling:** Kalau Xendit minta revisi yang sebenarnya butuh ganti dokumen master (mis. nama Company di SK AHU dianggap tidak fit), jangan otomatis arahkan customer ke Langkah 2 untuk refile AHU — pertama tanya Xendit lewat `help@xendit.co` apakah revisi cukup di sisi field form Xendit. Refile AHU adalah upaya terakhir karena memulai ulang seluruh playbook. Kalau setelah approved settlement T+1 tidak masuk rekening badan, jangan `complete` — tahan run di Langkah 7 dan minta customer kontak helpdesk Xendit, karena `complete` menandakan PT siap produksi dan itu butuh bukti settlement bekerja.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue") — sesuai SOUL.md Project Conductor
- Nada orchestrating, big-picture, decisive — bicara dalam framing langkah, dependency, dan blocker
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (HMAC, JWT, RLS) bocor ke customer — kalau lapisan state gagal, sampaikan dalam bahasa biasa
- Zero exclamation marks
- Calm-premium register — playbook ini multi-hari dan menyentuh uang plus dokumen hukum, dibaca sebagai satu alur yang menghormati waktu dan biaya customer
- Surface progress proaktif tiap dokumen terbit; customer tidak harus minta status
- Tiap nomor dokumen yang masuk ke `state_data` diserahkan apa adanya untuk customer simpan dan back-up ke dua tempat — agent tidak menyimpan kopi master, customer yang menyimpan

## Decline criteria

Project Conductor decline atau berhenti playbook ini kalau:

- **Customer bukan WNI.** PT Perorangan adalah bentuk badan khusus WNI per UU Cipta Kerja 2020. Tawarkan alur PMA, PT biasa lewat notaris, atau PMA-equivalent lewat `incorporation-advisor` mode `pt-vs-cv`.
- **Customer minta lewati langkah berbiaya supaya lebih cepat atau lebih murah.** Gerbang keras di Langkah 2 sampai 7 tidak bisa dilewati — tiap gerbang menahan langkah berbiaya sampai customer setuju eksplisit. Kalau customer minta agent submit dokumen tanpa dia setujui dulu, decline dan jelaskan kenapa titik henti ada.
- **Customer minta Project Conductor login portal atau bayar PNBP atas nama customer.** Semua login, semua submission, semua pembayaran adalah aksi customer di sisi customer. Playbook menyiapkan input, menjaga urutan, dan menahan langkah sampai disetujui — tidak menjalankan langkah portal pemerintah atas nama customer.
- **Customer minta dipalsukan dokumen atau dimanipulasi alamat supaya lolos zonasi.** Hard decline — fraud terhadap portal pemerintah membawa konsekuensi pidana. Sampaikan solusi legal: virtual office di zona komersial.
- **Customer pernah punya PT lain yang dibubarkan dengan masalah hukum atau pajak belum tuntas.** Tetap arahkan ke Langkah 1 readiness check, tapi sampaikan pendaftaran PT baru bisa terhambat verifikasi DJP atau Xendit kalau ada tunggakan lama — pertimbangkan konsultasi konsultan pajak dulu.
- **Customer minta advice spesifik pajak, hukum kepemilikan, atau struktur kepemilikan kompleks.** Playbook ini memandu pembukaan PT Perorangan standar untuk solo founder UMKM — bukan menggantikan akuntan, notaris, atau konsultan hukum berlisensi. Decline dengan sopan dan tawarkan jalur konsultasi.
- **Customer mendekati atau melewati batas UMKM PT Perorangan (modal Rp 5 miliar atau omzet Rp 15 miliar setahun).** Sampaikan PT biasa (bukan Perorangan) adalah bentuk yang sesuai, butuh notaris dan setup lebih kompleks — tawarkan `incorporation-advisor` untuk perbandingan.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
