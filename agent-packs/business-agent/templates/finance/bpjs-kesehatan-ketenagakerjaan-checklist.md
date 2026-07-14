# Template — Checklist Onboarding BPJS Kesehatan + Ketenagakerjaan Karyawan Baru

Checklist sequence pendaftaran BPJS Kesehatan + BPJS Ketenagakerjaan untuk karyawan baru di PT/CV. Kewajiban perusahaan per UU 24/2011 (BPJS), UU 40/2004 (SJSN), PP 86/2013 (BPJS Kesehatan), PP 44/2015 jo. PP 82/2019 (BPJS Ketenagakerjaan), dan Perpres 82/2018 jo. Perpres 64/2020.

Audience: founder, HR lead, finance lead PT/CV yang onboard karyawan baru.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_badan}}` — string. Nama PT/CV pemberi kerja.
- `{{nomor_va_kesehatan}}` — string. Virtual account BPJS Kesehatan badan usaha.
- `{{nomor_va_ketenagakerjaan}}` — string. Virtual account BPJS TK badan usaha.
- `{{nama_karyawan}}` — string. Nama lengkap karyawan baru.
- `{{nik_karyawan}}` — string. NIK 16 digit dari KTP.
- `{{gaji_pokok}}` — number. Gaji pokok bulanan dalam rupiah.
- `{{tingkat_risiko_jkk}}` — string. Sangat rendah / Rendah / Sedang / Tinggi / Sangat tinggi (per PP 44/2015 Lampiran).
- `{{tanggal_mulai_kerja}}` — date. Tanggal masuk kerja.
- `{{jumlah_tanggungan}}` — number. Dependents untuk BPJS Kesehatan (suami/istri + 3 anak maks per Perpres 82/2018).

## Checklist

```
# Checklist BPJS Onboarding — {{nama_karyawan}}

Pemberi kerja : {{nama_badan}}
Karyawan      : {{nama_karyawan}} ({{nik_karyawan}})
Mulai kerja   : {{tanggal_mulai_kerja}}

## 1. Dasar hukum

- UU 24/2011 — Badan Penyelenggara Jaminan Sosial.
- UU 40/2004 — Sistem Jaminan Sosial Nasional.
- Perpres 82/2018 jo. Perpres 64/2020 — Jaminan Kesehatan.
- PP 44/2015 jo. PP 82/2019 — Penyelenggaraan Program JKK + JKM.
- PP 45/2015 — Penyelenggaraan Program Jaminan Pensiun.
- PP 46/2015 jo. PP 60/2015 — Penyelenggaraan Program JHT.

Kewajiban perusahaan: daftarkan karyawan dalam 30 hari sejak mulai bekerja (UU 24/2011 Pasal 15). Sanksi: teguran tertulis → denda → tidak dapat layanan publik (PP 86/2013 Pasal 5-9).

## 2. Pre-onboarding: data karyawan yang perlu dikumpulkan

- [ ] KTP karyawan (NIK 16 digit) + scan/foto.
- [ ] Kartu Keluarga (KK).
- [ ] NPWP karyawan (jika sudah punya — opsional).
- [ ] Foto karyawan ukuran 3x4 (digital, untuk kartu BPJS).
- [ ] Data tanggungan: KTP/akta lahir suami/istri + akta lahir maks 3 anak (untuk BPJS Kesehatan).
- [ ] Nomor rekening bank karyawan (untuk klaim BPJS TK).
- [ ] Surat keterangan kerja / kontrak kerja yang sudah ditandatangani.

## 3. BPJS Kesehatan — registrasi karyawan baru

Portal: https://edabu.bpjs-kesehatan.go.id (E-Dabu = Elektronik Data Badan Usaha).

- [ ] Login E-Dabu pakai NIK PIC perusahaan + password.
- [ ] Pilih menu "Mutasi Peserta" → "Tambah Peserta".
- [ ] Input NIK karyawan + tanggal mulai kerja {{tanggal_mulai_kerja}} + gaji pokok {{gaji_pokok}}.
- [ ] Pilih tanggungan: maks 5 jiwa (peserta + suami/istri + 3 anak), per Perpres 82/2018 Pasal 5.
- [ ] Tanggungan tambahan (anak ke-4+, orang tua, mertua) bisa didaftarkan terpisah dengan tambahan iuran 1% per orang per Perpres 82/2018 Pasal 38.
- [ ] Submit, dapatkan nomor kepesertaan + Virtual Account untuk iuran bulanan.
- [ ] Cetak kartu digital via aplikasi Mobile JKN — kartu fisik opsional.

### Iuran BPJS Kesehatan (per Perpres 64/2020 Pasal 30)

| Komponen           | Tarif | Catatan                                                  |
|--------------------|-------|----------------------------------------------------------|
| Total iuran        | 5%    | Dari gaji + tunjangan tetap                              |
| Tanggungan perusahaan| 4%  | Setor langsung ke BPJS                                   |
| Tanggungan karyawan| 1%    | Potong dari gaji karyawan                                |
| Cap basis gaji     | —     | Maksimum Rp 12.000.000,- (per Perpres 64/2020 Pasal 30)  |
| Floor basis gaji   | —     | Minimum UMK/UMP setempat                                 |

