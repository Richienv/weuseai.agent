# DJP Tax Filing Cycle (Indonesian Founder)

> Compact reference of monthly + annual tax obligations for PT, CV, and Perorangan. BD v3's compliance-checker surfaces reminders 1 minggu sebelum due.

---

## Monthly cycle

| Tax | Subject | Due | Filing portal |
|---|---|---|---|
| **PPh 21** | Karyawan personal income tax (withheld + setor) | Tanggal 10 bulan berikutnya | DJP Online → e-SPT PPh 21 |
| **PPh 23** | Withholding atas jasa, sewa, dividen ke pihak ketiga | Tanggal 10 bulan berikutnya | DJP Online → SPT Masa PPh 23 |
| **PPh 4 ayat 2** | Final atas omzet tertentu (tanah/bangunan, deposito, dividen IPO) | Tanggal 10 | DJP Online |
| **PPh 25** | Angsuran PPh Badan tahunan (1/12 dari estimasi) | Tanggal 15 | DJP Online |
| **PPh Final UMKM 0.5%** | Omzet ≤Rp 4.8M/tahun (PT/CV/Perorangan) | Tanggal 15 (kalau pakai opsi UMKM) | DJP Online → SPT Masa Final |
| **PPN** | Bila PKP (omzet > Rp 4.8M/thn dan submit pengukuhan PKP) | Akhir bulan berikutnya | e-Faktur (faktur output + input) + e-SPT PPN |

**Lapor SPT 0 (nihil)** wajib walaupun tidak ada transaksi. Skip = denda Rp 100k-500k per laporan.

---

## Annual cycle

| Tax | Subject | Due | Filing portal |
|---|---|---|---|
| **SPT Tahunan PPh Badan (1771)** | PT/CV — laporan laba rugi + neraca | 30 April tahun berikutnya | DJP Online → e-Filing SPT 1771 |
| **SPT Tahunan PPh Orang Pribadi (1770/1770S)** | Perorangan + sekutu CV | 31 Maret tahun berikutnya | DJP Online → e-Filing 1770 |
| **SPT Final UMKM 0.5%** | Konfirmasi total omzet tahunan | 31 Maret | DJP Online (otomatis dari e-Filing bulanan) |

---

## Decision: PPh 25 vs PPh Final UMKM 0.5%

**Pakai PPh Final UMKM kalau:**
- Omzet tahun lalu ≤ Rp 4.8M
- Bisnis bukan jasa profesional khusus (notaris, pengacara, akuntan, dokter — wajib PPh 25)
- Mau simpel: 0.5% × omzet bulanan, no rekonsiliasi laba/rugi

**Pakai PPh 25 (Badan, 22%) kalau:**
- Omzet > Rp 4.8M atau plan exceed within 1-2 tahun
- Margin tipis (UMKM Final = 0.5% × omzet whether profit or loss; PPh 25 = 22% × profit, lebih ringan kalau profit margin <2.3%)
- Mau klaim biaya operasional sebagai pengurang penghasilan

---

## PKP (Pengusaha Kena Pajak) threshold

- Omzet > Rp 4.8M/tahun → **wajib daftar PKP** dalam 30 hari setelah cross threshold
- Konsekuensi: pungut PPN 11% dari customer + setor + lapor SPT Masa PPN
- Benefit: bisa kreditkan PPN masukan dari supplier
- Kalau B2C dengan customer non-PKP, PKP bisa hurt karena harga effective +11%
- Strategy: **PKP volunteer kalau B2B-heavy** (customer kreditkan PPN masukan); **delay sampai wajib kalau B2C-heavy**

---

## Deliverable mapping

`build_unit_economics_modeled` deliverable harus ada decision: PKP atau non-PKP path. BD v3 surface ini sebagai sub-question saat customer di stage Build.

`sell_recurring_revenue_stable` deliverable mengasumsikan customer udah set the tax cycle dengan benar (3 bulan stabil = sudah lewat 1 cycle PPN/PPh 21/25 lengkap).

---

## What BD v3 surfaces vs what customer does

- **BD v3 tracks:** SPT Tahunan + monthly PPh/PPN due dates via compliance-checker. Reminders 1 minggu sebelum cliff.
- **Customer does:** actual filing submission to DJP Online. Q4=C `regulatory_filing` approval (48h expiry) for any auto-generated draft before submission.

### Approval gate flow

1. finance-dispatch (`spt-tahunan` intent) → Trade Pro composes draft.
2. Draft includes computed totals (NPWP redacted in Telegram surfacing per Phase 4-4 PII rules).
3. `approval_requests` row opened (`action_kind: 'regulatory_filing'`, expiry NOW + 48h).
4. Customer reviews + approves in Telegram.
5. Final PDF (PII included for printing) delivered.
6. Customer submits to DJP Online via official portal.

> _Disclaimer: BD v3 bukan konsultan pajak berlisensi. Reference ini grounded in DJP regulasi per 2026 Q1. Verify rate + threshold lewat DJP official sebelum bayar/file._
