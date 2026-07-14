# Template — Plan pemilihan KBLI 2020

Dipakai untuk memandu pemilihan kode KBLI 2020 (Klasifikasi Baku Lapangan Usaha Indonesia) sebelum registrasi NIB di OSS-RBA. Audiens: founder atau notaris yang sedang menyiapkan akta pendirian PT/CV atau pendaftaran perorangan/UD/PT Perorangan. Pemilihan KBLI salah = sulit revisi setelah NIB terbit dan bisa mempengaruhi tingkat risiko izin operasi.

> **NOTE: PANDUAN OPERASIONAL, BUKAN NASIHAT HUKUM.** KBLI dan tingkat risiko diatur PP 5/2021 dan revisi BPS. Konsultasi notaris atau konsultan regulatori bersertifikat untuk usaha yang lintas-sektor atau ada batasan asing.

## Variables

- `{{nama_usaha}}` — string, nama usaha
- `{{deskripsi_aktivitas}}` — string, 1-3 kalimat menjelaskan apa yang usaha lakukan untuk menghasilkan uang
- `{{model_revenue}}` — string, salah satu dari "jual barang", "jual jasa", "jual akses platform/SaaS", "manufaktur", "perdagangan grosir/eceran", "hibrid"
- `{{target_pasar}}` — string, salah satu dari "B2C", "B2B", "B2G", "campuran"
- `{{ada_modal_asing}}` — boolean, apakah ada penanam modal asing (PMA)
- `{{pic_pemilih}}` — string, nama PIC yang menentukan final pilihan

## Template

# Plan pemilihan KBLI 2020 — {{nama_usaha}}

**Deskripsi aktivitas:** {{deskripsi_aktivitas}}
**Model revenue:** {{model_revenue}}
**PIC:** {{pic_pemilih}}

## Konteks KBLI 2020

KBLI 2020 adalah klasifikasi 5-digit yang dikelola BPS (Badan Pusat Statistik). Sistem OSS-RBA pakai KBLI 2020 sebagai basis untuk menentukan tingkat risiko izin per PP 5/2021. Tiap usaha wajib pilih minimal 1 KBLI utama, plus boleh tambah KBLI sekunder (maksimal sesuai akta pendirian — biasanya 5-10 untuk PT). Pemilihan KBLI menentukan:

- Tingkat risiko (Rendah / Menengah-Rendah / Menengah-Tinggi / Tinggi)
- Izin tambahan yang diperlukan (SIUP, izin K/L sektor, izin lokasi)
- Batasan kepemilikan asing per Perpres 49/2021 (Daftar Positif Investasi)
- Klasifikasi pajak (jenis usaha kena pajak / tidak)

## Phase 1: Identifikasi aktivitas usaha utama (0.5 hari kerja)

Jawab pertanyaan ini:

1. Apa produk atau jasa utama yang dijual ke customer pertama?
2. Apa channel distribusi utama? (toko fisik, online marketplace, B2B kontrak, platform SaaS)
3. Apakah ada aktivitas produksi sendiri, atau hanya distribusi / agen?
4. Berapa persentase revenue dari aktivitas utama vs sekunder?

Aktivitas utama = aktivitas yang menyumbang revenue terbesar. Itulah yang dijadikan KBLI utama.

## Phase 2: Lookup KBLI di kbli.bps.go.id (1-2 jam)

- Buka kbli.bps.go.id
- Search keyword dari deskripsi aktivitas (mis. "perdagangan elektronik", "pemrograman komputer", "konsultasi manajemen")
- Buka detail tiap kandidat — baca deskripsi 5-digit yang muncul untuk konfirmasi cakupan
- Catat 2-3 kandidat KBLI utama, plus 2-5 kandidat KBLI sekunder

## Phase 3: Cek tingkat risiko per kandidat (1 jam)

Tingkat risiko per PP 5/2021:

| Tingkat | Implikasi izin | Timeline NIB |
| --- | --- | --- |
| Rendah | NIB = izin tunggal, langsung berlaku | Sama hari sampai 1 hari kerja |
| Menengah-Rendah | NIB + Sertifikat Standar self-declared | 1-2 hari kerja |
| Menengah-Tinggi | NIB + Sertifikat Standar (perlu verifikasi K/L/D) | 7-14 hari kerja |
| Tinggi | NIB + Izin (perlu approval + verifikasi lokasi) | 14-30 hari kerja, bisa lebih |

