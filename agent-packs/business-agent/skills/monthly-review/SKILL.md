---
skill_kind: playbook
name: monthly-review
bundle: business-agent
flow_state_playbook_id: monthly-review
total_steps: 7
use_cases:
  - "Customer minta siklus review bulanan PT/CV — P&L bulan berjalan, kepatuhan PPh Final UMKM + BPJS, posisi kas, ringkasan KPI, sampai paket review siap dibagikan ke direksi"
  - "Awal bulan, customer mau ringkasan keuangan bulan lalu yang sudah disisir kepatuhan sebelum dibawa ke rapat direksi"
  - "Customer founder PT UMKM mau dokumen review bulanan yang konsisten formatnya tiap bulan untuk dilampirkan ke RUPS Tahunan nanti"
  - "Customer mau Business Director menyiapkan paket review bulan ini lengkap dengan titik henti untuk direksi sebelum distribusi"
prerequisites:
  - "Customer pakai tier Pro atau Studio — playbook ini tidak tersedia di tier Starter"
  - "Status badan usaha customer diketahui — PT atau CV aktif dengan omzet bulanan tercatat"
  - "Pembukuan bulan berjalan sudah ditutup oleh customer atau akuntan customer — angka revenue, beban, dan kas posisi akhir bulan tersedia"
  - "Customer tahu siapa direksi yang menerima paket review — minimal satu nama dengan jabatan (Direktur Utama, Direktur Operasional, atau jabatan setara per anggaran dasar)"
escalation_to: customer
---

# monthly-review — business-agent playbook

Playbook ini menjalankan satu siklus review bulanan PT/CV UMKM dari intake periode sampai paket review siap dibagikan ke direksi. Tujuh langkah berurutan: intake periode dan data fiskal, tarik laporan keuangan bulanan, pemeriksaan kepatuhan PPh Final UMKM plus BPJS, ringkasan posisi kas, dashboard KPI ringkas, gerbang lunak untuk review direksi, lalu distribusi paket final ke direksi yang ditunjuk.

Bedanya dengan menjalankan `finance-dispatch` atau memanggil template laporan keuangan langsung: di sini alurnya utuh dengan satu titik henti supaya paket yang dilihat direksi selalu lewat sentuhan customer dulu. Review bulanan adalah dokumen tata kelola — UU PT 40/2007 Pasal 66 menempatkan tanggung jawab penyusunan laporan keuangan pada Direksi, jadi paket yang sampai ke direksi pantas direview customer sebelum dikirim, bukan dipublikasikan otomatis.

## Kapan dipakai

Customer minta review bulanan satu siklus penuh, bukan sekadar satu laporan. Trigger phrases:

- "jalankan review bulan ini"
- "bantu aku siapkan review bulanan untuk direksi"
- "monthly review untuk PT, periode Oktober"
- "siapin paket review bulanan, nanti aku review sebelum dikirim ke direksi"
- "review bulanan plus cek kepatuhan PPh Final dan BPJS"

Kalau customer cuma minta satu laporan — "kasih P&L bulan ini saja", "berapa setoran PPh Final UMKM bulan ini" — pakai `finance-dispatch` atau template `finance/laporan-keuangan-bulanan-pt-umkm.md` / `finance/pph-final-umkm-bulanan.md` langsung, bukan playbook ini. Playbook ini dipakai saat customer mau paket review lengkap dengan titik henti direksi.

## Cara kerja

Playbook ini dijalankan oleh mesin state-machine `flow-state`. Mesin menyimpan posisi langkah dan hasil tiap langkah, jadi siklus tetap utuh walau ada jeda antara penarikan data, ringkasan, dan balasan customer.

Kontrak mesin — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "monthly-review", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 7`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 7`. Tiap siklus bulanan adalah run baru.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"` (checkpoint lunak), sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 7 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

### Konvensi penyebutan direksi

Paket review yang sampai ke direksi memakai konvensi formal **Bapak/Ibu + jabatan** sesuai praktek tata kelola PT — "Kepada Bapak Hendra selaku Direktur Utama" atau "Kepada Ibu Sari selaku Direktur Keuangan". Jabatan harus sesuai anggaran dasar terakhir (UU PT 40/2007 Pasal 92 mengatur kedudukan Direksi). Customer yang menyetel nama plus jabatan di Langkah 6 — agent tidak mengarang jabatan.

