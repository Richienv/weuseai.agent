# Indonesian Compliance Due Dates

> Reference reminder list. compliance-checker skill load file ini, filter per business_status + has_employees, surface 3-5 most-imminent items.

---

## Schema per item

```yaml
- name: short label
  applies_to: [pt-active | cv-active | pre-incorporation]
  triggers: [has_employees | is_pkp | omzet_>_4_8m]  # optional gates
  cadence: monthly | quarterly | annually | one-time | per-event
  due_date: pattern (e.g. "tanggal 10 bulan berikutnya")
  filing_portal: pajak.go.id | bpjs.go.id | oss.go.id
  document: SPT 1111 | bukti potong A1 | etc
  late_penalty: text
  notes: text
```

---

## Pajak (Pajak Penghasilan & PPN)

### PPh 21 — Pemotongan Pajak Karyawan
- **applies_to:** pt-active, cv-active
- **triggers:** has_employees
- **cadence:** monthly
- **due_date:** Setor max **tanggal 10 bulan berikutnya**, lapor SPT Masa max **tanggal 20 bulan berikutnya**
- **filing_portal:** pajak.go.id (e-Bupot 21)
- **document:** SPT Masa PPh 21, Bukti Potong A1 (karyawan tetap) atau A2 (PNS)
- **late_penalty:** Bunga 2% per bulan dari pajak terutang (max 24 bulan)
- **notes:** Kalau payroll outsource, biasanya provider handle ini.

### PPh 25 — Angsuran Bulanan Badan
- **applies_to:** pt-active, cv-active
- **triggers:** omzet > Rp 4.8M/tahun (di luar UMKM Final)
- **cadence:** monthly
- **due_date:** Setor max **tanggal 15 bulan berikutnya**
- **filing_portal:** pajak.go.id
- **document:** SSP (Surat Setoran Pajak)
- **late_penalty:** Bunga 2% per bulan
- **notes:** Angsuran berdasarkan SPT Tahunan tahun lalu / 12.

### PPh Final UMKM 0.5% — Tarif khusus omzet kecil
- **applies_to:** pt-active, cv-active
- **triggers:** omzet ≤ Rp 4.8M/tahun (PT) atau ≤ Rp 4.8M/tahun (orang pribadi pengusaha)
- **cadence:** monthly
- **due_date:** Setor max **tanggal 15 bulan berikutnya**
- **filing_portal:** pajak.go.id
- **document:** SSP, lapor SPT Tahunan ringkas
- **late_penalty:** Bunga 2% per bulan
- **notes:** Berlaku 7 tahun untuk OP, 4 tahun untuk PT, 3 tahun untuk CV. Setelah itu wajib pembukuan normal.

### PPN — Pajak Pertambahan Nilai
- **applies_to:** pt-active, cv-active
- **triggers:** is_pkp (omzet >Rp 4.8M/tahun → wajib jadi Pengusaha Kena Pajak)
- **cadence:** monthly
- **due_date:** Setor + lapor max **akhir bulan berikutnya**
- **filing_portal:** pajak.go.id (e-Faktur)
- **document:** SPT Masa PPN 1111
- **late_penalty:** Denda Rp 500k per SPT terlambat + bunga 2% per bulan
- **notes:** Wajib terbitkan e-Faktur untuk setiap penjualan kena PPN. PPN rate 11% (sejak April 2022).

### SPT Tahunan Badan
- **applies_to:** pt-active, cv-active
- **cadence:** annually
- **due_date:** **4 bulan setelah akhir tahun buku** (untuk tahun buku Jan-Des: deadline 30 April)
- **filing_portal:** pajak.go.id (e-Filing)
- **document:** SPT 1771 (PT) atau SPT 1770 (OP/CV via sekutu)
- **late_penalty:** Denda Rp 1jt + bunga 2% per bulan kalau ada pajak kurang bayar
- **notes:** Bisa minta perpanjangan max 2 bulan kalau ada alasan valid.

---

## BPJS (Jaminan Sosial)

