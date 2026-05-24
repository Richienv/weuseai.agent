---
skill_kind: playbook
name: quarterly-strategy-review
bundle: business-agent
flow_state_playbook_id: quarterly-strategy-review
total_steps: 8
use_cases:
  - "Customer minta siklus review strategi kuartalan PT/CV — ringkasan finansial Q, lanskap kompetitif, penilaian capaian OKR atau target, identifikasi prioritas kuartal berikutnya, sampai paket review siap dibagikan ke direksi plus komisaris"
  - "Akhir kuartal, customer mau review menyeluruh sebelum rapat dewan komisaris atau RUPS kuartalan"
  - "Customer founder PT mau dokumen quarterly strategy review yang konsisten formatnya per kuartal untuk dilampirkan ke risalah komisaris"
  - "Customer mau Business Director menyiapkan paket strategi kuartalan dengan titik henti komisaris sebelum distribusi resmi"
prerequisites:
  - "Customer pakai tier Pro atau Studio — playbook ini tidak tersedia di tier Starter"
  - "Status badan usaha customer adalah PT aktif — komisaris hanya berlaku untuk PT per UU PT 40/2007 Pasal 1 angka 6"
  - "Pembukuan kuartal berjalan sudah ditutup oleh customer atau akuntan customer — angka revenue, beban, dan kas per bulan dalam kuartal tersedia"
  - "Customer punya OKR kuartalan atau daftar target yang ditetapkan di awal kuartal — kalau belum ada, agent menawarkan template `operational/okr-quarterly.md` untuk siklus berikutnya tapi review berjalan apa adanya"
  - "Customer tahu siapa direksi plus komisaris yang menerima paket review — minimal satu Direktur Utama dan satu Komisaris Utama dengan nama plus jabatan sesuai anggaran dasar"
escalation_to: customer
---

# quarterly-strategy-review — business-agent playbook

Playbook ini menjalankan satu siklus review strategi kuartalan PT dari intake kuartal sampai paket review siap didistribusikan ke direksi plus komisaris. Delapan langkah berurutan: intake kuartal dan OKR atau target, ringkasan finansial kuartal, tarikan lanskap kompetitif sektor, penilaian pencapaian goal kuartal, identifikasi prioritas kuartal berikutnya, susun paket review dengan PII terselubung, gerbang lunak untuk review komisaris, lalu distribusi ke direksi plus komisaris.

Bedanya dengan `monthly-review`: review bulanan fokus operasional dan kepatuhan rutin, audience utama direksi. Review kuartalan fokus strategi dan capaian goal, audience direksi plus komisaris. Komisaris menjalankan pengawasan strategis per UU PT 40/2007 Pasal 108 — paket yang sampai ke mereka pantas direview customer sebelum didistribusikan secara resmi.

## Kapan dipakai

Customer minta review strategi kuartalan satu siklus penuh. Trigger phrases:

- "jalankan quarterly review Q3"
- "bantu aku siapkan review strategi kuartal ini untuk komisaris"
- "siapin paket review kuartalan, nanti aku review sebelum dikirim ke direksi dan komisaris"
- "review pencapaian OKR Q2 plus prioritas Q3"
- "quarterly strategy review plus pull tren sektor"

Kalau customer cuma minta satu komponen — "kasih ringkasan finansial Q saja", "cek pencapaian OKR doang" — pakai `finance-dispatch` atau panggilan template OKR langsung, bukan playbook ini. Playbook ini dipakai saat customer mau paket strategi lengkap dengan titik henti komisaris.

## Cara kerja

Playbook ini dijalankan oleh mesin state-machine `flow-state`. Mesin menyimpan posisi langkah dan hasil tiap langkah, jadi siklus tetap utuh walau ada jeda antara penarikan data, riset lanskap, dan balasan customer.

Kontrak mesin — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "quarterly-strategy-review", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 8`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data`.
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 8`. Tiap siklus kuartalan adalah run baru.
2. Tiap pesan customer berikutnya → panggil `get` dulu → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"`, sampaikan ke customer apa yang dibutuhkan, lalu berhenti.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 8 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