### Catatan PII

Sepanjang siklus, `state_data` mengakumulasi angka keuangan dan NPWP badan. Karena Trade Pro dan Doc Expert yang dipanggil lewat `finance-dispatch` ada di luar allowlist PII business-agent, NPWP hanya muncul utuh di dokumen PDF final yang diserahkan di Langkah 7. Ringkasan yang disampaikan ke customer di Telegram di Langkah 5 dan Langkah 6 pakai versi terselubung — NPWP hanya empat digit terakhir.

## Langkah-langkah

### Langkah 1 — Intake periode dan data fiskal  ·  estimasi 2-3 menit

- **Aksi:** Baca pesan customer. Tarik `business_status` (pt-aktif atau cv-aktif), `cycle_period` (bulan dan tahun review, contoh "Oktober 2026"), `pkp_status` (PKP atau bukan), dan `umkm_status` (omzet tahun berjalan ≤ Rp 4,8 milyar atau di atasnya). Kalau salah satu belum jelas, tanya dalam satu pesan ringkas. Lalu panggil `start` pada flow-state dengan `total_steps: 7`. Sebelum `start`, panggil `get` dulu — kalau sudah ada run yang belum selesai untuk periode yang sama, lanjutkan run itu alih-alih memulai dari nol.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer, idealnya menyebut bulan periode dan status badan usaha.
- **Output yang diharapkan:** `step_output` berisi `{ business_status, cycle_period, pkp_status, umkm_status, npwp_badan_redacted, nama_badan }` — masuk ke `state_data`. `npwp_badan_redacted` adalah empat digit terakhir NPWP, dipakai untuk ringkasan ke customer di langkah selanjutnya.
- **Validasi:** Periode dan status badan usaha harus jelas sebelum penarikan data dimulai.

  | Kondisi | Tindakan |
  |---|---|
  | `business_status`, `cycle_period`, dan `umkm_status` jelas | `advance` ke Langkah 2 |
  | Salah satu belum jelas | Tetap di Langkah 1, tanya satu pertanyaan tertutup, jangan `advance` |
  | Customer berstatus pre-incorporation atau badan usaha belum aktif | Sampaikan bahwa review bulanan PT/CV belum berlaku, tawarkan playbook `incorporation-walkthrough`, jangan lanjut |

- **Gerbang eskalasi:** `none` — klarifikasi di sini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah konteks periode cukup jelas.
- **Error handling:** Kalau `get` atau `start` tidak bisa diakses, ulangi sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai review bulanan-nya, coba lagi sebentar" dan jangan lanjut.

### Langkah 2 — Tarik laporan keuangan bulanan  ·  estimasi 4-7 menit

- **Aksi:** Susun ringkasan P&L bulan berjalan dari pembukuan yang sudah ditutup customer — revenue total, breakdown HPP plus beban operasional, laba bersih, gross margin, operating margin. Pakai template `finance/laporan-keuangan-bulanan-pt-umkm.md` sebagai kerangka untuk PT UMKM, basis SAK ETAP per IAI 2009 revisi 2016. Bandingkan dengan periode sebelumnya kalau data pembanding tersedia.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `pnl-summary` — referensi struktur laporan di template `finance/laporan-keuangan-bulanan-pt-umkm.md`
- **Input yang diharapkan:** `cycle_period`, `business_status`, dan `nama_badan` dari `state_data` (hasil Langkah 1). Data pembukuan bulan berjalan yang sudah ditutup customer atau akuntan customer.
- **Output yang diharapkan:** `step_output` berisi `{ pnl_summary: { revenue, hpp, beban_operasional, laba_bersih, gross_margin_pct, operating_margin_pct }, periode_pembanding, pnl_pdf_ref }` — masuk ke `state_data`. `pnl_pdf_ref` adalah referensi ke laporan PDF lengkap yang dipakai di Langkah 7.
- **Validasi:** Angka revenue dan laba bersih harus konsisten dengan pembukuan yang ditutup. Selisih kecil yang muncul dari pembulatan ditandai eksplisit.

  | Kondisi | Tindakan |
  |---|---|
  | P&L tersusun lengkap dengan margin terhitung | `advance` ke Langkah 3 |
  | Pembukuan bulan berjalan belum ditutup atau ada angka yang masih draft | Tetap di Langkah 2, sampaikan ke customer pos mana yang masih kosong, minta pelengkap |
  | Data pembanding tidak tersedia | `advance` ke Langkah 3 dengan `periode_pembanding: null` — bandingkan hanya kalau data ada |

