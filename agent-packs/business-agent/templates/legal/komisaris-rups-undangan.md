# Template — Undangan Rapat Umum Pemegang Saham (RUPS)

Surat undangan RUPS untuk PT (Perseroan Terbatas) per UU 40/2007 Pasal 78-91 (Undang-Undang Perseroan Terbatas). Memo mencakup format pemanggilan, kuorum yang disyaratkan, agenda standar tahunan, dan tata cara penyelenggaraan.

Audience: founder / direksi / komisaris PT yang menyelenggarakan RUPS Tahunan atau RUPS Luar Biasa.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham. Untuk aspek hukum korporat (notulen, kuorum, perubahan anggaran dasar), konsultasi notaris atau advokat berlisensi.

## Variables

- `{{nama_perseroan}}` — string. Nama PT lengkap, contoh "PT Sinar Bahari Nusantara".
- `{{kedudukan_perseroan}}` — string. Kota kedudukan PT sesuai anggaran dasar.
- `{{jenis_rups}}` — string. "RUPS Tahunan" atau "RUPS Luar Biasa".
- `{{tanggal_rups}}` — date. Tanggal pelaksanaan rapat.
- `{{waktu_rups}}` — string. Format "10.00 WIB - selesai".
- `{{lokasi_rups}}` — string. Alamat lengkap atau "secara elektronik via [platform]".
- `{{tanggal_pemanggilan}}` — date. Tanggal surat dikirim (minimal 14 hari sebelum RUPS per UU PT Pasal 82).
- `{{nama_direksi_pemanggil}}` — string. Nama direktur yang menandatangani pemanggilan.
- `{{jabatan_direksi_pemanggil}}` — string. "Direktur Utama" atau "Direktur".

## Memo

