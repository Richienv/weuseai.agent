# Template — Memo PPh 21 Karyawan Tetap Bulanan (TER)

Memo internal bulanan untuk menghitung PPh Pasal 21 atas penghasilan karyawan tetap menggunakan skema Tarif Efektif Rata-rata (TER) per PP 58/2023 jo. PMK 168/2023. Skema TER berlaku efektif sejak Januari 2024 — menggantikan metode hitungan progresif bulanan yang lama dengan tarif efektif harian/bulanan/lump-sum yang lebih sederhana.

Audience: founder, HR lead, atau finance lead PT/CV yang setor + lapor PPh 21 sendiri sebelum konsultasi akuntan.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_badan}}` — string. Nama pemberi kerja.
- `{{nama_karyawan}}` — string. Nama lengkap karyawan tetap.
- `{{npwp_karyawan}}` — string. NPWP-16 karyawan (atau NIK jika belum NPWP per PMK 112/2022).
- `{{status_ptkp}}` — string. TK/0, K/0, K/1, K/2, K/3.
- `{{masa_pajak}}` — string. Format "Oktober 2026".
- `{{gaji_bruto}}` — number. Penghasilan bruto bulan berjalan (gaji pokok + tunjangan tetap + tunjangan tidak tetap).
- `{{iuran_bpjs_kes_karyawan}}` — number. 1% × gaji bruto (cap Rp 12.000.000,-).
- `{{iuran_jht_karyawan}}` — number. 2% × gaji bruto (BPJS Ketenagakerjaan JHT).
- `{{iuran_jp_karyawan}}` — number. 1% × gaji bruto (cap Rp 9.077.600,- per Peraturan BPJS TK 2024).
- `{{biaya_jabatan}}` — number. 5% × gaji bruto, maksimum Rp 500.000,- per bulan (Rp 6.000.000,- per tahun).
- `{{kategori_ter}}` — string. A / B / C tergantung kombinasi status PTKP per PMK 168/2023 Lampiran.
- `{{tarif_ter_bulanan}}` — number. Tarif efektif bulanan dari tabel TER PMK 168/2023.
- `{{pph_21_terutang}}` — number. Hasil perhitungan TER bulanan.

## Memo

```
# Memo PPh 21 Karyawan Tetap — {{masa_pajak}}

Kepada   : Founder / HR / Finance {{nama_badan}}
Dari     : Business Director (draft compliance internal)
Perihal  : Hitungan PPh 21 karyawan tetap {{nama_karyawan}} — Masa {{masa_pajak}}

## 1. Dasar hukum

- PP 58/2023 — Tarif Efektif Rata-rata (TER) PPh Pasal 21.
- PMK 168/2023 — petunjuk teknis TER + tabel kategori A/B/C.
- UU HPP 7/2021 Pasal 7 — PTKP per status (TK/0 = Rp 54jt, K/0 = Rp 58,5jt, K/1 = Rp 63jt, K/2 = Rp 67,5jt, K/3 = Rp 72jt per tahun).
- UU PPh 36/2008 Pasal 21 — kewajiban pemotongan PPh oleh pemberi kerja.

## 2. Profil karyawan

| Pos                       | Nilai                                |
|---------------------------|--------------------------------------|
| Nama                      | {{nama_karyawan}}                    |
| NPWP / NIK                | {{npwp_karyawan}}                    |
| Status PTKP               | {{status_ptkp}}                      |
| Kategori TER (PMK 168/23) | {{kategori_ter}}                     |

Mapping status PTKP → kategori TER per PMK 168/2023 Lampiran:
- TK/0, TK/1, K/0 → Kategori A
- TK/2, TK/3, K/1, K/2 → Kategori B
- K/3 → Kategori C

## 3. Hitungan PPh 21 metode TER bulanan (Januari-November)

Untuk masa Januari sampai November, gunakan TER bulanan langsung — tidak perlu setahunkan dulu.

| Pos                                              | Jumlah                                  |
|--------------------------------------------------|-----------------------------------------|
| Penghasilan bruto bulan {{masa_pajak}}           | Rp {{gaji_bruto}},-                     |
| Tarif efektif bulanan kategori {{kategori_ter}}  | {{tarif_ter_bulanan}}%                  |
| **PPh 21 terutang bulan berjalan**               | **Rp {{pph_21_terutang}},-**            |

