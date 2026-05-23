# Template — Surat Perjanjian Sewa-Menyewa (DRAFT)

Draft perjanjian sewa-menyewa properti (kantor, rumah, kios, gudang, ruko) sesuai konvensi pasar properti Indonesia.
Audience: pemilik properti + penyewa yang butuh kontrak ringkas untuk hubungan sewa jangka pendek atau menengah.
Pakai untuk sewa kantor, rumah tinggal, kios, ruko, gudang. **Beda dari western lease** — mencakup ketentuan IPL, listrik+air, deposit, dan referensi yurisdiksi Indonesia.

> **DRAFT — BUKAN NASIHAT HUKUM.** Dokumen ini adalah kerangka awal yang **wajib direview oleh advokat / kuasa hukum bersertifikat atau notaris** sebelum ditandatangani. Untuk sewa jangka panjang (>5 tahun) atau properti komersial bernilai tinggi, akta notaris sangat dianjurkan. Doc Expert tidak memberikan nasihat hukum.

## Variables

- `{{contract_number}}` — string. Nomor perjanjian (mis. `001/SPS/V/2026`).
- `{{contract_date_id}}` — string. Tanggal pembuatan (mis. `22 Mei 2026`).
- `{{contract_city}}` — string. Kota penandatanganan.
- `{{owner_name}}` — string. Nama pemilik properti (Pihak Pertama).
- `{{owner_nik}}` — string. NIK pemilik (KTP).
- `{{owner_address}}` — string. Alamat sesuai KTP.
- `{{owner_phone}}` — string. Nomor WhatsApp pemilik.
- `{{tenant_name}}` — string. Nama penyewa (Pihak Kedua) — perorangan atau badan usaha.
- `{{tenant_legal_form}}` — string. `perorangan`, `PT`, `CV`, `Yayasan`, dll.
- `{{tenant_nik_or_npwp}}` — string. NIK (perorangan) atau NPWP (badan usaha).
- `{{tenant_address}}` — string. Alamat penyewa (alamat KTP atau domisili usaha).
- `{{tenant_representative_name}}` — string. Wakil penyewa jika badan usaha.
- `{{tenant_representative_title}}` — string. Jabatan wakil.
- `{{property_type}}` — string. `rumah tinggal`, `kantor`, `kios`, `ruko`, `gudang`, `kantor virtual`.
- `{{property_address}}` — string. Alamat lengkap properti yang disewakan.
- `{{property_size_m2}}` — string. Luas dalam m² (mis. `120 m²`).
- `{{property_facilities}}` — markdown list. Daftar fasilitas (mis. `2 kamar tidur, 1 kamar mandi, dapur, garasi, AC 2 unit`).
- `{{rental_period_words}}` — string. Periode sewa dieja (mis. `1 (satu) tahun`, `6 (enam) bulan`).
- `{{rental_period_start}}` — string. Tanggal mulai sewa (mis. `1 Juni 2026`).
- `{{rental_period_end}}` — string. Tanggal akhir sewa (mis. `31 Mei 2027`).
- `{{rental_amount_words}}` — string. Nilai sewa dieja (mis. `Lima puluh juta Rupiah`).
- `{{rental_amount_numeric}}` — string. Nilai sewa angka (mis. `Rp 50.000.000,-`).
- `{{payment_term}}` — string. Skema pembayaran (mis. `dibayar penuh di muka`, `dibayar per 6 bulan`, `dibayar bulanan setiap tanggal 1`).
- `{{deposit_amount_words}}` — string. Deposit dieja (mis. `Lima juta Rupiah`).
- `{{deposit_amount_numeric}}` — string. Deposit angka (mis. `Rp 5.000.000,-`).
- `{{utilities_responsibility}}` — string. Pembagian biaya utilitas (mis. `Listrik PLN, air PDAM, internet ditanggung sepenuhnya oleh Penyewa berdasarkan tagihan riil`).
- `{{ipl_amount}}` — string. Iuran Pengelolaan Lingkungan / Iuran Pemeliharaan Lingkungan (mis. `Rp 200.000,- per bulan ditanggung Penyewa`, atau `tidak ada IPL`).
- `{{renewal_notice_days}}` — string. Hari pemberitahuan perpanjangan (mis. `30 (tiga puluh)`).
- `{{property_use_restriction}}` — string. Peruntukan / pembatasan penggunaan (mis. `khusus untuk hunian keluarga, dilarang untuk kegiatan komersial atau gudang barang berbahaya`).
- `{{dispute_forum_city}}` — string. Pengadilan Negeri yang dipilih.

