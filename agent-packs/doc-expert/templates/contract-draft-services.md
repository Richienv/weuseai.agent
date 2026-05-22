# Template — Draft Perjanjian Kerja Sama Layanan (DRAFT)

Draft perjanjian kerja sama layanan untuk dua pihak (penyedia jasa + pengguna jasa) di yurisdiksi Indonesia.
Audience: pengguna yang butuh dokumen awal untuk dasar diskusi sebelum direview oleh kuasa hukum.
Pakai untuk MoU layanan ringan, perjanjian freelance, kontrak konsultasi jangka pendek.

> **DRAFT — BUKAN NASIHAT HUKUM.** Dokumen ini adalah kerangka awal yang **wajib direview oleh advokat / kuasa hukum bersertifikat** sebelum ditandatangani. Klausul, terminologi, dan struktur perjanjian harus disesuaikan dengan sifat layanan, nilai transaksi, regulasi sektoral yang berlaku, dan kebutuhan kedua belah pihak. Doc Expert tidak memberikan nasihat hukum.

## Variables

- `{{contract_number}}` — string. Nomor perjanjian.
- `{{contract_date_full}}` — string. Tanggal dibuat ditulis lengkap (mis. `dua puluh dua Mei dua ribu dua puluh enam (22-05-2026)`).
- `{{contract_city}}` — string. Kota penandatanganan.
- `{{party_1_name}}` — string. Nama Pihak Pertama (penyedia jasa).
- `{{party_1_legal_form}}` — string. Bentuk badan hukum (PT, CV, perorangan).
- `{{party_1_address}}` — string. Alamat Pihak Pertama.
- `{{party_1_representative_name}}` — string. Nama wakil yang menandatangani.
- `{{party_1_representative_title}}` — string. Jabatan wakil.
- `{{party_1_identity_number}}` — string. NIK / nomor identitas wakil.
- `{{party_2_name}}` — string. Nama Pihak Kedua (pengguna jasa).
- `{{party_2_legal_form}}` — string. Bentuk badan hukum.
- `{{party_2_address}}` — string. Alamat Pihak Kedua.
- `{{party_2_representative_name}}` — string. Nama wakil.
- `{{party_2_representative_title}}` — string. Jabatan wakil.
- `{{party_2_identity_number}}` — string. NIK / nomor identitas.
- `{{scope_description}}` — string. Deskripsi lingkup pekerjaan (1-2 paragraf).
- `{{deliverable_list}}` — markdown list. Daftar deliverable konkret.
- `{{contract_period_start}}` — string. Tanggal mulai.
- `{{contract_period_end}}` — string. Tanggal selesai.
- `{{fee_amount_words}}` — string. Nilai kontrak dieja (mis. `Dua puluh lima juta Rupiah`).
- `{{fee_amount_numeric}}` — string. Nilai kontrak angka (mis. `Rp 25.000.000,-`).
- `{{payment_terms}}` — string. Termin pembayaran (mis. `50% di awal, 50% saat penyerahan akhir`).
- `{{ip_ownership_clause}}` — string. Klausul kepemilikan hak kekayaan intelektual.
- `{{confidentiality_period_years}}` — string. Periode kerahasiaan pasca-kontrak dalam tahun.
- `{{termination_notice_days}}` — string. Periode pemberitahuan pemutusan dalam hari.
- `{{force_majeure_examples}}` — string. Contoh kejadian force majeure (mis. bencana alam, pandemi, kebijakan pemerintah).
- `{{dispute_forum_city}}` — string. Pengadilan Negeri yang dipilih (mis. `Jakarta Selatan`).

## Template

---
template: contract-draft-services
language: id
register: legal-formal
jurisdiction: indonesia
status: DRAFT-REVIEW-REQUIRED
---

> **CATATAN PENTING:** Dokumen ini adalah DRAFT awal. **Wajib direview dan disesuaikan oleh advokat / kuasa hukum bersertifikat** sebelum ditandatangani. Bukan nasihat hukum.

---

# PERJANJIAN KERJA SAMA LAYANAN

**Nomor:** {{contract_number}}

Perjanjian Kerja Sama Layanan ini ("**Perjanjian**") dibuat dan ditandatangani di {{contract_city}} pada hari ini, {{contract_date_full}}, oleh dan antara:

**I. PIHAK PERTAMA**

{{party_1_name}}, suatu {{party_1_legal_form}} yang didirikan berdasarkan hukum Republik Indonesia, berkedudukan di {{party_1_address}}, dalam hal ini diwakili oleh **{{party_1_representative_name}}** selaku {{party_1_representative_title}}, pemegang Kartu Tanda Penduduk Nomor {{party_1_identity_number}}, bertindak untuk dan atas nama {{party_1_name}}, selanjutnya disebut **"PIHAK PERTAMA"**.

