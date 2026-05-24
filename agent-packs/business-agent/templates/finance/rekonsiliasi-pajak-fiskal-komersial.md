# Template — Memo Rekonsiliasi Pajak Fiskal vs Komersial

Memo internal yang menjelaskan + menghitung perbedaan antara laporan keuangan komersial (basis Standar Akuntansi Keuangan / SAK) dengan laporan fiskal (basis Undang-Undang Pajak Penghasilan). Rekonsiliasi fiskal adalah lampiran wajib SPT Tahunan PPh Badan (form 1771) yang menjembatani laba komersial ke Penghasilan Kena Pajak (PKP) fiskal.

Audience: founder, finance lead, akuntan internal PT yang menyusun lampiran rekonsiliasi fiskal sebelum konsultasi konsultan pajak.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_perseroan}}` — string. Nama PT.
- `{{npwp_badan}}` — string. NPWP-16 badan.
- `{{tahun_pajak}}` — number. Tahun pajak yang dilaporkan.
- `{{laba_komersial}}` — number. Laba sebelum pajak per laporan komersial (SAK).
- `{{entertainment_tanpa_nominatif}}` — number. Biaya entertainment yang tidak memiliki daftar nominatif.
- `{{sumbangan_non_deductible}}` — number. Sumbangan di luar kategori deductible.
- `{{biaya_natura_excess}}` — number. Biaya natura / kenikmatan di atas threshold deductible per UU HPP.
- `{{penyusutan_excess}}` — number. Penyusutan komersial yang melebihi tarif fiskal.
- `{{cadangan_non_deductible}}` — number. Pembentukan cadangan kerugian yang non-deductible.
- `{{dividen_ps_25_persen}}` — number. Dividen dari PT dalam negeri dengan kepemilikan ≥ 25% (bukan objek pajak).
- `{{penghasilan_final}}` — number. Total penghasilan yang sudah dikenai PPh Final.
- `{{koreksi_positif_total}}` — number. Total koreksi positif.
- `{{koreksi_negatif_total}}` — number. Total koreksi negatif.
- `{{pkp_fiskal}}` — number. PKP fiskal hasil rekonsiliasi.

## Memo

```
# Memo Rekonsiliasi Fiskal vs Komersial Tahun Pajak {{tahun_pajak}}

Entitas       : {{nama_perseroan}}
NPWP          : {{npwp_badan}}
Tahun pajak   : {{tahun_pajak}}
Tujuan        : Lampiran rekonsiliasi fiskal untuk SPT Tahunan PPh Badan (form 1771)

## 1. Dasar hukum

- UU 7/1983 sebagaimana diubah terakhir dengan UU 7/2021 (UU HPP) — UU Pajak Penghasilan.
- UU PPh Pasal 4 — objek dan bukan objek pajak.
- UU PPh Pasal 6 — biaya yang dapat dikurangkan.
- UU PPh Pasal 9 — biaya yang tidak dapat dikurangkan.
- UU PPh Pasal 11 — penyusutan aset tetap.
- PP 55/2022 — perlakuan biaya natura dan kenikmatan untuk PPh.
- PMK 96/2009 — kelompok dan masa manfaat penyusutan fiskal.
- SE-27/PJ.22/1986 — daftar nominatif untuk biaya entertainment.

## 2. Konsep dasar rekonsiliasi

Laporan keuangan komersial disusun per SAK (Standar Akuntansi Keuangan) — orientasi: representasi posisi keuangan yang wajar untuk pengguna laporan.

Laporan fiskal disusun per UU PPh — orientasi: menghitung Penghasilan Kena Pajak sesuai aturan perpajakan.

Karena dua basis berbeda, ada perbedaan perlakuan atas pos tertentu. Rekonsiliasi fiskal adalah jembatan: laba komersial + koreksi positif − koreksi negatif = PKP fiskal.

### Jenis perbedaan

- **Beda tetap (permanent difference)** — perbedaan yang tidak akan terbalik di masa depan. Contoh: sumbangan non-deductible, PPh badan, sanksi pajak. Koreksi langsung di tahun berjalan.
- **Beda waktu (timing difference)** — perbedaan timing pengakuan yang akan terbalik di periode lain. Contoh: penyusutan dengan tarif berbeda, cadangan kerugian piutang yang akhirnya direalisasi. Memunculkan pajak tangguhan (deferred tax) di laporan komersial.

## 3. Koreksi positif — menambah PKP

Koreksi positif terjadi ketika biaya yang diakui di laporan komersial **tidak diakui** sebagai pengurang penghasilan fiskal, atau pendapatan yang belum diakui komersial **sudah diakui** fiskal.