### Konvensi penyebutan direksi dan komisaris

Paket review yang sampai ke direksi plus komisaris memakai konvensi formal **Bapak/Ibu + jabatan** sesuai praktek tata kelola PT. UU PT 40/2007 Pasal 1 angka 5 mendefinisikan Direksi sebagai organ pengurus, Pasal 1 angka 6 mendefinisikan Dewan Komisaris sebagai organ pengawas. Jabatan harus sesuai anggaran dasar terakhir — Direktur Utama, Direktur Keuangan, Direktur Operasional, Komisaris Utama, Komisaris. Customer yang menyetel nama plus jabatan di Langkah 7 — agent tidak mengarang.

### Catatan PII

Sepanjang siklus, `state_data` mengakumulasi angka keuangan dan NPWP badan. Karena Trade Pro dan Deep Researcher yang dipanggil lewat dispatch ada di luar allowlist PII business-agent, NPWP hanya muncul utuh di dokumen PDF final yang didistribusikan di Langkah 8. Ringkasan yang disampaikan ke customer di Telegram di Langkah 6 dan Langkah 7 pakai versi terselubung — NPWP hanya empat digit terakhir.

## Langkah-langkah

### Langkah 1 — Intake kuartal dan baca OKR atau target  ·  estimasi 3-4 menit

- **Aksi:** Baca pesan customer. Tarik `business_status` (harus pt-aktif untuk siklus ini), `cycle_quarter` (kuartal dan tahun review, contoh "Q3 2026"), `cycle_period_start` dan `cycle_period_end` (tanggal awal dan akhir kuartal), `sektor` (sektor usaha customer untuk konteks lanskap di Langkah 3), dan daftar OKR atau target yang ditetapkan customer di awal kuartal. Kalau customer belum punya OKR formal, tanya apakah ada daftar target informal (revenue target, target customer, target produk shipped) yang bisa dipakai sebagai patokan. Lalu panggil `start` pada flow-state dengan `total_steps: 8`. Sebelum `start`, panggil `get` dulu — kalau ada run yang belum selesai untuk kuartal yang sama, lanjutkan run itu.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer, idealnya menyebut kuartal dan daftar OKR atau target awal kuartal.
- **Output yang diharapkan:** `step_output` berisi `{ business_status, cycle_quarter, cycle_period_start, cycle_period_end, sektor, npwp_badan_redacted, nama_badan, okr_atau_target_awal: [ { objective, key_results, baseline, target } ] }` — masuk ke `state_data`. Kalau customer tidak punya OKR formal, isi `okr_atau_target_awal` dengan daftar target informal yang customer sebut.
- **Validasi:** Kuartal dan status badan usaha PT harus jelas. Daftar OKR atau target minimal satu item — kalau benar-benar tidak ada, agent mencatat itu dan menawarkan template `operational/okr-quarterly.md` untuk kuartal berikutnya.

  | Kondisi | Tindakan |
  |---|---|
  | Kuartal, sektor, dan OKR atau target jelas | `advance` ke Langkah 2 |
  | Salah satu belum jelas | Tetap di Langkah 1, tanya satu pertanyaan tertutup, jangan `advance` |
  | Customer berstatus CV atau perorangan | Sampaikan bahwa playbook ini untuk PT (yang punya struktur direksi plus komisaris); untuk CV review strategi internal boleh pakai playbook `monthly-review` yang dijalankan akhir kuartal, jangan lanjut |

- **Gerbang eskalasi:** `none` — klarifikasi di sini adalah pertanyaan pembuka, bukan parkir state-machine. Agent baru `advance` setelah konteks kuartal cukup jelas.
- **Error handling:** Kalau `get` atau `start` tidak bisa diakses, ulangi sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai quarterly review-nya, coba lagi sebentar" dan jangan lanjut.

### Langkah 2 — Tarik ringkasan finansial kuartal  ·  estimasi 5-8 menit

