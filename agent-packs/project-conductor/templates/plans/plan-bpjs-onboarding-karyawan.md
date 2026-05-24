# Template — Plan onboarding karyawan baru ke BPJS

Dipakai untuk merencanakan onboarding karyawan baru ke BPJS Kesehatan plus BPJS Ketenagakerjaan (4 program: JHT, JKK, JKM, JP). Audiens: HR atau ops lead di PT/CV yang baru rekrut karyawan dan harus comply dengan UU 24/2011 (BPJS wajib semua karyawan).

> **NOTE: PANDUAN OPERASIONAL, BUKAN NASIHAT HUKUM.** Iuran dan persentase berubah per peraturan. Konsultasi dengan akuntan atau konsultan HR bersertifikat untuk perhitungan payroll spesifik.

## Variables

- `{{nama_perusahaan}}` — string, nama perusahaan (mis. "PT Surya Niaga Sentosa")
- `{{nik_perusahaan_bpjs}}` — string, Nomor Induk Kepesertaan Badan Usaha (NIK BU) BPJS, jika perusahaan sudah terdaftar
- `{{nama_karyawan}}` — string, nama lengkap karyawan
- `{{nik_karyawan}}` — string, NIK karyawan (16 digit dari KTP)
- `{{tanggal_mulai_kerja}}` — string, tanggal mulai kerja (mis. "Senin, 1 Juni 2026")
- `{{gaji_pokok}}` — string, gaji pokok bulanan (mis. "Rp 6.500.000")
- `{{pic_hr}}` — string, nama PIC HR yang mengurus

## Template

# Plan onboarding BPJS — {{nama_karyawan}}

**Perusahaan:** {{nama_perusahaan}}
**Tanggal mulai kerja:** {{tanggal_mulai_kerja}}
**PIC HR:** {{pic_hr}}

## Konteks regulasi

UU 24/2011 mewajibkan setiap pemberi kerja mendaftarkan karyawan ke BPJS Kesehatan plus BPJS Ketenagakerjaan paling lambat 30 hari sejak mulai kerja. Telat daftar berisiko sanksi administratif dari BPJS dan denda. Target praktis: tuntas dalam 7-14 hari kerja sejak {{tanggal_mulai_kerja}}.

## Phase 1: Kumpulkan dokumen karyawan (1-2 hari kerja)

| Dokumen | Format | Status |
| --- | --- | --- |
| KTP (NIK aktif Dukcapil) | Scan / foto JPG | |
| KK (Kartu Keluarga) | Scan / foto JPG | |
| Foto formal 4x6 | JPG, latar merah atau biru | |
| Ijazah terakhir | Scan PDF | |
| NPWP pribadi (kalau ada) | Scan JPG | |
| Buku tabungan halaman pertama | Scan JPG, untuk pencairan JHT/JP nanti | |
| Surat keterangan sehat (jika diminta perusahaan) | Asli dari klinik | |
| Form pernyataan keluarga (untuk BPJS Kesehatan tanggungan) | Diisi karyawan | |

Catatan: untuk BPJS Kesehatan, default tanggungan = istri/suami plus maksimal 3 anak. Anak ke-4 dst harus daftar mandiri (kelas yang sama atau berbeda).

## Phase 2: Registrasi BPJS Kesehatan (1-3 hari kerja)

- Login portal SIPP atau e-Dabu BPJS Kesehatan: bpjs-kesehatan.go.id (lookup current path untuk SIPP)
- Pilih menu "Tambah Karyawan" — input NIK, KK, data keluarga
- Pilih kelas perawatan: kelas standar (KRIS) untuk seluruh peserta per regulasi terbaru
- Pilih cabang Faskes Tingkat 1 (Puskesmas atau klinik) sesuai domisili karyawan
- Sistem generate Virtual Account untuk iuran pertama
- Iuran: 5% dari gaji pokok (max plafon per regulasi terbaru) — 4% perusahaan, 1% karyawan (potong payroll)
- Setor iuran pertama via VA paling lambat tanggal 10 bulan berikutnya
- Kartu digital aktif di Mobile JKN setelah pembayaran masuk (2-3 hari kerja)
- Kartu fisik dicetak per permintaan via aplikasi atau kantor cabang

## Phase 3: Registrasi BPJS Ketenagakerjaan — 4 program (2-5 hari kerja)

Portal: sipp.bpjsketenagakerjaan.go.id

### Program 1: JKK (Jaminan Kecelakaan Kerja)

