# Template — Plan pendaftaran produk konsumsi ke BPOM

Dipakai untuk merencanakan pendaftaran produk konsumsi (makanan, minuman, kosmetik, obat tradisional) ke BPOM (Badan Pengawas Obat dan Makanan). Audiens: founder F&B / kosmetik / herbal yang mau jual produk legal di Indonesia, baik direct atau via marketplace.

> **NOTE: PANDUAN OPERASIONAL, BUKAN NASIHAT HUKUM.** Biaya PNBP, persyaratan teknis, dan timeline berubah per peraturan BPOM. Konsultasi konsultan regulatori bersertifikat untuk produk dengan klaim spesifik (klaim kesehatan, klaim halal, klaim organik).

## Variables

- `{{nama_produk}}` — string, nama produk komersial (mis. "Kopi Susu Sentosa")
- `{{kategori_produk}}` — string, salah satu dari "Pangan Olahan (MD/ML)", "Pangan PIRT", "Kosmetik", "Obat Tradisional", "Suplemen Kesehatan"
- `{{nama_perusahaan}}` — string, nama PT atau CV pemilik produk
- `{{nib}}` — string, NIB perusahaan (sudah terbit dari OSS-RBA)
- `{{produsen}}` — string, "produksi dalam negeri sendiri" atau "maklon ke [nama produsen]" atau "impor dari [negara]"
- `{{klaim_halal}}` — boolean, apakah produk pakai klaim halal di kemasan
- `{{pic_regulatori}}` — string, nama PIC yang mengurus pendaftaran
- `{{target_terbit_izin}}` — string, target tanggal izin BPOM terbit (mis. "Jumat, 28 Agustus 2026")

## Template

# Plan pendaftaran BPOM — {{nama_produk}}

**Perusahaan:** {{nama_perusahaan}} (NIB: {{nib}})
**Kategori:** {{kategori_produk}}
**Produsen:** {{produsen}}
**PIC regulatori:** {{pic_regulatori}}
**Target izin terbit:** {{target_terbit_izin}}

## Konteks regulasi

Produk konsumsi yang dijual di Indonesia wajib punya izin edar BPOM (untuk pangan olahan dengan masa simpan >7 hari, kosmetik, obat tradisional, suplemen). PIRT (Pangan Industri Rumah Tangga) cukup untuk pangan olahan skala mikro masa simpan kurang dari 7 hari — diurus di Dinas Kesehatan kab/kota, bukan BPOM pusat. Pelanggaran (jual tanpa izin) berisiko penarikan produk dan sanksi pidana per UU 18/2012 Pangan dan UU 36/2009 Kesehatan.

## Phase 1: Prasyarat dokumen umum (3-7 hari kerja)

| Dokumen | Status | Catatan |
| --- | --- | --- |
| NIB OSS-RBA aktif | | Wajib. Lihat template `plan-oss-rba-nib-issuance.md` jika belum punya |
| NPWP badan | | Output bersamaan dengan NIB |
| Sertifikat Produksi Pangan Industri Rumah Tangga (SPP-IRT) atau Izin Edar Pabrik (CPPOB) | | Untuk pangan olahan — tergantung skala |
| Sertifikat halal MUI (jika {{klaim_halal}} = true) | | Wajib jika klaim halal di kemasan. Urus via si-halal.kemenag.go.id (BPJPH), bukan langsung MUI. Timeline 30-60 hari kerja terpisah |
| Hasil uji lab dari lab terakreditasi BPOM | | Per kategori produk, parameter beda |
| Foto kemasan 360 derajat + draft desain label | | Label harus comply ketentuan PerBPOM No. 31/2018 (label pangan) atau aturan kategori |
| CoA (Certificate of Analysis) bahan baku utama | | Dari supplier bahan baku |
| Formula produk + proses produksi | | Confidential, hanya untuk submit BPOM |

## Phase 2: Pilih portal sesuai kategori (0.5 hari kerja)

| Kategori | Portal | Catatan |
| --- | --- | --- |
| Pangan Olahan (MD lokal / ML impor) | asrot.pom.go.id (e-Registration Pangan Olahan) | Lookup current path |
| Kosmetik | notifkos.pom.go.id (Notifikasi Kosmetik) | Sistem notifikasi, bukan registrasi penuh |
| Obat Tradisional | new-asrot.pom.go.id / portal obat tradisional | Lookup current path |
| Suplemen Kesehatan | Portal khusus suplemen di pom.go.id | Lookup current path |
| Pangan PIRT (skala mikro) | Dinkes kab/kota setempat | Bukan BPOM pusat |

## Phase 3: Registrasi akun + input data perusahaan (1-2 hari kerja)

- Buat akun di portal yang sesuai
- Upload NIB, NPWP, akta perusahaan
- Tunggu verifikasi akun BPOM (1-3 hari kerja typical)
- Setelah aktif, masuk ke menu "Daftar Produk Baru"

## Phase 4: Uji lab + dokumen mutu (14-30 hari kerja)