**II. PIHAK KEDUA**

{{party_2_name}}, suatu {{party_2_legal_form}} yang didirikan berdasarkan hukum Republik Indonesia, berkedudukan di {{party_2_address}}, dalam hal ini diwakili oleh **{{party_2_representative_name}}** selaku {{party_2_representative_title}}, pemegang Kartu Tanda Penduduk Nomor {{party_2_identity_number}}, bertindak untuk dan atas nama {{party_2_name}}, selanjutnya disebut **"PIHAK KEDUA"**.

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut **"Para Pihak"** dan secara sendiri-sendiri disebut **"Pihak"**.

Para Pihak sepakat untuk mengikatkan diri dalam Perjanjian ini dengan syarat dan ketentuan sebagai berikut:

---

## Pasal 1 — Ruang Lingkup Pekerjaan

PIHAK PERTAMA bersedia memberikan layanan kepada PIHAK KEDUA sebagai berikut:

{{scope_description}}

Adapun deliverable yang menjadi keluaran Perjanjian ini meliputi:

{{deliverable_list}}

## Pasal 2 — Jangka Waktu

Perjanjian ini berlaku selama jangka waktu mulai tanggal **{{contract_period_start}}** sampai dengan **{{contract_period_end}}** ("**Jangka Waktu**"), dengan kemungkinan perpanjangan berdasarkan kesepakatan tertulis Para Pihak.

## Pasal 3 — Nilai Kontrak dan Cara Pembayaran

1. PIHAK KEDUA wajib membayar imbalan kepada PIHAK PERTAMA atas pelaksanaan pekerjaan sebagaimana diatur dalam Pasal 1 sebesar **{{fee_amount_words}} ({{fee_amount_numeric}})**, sudah termasuk pajak yang berlaku.
2. Pembayaran dilakukan dengan ketentuan: {{payment_terms}}.
3. Pembayaran dilakukan melalui transfer bank ke rekening yang ditunjuk oleh PIHAK PERTAMA.
4. Bukti pembayaran wajib disampaikan oleh PIHAK KEDUA kepada PIHAK PERTAMA dalam waktu paling lambat 3 (tiga) hari kerja setelah pembayaran dilakukan.

## Pasal 4 — Hak dan Kewajiban

### 4.1 Hak dan Kewajiban PIHAK PERTAMA

PIHAK PERTAMA berhak:
- Menerima pembayaran sesuai ketentuan Pasal 3.
- Memperoleh informasi, akses, dan data yang dibutuhkan untuk pelaksanaan pekerjaan.

PIHAK PERTAMA berkewajiban:
- Melaksanakan pekerjaan dengan profesional sesuai standar industri yang berlaku.
- Menyerahkan deliverable sesuai jangka waktu yang disepakati.
- Menjaga kerahasiaan informasi PIHAK KEDUA sesuai Pasal 6.

### 4.2 Hak dan Kewajiban PIHAK KEDUA

PIHAK KEDUA berhak:
- Menerima deliverable sesuai Pasal 1.
- Memberikan masukan dan revisi sesuai mekanisme yang disepakati.

PIHAK KEDUA berkewajiban:
- Melakukan pembayaran sesuai Pasal 3.
- Memberikan informasi, akses, dan data yang dibutuhkan secara tepat waktu.
- Menjaga kerahasiaan informasi PIHAK PERTAMA sesuai Pasal 6.

## Pasal 5 — Hak Kekayaan Intelektual

{{ip_ownership_clause}}

## Pasal 6 — Kerahasiaan

1. Para Pihak sepakat untuk menjaga kerahasiaan seluruh informasi yang diperoleh dalam rangka pelaksanaan Perjanjian ini, baik selama Jangka Waktu maupun setelah berakhirnya Perjanjian.
2. Kewajiban kerahasiaan sebagaimana dimaksud pada ayat (1) berlaku selama **{{confidentiality_period_years}} ({{confidentiality_period_years}})** tahun terhitung sejak berakhirnya Perjanjian.
3. Pengecualian dari kewajiban kerahasiaan berlaku untuk informasi yang: (a) telah menjadi pengetahuan umum bukan karena pelanggaran Perjanjian; (b) diperoleh secara sah dari pihak ketiga tanpa kewajiban kerahasiaan; atau (c) wajib diungkapkan berdasarkan ketentuan peraturan perundang-undangan atau perintah pengadilan.

## Pasal 7 — Pengakhiran Perjanjian