- Iuran: 0.24% sampai 1.74% dari gaji per bulan, ditanggung perusahaan, sesuai tingkat risiko pekerjaan
- Tingkat risiko: I (rendah, mis. kantor) sampai V (tinggi, mis. tambang)
- Aktif sejak hari pertama kerja, sebelum kartu terbit pun

### Program 2: JKM (Jaminan Kematian)

- Iuran: 0.3% dari gaji per bulan, ditanggung perusahaan penuh
- Santunan ke ahli waris jika karyawan meninggal bukan karena kerja

### Program 3: JHT (Jaminan Hari Tua)

- Iuran: 5.7% dari gaji — 3.7% perusahaan, 2% karyawan (potong payroll)
- Saldo bisa dicairkan saat resign atau usia 56 tahun
- Wajib semua karyawan tanpa kecuali

### Program 4: JP (Jaminan Pensiun)

- Iuran: 3% dari gaji (cap plafon per regulasi terbaru) — 2% perusahaan, 1% karyawan (potong payroll)
- Manfaat: pensiun bulanan setelah usia pensiun, atau lump sum jika masa iur kurang dari 15 tahun
- Wajib karyawan WNI di PT/CV/UD; karyawan WNA kondisional

### Aksi gabungan

- Input data karyawan di SIPP — sekali input, 4 program ter-cover
- Generate VA gabungan untuk 4 iuran
- Setor paling lambat tanggal 15 bulan berikutnya
- Kartu Peserta JAMSOSTEK (digital) aktif di JMO app setelah pembayaran masuk

## Phase 4: Integrasi payroll (1-2 hari kerja)

- Update komponen potongan gaji karyawan:
  - BPJS Kesehatan: 1% dari gaji pokok
  - JHT: 2% dari gaji pokok
  - JP: 1% dari gaji pokok (cap plafon)
- Update komponen biaya perusahaan:
  - BPJS Kesehatan: 4% dari gaji pokok
  - JKK: 0.24%-1.74% sesuai risiko
  - JKM: 0.3%
  - JHT: 3.7%
  - JP: 2% (cap plafon)
- Slip gaji pertama harus tampilkan potongan + kontribusi perusahaan terpisah supaya transparan ke karyawan

## Phase 5: Distribusi kartu + edukasi karyawan (1-2 hari kerja)

- Kirim ke karyawan: nomor kepesertaan BPJS Kesehatan + Ketenagakerjaan
- Bantu install Mobile JKN (BPJS Kesehatan) + JMO (BPJS Ketenagakerjaan)
- Briefing singkat: cara akses Faskes 1, cara klaim JKK jika kecelakaan kerja, cara cek saldo JHT
- Cetak kartu fisik kalau karyawan minta — bisa di kantor cabang BPJS atau via aplikasi

## Timeline ringkas

| Hari kerja | Aksi |
| --- | --- |
| 1-2 | Phase 1 — kumpul dokumen |
| 3-5 | Phase 2 — daftar BPJS Kesehatan + setor VA |
| 4-7 | Phase 3 — daftar BPJS Ketenagakerjaan + setor VA |
| 8-9 | Phase 4 — update payroll |
| 10-12 | Phase 5 — distribusi kartu + briefing |

Total: 7-14 hari kerja. Geser kalau jatuh di periode mudik Lebaran (H-7 sampai H+7) atau cuti bersama panjang.

## Risiko umum

- NIK karyawan tidak sinkron Dukcapil — SIPP reject, harus update di Dukcapil dulu
- Faskes 1 yang dipilih penuh — pilih cabang alternatif sebelum approve
- Karyawan punya BPJS Kesehatan mandiri sebelumnya — perlu pindah segmen dari PBPU ke PPU, bukan daftar baru
- Gaji di atas plafon JP (cap) — iuran tetap dihitung dari plafon, bukan gaji aktual

## Tone guide

Peer-coordination register — kamu bicara ke sesama HR atau ops lead, pakai "kamu". Fokus pada urutan kerja yang clear. Sebut nominal persentase + nominal rupiah jelas — karyawan dan finance butuh angka, bukan estimasi. Sebut "lookup current path" untuk portal SIPP dan e-Dabu kalau URL subdomain berubah. Tidak ada hedge tentang regulasi yang sudah jelas (UU 24/2011 wajib), tapi tetap notes "konsultasi akuntan" untuk perhitungan payroll spesifik karena cap plafon dan tingkat risiko JKK bisa beda per perusahaan.