- **Gerbang eskalasi:** `none` — langkah ini auto-advance setelah P&L tersusun. Customer melihat angka di ringkasan Langkah 5.
- **Error handling:** Kalau `finance-dispatch` gagal menyusun P&L, ulangi sekali dengan input yang sama dari `state_data`. Kalau tetap gagal, sampaikan ke customer bahwa penarikan tersendat dan tahan run di Langkah 2 sampai bisa diulang.

### Langkah 3 — Cek kepatuhan PPh Final UMKM dan BPJS  ·  estimasi 3-5 menit

- **Aksi:** Untuk customer UMKM (omzet tahun berjalan ≤ Rp 4,8 milyar), pakai template `finance/pph-final-umkm-bulanan.md` untuk hitung kewajiban setor PPh Final 0,5% atas peredaran bruto bulan berjalan per PP 55/2022 Pasal 56-65. Pakai batas setor tanggal 15 dan batas lapor SPT Masa tanggal 20 bulan berikutnya per PMK 9/2018 jo. PMK 18/2021. Sandingkan dengan kewajiban BPJS Kesehatan plus Ketenagakerjaan bulan berjalan kalau customer punya karyawan, rujukannya template `finance/bpjs-kesehatan-ketenagakerjaan-checklist.md`. Catat status: sudah disetor, belum disetor, atau tidak berlaku (mis. tidak ada karyawan).
- **Tautan/endpoint:** `hermes-skill:compliance-checker` mode `period-check` — referensi tarif dan tanggal di template `finance/pph-final-umkm-bulanan.md` plus `finance/bpjs-kesehatan-ketenagakerjaan-checklist.md`
- **Input yang diharapkan:** `cycle_period`, `umkm_status`, dan `pnl_summary.revenue` dari `state_data` (hasil Langkah 1 dan Langkah 2). Status karyawan customer kalau belum tersimpan di profil customer.
- **Output yang diharapkan:** `step_output` berisi `{ compliance_status: { pph_final_umkm: { terutang, status, batas_setor, batas_lapor }, bpjs: { kesehatan_status, ketenagakerjaan_status, total_iuran } } }` — masuk ke `state_data`. `status` salah satu dari `sudah-setor`, `belum-setor`, atau `tidak-berlaku`.
- **Validasi:** Angka PPh Final yang dihitung sama dengan `revenue × 0,5%` untuk customer UMKM. BPJS Kesehatan iuran 5% gaji dengan cap Rp 12 juta (4% pemberi kerja, 1% karyawan) per Perpres 64/2020. BPJS Ketenagakerjaan JHT 5,7%, JP 3%, JKK 0,24-1,74% per tingkat risiko, JKM 0,3% per PP 44/2015 jo. PP 82/2019 dan PP 45/2015.

  | Kondisi | Tindakan |
  |---|---|
  | Kepatuhan tercek dengan status jelas per kewajiban | `advance` ke Langkah 4 |
  | Customer di atas threshold UMKM (omzet > Rp 4,8 milyar) | `advance` ke Langkah 4 dengan catatan bahwa rezim pajak pindah ke PPh Badan umum 22% per PP 30/2020 mulai tahun pajak berikutnya — review bulanan tetap berjalan, tapi PPh Final tidak lagi berlaku |
  | Pembayaran BPJS atau setoran PPh Final terlambat di periode review | `advance` ke Langkah 4 dengan flag `tunggakan: true` supaya Langkah 5 memasukkan ke ringkasan |

- **Gerbang eskalasi:** `none` — status kepatuhan ditampilkan di ringkasan, bukan dijadikan gerbang. Keputusan tindak lanjut ada di customer.
- **Error handling:** Kalau `compliance-checker` gagal, ulangi sekali. Kalau tetap gagal, lanjut ke Langkah 4 dengan `compliance_status: null` dan catatan "kepatuhan tidak bisa dicek otomatis bulan ini" supaya review tetap bisa jadi.