- **Aksi:** Susun ringkasan finansial Q dari tiga bulan dalam kuartal — revenue total Q, breakdown HPP plus beban operasional Q, laba bersih Q, gross margin Q, operating margin Q, plus perbandingan dengan kuartal sebelumnya kalau data tersedia. Pakai template `finance/laporan-keuangan-bulanan-pt-umkm.md` sebagai kerangka, basis SAK ETAP per IAI 2009 revisi 2016, agregasi tiga bulan. Sertakan ringkasan posisi kas akhir Q dengan runway bulan berdasar burn rata-rata kuartal.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `pnl-summary` periode kuartal — referensi struktur laporan di template `finance/laporan-keuangan-bulanan-pt-umkm.md`
- **Input yang diharapkan:** `cycle_quarter`, `cycle_period_start`, `cycle_period_end`, dan `nama_badan` dari `state_data` (hasil Langkah 1). Data pembukuan tiga bulan dalam kuartal yang sudah ditutup customer atau akuntan customer.
- **Output yang diharapkan:** `step_output` berisi `{ finansial_q: { revenue_q, hpp_q, beban_operasional_q, laba_bersih_q, gross_margin_pct, operating_margin_pct, saldo_kas_akhir_q, runway_bulan }, kuartal_pembanding, finansial_pdf_ref }` — masuk ke `state_data`. `finansial_pdf_ref` adalah referensi ke laporan PDF lengkap untuk Langkah 8.
- **Validasi:** Angka revenue Q sama dengan jumlah revenue tiga bulan dalam kuartal. Selisih pembulatan ditandai eksplisit.

  | Kondisi | Tindakan |
  |---|---|
  | Ringkasan finansial Q tersusun lengkap | `advance` ke Langkah 3 |
  | Pembukuan salah satu bulan dalam kuartal belum ditutup | Tetap di Langkah 2, sampaikan ke customer bulan mana yang belum tutup, minta data |
  | Data pembanding (kuartal sebelumnya) tidak tersedia | `advance` ke Langkah 3 dengan `kuartal_pembanding: null` |

- **Gerbang eskalasi:** `none` — langkah ini auto-advance setelah finansial Q tersusun.
- **Error handling:** Kalau `finance-dispatch` gagal, ulangi sekali dengan input yang sama. Kalau tetap gagal, tahan run di Langkah 2 dan sampaikan ke customer.

### Langkah 3 — Tarik lanskap kompetitif sektor  ·  estimasi 6-10 menit

- **Aksi:** Jalankan Deep Researcher untuk menarik tren sektor `sektor` customer dalam kuartal `cycle_quarter` — pemain utama yang aktif, perubahan regulasi yang berlaku di kuartal ini, sinyal pasar yang relevan (funding round, akuisisi, peluncuran produk pesaing), plus shift demand atau supply yang teramati. Bukan riset mendalam yang butuh berhari-hari; ini snapshot sektor satu halaman untuk konteks komisaris. Hindari klaim yang tidak bisa di-cite — kalau sumber primer tidak ada, tandai sebagai "observasi tidak tertegaskan" daripada disajikan sebagai fakta.
- **Tautan/endpoint:** `hermes-skill:deep-researcher` mode `sector-snapshot` periode kuartal
- **Input yang diharapkan:** `sektor` dan `cycle_quarter` dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** `step_output` berisi `{ lanskap_sektor: { pemain_utama, regulasi_kuartal, sinyal_pasar, shift_demand_supply, sumber_referensi } }` — masuk ke `state_data`. `sumber_referensi` adalah daftar URL atau publikasi yang dipakai supaya komisaris bisa verifikasi.
- **Validasi:** Setiap klaim faktual di `lanskap_sektor` punya rujukan di `sumber_referensi` atau ditandai eksplisit sebagai observasi tidak tertegaskan.

  | Kondisi | Tindakan |
  |---|---|
  | Lanskap sektor tertarik dengan sumber tertegaskan | `advance` ke Langkah 4 |
  | Riset gagal sebagian (mis. sektor terlalu niche) | `advance` ke Langkah 4 dengan field kosong ditandai "data tidak tersedia di siklus ini" |
  | Customer tidak ingin sektor pull (mau review internal saja) | `advance` ke Langkah 4 dengan `lanskap_sektor: { skipped: true, alasan: "atas permintaan customer" }` |