```
# {{jenis_rups}} {{nama_perseroan}}

Nomor   : [nomor surat internal]
Lampiran: Materi agenda, laporan tahunan, laporan keuangan teraudit
Perihal : Pemanggilan {{jenis_rups}} {{nama_perseroan}}

Kepada Yang Terhormat,
Para Pemegang Saham {{nama_perseroan}}
di tempat

Dengan hormat,

Berdasarkan ketentuan Undang-Undang Nomor 40 Tahun 2007 tentang Perseroan Terbatas (UU PT) dan Anggaran Dasar {{nama_perseroan}}, Direksi dengan ini memanggil para Pemegang Saham untuk menghadiri {{jenis_rups}} yang akan diselenggarakan pada:

Hari, tanggal : {{tanggal_rups}}
Waktu         : {{waktu_rups}}
Tempat        : {{lokasi_rups}}

## 1. Dasar hukum pemanggilan

- UU 40/2007 (UU PT) Pasal 78 — kewajiban penyelenggaraan RUPS Tahunan paling lambat 6 bulan setelah tahun buku berakhir.
- UU PT Pasal 79 — hak Direksi atau Dewan Komisaris memanggil RUPS Luar Biasa.
- UU PT Pasal 82 — pemanggilan paling lambat 14 hari sebelum RUPS, dengan surat tercatat atau iklan di surat kabar.
- UU PT Pasal 86 — kuorum kehadiran minimal lebih dari 1/2 bagian saham dengan hak suara (untuk RUPS biasa).
- UU PT Pasal 88 — kuorum khusus 2/3 untuk perubahan anggaran dasar.
- UU PT Pasal 89 — kuorum 3/4 untuk penggabungan, peleburan, pengambilalihan, pemisahan, kepailitan, atau pembubaran.

## 2. Agenda {{jenis_rups}}

Untuk RUPS Tahunan, agenda standar mencakup (per UU PT Pasal 78 ayat 2):

1. Persetujuan Laporan Tahunan Direksi tahun buku [tahun-1], termasuk pengesahan Laporan Keuangan dan Laporan Tugas Pengawasan Dewan Komisaris.
2. Penetapan penggunaan laba bersih tahun buku [tahun-1] — pembagian dividen kepada Pemegang Saham + alokasi cadangan wajib (minimum 20% modal ditempatkan per UU PT Pasal 70).
3. Penetapan akuntan publik terdaftar OJK yang akan mengaudit laporan keuangan tahun buku berjalan.
4. Penetapan gaji + tunjangan anggota Direksi serta honorarium anggota Dewan Komisaris.
5. Pengangkatan, pemberhentian, atau perubahan susunan anggota Direksi dan/atau Dewan Komisaris (jika ada).
6. Penetapan rencana kerja + anggaran perseroan tahun buku berjalan.
7. Hal-hal lain yang sah untuk diputuskan dalam RUPS Tahunan.

Untuk RUPS Luar Biasa, agenda spesifik per kebutuhan — misal perubahan anggaran dasar, perubahan modal dasar/ditempatkan/disetor, pengambilalihan saham, atau pembubaran.

## 3. Kuorum + pengambilan keputusan

| Jenis keputusan                                            | Kuorum minimal kehadiran      | Suara setuju minimal      |
|------------------------------------------------------------|-------------------------------|---------------------------|
| RUPS biasa (Pasal 86)                                      | >1/2 saham dengan hak suara   | >1/2 dari yang hadir      |
| Perubahan anggaran dasar (Pasal 88)                        | 2/3 saham dengan hak suara    | 2/3 dari yang hadir       |
| Penggabungan / peleburan / pengambilalihan (Pasal 89)      | 3/4 saham dengan hak suara    | 3/4 dari yang hadir       |
| Pembubaran perseroan (Pasal 89)                            | 3/4 saham dengan hak suara    | 3/4 dari yang hadir       |

Jika kuorum tidak tercapai pada panggilan pertama, RUPS dapat diadakan kembali (panggilan kedua) dengan kuorum lebih rendah per UU PT Pasal 86 ayat 4 — 1/3 saham untuk RUPS biasa, 3/5 untuk perubahan anggaran dasar, 2/3 untuk penggabungan dan seterusnya.

## 4. Hak Pemegang Saham + tata cara

- Pemegang Saham yang berhak hadir + memberikan suara adalah yang namanya tercatat dalam Daftar Pemegang Saham pada 1 hari kerja sebelum pemanggilan (cum-date per UU PT Pasal 84).
- Pemegang Saham dapat diwakili melalui surat kuasa (proxy) — pemegang kuasa tidak boleh anggota Direksi, Komisaris, atau karyawan perseroan (UU PT Pasal 85 ayat 4).
- Materi RUPS (laporan tahunan, laporan keuangan teraudit, agenda) tersedia di kantor perseroan {{kedudukan_perseroan}} sejak tanggal pemanggilan ini sampai hari pelaksanaan RUPS.
- Pemegang Saham yang ingin mengajukan agenda tambahan wajib menyampaikan secara tertulis paling lambat 7 hari sebelum RUPS, dengan dukungan minimal 1/10 saham (UU PT Pasal 79 ayat 2).

## 5. Penyelenggaraan secara elektronik (RUPS Online)

Jika lokasi RUPS adalah elektronik, penyelenggaraan tunduk pada:
- UU PT Pasal 77 — RUPS dapat dilakukan melalui media telekonferensi, video konferensi, atau sarana media elektronik lainnya yang memungkinkan semua peserta saling melihat + mendengar serta berpartisipasi langsung.
- POJK 15/2020 + POJK 16/2020 (untuk PT terbuka / Tbk) — tata cara e-RUPS via Akses Lapor RUPS (eASY.KSEI).

{{nama_perseroan}}
{{kedudukan_perseroan}}, {{tanggal_pemanggilan}}

Direksi {{nama_perseroan}}

{{nama_direksi_pemanggil}}
{{jabatan_direksi_pemanggil}}
```

## Tone guide

Bahasa formal Indonesia korporat — Anda form sepanjang dokumen, kalimat panjang yang biasa di dokumen hukum diperbolehkan tetapi tetap satu ide per kalimat ketika menjelaskan. Setiap kewajiban tata cara harus terikat ke pasal — UU 40/2007 Pasal 78-91, POJK 15/2020 untuk Tbk. Format tabel kuorum harus akurat (1/2, 2/3, 3/4 sesuai jenis keputusan). Zero exclamation marks. Hindari kata banned brand voice. Jangan klaim aturan tanpa sitasi pasal — jika ragu, omit klaim alih-alih menebak nomor pasal.
