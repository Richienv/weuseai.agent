# Template — Memo Persiapan SPT Tahunan PPh Badan (Form 1771)

Memo internal untuk persiapan + pelaporan SPT Tahunan PPh Badan menggunakan form 1771 (untuk PT, CV yang dikenakan PPh Badan). Mencakup sequence tutup buku, kewajiban audit, rekonsiliasi fiskal, hitungan PPh terutang, kredit pajak yang sudah disetor, dan deadline pelaporan.

Audience: founder, finance lead, owner PT yang sedang mempersiapkan SPT Tahunan sebelum konsultasi akuntan publik / konsultan pajak.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_perseroan}}` — string. Nama PT lengkap.
- `{{npwp_badan}}` — string. NPWP-16 badan.
- `{{tahun_pajak}}` — number. Tahun pajak yang dilaporkan, contoh 2026.
- `{{tanggal_tutup_buku}}` — date. Tanggal tutup buku, default 31 Desember.
- `{{tanggal_deadline_lapor}}` — date. Default 30 April tahun berikutnya (4 bulan setelah tutup buku per UU KUP).
- `{{peredaran_bruto}}` — number. Total omzet tahun pajak.
- `{{laba_komersial}}` — number. Laba sebelum pajak per laporan komersial (SAK).
- `{{koreksi_positif_total}}` — number. Total koreksi positif (menambah PKP).
- `{{koreksi_negatif_total}}` — number. Total koreksi negatif (mengurangi PKP).
- `{{pkp_fiskal}}` — number. Penghasilan Kena Pajak fiskal = laba komersial + koreksi positif − koreksi negatif.
- `{{pph_terutang}}` — number. PPh badan terutang (22% × PKP per PP 30/2020).
- `{{kredit_pph_22}}` — number. PPh 22 yang sudah dipotong pihak lain.
- `{{kredit_pph_23}}` — number. PPh 23 yang sudah dipotong pihak lain.
- `{{kredit_pph_25}}` — number. Total angsuran PPh 25 yang sudah disetor sepanjang tahun.
- `{{pph_kurang_lebih_bayar}}` — number. Hasil PPh terutang − kredit pajak (positif = kurang bayar, negatif = lebih bayar).

## Memo

```
# Memo Persiapan SPT Tahunan PPh Badan {{tahun_pajak}} (Form 1771)

Entitas        : {{nama_perseroan}}
NPWP           : {{npwp_badan}}
Tahun pajak    : {{tahun_pajak}}
Tutup buku     : {{tanggal_tutup_buku}}
Deadline lapor : {{tanggal_deadline_lapor}}

## 1. Dasar hukum

- UU 7/1983 (UU PPh) sebagaimana diubah terakhir dengan UU 7/2021 (UU HPP) Pasal 17 — tarif PPh Badan 22%.
- PP 30/2020 — penurunan tarif PPh Badan menjadi 22% (sebelumnya 25%).
- UU 28/2007 (UU KUP) Pasal 3 — kewajiban lapor SPT Tahunan paling lambat 4 bulan setelah akhir tahun pajak.
- UU KUP Pasal 7 — denda keterlambatan lapor SPT Tahunan Badan Rp 1.000.000,-.
- Permenkeu 9/2018 jo. PMK 18/2021 — tata cara pengisian + pelaporan SPT.
- UU 8/1997 Pasal 2 — kewajiban audit untuk entitas dengan kriteria tertentu (omzet, aset, jumlah karyawan).

## 2. Sequence persiapan SPT 1771

### Langkah 1 — Tutup buku ({{tanggal_tutup_buku}})

- Posting jurnal penyesuaian akhir tahun: penyusutan, amortisasi, akrual gaji + bonus, akrual bunga, persediaan akhir.
- Reconcile saldo bank dengan rekening koran 31 Desember.
- Stock opname persediaan fisik vs catatan.
- Konfirmasi piutang ke customer + utang ke supplier (untuk PT dengan kewajiban audit).
- Tutup akun pendapatan + beban ke laba ditahan via jurnal closing.

### Langkah 2 — Audit (jika wajib)

