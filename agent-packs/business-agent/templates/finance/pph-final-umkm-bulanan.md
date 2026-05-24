# Template — Memo PPh Final UMKM Bulanan

Memo internal bulanan untuk PT/CV UMKM dengan omzet ≤ Rp 4.800.000.000,- per tahun yang memilih skema PPh Final 0,5% per PP 55/2022 Pasal 56-65 (pengganti PP 23/2018). Memo merangkum hitungan omzet bulan berjalan, kewajiban setor via e-billing DJP, dan deadline lapor SPT Masa PPh Final.

Audience: founder, finance lead, atau owner UMKM yang mengelola sendiri kewajiban pajak bulanan sebelum konsultasi akuntan.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_badan}}` — string. Nama PT/CV lengkap, contoh "PT Sinar Bahari".
- `{{npwp_badan}}` — string. NPWP 15 atau 16 digit (NPWP-16 wajib sejak Permenkeu 112/2022).
- `{{masa_pajak}}` — string. Bulan dan tahun pajak, format "Oktober 2026".
- `{{omzet_bulan}}` — number. Total peredaran bruto bulan berjalan dalam rupiah.
- `{{omzet_ytd}}` — number. Akumulasi omzet year-to-date dalam tahun pajak berjalan.
- `{{tarif_pph_final}}` — number. Default 0,005 (0,5%) untuk skema UMKM PP 55/2022.
- `{{pph_terutang}}` — number. Hasil `omzet_bulan × tarif_pph_final`.
- `{{kode_billing}}` — string. Default `411128-420` (kode setoran PPh Final UMKM).
- `{{tanggal_setor}}` — date. Default tanggal 15 bulan berikutnya untuk batas setor.
- `{{tanggal_lapor}}` — date. Default tanggal 20 bulan berikutnya untuk batas lapor SPT Masa (per PMK 9/2018 jo. PMK 18/2021).

## Memo

```
# Memo PPh Final UMKM — {{masa_pajak}}

Kepada   : Founder / Direksi {{nama_badan}}
Dari     : Business Director (draft compliance internal)
Perihal  : Setoran + pelaporan PPh Final UMKM Pasal 4 ayat (2) — Masa {{masa_pajak}}
NPWP     : {{npwp_badan}}

## 1. Dasar hukum

- PP 55/2022 Pasal 56-65 — PPh Final UMKM tarif 0,5% atas peredaran bruto ≤ Rp 4.800.000.000,- per tahun pajak.
- PMK 164/2023 — tata cara penyetoran + pelaporan PPh Final UMKM.
- UU 7/2021 (UU HPP) Pasal 7 ayat (2a) — threshold peredaran bruto.

## 2. Posisi omzet bulan berjalan

| Pos                                  | Jumlah                          |
|--------------------------------------|---------------------------------|
| Peredaran bruto {{masa_pajak}}       | Rp {{omzet_bulan}},-            |
| Peredaran bruto YTD tahun berjalan   | Rp {{omzet_ytd}},-              |
| Batas threshold UMKM (per tahun)     | Rp 4.800.000.000,-              |
| Sisa kapasitas threshold             | Rp (4.800.000.000 − YTD),-      |

Catatan: jika YTD melewati Rp 4.800.000.000,- dalam tahun pajak berjalan, sisa omzet bulan tersebut tetap dikenai PPh Final 0,5% (per PP 55/2022 Pasal 60), namun mulai tahun pajak berikutnya wajib pindah ke rezim PPh Badan umum (tarif 22% per PP 30/2020 atas laba kena pajak).

## 3. Hitungan PPh Final terutang

PPh Final terutang = {{omzet_bulan}} × 0,5%
                   = Rp {{pph_terutang}},-

Contoh perhitungan (omzet Rp 120.000.000,- bulan berjalan):
  120.000.000 × 0,005 = Rp 600.000,-

## 4. Mekanisme setor

1. Buat kode billing via DJP Online (https://djponline.pajak.go.id) atau aplikasi e-Billing.
2. Pilih jenis pajak: PPh Final Pasal 4 ayat (2), kode setoran {{kode_billing}}.
3. Masukkan masa pajak {{masa_pajak}} + jumlah Rp {{pph_terutang}},-.
4. Bayar via teller bank persepsi, ATM, internet banking, atau marketplace yang terintegrasi DJP.
5. Simpan Bukti Penerimaan Negara (BPN) — wajib lampir saat pelaporan.

Batas setor: paling lambat {{tanggal_setor}} (tanggal 15 bulan berikutnya per PMK 242/2014 jo. PMK 18/2021).

## 5. Mekanisme lapor

1. Login DJP Online → pilih e-Filing.
2. Pilih SPT Masa PPh Final, masa pajak {{masa_pajak}}.
3. Isi jumlah peredaran bruto Rp {{omzet_bulan}},-, otomatis terhitung PPh Final Rp {{pph_terutang}},-.
4. Lampirkan BPN dari Langkah 4 di Bagian "Setor".
5. Submit, simpan Bukti Penerimaan Elektronik (BPE).

Batas lapor: paling lambat {{tanggal_lapor}} (tanggal 20 bulan berikutnya untuk SPT Masa per PMK 9/2018).

## 6. Sanksi keterlambatan

| Pelanggaran                              | Sanksi                                                                |
|------------------------------------------|-----------------------------------------------------------------------|
| Terlambat setor                          | Bunga per bulan, tarif acuan Menteri Keuangan + 5% / 12 (UU KUP Pasal 9 ayat 2a jo. UU HPP 7/2021). |
| Terlambat lapor SPT Masa                 | Denda Rp 100.000,- per SPT (UU KUP Pasal 7 ayat 1 huruf a).           |
| Tidak setor sama sekali                  | Surat Tagihan Pajak (STP) + bunga + kemungkinan pemeriksaan.          |

## 7. Catatan untuk founder

- Skema 0,5% UMKM bersifat **opsional** — jika margin tipis (<2,3%), pertimbangkan beralih ke PPh Badan 22% atas laba kena pajak, lebih ringan.
- Opsi UMKM hanya berlaku 7 tahun untuk PT (sejak tahun pajak terdaftar UMKM per PP 55/2022 Pasal 59), 4 tahun untuk CV/Firma, dan 7 tahun untuk Perorangan.
- Lapor SPT 0 (nihil) tetap wajib walau tidak ada omzet bulan tersebut — skip = denda Rp 100.000,-.
- BPN + BPE wajib arsipkan minimal 10 tahun (UU KUP Pasal 28 ayat 11).
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek satu ide per kalimat. Angka rapi: IDR dengan separator titik thousand tanpa desimal (Rp 25.000.000,-), persen dengan koma desimal (0,5%). Setiap kewajiban harus terikat ke pasal — UU KUP, PP 55/2022, PMK terkait. Zero exclamation marks. Hindari kata banned brand voice. Jangan klaim tarif tanpa sitasi pasal.