- **Gerbang eskalasi:** `none` — lanskap ditampilkan di paket, bukan dijadikan gerbang.
- **Error handling:** Kalau `deep-researcher` gagal sama sekali, ulangi sekali. Kalau tetap gagal, lanjut ke Langkah 4 dengan `lanskap_sektor: null` dan catatan "snapshot sektor tidak tersedia bulan ini" supaya review tetap bisa jadi.

### Langkah 4 — Penilaian pencapaian goal kuartal  ·  estimasi 4-6 menit

- **Aksi:** Sandingkan `okr_atau_target_awal` dari Langkah 1 dengan aktual kuartal — `finansial_q` dari Langkah 2 plus data operasional customer (jumlah customer baru, churn, milestone produk shipped). Per objective atau target, hitung persen capaian (aktual / target), tandai status dengan skala tiga: `tercapai` (≥ 90%), `sebagian` (50-89%), `tidak-tercapai` (< 50%). Sertakan satu kalimat diagnosis per item — kenapa target tercapai atau tidak, apa yang berbeda dari rencana awal.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `okr-scoring` — referensi struktur OKR di template `operational/okr-quarterly.md`
- **Input yang diharapkan:** `okr_atau_target_awal` dari Langkah 1, `finansial_q` dari Langkah 2, plus data operasional yang customer kirim atau yang tersimpan di profil customer.
- **Output yang diharapkan:** `step_output` berisi `{ pencapaian: [ { objective, persen_capaian, status, diagnosis } ], skor_rata_rata, tema_pencapaian }` — masuk ke `state_data`. `skor_rata_rata` adalah rata-rata persen capaian seluruh objective. `tema_pencapaian` adalah satu kalimat ringkasan (mis. "Kuartal ini fokus retention berjalan, akuisisi tertinggal.").
- **Validasi:** Setiap objective dari `okr_atau_target_awal` muncul di `pencapaian`. Tidak ada objective yang dilewati diam-diam. Persen capaian dihitung dari angka aktual yang verifiable, bukan tebakan.

  | Kondisi | Tindakan |
  |---|---|
  | Semua objective ter-score dengan diagnosis | `advance` ke Langkah 5 |
  | Sebagian objective tidak punya data aktual untuk dihitung | Tetap di Langkah 4, sampaikan ke customer data apa yang dibutuhkan, jangan `advance` |
  | Customer tidak punya OKR awal kuartal (Langkah 1 nol item) | `advance` ke Langkah 5 dengan `pencapaian: []` dan catatan "kuartal ini tanpa OKR formal — review berbasis tren finansial dan operasional saja" |

- **Gerbang eskalasi:** `none` — penilaian ditampilkan di paket, bukan dijadikan gerbang.
- **Error handling:** Kalau scoring gagal, ulangi Langkah 4 sekali. Kalau tetap gagal, lanjut ke Langkah 5 dengan `pencapaian: []` dan catatan teknis di `step_output`.

### Langkah 5 — Identifikasi prioritas kuartal berikutnya  ·  estimasi 4-5 menit

- **Aksi:** Dari `pencapaian` di Langkah 4 plus `lanskap_sektor` di Langkah 3, susun draft tiga sampai lima prioritas untuk kuartal berikutnya. Per prioritas: pernyataan singkat, alasan (objective yang carry-over atau sinyal baru dari lanskap), pemilik kandidat (Direktur Utama, Direktur Operasional, atau jabatan setara), dan ukuran sukses kuartal berikutnya. Ini adalah draft yang nanti direview customer di Langkah 7 sebelum sampai ke komisaris — agent tidak mengikat prioritas tanpa konfirmasi customer.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `priority-draft` — referensi struktur prioritas di template `operational/okr-quarterly.md`
- **Input yang diharapkan:** `pencapaian` dari Langkah 4 plus `lanskap_sektor` dari Langkah 3.
- **Output yang diharapkan:** `step_output` berisi `{ prioritas_q_plus_1: [ { pernyataan, alasan, pemilik_kandidat, ukuran_sukses } ] }` — masuk ke `state_data`. Tiga sampai lima item.
- **Validasi:** Setiap prioritas punya alasan yang merujuk ke data Q (objective yang carry-over) atau sinyal sektor (dari `lanskap_sektor`). Prioritas yang tidak punya alasan jelas dibuang.

  | Kondisi | Tindakan |
  |---|---|
  | Tiga sampai lima prioritas tersusun dengan alasan jelas | `advance` ke Langkah 6 |
  | Hanya satu atau dua prioritas yang punya basis kuat — sisanya tebak-tebakan | `advance` ke Langkah 6 dengan jumlah lebih sedikit, sertakan catatan "siklus ini hanya N prioritas yang punya basis tertegaskan" |