| Pos koreksi positif                                            | Dasar hukum                                  | Jumlah                                |
|----------------------------------------------------------------|----------------------------------------------|---------------------------------------|
| Biaya entertainment tanpa daftar nominatif                     | UU PPh Pasal 6 jo. SE-27/PJ.22/1986          | Rp {{entertainment_tanpa_nominatif}},-|
| Sumbangan non-bencana / non-pendidikan / non-litbang           | UU PPh Pasal 9 ayat 1 huruf g                | Rp {{sumbangan_non_deductible}},-     |
| Pajak Penghasilan (PPh terutang sendiri)                       | UU PPh Pasal 9 ayat 1 huruf h                | Rp [nilai],-                          |
| Sanksi administrasi + sanksi pidana pajak                      | UU PPh Pasal 9 ayat 1 huruf k                | Rp [nilai],-                          |
| Biaya untuk kepentingan pribadi pemegang saham / direksi       | UU PPh Pasal 9 ayat 1 huruf b                | Rp [nilai],-                          |
| Biaya natura / kenikmatan di atas threshold deductible         | PP 55/2022 (sejak 2022)                      | Rp {{biaya_natura_excess}},-          |
| Penyusutan komersial melebihi tarif fiskal                     | UU PPh Pasal 11 jo. PMK 96/2009              | Rp {{penyusutan_excess}},-            |
| Cadangan kerugian non-bank / non-asuransi (non-deductible)     | UU PPh Pasal 9 ayat 1 huruf c                | Rp {{cadangan_non_deductible}},-      |
| Premi asuransi karyawan yang masuk natura                      | UU PPh Pasal 9 ayat 1 huruf d                | Rp [nilai],-                          |
| **Total koreksi positif**                                      |                                              | **Rp {{koreksi_positif_total}},-**    |

### Catatan biaya entertainment

Per SE-27/PJ.22/1986, biaya entertainment hanya deductible jika ada daftar nominatif yang mencantumkan:
1. Nomor urut.
2. Tanggal entertainment.
3. Nama tempat + alamat.
4. Jenis entertainment.
5. Jumlah biaya.
6. Nama relasi + perusahaan + jabatan + hubungan bisnis.

Tanpa daftar nominatif lengkap, biaya entertainment dikoreksi positif 100%.

### Catatan biaya natura per UU HPP

Sebelum UU HPP 7/2021, semua biaya natura non-deductible per UU PPh Pasal 9 ayat 1 huruf e. Sejak 2022 (PP 55/2022), beberapa kategori natura menjadi deductible bagi pemberi kerja + bukan objek pajak bagi karyawan:
- Makan + minum untuk seluruh karyawan di tempat kerja.
- Natura di daerah tertentu (terpencil) — sesuai daftar PMK.
- Natura terkait keharusan pekerjaan (APD, seragam wajib).
- Natura sebagai bagian remunerasi yang diterima jenderal karyawan dengan ambang batas tertentu per PMK 66/2023.

Natura di luar kategori di atas tetap non-deductible — koreksi positif.

## 4. Koreksi negatif — mengurangi PKP

Koreksi negatif terjadi ketika pendapatan yang diakui komersial **bukan** objek pajak fiskal, atau biaya yang belum diakui komersial **sudah** deductible fiskal.

| Pos koreksi negatif                                                | Dasar hukum                                  | Jumlah                                |
|--------------------------------------------------------------------|----------------------------------------------|---------------------------------------|
| Dividen dari PT dalam negeri kepemilikan ≥ 25% (bukan objek pajak) | UU PPh Pasal 4 ayat 3 huruf f                | Rp {{dividen_ps_25_persen}},-         |
| Penghasilan yang sudah dikenai PPh Final (PPN, PPh 4(2), Final UMKM)| UU PPh Pasal 4 ayat 2                       | Rp {{penghasilan_final}},-            |
| Bagian laba anggota CV / Firma (modal tidak terbagi atas saham)    | UU PPh Pasal 4 ayat 3 huruf i                | Rp [nilai],-                          |
| Bantuan / sumbangan / hibah memenuhi syarat Pasal 4(3) huruf a     | UU PPh Pasal 4 ayat 3 huruf a                | Rp [nilai],-                          |
| Warisan                                                            | UU PPh Pasal 4 ayat 3 huruf b                | Rp [nilai],-                          |
| Setoran dari pemegang saham sebagai pengganti modal                | UU PPh Pasal 4 ayat 3 huruf c                | Rp [nilai],-                          |
| Selisih lebih revaluasi aset tetap yang sudah dikenai PPh Final    | PMK 79/2008                                  | Rp [nilai],-                          |
| Pemulihan cadangan piutang yang tahun lalu sudah dikoreksi positif | UU PPh Pasal 6 ayat 1 huruf h                | Rp [nilai],-                          |
| **Total koreksi negatif**                                          |                                              | **Rp {{koreksi_negatif_total}},-**    |