Contoh (gaji Rp 10.000.000,-): total iuran 5% × 10.000.000 = Rp 500.000,-. Perusahaan setor Rp 400.000,-, karyawan potong Rp 100.000,-.

Tanggungan tambahan di luar 5 jiwa standar: 1% × gaji per orang per Perpres 82/2018 Pasal 38.

## 4. BPJS Ketenagakerjaan — registrasi karyawan baru

Portal: https://sipp.bpjsketenagakerjaan.go.id (SIPP = Sistem Informasi Pelaporan Peserta).

- [ ] Login SIPP pakai user ID perusahaan + password.
- [ ] Pilih "Penambahan Tenaga Kerja Baru".
- [ ] Input NIK + nama + gaji {{gaji_pokok}} + tanggal mulai kerja {{tanggal_mulai_kerja}}.
- [ ] Pilih program: JHT (wajib), JKK (wajib), JKM (wajib), JP (wajib untuk PT, opsional untuk perorangan).
- [ ] Pilih tingkat risiko pekerjaan {{tingkat_risiko_jkk}} (sesuai klasifikasi PP 44/2015 Lampiran).
- [ ] Submit, dapatkan nomor kepesertaan + Virtual Account.

### Iuran BPJS Ketenagakerjaan (per PP 44/2015 jo. PP 82/2019 dan PP 45/2015)

| Program           | Tarif total | Perusahaan | Karyawan | Cap basis                       |
|-------------------|-------------|------------|----------|---------------------------------|
| JHT (Hari Tua)    | 5,7%        | 3,7%       | 2%       | Tidak ada cap                   |
| JP (Pensiun)      | 3%          | 2%         | 1%       | Cap Rp 9.077.600,- (per 2024)   |
| JKK (Kecelakaan)  | 0,24-1,74%  | 100%       | 0%       | Tarif per tingkat risiko        |
| JKM (Kematian)    | 0,3%        | 100%       | 0%       | Tidak ada cap                   |

Tarif JKK per tingkat risiko (PP 44/2015 Lampiran):
- Sangat rendah: 0,24%
- Rendah: 0,54%
- Sedang: 0,89%
- Tinggi: 1,27%
- Sangat tinggi: 1,74%

Contoh (gaji Rp 10.000.000,-, JKK rendah, perusahaan total tanggungan):
- JHT 3,7% × 10jt = Rp 370.000,-
- JP 2% × 10jt = Rp 200.000,- (cap basis tidak terlampaui)
- JKK 0,54% × 10jt = Rp 54.000,-
- JKM 0,3% × 10jt = Rp 30.000,-
- Total perusahaan = Rp 654.000,-
- Total karyawan (JHT 2% + JP 1%) = Rp 300.000,-

## 5. Timeline iuran bulanan

| Tugas                                                          | Frekuensi    | Deadline                              |
|----------------------------------------------------------------|--------------|---------------------------------------|
| Setor iuran BPJS Kesehatan via VA {{nomor_va_kesehatan}}       | Bulanan      | Tanggal 10 bulan berjalan (Perpres 82/2018 Pasal 42) |
| Setor iuran BPJS TK via VA {{nomor_va_ketenagakerjaan}}        | Bulanan      | Tanggal 15 bulan berikutnya (PP 44/2015 Pasal 19)    |
| Lapor mutasi karyawan (tambah/keluar) via E-Dabu + SIPP        | Per kejadian | Maks 7 hari setelah perubahan         |
| Update gaji karyawan (kenaikan/penurunan)                      | Per kejadian | Bulan berikutnya setelah perubahan    |

## 6. Sanksi non-compliance

- Tidak daftarkan karyawan dalam 30 hari → teguran tertulis → denda 0,1% × iuran tertunggak per hari → tidak dapat layanan publik (PP 86/2013 Pasal 9).
- Terlambat setor iuran → denda 2% × iuran tertunggak per bulan (PP 86/2013 Pasal 17 ayat 5).
- Tidak laporkan upah sesungguhnya → sanksi pidana per UU 24/2011 Pasal 55 (penjara 8 tahun atau denda Rp 1 milyar).

## 7. Catatan untuk founder

- Cap gaji BPJS Kesehatan Rp 12.000.000,- berarti untuk gaji di atas cap, iuran tetap dihitung dari Rp 12.000.000,- — bukan dari gaji aktual.
- Cap basis JP Rp 9.077.600,- direvisi BPJS TK setiap tahun mengikuti inflasi — verifikasi via https://www.bpjsketenagakerjaan.go.id sebelum hitung.
- JHT karyawan (2%) jadi pengurang PPh 21 (Pasal 6 UU PPh 36/2008), tapi JKK + JKM + JHT 3,7% perusahaan **tidak** pengurang penghasilan kena pajak karyawan — itu beban perusahaan.
- Karyawan dengan kontrak <3 bulan tetap wajib didaftarkan BPJS (UU 24/2011 Pasal 14).
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek. Angka IDR dengan separator titik thousand (Rp 9.077.600,-), persen dengan koma desimal (0,54%). Setiap tarif iuran harus terikat ke pasal — UU 24/2011, PP 44/2015, PP 82/2019, PP 45/2015, Perpres 64/2020. Sebutkan kedua portal — E-Dabu (Kesehatan) + SIPP (Ketenagakerjaan). Zero exclamation marks. Hindari kata banned brand voice.
