# Template — Laporan Keuangan Bulanan PT UMKM (SAK ETAP)

Template laporan keuangan bulanan untuk PT UMKM yang menggunakan Standar Akuntansi Keuangan Entitas Tanpa Akuntabilitas Publik (SAK ETAP) — bukan SAK Umum / IFRS yang berlaku untuk entitas publik. SAK ETAP disahkan IAI (Ikatan Akuntan Indonesia) 2009, direvisi 2016, dipakai entitas yang tidak memiliki akuntabilitas publik signifikan + tidak menerbitkan laporan keuangan untuk tujuan umum bagi pengguna eksternal.

Audience: founder, finance lead, atau owner PT UMKM (omzet ≤ Rp 50 milyar per UU UMKM 20/2008 Pasal 6) untuk monitoring internal + lampiran SPT Tahunan.

> **NOTE: KONSULTASI AKUNTAN / KONSULTAN PAJAK BERSERTIFIKAT.** Template ini adalah kerangka memo internal — angka, tarif, dan kewajiban harus diverifikasi oleh akuntan publik atau konsultan pajak bersertifikat (BKP / KPA) sebelum diserahkan ke DJP / pemegang saham.

## Variables

- `{{nama_perseroan}}` — string. Nama PT lengkap.
- `{{npwp_badan}}` — string. NPWP-16 badan.
- `{{periode}}` — string. Bulan + tahun, format "Oktober 2026".
- `{{periode_pembanding}}` — string. Periode pembanding, format "September 2026" atau "Oktober 2025".
- `{{kas_setara_kas}}` — number. Saldo kas + bank akhir periode dalam rupiah.
- `{{piutang_usaha}}` — number. Saldo piutang ke customer.
- `{{persediaan}}` — number. Nilai stok / inventory akhir periode.
- `{{aset_tetap_neto}}` — number. Aset tetap setelah dikurangi akumulasi penyusutan.
- `{{utang_usaha}}` — number. Utang ke supplier.
- `{{utang_pajak}}` — number. Utang PPh 21 + PPh 23 + PPh Final + PPN belum disetor.
- `{{modal_disetor}}` — number. Modal saham ditempatkan + disetor per akta pendirian.
- `{{laba_ditahan}}` — number. Akumulasi laba bersih dari periode-periode lalu.
- `{{pendapatan}}` — number. Total revenue periode berjalan.
- `{{hpp}}` — number. Harga Pokok Penjualan / Cost of Service.
- `{{beban_operasional}}` — number. OpEx total — gaji, sewa, marketing, infrastruktur, lain-lain.
- `{{laba_bersih}}` — number. Net profit periode berjalan.

## Memo

