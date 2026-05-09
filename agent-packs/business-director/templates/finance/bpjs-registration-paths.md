# BPJS Registration Paths (Indonesian Founder)

> Two parallel BPJS systems. Both wajib begitu hire 1 karyawan (PT) atau 1 anggota CV. Mark `setup_bpjs_registered` deliverable complete after both done.

---

## TL;DR — which one(s) do you need?

| Status kamu | BPJS Kesehatan | BPJS Ketenagakerjaan |
|---|---|---|
| PT, no employees yet | Wajib (founder daftar sebagai pengurus, monthly Rp 25-50k) | Tunggu hire pertama |
| PT + 1 karyawan | Wajib (perusahaan + karyawan) | Wajib (4 program: JHT, JKK, JKM, JP) |
| CV solo founder | Optional (daftar mandiri kalau mau coverage) | Optional |
| CV + 1 anggota | Wajib | Wajib |
| Perorangan + 1 karyawan | Wajib (perusahaan kategori PPU) | Wajib |

---

## BPJS Kesehatan — registration path

**Prereq:** NIB dari OSS + akta pendirian + alamat kantor (rumah OK).

1. Daftar online via [edabu.bpjs-kesehatan.go.id](https://edabu.bpjs-kesehatan.go.id) (PPU = Pekerja Penerima Upah).
2. Upload: NIB, akta, NPWP badan, daftar nama karyawan + NIK.
3. Approval ~3-5 hari kerja.
4. Bayar iuran bulanan: 4% dari gaji (3% perusahaan, 1% karyawan, max base Rp 12jt/bulan).
5. Karyawan dapat kartu BPJS Kesehatan dalam 1-2 minggu.

**Kalau telat daftar (≥30 hari setelah hire):** denda 2% per bulan. Tidak retroaktif untuk klaim.

---

## BPJS Ketenagakerjaan — 4 program

Wajib semua untuk PT/CV yang punya karyawan. Iuran ditanggung sebagian perusahaan, sebagian karyawan.

| Program | Iuran | Bagian perusahaan | Bagian karyawan | Catatan |
|---|---|---|---|---|
| **JHT** (Jaminan Hari Tua) | 5.7% gaji | 3.7% | 2% | Bisa dicairkan saat resign / 56 tahun |
| **JKK** (Jaminan Kecelakaan Kerja) | 0.24-1.74% gaji | 100% perusahaan | 0 | Risk-rated per KBLI (office work paling rendah, manufaktur tinggi) |
| **JKM** (Jaminan Kematian) | 0.30% gaji | 100% perusahaan | 0 | Santunan ahli waris saat karyawan meninggal |
| **JP** (Jaminan Pensiun) | 3% gaji (cap base Rp 9jt) | 2% | 1% | Pensiun di usia 56+ |

**Total kontribusi perusahaan:** ~6.24-7.74% gaji per karyawan (tergantung JKK rate).

### Registration path

1. Daftar online via [bpjsketenagakerjaan.go.id/perusahaan](https://www.bpjsketenagakerjaan.go.id) (menu "Pendaftaran Perusahaan").
2. Upload: NIB, akta, NPWP badan, KTP pengurus, daftar karyawan + gaji.
3. Approval ~5-7 hari kerja.
4. Setiap bulan: bayar iuran via SIPP (Sistem Informasi Pelaporan Perusahaan) atau bank channel.
5. Submit lapor bulanan max tanggal 15 bulan berikutnya.

**Denda telat:** 2% per bulan dari iuran tertunggak.

---

## Common slip-ups

- **Forget JKK risk-rate update.** KBLI bisa berubah kalau bisnis pivot — JKK rate ikut. Update via SIPP setiap perubahan.
- **Salah cap JP.** JP base capped at Rp 9jt per bulan. Karyawan bergaji Rp 15jt: kontribusi JP cap-out di Rp 270k (3% × Rp 9jt), bukan Rp 450k.
- **Auto-pause iuran saat karyawan resign tanpa update SIPP.** Iuran tetap charged jika karyawan tidak di-deactivate. Update SIPP ≤7 hari setelah resign.

---

## What BD v3 surfaces vs what customer does

- **BD v3 tracks:** deliverable status (`setup_bpjs_registered`), reminds approaching due dates via compliance-checker.
- **Customer does:** the actual registration submission (PII like NIK karyawan can't go through dispatched skills — Q4=A allowlist only covers incorporation-advisor + compliance-checker).

> _Disclaimer: BD v3 bukan konsultan BPJS. Reference ini grounded in BPJS public guidelines per 2026 Q1. Verify rate + iuran lewat BPJS official channel sebelum bayar._