Contoh perhitungan (karyawan K/0, gaji bruto Rp 15.000.000,-):
- Kategori TER: A
- Tarif TER bulanan untuk bruto Rp 15.000.000,- (kategori A): 2%
- PPh 21 = 15.000.000 × 2% = Rp 300.000,-

## 4. Hitungan PPh 21 metode setahunkan (khusus Desember)

Pada masa Desember, hitung ulang PPh 21 setahun penuh dengan metode progresif klasik untuk koreksi akhir tahun:

| Pos                                                | Formula                                       |
|----------------------------------------------------|-----------------------------------------------|
| Penghasilan bruto setahun                          | Σ gaji bruto Januari-Desember                 |
| Pengurang: biaya jabatan                           | 5% × bruto, maks Rp 6.000.000,- per tahun     |
| Pengurang: iuran JHT karyawan                      | 2% × gaji bruto setahun                       |
| Pengurang: iuran JP karyawan                       | 1% × gaji bruto setahun (cap Rp 9.077.600,-)  |
| Penghasilan neto setahun                           | bruto − biaya jabatan − JHT − JP              |
| PTKP per status {{status_ptkp}}                    | Sesuai UU HPP 7/2021 Pasal 7                  |
| **Penghasilan Kena Pajak (PKP) setahun**           | neto − PTKP                                   |
| PPh 21 terutang setahun (tarif progresif Pasal 17) | Lapis 5% / 15% / 25% / 30% / 35%              |
| PPh 21 sudah dipotong Januari-November (TER)       | Σ pemotongan TER bulanan                      |
| **PPh 21 Desember = setahun − yang sudah dipotong**| **Hasil koreksi**                             |

Tarif progresif Pasal 17 UU PPh (jo. UU HPP 7/2021):
- 0-60jt: 5%
- >60jt-250jt: 15%
- >250jt-500jt: 25%
- >500jt-5M: 30%
- >5M: 35%

## 5. Iuran BPJS yang menjadi tanggungan karyawan (pengurang)

| Iuran                       | Tarif karyawan | Cap basis                    |
|-----------------------------|----------------|------------------------------|
| BPJS Kesehatan              | 1%             | Cap gaji Rp 12.000.000,-     |
| BPJS TK JHT (Jaminan Hari Tua)| 2%           | Tidak ada cap                |
| BPJS TK JP (Jaminan Pensiun)| 1%             | Cap Rp 9.077.600,- (per 2024)|

Iuran JKK + JKM + JHT 3,7% + JP 2% = tanggungan perusahaan, bukan pengurang PPh 21 karyawan.

## 6. Mekanisme setor + lapor

- Setor PPh 21 yang sudah dipotong: kode billing 411121-100, paling lambat tanggal 10 bulan berikutnya (UU KUP Pasal 9).
- Lapor SPT Masa PPh 21 (form 1721): paling lambat tanggal 20 bulan berikutnya via DJP Online → e-Filing.
- Bukti potong (1721-A1 untuk karyawan tetap): wajib serahkan ke karyawan paling lambat Januari tahun berikutnya — input untuk SPT Tahunan 1770/1770S karyawan.

## 7. Sanksi keterlambatan

| Pelanggaran                  | Sanksi                                                    |
|------------------------------|-----------------------------------------------------------|
| Terlambat setor              | Bunga tarif acuan Menkeu + 5% / 12 per bulan (UU KUP 9(2a)).|
| Terlambat lapor SPT Masa     | Denda Rp 100.000,- per SPT (UU KUP Pasal 7).              |
| Tidak potong padahal wajib   | Sanksi 100% × jumlah pajak yang seharusnya dipotong (UU KUP Pasal 13(3)). |
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek. Angka IDR dengan separator titik thousand (Rp 12.000.000,-), persen dengan koma desimal. Setiap tarif harus terikat ke pasal — PP 58/2023, PMK 168/2023, UU HPP 7/2021, UU PPh 36/2008. Bedakan jelas TER bulanan (Jan-Nov) vs setahunkan (Des). Zero exclamation marks. Hindari kata banned brand voice.