- **Gerbang eskalasi:** `none` — prioritas draft dibawa ke Langkah 7 untuk review customer.
- **Error handling:** Kalau penyusunan prioritas gagal, ulangi Langkah 5 sekali.

### Langkah 6 — Susun paket review dengan PII terselubung  ·  estimasi 3-4 menit

- **Aksi:** Susun paket review lengkap dari `state_data` — bagian satu ringkasan eksekutif, bagian dua finansial Q, bagian tiga lanskap sektor, bagian empat penilaian pencapaian goal, bagian lima prioritas kuartal berikutnya. Pakai template `strategic/board-update.md` sebagai kerangka format formal. NPWP badan di paket hanya empat digit terakhir untuk ringkasan ke customer — versi utuh disimpan di `finansial_pdf_ref` dan baru muncul di dokumen final Langkah 8.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `quarterly-package` — referensi struktur paket di template `strategic/board-update.md`
- **Input yang diharapkan:** Seluruh `state_data` — `finansial_q`, `lanskap_sektor`, `pencapaian`, `prioritas_q_plus_1`, `npwp_badan_redacted`, `nama_badan`.
- **Output yang diharapkan:** `step_output` berisi `{ paket_summary_redacted, paket_pdf_ref, tema_kuartal }` — masuk ke `state_data`. `paket_summary_redacted` adalah blok ringkas untuk Langkah 7. `paket_pdf_ref` adalah dokumen PDF lengkap untuk Langkah 8. `tema_kuartal` adalah satu kalimat ringkasan strategi kuartal yang customer setel atau agent tawarkan sebagai draft.
- **Validasi:** Paket memuat lima bagian. Bagian yang tidak punya data ditandai eksplisit "data tidak tersedia di siklus ini" daripada dilewati diam-diam.

  | Kondisi | Tindakan |
  |---|---|
  | Paket tersusun dengan kelima bagian terisi | `advance` ke Langkah 7 |
  | Satu atau dua bagian benar-benar kosong (mis. lanskap sektor di-skip) | `advance` ke Langkah 7 dengan bagian tersebut ditandai "skipped atas permintaan customer" |

- **Gerbang eskalasi:** `none` — paket dibawa ke Langkah 7 untuk gerbang review customer.
- **Error handling:** Kalau penyusunan paket gagal, ulangi Langkah 6 dengan data yang sama.