### Catatan dividen ≥ 25%

Per UU PPh Pasal 4 ayat 3 huruf f jo. UU HPP 7/2021, dividen yang diterima PT / Koperasi / BUMN / BUMD dari penyertaan modal di PT / BUMN / BUMD dalam negeri bukan objek pajak sepanjang:
1. Dividen berasal dari laba ditahan, dan
2. Penerima memiliki kepemilikan saham minimal 25%, atau
3. Dividen diterima oleh PT yang melakukan investasi di Indonesia dalam jangka waktu tertentu sesuai PMK 18/2021 (skema reinvestasi).

## 5. Format ringkasan rekonsiliasi (untuk lampiran SPT 1771)

| Pos                                          | Jumlah                                |
|----------------------------------------------|---------------------------------------|
| Laba komersial sebelum pajak                 | Rp {{laba_komersial}},-               |
| (+) Total koreksi positif                    | Rp {{koreksi_positif_total}},-        |
| (−) Total koreksi negatif                    | Rp {{koreksi_negatif_total}},-        |
| **Penghasilan Kena Pajak (PKP) fiskal**      | **Rp {{pkp_fiskal}},-**               |
| Tarif PPh Badan (PP 30/2020)                 | 22%                                   |
| PPh Badan terutang                           | Rp [hitung 22% × PKP],-               |

Catatan: jika peredaran bruto ≤ Rp 50 milyar, terapkan fasilitas Pasal 31E UU PPh — tarif efektif 11% atas PKP dari peredaran bruto ≤ Rp 4,8 milyar.

## 6. Hubungan dengan akuntansi pajak tangguhan (PSAK 46)

Beda waktu (timing difference) menghasilkan:
- **Aktiva pajak tangguhan (deferred tax asset)** — jika beda waktu akan menurunkan PKP di masa depan (contoh: cadangan kerugian piutang yang akhirnya direalisasi).
- **Kewajiban pajak tangguhan (deferred tax liability)** — jika beda waktu akan menaikkan PKP di masa depan (contoh: penyusutan fiskal lebih cepat dari penyusutan komersial).

PSAK 46 (Pajak Penghasilan) mengatur pengakuan + pengukuran pajak tangguhan di laporan komersial. SAK ETAP tidak mewajibkan pengakuan pajak tangguhan — UMKM cukup mencatat PPh terutang aktual saja.

## 7. Catatan untuk founder

- Rekonsiliasi fiskal **wajib** dilampirkan di SPT Tahunan 1771 — tanpa rekonsiliasi, SPT dianggap tidak lengkap + bisa kena sanksi UU KUP Pasal 7.
- Daftar nominatif entertainment harus disusun real-time sepanjang tahun, bukan dibuat retroaktif saat tutup buku — DJP cenderung menolak daftar yang dibuat sekaligus akhir tahun tanpa bukti pendukung tanggal.
- Penyusutan fiskal pakai metode garis lurus untuk bangunan + boleh garis lurus / saldo menurun untuk non-bangunan, dengan masa manfaat per kelompok di PMK 96/2009 — beda dengan estimasi masa manfaat komersial yang biasanya lebih panjang.
- Beda tetap selesai di tahun berjalan (tidak menghasilkan deferred tax). Beda waktu menghasilkan deferred tax di laporan komersial pakai PSAK 46.
- Konsultasikan setiap koreksi dengan konsultan pajak bersertifikat — interpretasi UU PPh terhadap kasus spesifik (terutama natura post-UU HPP) sering berubah lewat SE/Surat Edaran DJP.
- Arsip kertas kerja rekonsiliasi + dokumen pendukung minimal 10 tahun (UU KUP Pasal 28 ayat 11).
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek. Angka IDR dengan separator titik thousand tanpa desimal (Rp 4.800.000.000,-), persen dengan koma desimal (22% / 11%). Setiap koreksi terikat ke pasal — UU PPh Pasal 4/6/9/11, PP 55/2022, PMK 96/2009, SE-27/PJ.22/1986, PMK 66/2023. Bedakan jelas beda tetap vs beda waktu, dan beda komersial (SAK/PSAK 46) vs fiskal (UU PPh). Zero exclamation marks. Hindari kata banned brand voice.