Wajib audit untuk PT yang memenuhi salah satu kriteria UU 40/2007 Pasal 68 ayat 1:
- Kegiatan usaha menghimpun + mengelola dana masyarakat (perbankan, asuransi, lembaga keuangan).
- Menerbitkan surat pengakuan utang kepada masyarakat (obligasi).
- PT terbuka (Tbk) per UU Pasar Modal.
- PT Persero (BUMN).
- Memiliki aset dan/atau peredaran bruto minimal Rp 50.000.000.000,- (lima puluh milyar rupiah).

Untuk UMKM tidak wajib audit, tapi laporan keuangan tetap harus disusun + ditandatangani Direksi.

### Langkah 3 — Rekonsiliasi fiskal

Rekonsiliasi fiskal adalah penyesuaian dari laporan komersial (SAK) ke laporan fiskal (UU PPh) karena ada beda perlakuan:

**Koreksi positif** (menambah Penghasilan Kena Pajak):
- Biaya entertainment tanpa daftar nominatif (UU PPh Pasal 6 ayat 1 jo. SE-27/PJ.22/1986).
- Sumbangan non-bencana nasional / non-pendidikan / non-litbang (UU PPh Pasal 9 ayat 1 huruf g).
- Biaya yang dikeluarkan untuk kepentingan pribadi pemegang saham.
- Pajak penghasilan + sanksi pajak (UU PPh Pasal 9 ayat 1 huruf h + k).
- Hadiah karyawan dalam bentuk natura/kenikmatan (sebelum UU HPP 7/2021 — sejak 2022 hadiah natura ≤ Rp 5jt per tahun per karyawan boleh deductible per PP 55/2022).
- Penyusutan aset di atas tarif fiskal (UU PPh Pasal 11 jo. PMK 96/2009).
- Cadangan kerugian non-bank / non-asuransi (UU PPh Pasal 9 ayat 1 huruf c).

**Koreksi negatif** (mengurangi Penghasilan Kena Pajak):
- Dividen dari PT dalam negeri dengan kepemilikan ≥ 25% (UU PPh Pasal 4 ayat 3 huruf f — bukan objek pajak).
- Bagian laba anggota CV / Firma yang modalnya tidak terbagi atas saham (UU PPh Pasal 4 ayat 3 huruf i).
- Bantuan / sumbangan / hibah yang memenuhi syarat Pasal 4 ayat 3 huruf a.
- Penghasilan yang sudah dikenai PPh Final (PPN, PPh Final UMKM, PPh 4 ayat 2 atas bunga deposito, sewa tanah/bangunan, dll) — keluarkan dari PKP umum.

| Pos rekonsiliasi                       | Jumlah                          |
|----------------------------------------|---------------------------------|
| Laba komersial sebelum pajak           | Rp {{laba_komersial}},-         |
| (+) Koreksi positif total              | Rp {{koreksi_positif_total}},-  |
| (−) Koreksi negatif total              | Rp {{koreksi_negatif_total}},-  |
| **Penghasilan Kena Pajak (PKP) fiskal**| **Rp {{pkp_fiskal}},-**         |

### Langkah 4 — Hitung PPh terutang

| Pos                                            | Jumlah                       |
|------------------------------------------------|------------------------------|
| Peredaran bruto tahun {{tahun_pajak}}          | Rp {{peredaran_bruto}},-     |
| PKP fiskal                                     | Rp {{pkp_fiskal}},-          |
| Tarif PPh Badan (PP 30/2020)                   | 22%                          |
| **PPh terutang**                               | **Rp {{pph_terutang}},-**    |

Catatan: PT dengan peredaran bruto ≤ Rp 50 milyar mendapat fasilitas pengurangan tarif 50% atas PKP yang berasal dari peredaran bruto ≤ Rp 4,8 milyar (UU PPh Pasal 31E) — tarif efektif 11% atas porsi tersebut. Lihat juga opsi PPh Final UMKM 0,5% per PP 55/2022 untuk peredaran bruto ≤ Rp 4,8 milyar.

### Langkah 5 — Kredit pajak

| Kredit pajak                                  | Jumlah                       |
|-----------------------------------------------|------------------------------|
| PPh 22 (impor + pembelian barang tertentu)    | Rp {{kredit_pph_22}},-       |
| PPh 23 (jasa, sewa, dividen yang dipotong)    | Rp {{kredit_pph_23}},-       |
| PPh 25 (angsuran sepanjang tahun)             | Rp {{kredit_pph_25}},-       |
| **Total kredit pajak**                        | **Rp [total kredit],-**      |