```
# Laporan Keuangan Bulanan — {{periode}}

Entitas  : {{nama_perseroan}}
NPWP     : {{npwp_badan}}
Periode  : {{periode}} (pembanding {{periode_pembanding}})
Standar  : SAK ETAP (Standar Akuntansi Keuangan Entitas Tanpa Akuntabilitas Publik)

## 1. Dasar penyusunan

- SAK ETAP — disahkan IAI 2009, revisi 2016. Berlaku untuk entitas yang tidak memiliki akuntabilitas publik signifikan + tidak menerbitkan laporan keuangan untuk tujuan umum bagi pengguna eksternal.
- UU UMKM 20/2008 Pasal 6 — kriteria entitas: usaha kecil ≤ Rp 5 milyar omzet, usaha menengah ≤ Rp 50 milyar omzet (per PP 7/2021 revisi).
- UU PT 40/2007 Pasal 66 — kewajiban Direksi menyusun laporan keuangan tahunan.
- UU KUP 28/2007 Pasal 28 — kewajiban pembukuan untuk wajib pajak badan + perorangan dengan omzet > Rp 4,8 milyar per tahun.

Perbedaan SAK ETAP vs SAK Umum / IFRS:
- SAK ETAP tidak mewajibkan laporan arus kas metode tidak langsung (boleh metode langsung).
- SAK ETAP tidak mewajibkan revaluasi aset tetap (boleh historical cost).
- SAK ETAP tidak mewajibkan pengungkapan instrumen keuangan kompleks (derivative, hedging).
- SAK ETAP lebih sederhana — cocok untuk UMKM.

## 2. Neraca per {{periode}}

| Pos                                | {{periode}}           | {{periode_pembanding}} | Δ                |
|------------------------------------|-----------------------|------------------------|------------------|
| **ASET**                           |                       |                        |                  |
| Aset Lancar                        |                       |                        |                  |
|   Kas + setara kas                 | Rp {{kas_setara_kas}},-| Rp [prior],-           | [delta]          |
|   Piutang usaha                    | Rp {{piutang_usaha}},-| Rp [prior],-           | [delta]          |
|   Persediaan                       | Rp {{persediaan}},-   | Rp [prior],-           | [delta]          |
|   Total Aset Lancar                | Rp [subtotal],-       | Rp [prior],-           | [delta]          |
| Aset Tidak Lancar                  |                       |                        |                  |
|   Aset tetap neto (setelah penyusutan)| Rp {{aset_tetap_neto}},-| Rp [prior],-       | [delta]          |
|   Aset tidak berwujud              | Rp [nilai],-          | Rp [prior],-           | [delta]          |
|   Total Aset Tidak Lancar          | Rp [subtotal],-       | Rp [prior],-           | [delta]          |
| **TOTAL ASET**                     | **Rp [total],-**      | **Rp [prior],-**       | **[delta]**      |
|                                    |                       |                        |                  |
| **LIABILITAS + EKUITAS**           |                       |                        |                  |
| Liabilitas Jangka Pendek           |                       |                        |                  |
|   Utang usaha                      | Rp {{utang_usaha}},-  | Rp [prior],-           | [delta]          |
|   Utang pajak (PPh + PPN)          | Rp {{utang_pajak}},-  | Rp [prior],-           | [delta]          |
|   Utang gaji + BPJS                | Rp [nilai],-          | Rp [prior],-           | [delta]          |
|   Total Liabilitas Jangka Pendek   | Rp [subtotal],-       | Rp [prior],-           | [delta]          |
| Liabilitas Jangka Panjang          |                       |                        |                  |
|   Utang bank > 1 tahun             | Rp [nilai],-          | Rp [prior],-           | [delta]          |
|   Total Liabilitas Jangka Panjang  | Rp [subtotal],-       | Rp [prior],-           | [delta]          |
| Ekuitas                            |                       |                        |                  |
|   Modal disetor                    | Rp {{modal_disetor}},-| Rp [prior],-           | —                |
|   Laba ditahan                     | Rp {{laba_ditahan}},- | Rp [prior],-           | [delta]          |
|   Total Ekuitas                    | Rp [subtotal],-       | Rp [prior],-           | [delta]          |
| **TOTAL LIABILITAS + EKUITAS**     | **Rp [total],-**      | **Rp [prior],-**       | **[delta]**      |

Persamaan dasar SAK ETAP: Aset = Liabilitas + Ekuitas. Jika tidak balance, ada kesalahan posting yang harus dicari.

## 3. Laporan Laba Rugi {{periode}}

| Pos                                     | {{periode}}             | {{periode_pembanding}} | Δ        |
|-----------------------------------------|-------------------------|------------------------|----------|
| Pendapatan usaha                        | Rp {{pendapatan}},-     | Rp [prior],-           | [delta]  |
| Pendapatan lain-lain                    | Rp [nilai],-            | Rp [prior],-           | [delta]  |
| **Total Pendapatan**                    | **Rp [subtotal],-**     | **Rp [prior],-**       | [delta]  |
| Harga Pokok Penjualan (HPP)             | (Rp {{hpp}},-)          | (Rp [prior],-)         | [delta]  |
| **Laba Kotor**                          | **Rp [subtotal],-**     | **Rp [prior],-**       | [delta]  |
| Beban Operasional                       |                         |                        |          |
|   Gaji + tunjangan                      | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Sewa kantor                           | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Marketing + iklan                     | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Infrastruktur (server, tooling)       | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Penyusutan                            | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Lain-lain                             | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
|   Total Beban Operasional               | (Rp {{beban_operasional}},-)| (Rp [prior],-)     | [delta]  |
| **Laba Usaha**                          | **Rp [subtotal],-**     | **Rp [prior],-**       | [delta]  |
| Pendapatan / (beban) lain non-usaha     | Rp [nilai],-            | Rp [prior],-           | [delta]  |
| **Laba Sebelum Pajak**                  | **Rp [subtotal],-**     | **Rp [prior],-**       | [delta]  |
| PPh Final UMKM 0,5% (jika opsi UMKM)    | (Rp [nilai],-)          | (Rp [prior],-)         | [delta]  |
| **Laba Bersih**                         | **Rp {{laba_bersih}},-**| **Rp [prior],-**       | [delta]  |

## 4. Laporan Arus Kas {{periode}} (metode langsung)

SAK ETAP membolehkan metode langsung — lebih sederhana untuk UMKM.

| Kategori                                | {{periode}}             |
|-----------------------------------------|-------------------------|
| **Arus kas dari aktivitas operasi**     |                         |
|   Penerimaan dari customer              | Rp [nilai],-            |
|   Pembayaran ke supplier                | (Rp [nilai],-)          |
|   Pembayaran gaji + BPJS                | (Rp [nilai],-)          |
|   Pembayaran pajak                      | (Rp [nilai],-)          |
|   Pembayaran beban operasional lain     | (Rp [nilai],-)          |
|   Arus kas neto dari operasi            | Rp [subtotal],-         |
| **Arus kas dari aktivitas investasi**   |                         |
|   Pembelian aset tetap                  | (Rp [nilai],-)          |
|   Penjualan aset tetap                  | Rp [nilai],-            |
|   Arus kas neto dari investasi          | Rp [subtotal],-         |
| **Arus kas dari aktivitas pendanaan**   |                         |
|   Setoran modal pemegang saham          | Rp [nilai],-            |
|   Pengambilan utang bank                | Rp [nilai],-            |
|   Pelunasan utang bank                  | (Rp [nilai],-)          |
|   Pembagian dividen                     | (Rp [nilai],-)          |
|   Arus kas neto dari pendanaan          | Rp [subtotal],-         |
| **Kenaikan / (penurunan) kas neto**     | Rp [subtotal],-         |
| Kas + setara kas awal periode           | Rp [prior],-            |
| **Kas + setara kas akhir periode**      | **Rp {{kas_setara_kas}},-** |

Validasi: kas akhir periode di Laporan Arus Kas harus sama dengan pos Kas di Neraca.

## 5. Catatan Atas Laporan Keuangan (CALK)

Per SAK ETAP, CALK wajib mencakup:
1. Informasi umum entitas — nama, alamat, bidang usaha, NPWP, akta pendirian.
2. Kebijakan akuntansi signifikan — dasar pengukuran (historical cost), pengakuan pendapatan, metode penyusutan (garis lurus / saldo menurun).
3. Penjelasan pos signifikan — komposisi piutang, umur piutang, daftar aset tetap, daftar utang ke bank dengan jadwal pembayaran.
4. Kewajiban kontinjensi — jaminan, sengketa hukum, kewajiban pajak masih dalam pemeriksaan.
5. Peristiwa setelah tanggal neraca — peristiwa material yang terjadi setelah tanggal periode tetapi sebelum laporan diterbitkan.

## 6. Catatan untuk founder

- Laporan ini untuk konsumsi internal + lampiran SPT Tahunan. Untuk audit (jika omzet > Rp 50 milyar atau kewajiban audit per Permenkeu) wajib gunakan akuntan publik terdaftar OJK.
- Jika omzet melewati Rp 50 milyar dalam 2 tahun berturut-turut, entitas naik kategori menjadi "Entitas Menengah" + wajib pakai SAK Umum (PSAK), bukan lagi SAK ETAP.
- Pos "Utang pajak" wajib di-reconcile dengan SPT Masa yang sudah dilapor — jika beda, ada under/overpayment yang harus dikoreksi.
- Penyusutan aset tetap: SAK ETAP fleksibel (garis lurus, saldo menurun, unit produksi), tapi untuk PPh harus pakai metode + masa manfaat per UU PPh Pasal 11 jo. PMK 96/2009 — beda buku komersial vs fiskal dicatat di rekonsiliasi fiskal SPT Tahunan.
- Simpan dokumen pendukung minimal 10 tahun (UU KUP Pasal 28 ayat 11).
```

## Tone guide

Bahasa formal exec — Anda form di body, kalimat pendek. Angka IDR dengan separator titik thousand tanpa desimal (Rp 1.500.000.000,-), persen dengan koma desimal. Setiap pos akuntansi terikat ke standar — SAK ETAP, PSAK, UU PT 40/2007, UU KUP 28/2007, UU UMKM 20/2008 (revisi PP 7/2021). Tegaskan SAK ETAP bukan SAK Umum / IFRS — yang berbeda format + tingkat detail. Zero exclamation marks. Hindari kata banned brand voice.