## Template

---
template: surat-perjanjian-sewa
language: id
register: legal-formal
jurisdiction: indonesia
status: DRAFT-REVIEW-REQUIRED
---

> **CATATAN PENTING:** Dokumen ini adalah DRAFT awal. **Wajib direview oleh advokat / notaris** sebelum ditandatangani, terutama untuk sewa komersial atau jangka panjang. Bukan nasihat hukum.

---

# SURAT PERJANJIAN SEWA-MENYEWA

**Nomor:** {{contract_number}}

Surat Perjanjian Sewa-Menyewa ini ("**Perjanjian**") dibuat dan ditandatangani di {{contract_city}} pada {{contract_date_id}}, oleh dan antara:

**I. PIHAK PERTAMA (Pemilik / Yang Menyewakan)**

**{{owner_name}}**, perorangan, pemegang Kartu Tanda Penduduk Nomor {{owner_nik}}, beralamat di {{owner_address}}, bertindak untuk dan atas nama diri sendiri sebagai pemilik sah properti, selanjutnya disebut **"YANG MENYEWAKAN"**.

**II. PIHAK KEDUA (Penyewa)**

{{tenant_name}}, {{tenant_legal_form}}, beralamat di {{tenant_address}}, dalam hal ini diwakili oleh **{{tenant_representative_name}}** selaku {{tenant_representative_title}}, pemegang identitas {{tenant_nik_or_npwp}}, selanjutnya disebut **"PENYEWA"**.

YANG MENYEWAKAN dan PENYEWA secara bersama-sama disebut **"Para Pihak"** dan secara sendiri-sendiri disebut **"Pihak"**.

Para Pihak sepakat untuk mengikatkan diri dalam Perjanjian Sewa-Menyewa ini berdasarkan ketentuan **Pasal 1548 sampai dengan Pasal 1600 Kitab Undang-Undang Hukum Perdata (KUHPerdata)** tentang Sewa-Menyewa, dengan syarat dan ketentuan sebagai berikut:

---

## Pasal 1 — Objek Sewa

1. YANG MENYEWAKAN menyewakan kepada PENYEWA, dan PENYEWA menerima sewa dari YANG MENYEWAKAN, sebuah {{property_type}} ("**Properti**") dengan rincian:
   - **Alamat:** {{property_address}}
   - **Luas:** {{property_size_m2}}
2. Fasilitas yang termasuk dalam Properti adalah sebagai berikut:

{{property_facilities}}

3. YANG MENYEWAKAN menyatakan dan menjamin bahwa Properti adalah miliknya yang sah dan bebas dari sengketa, sita, atau jaminan kepada pihak ketiga.

## Pasal 2 — Jangka Waktu Sewa

1. Jangka waktu sewa adalah selama **{{rental_period_words}}**, terhitung sejak **{{rental_period_start}}** sampai dengan **{{rental_period_end}}** ("**Jangka Waktu Sewa**").
2. Penyerahan kunci dan akses Properti dilakukan oleh YANG MENYEWAKAN kepada PENYEWA pada tanggal mulai Jangka Waktu Sewa atau pada tanggal lain yang disepakati tertulis.

## Pasal 3 — Harga Sewa dan Pembayaran

1. Harga sewa yang disepakati adalah **{{rental_amount_words}} ({{rental_amount_numeric}})** untuk seluruh Jangka Waktu Sewa.
2. Pembayaran dilakukan dengan skema: **{{payment_term}}**.
3. Pembayaran dilakukan melalui transfer ke rekening yang ditunjuk YANG MENYEWAKAN. Bukti transfer dikirim ke {{owner_phone}}.
4. Keterlambatan pembayaran lebih dari 14 (empat belas) hari kalender memberikan hak kepada YANG MENYEWAKAN untuk menerbitkan teguran tertulis. Keterlambatan lebih dari 30 (tiga puluh) hari memberikan hak pengakhiran sepihak sesuai Pasal 9.

## Pasal 4 — Deposit (Uang Jaminan)

1. Pada saat penandatanganan Perjanjian, PENYEWA wajib menyerahkan deposit sebesar **{{deposit_amount_words}} ({{deposit_amount_numeric}})** sebagai jaminan atas pelaksanaan kewajiban PENYEWA.
2. Deposit **tidak dipotong dari harga sewa** dan akan dikembalikan kepada PENYEWA paling lambat 14 (empat belas) hari kalender setelah berakhirnya Jangka Waktu Sewa, dikurangi:
   - Biaya kerusakan Properti yang disebabkan oleh PENYEWA (di luar wear-and-tear wajar).
   - Tagihan listrik, air, internet, dan IPL yang belum dibayar.
   - Biaya pembersihan akhir jika Properti tidak diserahkan dalam kondisi bersih.