### Langkah 6 — PPh kurang / lebih bayar

PPh kurang / lebih bayar = PPh terutang − total kredit pajak
                        = Rp {{pph_kurang_lebih_bayar}},-

- Jika **positif** (kurang bayar): setor sebelum SPT dilaporkan, kode billing 411126-200.
- Jika **negatif** (lebih bayar): pilih restitusi (UU KUP Pasal 17B) atau kompensasi ke tahun pajak berikutnya.

## 3. Pelaporan

- Form: SPT 1771 (induk + lampiran I-VI + transkrip elemen-elemen laporan keuangan).
- Portal: DJP Online (https://djponline.pajak.go.id) → e-Filing → SPT Tahunan Badan.
- Format: e-Form (PDF interaktif) atau e-SPT (aplikasi desktop).
- Lampiran wajib: laporan keuangan ditandatangani Direksi + akuntan (jika audit) + bukti potong PPh 22/23 + bukti setor PPh 25 + rekonsiliasi fiskal.
- Deadline: paling lambat {{tanggal_deadline_lapor}} (4 bulan setelah tahun pajak berakhir — UU KUP Pasal 3 ayat 3 huruf c).
- Perpanjangan: dapat mengajukan perpanjangan maksimum 2 bulan dengan menyampaikan pemberitahuan tertulis + estimasi pajak terutang (UU KUP Pasal 3 ayat 4).

## 4. Sanksi non-compliance

| Pelanggaran                              | Sanksi                                                              |
|------------------------------------------|---------------------------------------------------------------------|
| Terlambat lapor SPT Tahunan Badan        | Denda Rp 1.000.000,- (UU KUP Pasal 7 ayat 1 huruf b).               |
| Terlambat setor PPh kurang bayar         | Bunga per bulan tarif acuan Menkeu + 5% / 12 (UU KUP Pasal 9 ayat 2a).|
| Tidak lapor sama sekali                  | Surat Tagihan Pajak + bunga + kemungkinan pemeriksaan pajak.        |
| Lapor tidak benar / tidak lengkap        | Surat Ketetapan Pajak Kurang Bayar (SKPKB) + sanksi 100% kurang bayar (UU KUP Pasal 13 ayat 3). |
| Sengaja tidak lapor / lapor palsu        | Pidana 6 bulan-6 tahun + denda 2-4× pajak terutang (UU KUP Pasal 39).|

## 5. Catatan untuk founder

- Tutup buku 31 Desember adalah default untuk tahun kalender. Jika tahun buku non-kalender (Juli-Juni misalnya), wajib mengajukan permohonan + persetujuan DJP via formulir KP.PPh.2.1.
- PPh 25 dasar perhitungan: 1/12 × (PPh terutang tahun lalu − kredit pajak PPh 22/23 tahun lalu). Setor tiap tanggal 15 bulan berikutnya.
- Untuk PT yang baru berdiri di tahun pajak berjalan, PPh 25 dihitung secara proporsional sesuai periode operasional + bisa berdasarkan estimasi tahun berjalan.
- Pasal 31E (fasilitas 50% tarif untuk peredaran bruto ≤ Rp 50 milyar) **bukan** opsi UMKM 0,5% — keduanya berbeda + tidak bisa dipakai bersamaan. Pilih yang lebih ringan setelah hitung skenario kedua.
- Arsip SPT + bukti pendukung wajib disimpan minimal 10 tahun (UU KUP Pasal 28 ayat 11).
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek. Angka IDR dengan separator titik thousand tanpa desimal (Rp 50.000.000.000,-), persen dengan koma desimal (22% / 11%). Setiap tarif + deadline + kewajiban terikat ke pasal — UU PPh 7/1983 jo. UU HPP 7/2021, PP 30/2020, UU KUP 28/2007, UU PT 40/2007, Permenkeu 9/2018. Bedakan jelas SPT 1771 (Badan) vs SPT 1770 (Orang Pribadi). Zero exclamation marks. Hindari kata banned brand voice.