Tiap kategori punya parameter uji wajib. Sample umum:

### Pangan Olahan
- Cemaran mikroba (TPC, kapang, khamir, E. coli, Salmonella)
- Cemaran logam berat (Pb, Cd, Hg, As)
- Parameter kimia per jenis (kadar air, kadar gula, kadar pengawet)
- Lab terakreditasi: Sucofindo, Saraswanti, IPB CARE, atau lab swasta lain yang masuk daftar BPOM

### Kosmetik
- Cemaran mikroba (TPC, Pseudomonas, Staphylococcus)
- Cemaran logam berat
- Stabilitas produk (accelerated stability test 3 bulan)
- Uji iritasi kulit (untuk produk leave-on)

### Obat Tradisional / Suplemen
- Cemaran mikroba + logam berat + aflatoksin
- Identifikasi bahan aktif (kromatografi)
- Uji stabilitas

Timeline: 14-30 hari kerja dari sampel masuk lab sampai CoA terbit. Biaya: Rp 2-8 juta per produk tergantung jumlah parameter.

## Phase 5: Submit pendaftaran via portal (2-5 hari kerja)

- Input data produk: nama, kategori, klaim, komposisi, berat netto, kemasan
- Upload: foto kemasan, draft label, CoA uji lab, sertifikat halal (jika klaim), CoA bahan baku
- Bayar PNBP via Virtual Account
- Submit untuk review

### PNBP per kategori (range typical, lookup current rate di PP PNBP terbaru)

| Kategori | PNBP per produk |
| --- | --- |
| Pangan Olahan lokal (MD) | Rp 500 ribu — Rp 2 juta |
| Pangan Olahan impor (ML) | Rp 1 juta — Rp 5 juta |
| Kosmetik notifikasi | Rp 500 ribu — Rp 1.5 juta |
| Obat Tradisional registrasi penuh | Rp 2 juta — Rp 10 juta |
| Suplemen | Rp 1.5 juta — Rp 5 juta |

## Phase 6: Review BPOM + perbaikan (30-60 hari kerja)

- Reviewer cek dokumen, label, klaim, CoA
- Notifikasi koreksi via portal — biasanya 1-3 ronde
- PIC harus respons koreksi paling lambat 30 hari kerja, kalau tidak permohonan dianggap batal
- Notifikasi Kosmetik (kategori 2) lebih cepat — 14 hari kerja jika dokumen lengkap

## Phase 7: Izin terbit + tindak lanjut (1 hari kerja)

- Download Sertifikat Izin Edar / Persetujuan Pendaftaran dari portal
- Nomor izin format: `MD 123456789012` (Pangan lokal), `ML 123456789012` (impor), `NA12345678901` (kosmetik), `TR 123456789` (obat tradisional)
- Cetak nomor izin di kemasan sebelum produksi massal
- Update marketplace listing (Tokopedia, Shopee, TikTok Shop) dengan nomor izin

## Timeline total

| Phase | Hari kerja |
| --- | --- |
| Phase 1-2: prasyarat + pilih portal | 3-7 |
| Phase 3: registrasi akun | 1-2 |
| Phase 4: uji lab | 14-30 |
| Phase 5: submit | 2-5 |
| Phase 6: review BPOM | 30-60 |
| Phase 7: izin terbit | 1 |
| **Total** | **60-90 hari kerja** typical |

Geser jika periode Lebaran (cuti bersama 5-10 hari), libur Natal-Tahun Baru, atau backlog BPOM tinggi pasca-libur panjang.

## Risiko umum

- Klaim halal tanpa sertifikat halal MUI/BPJPH valid — produk auto-reject di review
- Label tidak comply PerBPOM No. 31/2018 (informasi gizi salah format, klaim ilegal) — koreksi 1-2 ronde
- Uji lab bukan dari lab terakreditasi BPOM — auto-reject, harus uji ulang
- Bahan baku impor tanpa CoA dari supplier — sulit lolos cemaran mikroba klaim
- Telat respons koreksi (>30 hari kerja) — permohonan batal, ulang dari awal + PNBP hangus

## Tone guide

Coordinator + regulator register — kamu memandu founder F&B atau ops lead, bahasanya presisi tapi tidak terlalu legal-formal. Gunakan kategori jelas (MD/ML/NA/TR) dan portal eksplisit (asrot.pom.go.id, notifkos.pom.go.id) supaya founder tahu masuk ke pintu mana. Sebut "lookup current path" untuk URL portal karena BPOM sesekali migrasi sistem. PNBP dan timeline disebut sebagai range realistis, bukan angka pasti — diakhiri "per regulasi terbaru" karena PP PNBP berubah berkala. Tidak ada hedge soal kewajiban legal (UU 18/2012 Pangan jelas), tapi tetap notes "konsultasi konsultan regulatori" untuk klaim spesifik karena klaim kesehatan (mis. "menurunkan kolesterol") tunduk aturan tambahan.