### Langkah 4 — Ringkasan posisi kas akhir periode  ·  estimasi 2-3 menit

- **Aksi:** Susun posisi kas akhir bulan — saldo kas dan setara kas di rekening operasional plus rekening cadangan, plus runway dalam bulan berdasar burn bulan berjalan. Pakai template `finance/cash-runway.md` sebagai kerangka. Hitung runway base case dari `(saldo_kas / burn_bulanan)`. Tandai kalau runway turun di bawah enam bulan supaya direksi sadar.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `cash-runway` — referensi struktur di template `finance/cash-runway.md`
- **Input yang diharapkan:** `pnl_summary` dari `state_data` (hasil Langkah 2) untuk hitung burn bulanan. Saldo kas akhir periode dari pembukuan customer.
- **Output yang diharapkan:** `step_output` berisi `{ cash_position: { saldo_kas, burn_bulanan, runway_bulan, runway_status } }` — masuk ke `state_data`. `runway_status` salah satu dari `sehat` (> 12 bulan), `perlu-perhatian` (6-12 bulan), atau `kritikal` (< 6 bulan).
- **Validasi:** Saldo kas tidak negatif. Burn bulanan dihitung dari `(beban_operasional + hpp - revenue)` kalau revenue belum menutup biaya, atau ditandai `surplus` kalau positif.

  | Kondisi | Tindakan |
  |---|---|
  | Posisi kas dan runway terhitung jelas | `advance` ke Langkah 5 |
  | Bisnis sudah surplus (revenue > biaya) | `advance` ke Langkah 5 dengan `runway_status: "surplus"` — runway dalam bulan tidak relevan, tapi tetap catat saldo kas |
  | Saldo kas tidak tersedia | Tetap di Langkah 4, sampaikan ke customer angka apa yang dibutuhkan, jangan `advance` |

- **Gerbang eskalasi:** `none` — posisi kas ditampilkan di ringkasan, bukan dijadikan gerbang.
- **Error handling:** Kalau perhitungan runway gagal, ulangi Langkah 4 sekali. Kalau tetap gagal, lanjut ke Langkah 5 dengan `cash_position: { saldo_kas, burn_bulanan, runway_bulan: null, runway_status: "tidak-terhitung" }`.

### Langkah 5 — Susun dashboard KPI ringkas dengan PII terselubung  ·  estimasi 2-3 menit

- **Aksi:** Susun dashboard KPI satu halaman dari `state_data` — tema bulan (1 kalimat dari customer), revenue, laba bersih, gross margin, operating margin, posisi kas, runway, plus status kepatuhan PPh Final UMKM dan BPJS. Pakai template `finance/kpi-dashboard.md` sebagai kerangka dengan status RAG (Red / Amber / Green) per KPI. Untuk customer UMKM, sertakan satu kalimat "Status UMKM aktif — peredaran bruto YTD Rp X, sisa kapasitas threshold Rp Y" supaya direksi tahu posisi terhadap batas Rp 4,8 milyar. NPWP badan di dashboard hanya empat digit terakhir.
- **Tautan/endpoint:** `hermes-skill:finance-dispatch` mode `kpi-dashboard` — referensi struktur di template `finance/kpi-dashboard.md`
- **Input yang diharapkan:** `pnl_summary` (Langkah 2), `compliance_status` (Langkah 3), `cash_position` (Langkah 4), `npwp_badan_redacted` (Langkah 1).
- **Output yang diharapkan:** `step_output` berisi `{ dashboard_summary_redacted, dashboard_pdf_ref, tema_bulan }` — masuk ke `state_data`. `dashboard_summary_redacted` adalah blok ringkas untuk Langkah 6. `dashboard_pdf_ref` adalah dokumen PDF lengkap dengan NPWP utuh untuk Langkah 7. `tema_bulan` adalah satu kalimat ringkasan yang customer setel atau agent tawarkan sebagai draft.
- **Validasi:** Dashboard memuat semua KPI yang ada datanya. KPI yang tidak terhitung ditandai eksplisit "tidak tersedia" daripada dilewati diam-diam.

  | Kondisi | Tindakan |
  |---|---|
  | Dashboard tersusun dengan KPI lengkap | `advance` ke Langkah 6 |
  | Sebagian KPI tidak tersedia (mis. runway tidak terhitung) | `advance` ke Langkah 6 dengan KPI tersebut ditandai "tidak tersedia" |