### BPJS Kesehatan — Iuran Bulanan
- **applies_to:** pt-active, cv-active
- **triggers:** has_employees
- **cadence:** monthly
- **due_date:** **Tanggal 10 bulan berjalan**
- **filing_portal:** bpjs-kesehatan.go.id
- **document:** Auto-debit kalau setup; manual transfer kalau tidak
- **late_penalty:** Denda 5% × jumlah hari telat × iuran (max 30 hari)
- **notes:** Iuran 5% × gaji pokok (4% kontribusi perusahaan, 1% potong gaji karyawan). Cap gaji Rp 12jt.

### BPJS Ketenagakerjaan — JHT, JKK, JKM, JP
- **applies_to:** pt-active, cv-active
- **triggers:** has_employees
- **cadence:** monthly
- **due_date:** **Tanggal 15 bulan berikutnya**
- **filing_portal:** bpjsketenagakerjaan.go.id (SIPP)
- **document:** Laporan SIPP bulanan, auto-debit
- **late_penalty:** Denda 2% per bulan dari iuran
- **notes:** 4 program total ~10-12% of payroll (mix kontribusi perusahaan + karyawan). JHT 5.7%, JKK 0.24-1.74%, JKM 0.3%, JP 3%.

---

## OSS (Online Single Submission)

### OSS — Verifikasi Dokumen Pendukung
- **applies_to:** pt-active, cv-active, pre-incorporation
- **cadence:** one-time per NIB
- **due_date:** **90 hari setelah NIB terbit**
- **filing_portal:** oss.go.id
- **document:** Akta + SK Kemenkumham + NPWP badan + bukti modal disetor (kalau PT)
- **late_penalty:** NIB di-suspend; aktivitas usaha terganggu
- **notes:** Kalau lewat, harus submit ulang dengan klarifikasi.

### NIB — Perpanjangan / Update KBLI
- **applies_to:** pt-active, cv-active
- **triggers:** ada perubahan KBLI / ekspansi sektor
- **cadence:** per-event
- **due_date:** Sebelum aktivitas baru dimulai
- **filing_portal:** oss.go.id
- **document:** Submit perubahan KBLI di akun OSS
- **late_penalty:** Aktivitas baru tanpa KBLI = ilegal, kena sanksi sektoral
- **notes:** NIB itself tidak expire, tapi update KBLI penting kalau scope berubah.

---

## Kemenkumham (untuk PT)

### Akta Perubahan — Kalau ada perubahan struktur
- **applies_to:** pt-active
- **triggers:** perubahan pemegang saham / direksi / komisaris / modal
- **cadence:** per-event
- **due_date:** **Max 30 hari** setelah perubahan diputuskan RUPS
- **filing_portal:** ahu.go.id (lewat notaris)
- **document:** Akta perubahan + risalah RUPS
- **late_penalty:** SK Perubahan tertunda; risiko tidak diakui pihak ketiga
- **notes:** Wajib lewat notaris.

### Laporan Tahunan ke Kemenkumham
- **applies_to:** pt-active
- **cadence:** annually
- **due_date:** **6 bulan setelah akhir tahun buku** (untuk tahun buku Jan-Des: deadline 30 Juni)
- **filing_portal:** ahu.go.id
- **document:** Laporan keuangan + risalah RUPS tahunan
- **late_penalty:** Denda administratif; PT bisa di-cabut izin kalau berulang
- **notes:** Wajib khusus PT yang go public; PT private skala kecil sering skip — tapi best practice tetap submit.

---

## Reminder pattern (compliance-checker)

Default ping H-7 + H-1 + hari-H untuk:
- PPh 21 / PPh 25 / PPh Final UMKM (tanggal 10/15)
- PPN (akhir bulan)
- BPJS Kesehatan (tanggal 10)
- BPJS Ketenagakerjaan (tanggal 15)

Annual reminder:
- SPT Tahunan Badan: H-30, H-7, H-1 sebelum 30 April
- Laporan Tahunan Kemenkumham: H-30 sebelum 30 Juni

Conditional reminder:
- OSS verifikasi 90 hari: H-30, H-7 sebelum deadline

---

## Disclaimer

> _Tarif, due date, dan procedure bisa berubah. compliance-checker surface info publik per template ini — untuk filing actual + advice tax-specific (mis. perlakuan biaya, restitusi, tax planning), konsultasi dengan akuntan / konsultan pajak yang familiar dengan bisnis kamu._