### Langkah 7 — Gerbang lunak: review customer sebelum distribusi ke komisaris  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `paket_summary_redacted` plus daftar prioritas draft ke customer. Minta customer konfirmasi empat hal: (1) angka finansial dan pencapaian sesuai pembacaan customer, (2) prioritas kuartal berikutnya yang mau diteruskan ke komisaris (boleh hapus, tambah, atau revisi), (3) tema kuartal yang final, (4) daftar penerima distribusi — minimal satu Direktur Utama dan satu Komisaris Utama dengan nama plus jabatan sesuai anggaran dasar. Panggil `advance` dengan `set_status: "awaiting_customer"`, lalu berhenti sampai customer membalas.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `paket_summary_redacted`, `prioritas_q_plus_1`, dan `tema_kuartal` dari `state_data` (hasil Langkah 5 dan Langkah 6). Saat customer membalas: konfirmasi angka, prioritas final, tema, dan daftar direksi plus komisaris penerima dengan nama plus jabatan.
- **Output yang diharapkan:** `step_output` berisi `{ review_approved, prioritas_final, tema_final, edits_applied, recipients: [ { nama, jabatan, organ: "direksi"|"komisaris", channel } ], delivery_channel_default }` — masuk ke `state_data`. `recipients` minimal dua baris (satu direksi, satu komisaris). `organ` membantu Langkah 8 menyusun halaman pengantar dengan konvensi yang sesuai.
- **Validasi:** Balasan customer harus berisi konfirmasi angka, prioritas final, dan minimal satu direksi plus satu komisaris penerima.

  | Balasan customer | Tindakan |
  |---|---|
  | "Lanjut, kirim ke Bapak Hendra Direktur Utama dan Ibu Wati Komisaris Utama via email" | Rekam `review_approved: true`, isi `recipients` dengan dua entri, `advance` ke Langkah 8 |
  | Customer minta revisi prioritas atau hapus satu prioritas | Terapkan revisi ke `prioritas_q_plus_1`, tampilkan versi baru, parkir lagi `awaiting_customer` |
  | Customer minta revisi angka yang menyentuh `finansial_q` | Kembali ke Langkah 2 untuk refresh angka, sertakan catatan revisi, lalu lanjut menyusun ulang paket di Langkah 6 sebelum kembali ke Langkah 7 |
  | Customer pilih distribusi internal saja (tanpa komisaris) | Konfirmasi dengan customer bahwa paket akan dikirim hanya ke direksi — kalau setuju, isi `recipients` hanya direksi dengan catatan `organ: "direksi"`, `advance` ke Langkah 8 |
  | Customer belum siap distribusi — tunda | Panggil `abort`, sampaikan ke customer paket tetap aku simpan kalau berubah pikiran |
  | Customer belum jelas siapa komisaris yang dituju | Tetap di Langkah 7, tanya satu pertanyaan tertutup, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint` — gerbang lunak ini selalu aktif. Paket strategi kuartalan adalah dokumen tata kelola yang sampai ke organ pengawas PT — komisaris menjalankan fungsi pengawasan strategis per UU PT 40/2007 Pasal 108, dan paket yang sampai ke mereka pantas lewat sentuhan customer sebelum didistribusikan resmi. Yang agent sampaikan saat memarkir: ringkasan satu halaman plus empat pertanyaan tertutup — "Angka sesuai pembacaan kamu?", "Prioritas kuartal depan sudah final atau ada yang mau direvisi?", "Tema kuartal yang mau diteruskan?", "Kirim ke Bapak/Ibu siapa selaku direksi dan komisaris, lewat channel mana?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap tampilkan ringkasan dan minta customer membalas — saat customer membalas, panggilan `get` berikutnya menyinkronkan ulang posisi.

### Langkah 8 — Distribusi paket ke direksi plus komisaris dan tutup siklus  ·  estimasi 3-5 menit

- **Aksi:** Susun dokumen PDF final per penerima dari `paket_pdf_ref` dengan NPWP utuh dan angka lengkap. Halaman pengantar memakai konvensi formal yang membedakan organ — untuk direksi: "Kepada Bapak/Ibu [Nama] selaku [Jabatan Direksi] [Nama Badan] — terlampir paket review strategi kuartalan [Q dan tahun] untuk pelaksanaan." Untuk komisaris: "Kepada Bapak/Ibu [Nama] selaku [Jabatan Komisaris] [Nama Badan] — terlampir paket review strategi kuartalan [Q dan tahun] untuk pengawasan." Kirim ke channel yang customer setel di Langkah 7, satu per penerima. Setelah seluruh penerima terkirim, panggil `complete`. Run berstatus `completed`.
- **Tautan/endpoint:** Channel terhubung customer (Telegram atau email) lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** `recipients` dan `paket_pdf_ref` dari `state_data` (hasil Langkah 6 dan Langkah 7).
- **Output yang diharapkan:** `step_output` berisi `{ delivered: [ { nama, jabatan, organ, channel, sent_at } ], cycle_completed_at }`, lalu `complete` operation.
- **Validasi:** Setiap penerima terkirim dokumen lengkap dengan halaman pengantar yang membedakan direksi dan komisaris sesuai `organ`.

  | Kondisi | Tindakan |
  |---|---|
  | Semua penerima terkirim sukses | `complete`, konfirmasi singkat ke customer "Paket quarterly review sudah aku kirim ke [jumlah] penerima — [N] direksi dan [M] komisaris" |
  | Sebagian penerima gagal terkirim | Tetap di Langkah 8, sampaikan ke customer penerima mana yang gagal, ulangi pengiriman untuk yang gagal saja, jangan `complete` |
  | Channel tujuan tidak terhubung untuk satu penerima | Sampaikan ke customer channel mana yang perlu disiapkan, tahan dokumen untuk penerima itu, lanjut kirim ke penerima lain yang channel-nya siap |

- **Gerbang eskalasi:** `none` — paket sudah disetujui di Langkah 7, jadi distribusi tidak butuh gerbang lagi.
- **Error handling:** Kalau pengiriman gagal untuk satu penerima, jangan `abort`. Tahan dokumen di `state_data` dan tawarkan retry ke customer. Run tidak boleh `complete` sebelum minimal satu penerima yang customer konfirmasi terkirim sukses.

## Voice signature

- Bahasa Indonesia primer
- "kamu" untuk meta — saat agent ngobrol dengan customer di antara langkah
- Anda form atau Bapak/Ibu plus jabatan untuk paket dokumen yang sampai ke direksi plus komisaris — konvensi formal sesuai tata kelola PT
- Nada experienced-cofounder, decisive, Indonesia-savvy — sesuai SOUL.md Business Director
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (HMAC, JWT, RLS) bocor ke customer
- NPWP badan di pesan customer hanya empat digit terakhir — versi utuh hanya muncul di PDF final yang didistribusikan di Langkah 8
- Zero exclamation marks
- Calm-premium register — paket strategi kuartalan dibaca sebagai dokumen tata kelola, bukan ringkasan kasar
- Klaim faktual di bagian lanskap sektor harus tertegaskan ke sumber — tanpa sumber, tandai sebagai "observasi tidak tertegaskan"
- Disclaim setiap paket dengan satu kalimat: Business Director bukan akuntan publik atau analis sektor berlisensi, paket layak di-review tim internal customer sebelum didistribusikan ke komisaris

## Decline criteria

Business Director decline atau berhenti playbook ini kalau:

- Customer minta paket dikirim ke komisaris tanpa konfirmasi customer di Langkah 7 — gerbang lunak tidak bisa dilewati, paket strategi kuartalan adalah dokumen tata kelola yang pantas lewat sentuhan customer.
- Customer minta angka pencapaian goal diubah agar terlihat lebih bagus — penilaian capaian adalah informasi material untuk pengawasan komisaris per UU PT 40/2007 Pasal 108, angka diserahkan apa adanya dari data aktual.
- Customer minta klaim lanskap sektor tanpa sumber — agent menandai observasi yang tidak tertegaskan dengan label eksplisit, bukan menyajikannya sebagai fakta.
- Customer berstatus CV atau perorangan — playbook ini untuk PT yang punya struktur direksi plus komisaris; CV boleh pakai `monthly-review` yang dijalankan akhir kuartal.
- Customer minta paket diserahkan ke pemegang saham langsung tanpa lewat direksi atau komisaris — distribusi ke pemegang saham masuk ranah RUPS yang punya konvensi sendiri (rujuk template `legal/komisaris-rups-undangan.md`), bukan distribusi paket review.
- Customer minta riset sektor mendalam yang butuh berhari-hari — playbook ini menyiapkan snapshot sektor satu halaman; riset mendalam adalah pekerjaan terpisah lewat `deep-researcher` mode `market-research`.
- Customer minta rekomendasi keputusan strategis spesifik (mis. "haruskah pivot model bisnis", "kapan raise putaran berikutnya") — playbook ini menyusun paket review yang membantu direksi plus komisaris memutuskan, bukan menggantikan keputusan itu sendiri.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