- **Gerbang eskalasi:** `none` — dashboard dibawa ke Langkah 6 untuk gerbang review customer, bukan langsung dikirim ke direksi.
- **Error handling:** Kalau penyusunan dashboard gagal, ulangi Langkah 5 dengan data yang sama dari `state_data`. Tidak perlu mengulang langkah penarikan sebelumnya.

### Langkah 6 — Gerbang lunak: review customer sebelum distribusi ke direksi  ·  estimasi tunggu customer

- **Aksi:** Tampilkan `dashboard_summary_redacted` plus ringkasan satu halaman P&L plus posisi kepatuhan ke customer. Minta customer konfirmasi tiga hal: (1) angka dan tema bulan sesuai pembacaan customer, (2) daftar penerima distribusi — minimal satu nama direksi dengan jabatan sesuai anggaran dasar, contoh "Bapak Hendra, Direktur Utama" atau "Ibu Sari, Direktur Keuangan", (3) channel distribusi (Telegram, email, atau cetak). Panggil `advance` dengan `set_status: "awaiting_customer"`, lalu berhenti sampai customer membalas.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `dashboard_summary_redacted` dan `tema_bulan` dari `state_data` (hasil Langkah 5). Saat customer membalas: konfirmasi angka, daftar direksi penerima dengan nama plus jabatan, dan channel distribusi.
- **Output yang diharapkan:** `step_output` berisi `{ review_approved, edits_applied, recipients: [ { nama, jabatan, channel } ], delivery_channel_default }` — masuk ke `state_data`. `recipients` minimal satu baris. `jabatan` mengikuti anggaran dasar customer — Direktur Utama, Direktur Operasional, Direktur Keuangan, atau setara.
- **Validasi:** Balasan customer harus berisi konfirmasi angka plus minimal satu direksi penerima dengan jabatan.

  | Balasan customer | Tindakan |
  |---|---|
  | "Lanjut, kirim ke Bapak Hendra Direktur Utama via Telegram" | Rekam `review_approved: true`, isi `recipients`, `advance` ke Langkah 7 |
  | Customer minta revisi angka atau tema bulan | Terapkan revisi ke `dashboard_summary_redacted` dan `tema_bulan` (kalau perubahan menyentuh angka asal P&L, kembali ke Langkah 2 untuk refresh), tampilkan versi baru, parkir lagi `awaiting_customer` |
  | Customer belum siap distribusi — tunda ke bulan depan | Panggil `abort`, sampaikan ke customer paket review tetap aku simpan di `state_data` kalau berubah pikiran |
  | Customer pilih distribusi self saja (tidak ke direksi) | Rekam `recipients: [ { nama: "Diri sendiri", jabatan: "Founder", channel } ]`, `advance` ke Langkah 7 — review pribadi tetap berjalan tanpa pernyataan ke direksi |
  | Customer belum jelas mau direksi mana | Tetap di Langkah 6, tanya satu pertanyaan tertutup, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint` — gerbang lunak ini selalu aktif untuk audience direksi atau audience self. Paket review yang sampai ke direksi adalah dokumen tata kelola yang menyentuh kewajiban Direksi per UU PT 40/2007 Pasal 66 — paket pantas lewat sentuhan customer sebelum didistribusikan, bukan dipublikasikan otomatis. Yang agent sampaikan saat memarkir: ringkasan satu halaman plus tiga pertanyaan tertutup — "Angka sesuai pembacaan kamu?", "Kirim ke Bapak/Ibu siapa dengan jabatan apa?", "Lewat channel mana — Telegram atau email?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap tampilkan ringkasan dan minta customer membalas — saat customer membalas, panggilan `get` berikutnya menyinkronkan ulang posisi.

### Langkah 7 — Distribusi paket review ke direksi dan tutup siklus  ·  estimasi 2-4 menit

- **Aksi:** Susun dokumen PDF final per penerima dari `pnl_pdf_ref` plus `dashboard_pdf_ref` dengan NPWP utuh dan angka lengkap. Halaman pengantar setiap dokumen memakai konvensi formal: "Kepada Bapak/Ibu [Nama] selaku [Jabatan] [Nama Badan] — terlampir paket review bulanan periode [periode]." Kirim ke channel yang customer setel di Langkah 6, satu per penerima. Setelah seluruh penerima terkirim, panggil `complete`. Run berstatus `completed`.
- **Tautan/endpoint:** Channel terhubung customer (Telegram default, email kalau customer setel) lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** `recipients`, `pnl_pdf_ref`, dan `dashboard_pdf_ref` dari `state_data` (hasil Langkah 5 dan Langkah 6).
- **Output yang diharapkan:** `step_output` berisi `{ delivered: [ { nama, jabatan, channel, sent_at } ], cycle_completed_at }`, lalu `complete` operation.
- **Validasi:** Setiap penerima terkirim dokumen lengkap dengan halaman pengantar yang menyebut nama plus jabatan sesuai anggaran dasar.

  | Kondisi | Tindakan |
  |---|---|
  | Semua penerima terkirim sukses | `complete`, konfirmasi singkat ke customer "Paket review sudah aku kirim ke [jumlah] penerima" |
  | Sebagian penerima gagal terkirim | Tetap di Langkah 7, sampaikan ke customer penerima mana yang gagal, ulangi pengiriman untuk yang gagal saja, jangan `complete` |
  | Channel tujuan tidak terhubung untuk satu penerima | Sampaikan ke customer channel mana yang perlu disiapkan, tahan dokumen untuk penerima itu, lanjut kirim ke penerima lain yang channel-nya siap |

- **Gerbang eskalasi:** `none` — paket sudah disetujui di Langkah 6, jadi distribusi tidak butuh gerbang lagi.
- **Error handling:** Kalau pengiriman gagal untuk satu penerima, jangan `abort`. Tahan dokumen di `state_data` dan tawarkan retry ke customer. Dokumen yang sudah disusun tidak hilang. Run tidak boleh `complete` sebelum minimal satu penerima yang customer konfirmasi terkirim sukses.

## Voice signature

- Bahasa Indonesia primer
- "kamu" untuk meta — saat agent ngobrol dengan customer di antara langkah
- Anda form atau Bapak/Ibu plus jabatan untuk paket dokumen yang sampai ke direksi — konvensi formal sesuai tata kelola PT
- Nada experienced-cofounder, decisive, Indonesia-savvy — sesuai SOUL.md Business Director
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (HMAC, JWT, RLS) bocor ke customer — kalau lapisan state gagal, sampaikan dalam bahasa biasa
- NPWP badan di pesan customer hanya empat digit terakhir — versi utuh hanya muncul di PDF final yang didistribusikan di Langkah 7
- Zero exclamation marks
- Calm-premium register — paket review dibaca sebagai dokumen tata kelola yang tertata, bukan ringkasan kasar
- Disclaim setiap paket dengan satu kalimat: Business Director bukan akuntan publik berlisensi, laporan layak di-review akuntan customer sebelum dikirim ke direksi atau dilampirkan ke SPT Tahunan

## Decline criteria

Business Director decline atau berhenti playbook ini kalau:

- Customer minta paket dikirim ke direksi tanpa konfirmasi customer di Langkah 6 — gerbang lunak tidak bisa dilewati, paket review adalah dokumen tata kelola yang pantas lewat sentuhan customer.
- Customer minta angka P&L diubah agar terlihat lebih bagus dari pembukuan — laporan keuangan adalah dokumen yang menyentuh kewajiban Direksi per UU PT 40/2007 Pasal 66, angka diserahkan apa adanya dari pembukuan customer.
- Customer minta status kepatuhan PPh Final atau BPJS disembunyikan dari paket direksi — kepatuhan yang tertunggak adalah informasi material yang berhak diketahui direksi, agent tidak menghilangkannya.
- Customer minta dokumen filing langsung disubmit ke DJP atau BPJS — playbook ini menyusun paket review, bukan menggantikan playbook `finance-cycle` yang punya gerbang keras untuk submission filing.
- Customer berstatus pre-incorporation atau badan usaha belum aktif — review bulanan PT/CV belum berlaku, arahkan ke playbook `incorporation-walkthrough`.
- Customer minta advice akuntansi spesifik yang butuh akuntan publik atau konsultan pajak berlisensi — koreksi fiskal kompleks, restatement, audit response — playbook ini menyiapkan review rutin bulanan, bukan menggantikan akuntan customer.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