1. Perjanjian ini dapat diakhiri sebelum berakhirnya Jangka Waktu berdasarkan: (a) kesepakatan tertulis Para Pihak; (b) wanprestasi salah satu Pihak yang tidak diperbaiki dalam waktu wajar setelah pemberitahuan tertulis; atau (c) keadaan kahar sebagaimana diatur dalam Pasal 8.
2. Pihak yang bermaksud mengakhiri Perjanjian wajib menyampaikan pemberitahuan tertulis paling lambat **{{termination_notice_days}} ({{termination_notice_days}})** hari kalender sebelum tanggal pengakhiran yang diinginkan.
3. Para Pihak sepakat mengesampingkan berlakunya ketentuan Pasal 1266 dan 1267 KUH Perdata sepanjang berkaitan dengan keharusan adanya putusan pengadilan untuk mengakhiri Perjanjian ini.

## Pasal 8 — Keadaan Kahar (Force Majeure)

1. Tidak ada Pihak yang bertanggung jawab atas keterlambatan atau kegagalan pelaksanaan kewajiban yang disebabkan oleh keadaan kahar, termasuk namun tidak terbatas pada {{force_majeure_examples}}.
2. Pihak yang mengalami keadaan kahar wajib memberitahukan kepada Pihak lainnya dalam waktu paling lambat 7 (tujuh) hari kalender sejak terjadinya keadaan kahar.

## Pasal 9 — Penyelesaian Perselisihan

1. Setiap perselisihan yang timbul dari atau berkaitan dengan Perjanjian ini akan diselesaikan secara musyawarah untuk mufakat oleh Para Pihak.
2. Apabila musyawarah tidak mencapai mufakat dalam waktu 30 (tiga puluh) hari kalender, Para Pihak sepakat untuk menyelesaikan perselisihan melalui **Pengadilan Negeri {{dispute_forum_city}}**.

## Pasal 10 — Hukum yang Berlaku

Perjanjian ini tunduk pada dan ditafsirkan berdasarkan hukum negara Republik Indonesia.

## Pasal 11 — Ketentuan Lain

1. Setiap perubahan atas Perjanjian ini hanya sah apabila dibuat secara tertulis dan ditandatangani oleh Para Pihak dalam bentuk addendum.
2. Apabila terdapat ketentuan dalam Perjanjian ini yang dinyatakan tidak sah atau tidak dapat diberlakukan, ketentuan tersebut tidak akan mempengaruhi keabsahan ketentuan lainnya.
3. Perjanjian ini dibuat dalam rangkap 2 (dua), bermaterai cukup, dan masing-masing memiliki kekuatan hukum yang sama.

---

Demikian Perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani serta tanpa adanya paksaan dari pihak manapun.

| **PIHAK PERTAMA** | **PIHAK KEDUA** |
| --- | --- |
| {{party_1_name}} | {{party_2_name}} |
| <br><br><br> | <br><br><br> |
| **{{party_1_representative_name}}** | **{{party_2_representative_name}}** |
| {{party_1_representative_title}} | {{party_2_representative_title}} |

---

> **REMINDER — DRAFT REVIEW WAJIB.** Template ini berbasis konvensi umum perjanjian layanan di yurisdiksi Indonesia (mengacu KUH Perdata Buku III tentang Perikatan), namun TIDAK menggantikan review profesional. Klausul-klausul tertentu (HKI, kerahasiaan, force majeure, penyelesaian sengketa) dapat berbeda signifikan tergantung industri, nilai transaksi, dan profil risiko. Doc Expert tidak memberikan nasihat hukum dan tidak bertanggung jawab atas penggunaan dokumen ini tanpa review oleh advokat bersertifikat.

## Tone guide

Register **legal-formal Bahasa Indonesia**. Pakai kata baku KUH Perdata (Perjanjian, Para Pihak, wanprestasi, keadaan kahar, dst). Kalimat majemuk panjang dapat diterima dalam dokumen hukum — prioritas presisi atas keringkasan. Pakai penomoran pasal & ayat konsisten (Pasal 1, ayat (1), huruf a). Identifikasi pihak konsisten ("PIHAK PERTAMA", "PIHAK KEDUA" — kapital sepanjang dokumen). Hindari frasa lentur ("sebaiknya", "diharapkan") — pakai bahasa terikat ("wajib", "berhak", "tidak diperkenankan"). Tanggal dieja lengkap di pembukaan (`dua puluh dua Mei dua ribu dua puluh enam (22-05-2026)`). Tidak ada tanda seru. Tidak ada emoji.

> _Catatan customer: PASTIKAN lawyer review sebelum sign. Template ini cocok untuk transaksi &lt;Rp 100jt dan layanan sederhana. Untuk transaksi besar, kerja sama jangka panjang, atau industri yang diatur khusus (fintech, kesehatan, pertambangan, dsb), template generic tidak cukup — perlu drafting khusus._
