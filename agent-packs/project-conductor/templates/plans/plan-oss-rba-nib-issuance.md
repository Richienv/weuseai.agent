# Template — Plan penerbitan NIB via OSS-RBA

Dipakai untuk merencanakan penerbitan NIB (Nomor Induk Berusaha) lewat sistem OSS-RBA (Online Single Submission — Risk-Based Approach) di portal oss.go.id. Audiens: founder atau ops lead yang memandu pendirian usaha baru (perorangan, UD, CV, atau PT) dari titik nol sampai NIB terbit dan izin operasi siap.

> **NOTE: PANDUAN OPERASIONAL, BUKAN NASIHAT HUKUM.** Untuk pendirian PT/CV, akta notaris dan SK Kemenkumham wajib via notaris berlisensi. Tingkat risiko KBLI dapat berubah per revisi PP — konsultasi dengan konsultan hukum atau notaris bersertifikat untuk kasus spesifik.

## Variables

- `{{nama_usaha}}` — string, nama usaha yang akan didaftarkan (mis. "PT Surya Niaga Sentosa")
- `{{bentuk_badan}}` — string, salah satu dari "perorangan", "UD", "CV", "PT", "PT Perorangan"
- `{{kbli_utama}}` — string, kode KBLI 2020 utama 5 digit (mis. "62019 — Aktivitas Pemrograman Komputer Lainnya")
- `{{tingkat_risiko}}` — string, salah satu dari "Rendah", "Menengah-Rendah", "Menengah-Tinggi", "Tinggi" per PP 5/2021
- `{{alamat_usaha}}` — string, alamat lengkap domisili usaha (gedung/ruko/rumah, kelurahan, kecamatan, kab/kota, provinsi)
- `{{modal_dasar}}` — string, modal dasar dalam Rupiah jika PT/CV (mis. "Rp 50.000.000")
- `{{pic_pendaftaran}}` — string, nama PIC yang menjalankan registrasi OSS
- `{{target_terbit}}` — string, target tanggal NIB terbit (mis. "Jumat, 12 Juni 2026")

## Template

# Plan penerbitan NIB — {{nama_usaha}}

**Bentuk badan:** {{bentuk_badan}}
**KBLI utama:** {{kbli_utama}} (risiko {{tingkat_risiko}})
**PIC:** {{pic_pendaftaran}}
**Target terbit:** {{target_terbit}}

## Phase 1: Prasyarat dokumen (1-3 hari kerja)

| Dokumen | PIC | Status | Catatan |
| --- | --- | --- | --- |
| NPWP pribadi penanggung jawab | {{pic_pendaftaran}} | | Wajib aktif. Cek di djponline.pajak.go.id |
| NIK + KK penanggung jawab | {{pic_pendaftaran}} | | Pastikan data Dukcapil sinkron |
| Email + nomor HP aktif | {{pic_pendaftaran}} | | Dipakai untuk akun OSS, bukan email kantor lama |
| Akta pendirian (PT/CV) | Notaris | | Hanya jika bentuk badan PT atau CV. Tidak diperlukan untuk perorangan, UD, atau PT Perorangan |
| SK Kemenkumham (PT/CV) | Notaris | | Output dari notaris, biasanya 3-5 hari kerja setelah akta selesai |
| NPWP badan | Kantor Pajak / Coretax | | Wajib untuk PT/CV/UD. Tidak diperlukan untuk perorangan |
| Bukti domisili usaha | {{pic_pendaftaran}} | | Surat sewa, akta hak milik, atau SKDU dari kelurahan |

## Phase 2: Kunci nama dan KBLI (0.5 hari kerja)

- Cek ketersediaan nama PT/CV di ahu.go.id (kalau bentuk badan PT/CV)
- Lookup KBLI 2020 di kbli.bps.go.id — konfirmasi 5-digit kode untuk aktivitas utama
- Identifikasi KBLI sekunder kalau ada (maksimal sesuai akta untuk PT)
- Tentukan tingkat risiko per KBLI: rujuk Lampiran PP 5/2021 atau cek di sistem OSS saat registrasi

## Phase 3: Registrasi akun OSS (0.5 hari kerja)

- Buka oss.go.id (lookup current path — portal sesekali update URL)
- Pilih "Daftar" — kategori UMK (Usaha Mikro Kecil) atau Non-UMK sesuai modal
- Isi data penanggung jawab (NIK, NPWP, email, HP)
- Verifikasi OTP via email + SMS
- Login pertama: lengkapi profil pelaku usaha

## Phase 4: Input data usaha + KBLI (0.5-1 hari kerja)

- Input nama usaha, alamat, modal, jumlah tenaga kerja
- Tambah KBLI utama + sekunder
- Sistem auto-klasifikasi tingkat risiko per KBLI
- Upload dokumen pendukung yang diminta sistem (akta, NPWP badan, bukti domisili)

## Phase 5: Output NIB + izin per risiko (1-7 hari kerja)

| Tingkat risiko | Output | Timeline typical |
| --- | --- | --- |
| Rendah | NIB saja, langsung berlaku sebagai izin tunggal | Sama hari sampai 1 hari kerja |
| Menengah-Rendah | NIB + Sertifikat Standar (self-declared) | 1-2 hari kerja |
| Menengah-Tinggi | NIB + Sertifikat Standar (perlu verifikasi K/L/D) | 7-14 hari kerja |
| Tinggi | NIB + Izin (perlu approval K/L/D + verifikasi lokasi) | 14-30 hari kerja, bisa lebih |

Catatan: timeline di atas asumsi dokumen lengkap dan tidak ada koreksi dari verifier. Mudik Lebaran, cuti bersama, atau libur nasional menggeser timeline 3-7 hari.

## Phase 6: Setelah NIB terbit

- Download NIB + lampiran dari dashboard OSS
- Simpan PDF di drive perusahaan + cetak fisik untuk display di tempat usaha
- Aktivasi BPJS Kesehatan + Ketenagakerjaan untuk badan (lihat template `plan-bpjs-onboarding-karyawan.md`)
- Buka rekening bank badan (perlu NIB + NPWP badan + akta + SK Kemenkumham untuk PT/CV)
- Daftarkan ke marketplace / payment gateway jika online business

## Risiko umum

- KBLI salah pilih — sulit revisi, harus tutup OSS dan buka ulang. Mitigasi: lookup 2x di kbli.bps.go.id sebelum input
- Alamat domisili tidak diakui (rumah pribadi di area komersial saja) — cek peraturan Pemda setempat sebelum daftar
- NPWP penanggung jawab non-aktif — aktivasi dulu di KPP atau djponline sebelum mulai registrasi OSS
- Modal dasar PT di bawah ketentuan KBLI tertentu (mis. PMA wajib Rp 10 miliar) — cek lampiran PP 5/2021 per KBLI

## Tone guide

Coordinator register — kamu memandu founder atau ops lead, bukan customer awam. Jelaskan tiap dokumen dengan singkat tapi presisi. Tidak bertele-tele soal kenapa OSS-RBA ada — fokus pada urutan langkah. Sebut "lookup current path" untuk URL portal yang sering update — jangan klaim path subdomain yang belum kamu verifikasi. Sebut hari kerja, bukan kalender — Sabtu setengah hari, Minggu libur, libur nasional auto-block. Sebutkan PIC eksplisit di tiap dokumen — tanpa PIC, dokumen menggantung.