Cek tingkat risiko di sistem OSS-RBA preview atau lampiran PP 5/2021. Pilih KBLI yang risiko rendah jika ada alternatif yang sama-sama relevan.

## Phase 4: Cek batasan asing (jika {{ada_modal_asing}} = true) (1 jam)

- Buka Perpres 49/2021 (Daftar Positif Investasi)
- Cek persentase maksimal kepemilikan asing per KBLI yang dipilih
- Beberapa KBLI 100% terbuka untuk asing (mis. 62019 — Pemrograman Komputer); beberapa hanya 49% (mis. media); beberapa tertutup penuh untuk asing

## Phase 5: Konfirmasi dengan notaris (jika PT/CV) (1-2 hari kerja)

- Kirim daftar KBLI final ke notaris sebelum akta
- Notaris akan masukkan KBLI ke pasal "Maksud dan Tujuan" akta pendirian
- Setelah akta selesai, KBLI tambahan hanya bisa via RUPS + akta perubahan (biaya tambahan)

## Phase 6: Input ke OSS-RBA (saat registrasi NIB)

Lihat template `plan-oss-rba-nib-issuance.md` Phase 4.

## 10 KBLI yang umum dipilih startup Indonesia

| KBLI | Deskripsi | Risiko typical |
| --- | --- | --- |
| 62019 | Aktivitas Pemrograman Komputer Lainnya | Rendah |
| 62022 | Aktivitas Konsultasi Komputer | Rendah |
| 62029 | Aktivitas Konsultasi TIK Lainnya | Rendah |
| 63112 | Aktivitas Hosting dan Pengolahan Data | Rendah |
| 63121 | Portal Web dan/atau Platform Digital dengan Tujuan Komersial | Menengah-Rendah |
| 70209 | Aktivitas Konsultasi Manajemen Lainnya | Rendah |
| 73100 | Periklanan | Rendah |
| 47919 | Perdagangan Eceran Lainnya Melalui Pesanan Pos atau Internet | Rendah |
| 46100 | Perdagangan Besar Atas Dasar Balas Jasa atau Kontrak | Rendah |
| 82990 | Aktivitas Jasa Penunjang Usaha Lainnya YTDL | Rendah |

Catatan: 63121 (portal/platform digital komersial) sering relevan untuk SaaS atau marketplace — tapi risikonya naik ke Menengah-Rendah karena ada kewajiban PSE (Penyelenggara Sistem Elektronik) Kominfo. Jangan ambil KBLI 63121 kalau hanya jual jasa, bukan operasi platform.

## Strategi multi-KBLI

- KBLI utama: aktivitas dengan revenue terbesar — jadi anchor tingkat risiko
- KBLI sekunder: aktivitas pendukung yang sah dilakukan tapi bukan revenue utama
- Hindari menumpuk KBLI yang tidak akan dijalankan dalam 12 bulan ke depan — beberapa KBLI tinggi-risiko butuh izin tambahan yang harus diperbarui rutin meski tidak dipakai
- Untuk startup yang masih eksplorasi pivot, pilih 2-3 KBLI yang cakupannya luas tapi tetap relevan (mis. 62019 + 70209 + 82990)

## Risiko umum pemilihan

- Pilih KBLI yang terlalu spesifik — aktivitas masa depan tidak ter-cover, harus akta perubahan
- Pilih KBLI yang terlalu luas — tingkat risiko naik tanpa perlu, izin operasi makin ribet
- Lupa cek Daftar Positif Investasi — PMA terhalang setelah pendirian, harus restrukturisasi saham
- Pilih 63121 (platform digital) tanpa kesiapan jadi PSE — Kominfo bisa kirim teguran kalau platform live tanpa registrasi PSE
- KBLI yang konflik (mis. produksi obat + jual obat eceran) — perlu pemisahan badan usaha atau pengaturan internal khusus

## Tone guide

Peer-coordination register — kamu memandu founder yang sedang bingung membaca daftar KBLI 5-digit. Penjelasan singkat per KBLI, tapi sebut tingkat risiko + portal lookup eksplisit. Tidak menggurui — founder tahu apa usahanya, kamu cuma bantu memetakan ke kode. Sebut PP 5/2021 dan Perpres 49/2021 sebagai referensi karena tingkat risiko dan batasan asing bisa berubah per revisi. Gunakan "lookup current path" untuk kbli.bps.go.id kalau BPS update sistem. Tidak ada hedge soal kewajiban (KBLI wajib untuk NIB), tapi konsultasi notaris/konsultan tetap disebut untuk usaha lintas-sektor.