3. Pemotongan deposit harus disertai bukti tertulis dan disampaikan kepada PENYEWA dalam waktu 7 (tujuh) hari kalender setelah serah-terima akhir.

## Pasal 5 — Biaya Operasional

1. Selama Jangka Waktu Sewa, pembagian biaya operasional adalah sebagai berikut: {{utilities_responsibility}}.
2. Iuran Pengelolaan Lingkungan (IPL): {{ipl_amount}}.
3. Pajak Bumi dan Bangunan (PBB) sepenuhnya ditanggung oleh YANG MENYEWAKAN.

## Pasal 6 — Peruntukan dan Pembatasan

1. PENYEWA wajib menggunakan Properti sesuai peruntukan, yaitu: {{property_use_restriction}}.
2. PENYEWA dilarang menyewakan kembali (sub-leasing) Properti kepada pihak ketiga tanpa persetujuan tertulis YANG MENYEWAKAN.
3. PENYEWA dilarang melakukan perubahan struktur permanen pada Properti tanpa persetujuan tertulis YANG MENYEWAKAN. Perubahan minor (cat, dekorasi non-permanen) diperbolehkan dengan kewajiban mengembalikan ke kondisi semula saat serah-terima akhir.

## Pasal 7 — Hak dan Kewajiban Para Pihak

### 7.1 Hak dan Kewajiban YANG MENYEWAKAN
- Menerima pembayaran sewa sesuai Pasal 3.
- Menyerahkan Properti dalam kondisi layak huni / pakai sesuai peruntukan.
- Menanggung perbaikan kerusakan struktural (atap bocor, pipa utama pecah, instalasi listrik utama) yang bukan disebabkan PENYEWA.

### 7.2 Hak dan Kewajiban PENYEWA
- Menggunakan Properti dengan baik sesuai peruntukan.
- Membayar sewa, biaya operasional, dan IPL tepat waktu.
- Menanggung perbaikan kerusakan kecil (lampu mati, keran bocor, pintu macet) yang terjadi selama Jangka Waktu Sewa.
- Menyerahkan Properti dalam kondisi yang sama saat penyerahan, dengan toleransi wear-and-tear wajar.

## Pasal 8 — Perpanjangan

1. Para Pihak dapat memperpanjang Jangka Waktu Sewa dengan kesepakatan tertulis berupa addendum.
2. PENYEWA yang berminat memperpanjang wajib memberitahukan secara tertulis kepada YANG MENYEWAKAN paling lambat **{{renewal_notice_days}} hari kalender** sebelum berakhirnya Jangka Waktu Sewa.
3. Harga sewa periode perpanjangan dapat disesuaikan oleh kesepakatan Para Pihak, dengan kenaikan maksimum mengikuti rata-rata inflasi tahunan menurut data resmi Badan Pusat Statistik (BPS) kecuali disepakati lain.
4. Apabila PENYEWA tidak memberitahukan perpanjangan dalam tenggat di atas, Perjanjian berakhir secara otomatis pada tanggal akhir Jangka Waktu Sewa tanpa perpanjangan otomatis.

## Pasal 9 — Pengakhiran

1. Perjanjian dapat diakhiri sebelum berakhirnya Jangka Waktu Sewa berdasarkan:
   - Kesepakatan tertulis Para Pihak.
   - Wanprestasi salah satu Pihak yang tidak diperbaiki dalam waktu wajar setelah pemberitahuan tertulis.
   - Keadaan kahar berkepanjangan sesuai Pasal 10.
2. PENYEWA yang mengakhiri Perjanjian sebelum berakhirnya Jangka Waktu Sewa **tidak berhak menuntut pengembalian sebagian** harga sewa yang sudah dibayar, kecuali disepakati tertulis lain.
3. Para Pihak sepakat mengesampingkan berlakunya **Pasal 1266 dan 1267 KUHPerdata** sepanjang berkaitan dengan keharusan adanya putusan pengadilan untuk mengakhiri Perjanjian ini.

## Pasal 10 — Keadaan Kahar (Force Majeure)

1. Tidak ada Pihak yang bertanggung jawab atas kegagalan pelaksanaan kewajiban yang disebabkan oleh keadaan kahar, termasuk namun tidak terbatas pada: bencana alam (gempa bumi, banjir, kebakaran, gunung meletus), pandemi, kerusuhan, perang, kebijakan pemerintah yang menutup akses Properti.
2. Pihak yang mengalami keadaan kahar wajib memberitahukan kepada Pihak lainnya paling lambat 7 (tujuh) hari kalender sejak terjadinya keadaan tersebut.
3. Apabila keadaan kahar menyebabkan Properti tidak dapat digunakan lebih dari 60 (enam puluh) hari kalender, Para Pihak dapat sepakat untuk mengakhiri Perjanjian dengan pengembalian sewa proporsional atas periode yang tidak terpakai.

## Pasal 11 — Penyelesaian Sengketa

1. Setiap perselisihan akan diselesaikan secara musyawarah untuk mufakat dalam waktu 30 (tiga puluh) hari kalender.
2. Apabila tidak tercapai mufakat, Para Pihak sepakat untuk menyelesaikan perselisihan melalui **Pengadilan Negeri {{dispute_forum_city}}**.

## Pasal 12 — Hukum yang Berlaku

Perjanjian ini tunduk pada dan ditafsirkan berdasarkan hukum negara Republik Indonesia, terutama KUHPerdata Buku III tentang Perikatan dan ketentuan khusus tentang Sewa-Menyewa (Pasal 1548-1600 KUHPerdata).

## Pasal 13 — Ketentuan Lain

1. Setiap perubahan atas Perjanjian hanya sah apabila dibuat tertulis dan ditandatangani Para Pihak dalam bentuk addendum.
2. Apabila terdapat ketentuan dalam Perjanjian yang dinyatakan tidak sah oleh putusan pengadilan, ketentuan tersebut tidak mempengaruhi keabsahan ketentuan lainnya.
3. Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai cukup Rp 10.000 sesuai UU Bea Materai Nomor 10 Tahun 2020, dan memiliki kekuatan hukum yang sama.

---

Demikian Perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani serta tanpa adanya paksaan dari pihak manapun.

| **YANG MENYEWAKAN** | **PENYEWA** |
| --- | --- |
| {{owner_name}} | {{tenant_name}} |
| `[Materai Rp 10.000]` | `[Materai Rp 10.000]` |
| <br><br><br> | <br><br><br> |
| **{{owner_name}}** | **{{tenant_representative_name}}** |
| Pemilik | {{tenant_representative_title}} |
| NIK: {{owner_nik}} | {{tenant_nik_or_npwp}} |

**Saksi-saksi:**

| Saksi 1 | Saksi 2 |
| --- | --- |
| <br><br> | <br><br> |
| (...........................) | (...........................) |

---

> **REMINDER — DRAFT REVIEW WAJIB.** Template ini berbasis KUHPerdata Pasal 1548-1600 tentang Sewa-Menyewa. Untuk sewa komersial besar (>Rp 500jt/tahun), sewa lahan dengan rencana bangunan, atau sewa dengan opsi beli, **wajib akta notaris**. Klausul deposit, kerusakan, dan perpanjangan adalah area paling sering disengketakan — pastikan eksplisit. Pajak sewa (PPh 4(2) Final 10% untuk sewa tanah/bangunan) ditanggung YANG MENYEWAKAN dan disetor sendiri ke kas negara.

## Tone guide

Register **legal-formal Bahasa Indonesia**. Pakai kata baku KUHPerdata (Perjanjian, Para Pihak, YANG MENYEWAKAN, PENYEWA, wanprestasi, keadaan kahar). Penomoran pasal dan ayat konsisten. Identifikasi pihak kapital sepanjang dokumen. Format Rupiah: `Rp 50.000.000,-` (titik ribuan, koma desimal, akhiri dengan tanda hubung). Tanggal format Indonesia (`22 Mei 2026`). Tidak ada tanda seru. Tidak ada emoji. Tidak ada kontraksi.

> _Catatan customer: untuk sewa rumah biasanya pemilik mau hands-off — pastikan Pasal 7 (kewajiban perbaikan struktural pemilik) eksplisit supaya nggak ada perdebatan saat AC bocor. Deposit di Indonesia umumnya 1-2 bulan sewa, lebih dari itu termasuk tinggi. PBB tetap tanggungan pemilik kecuali disepakati tertulis lain. Jangan lupa cek IMB / PBG properti masih berlaku sebelum tanda tangan._
