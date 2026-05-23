# Template — Kontrak Freelance Bahasa Indonesia (DRAFT)

Draft perjanjian kerja freelance / pekerja lepas dalam register hukum Bahasa Indonesia.
Audience: freelancer perseorangan + klien (perorangan, UMKM, PT/CV) yang butuh kontrak ringkas untuk kerja per-proyek atau per-jam tanpa hubungan kerja tetap.
Pakai untuk pekerjaan desain, penulisan, pengembangan software, konsultasi, fotografi, dan jasa profesional independen lainnya — beda dari perjanjian kerja waktu tertentu (PKWT).

> **DRAFT — BUKAN NASIHAT HUKUM.** Dokumen ini adalah kerangka awal yang **wajib direview oleh advokat / kuasa hukum bersertifikat** sebelum ditandatangani. Hubungan freelance harus dipastikan tidak masuk kategori hubungan kerja sesuai UU Cipta Kerja Nomor 6 Tahun 2023 jo. PP Nomor 35 Tahun 2021 — kesalahan klasifikasi dapat menimbulkan kewajiban BPJS, THR, dan pesangon. Doc Expert tidak memberikan nasihat hukum.

## Variables

- `{{contract_number}}` — string. Nomor kontrak (mis. `001/FRL/V/2026`).
- `{{contract_date_id}}` — string. Tanggal pembuatan format Indonesia (mis. `22 Mei 2026`).
- `{{contract_city}}` — string. Kota penandatanganan.
- `{{freelancer_name}}` — string. Nama freelancer (Pihak Pertama).
- `{{freelancer_nik}}` — string. NIK freelancer (KTP).
- `{{freelancer_npwp}}` — string. NPWP freelancer (jika ada, optional bagi non-NPWP).
- `{{freelancer_address}}` — string. Alamat sesuai KTP.
- `{{freelancer_email}}` — string. Email kontak.
- `{{freelancer_phone}}` — string. Nomor WhatsApp.
- `{{client_name}}` — string. Nama klien (Pihak Kedua) — perorangan atau badan usaha.
- `{{client_legal_form}}` — string. Bentuk klien (mis. `perorangan`, `PT (Perseroan Terbatas)`, `CV (Persekutuan Komanditer)`, `Yayasan`).
- `{{client_address}}` — string. Alamat klien.
- `{{client_representative_name}}` — string. Nama wakil klien (jika badan usaha — sama dengan client_name jika perorangan).
- `{{client_representative_title}}` — string. Jabatan wakil.
- `{{client_npwp_or_nik}}` — string. NPWP (badan usaha) atau NIK (perorangan) klien.
- `{{project_name}}` — string. Nama proyek atau ringkasan pekerjaan.
- `{{scope_description}}` — string. Deskripsi lingkup pekerjaan (1-3 paragraf).
- `{{deliverable_list}}` — markdown list. Daftar deliverable konkret.
- `{{rate_type}}` — string. `per-jam`, `per-proyek`, atau `per-milestone`.
- `{{rate_amount_words}}` — string. Nilai dieja (mis. `Tiga ratus ribu Rupiah per jam`).
- `{{rate_amount_numeric}}` — string. Nilai angka format Indonesia (mis. `Rp 300.000,-/jam`).
- `{{total_estimated_words}}` — string. Estimasi total dieja (untuk per-jam: estimasi jam total).
- `{{total_estimated_numeric}}` — string. Estimasi total angka.
- `{{payment_schedule}}` — string. Jadwal pembayaran (mis. `30% di awal sebagai down payment, 70% saat pekerjaan selesai`, atau `mingguan berdasarkan timesheet`).
- `{{project_start_date}}` — string. Tanggal mulai pekerjaan.
- `{{project_end_date_or_milestone}}` — string. Tanggal target selesai atau milestone akhir.
- `{{revision_round_count}}` — string. Jumlah ronde revisi yang termasuk dalam fee (mis. `2 (dua) kali`).
- `{{extra_revision_rate}}` — string. Biaya revisi tambahan (mis. `Rp 150.000,- per ronde revisi tambahan`).
- `{{ip_default_clause}}` — string. Klausul HKI default (mis. `Hak Kekayaan Intelektual atas Deliverable tetap menjadi milik Freelancer sampai pelunasan penuh, setelah itu beralih ke Klien dengan lisensi non-eksklusif kepada Freelancer untuk portfolio.`).
- `{{force_majeure_examples_id}}` — string. Contoh force majeure (mis. `bencana alam, pandemi, kebijakan pemerintah yang menghentikan kegiatan usaha, gangguan infrastruktur internet skala nasional`).
- `{{dispute_forum_city}}` — string. Pengadilan Negeri yang dipilih untuk yurisdiksi sengketa.

## Template

---
template: kontrak-freelance-bahasa
language: id
register: legal-formal
jurisdiction: indonesia
status: DRAFT-REVIEW-REQUIRED
---

> **CATATAN PENTING:** Dokumen ini adalah DRAFT awal. **Wajib direview oleh advokat / kuasa hukum bersertifikat** sebelum ditandatangani. Bukan nasihat hukum. Pastikan hubungan ini tidak masuk kategori hubungan kerja menurut UU Cipta Kerja Nomor 6 Tahun 2023.

---

# PERJANJIAN KERJA FREELANCE

**Nomor:** {{contract_number}}

Perjanjian Kerja Freelance ini ("**Perjanjian**") dibuat dan ditandatangani di {{contract_city}} pada {{contract_date_id}}, oleh dan antara:

**I. PIHAK PERTAMA (Freelancer)**

**{{freelancer_name}}**, perorangan, pemegang Kartu Tanda Penduduk Nomor {{freelancer_nik}}, NPWP {{freelancer_npwp}}, beralamat di {{freelancer_address}}, bertindak untuk dan atas nama diri sendiri sebagai pekerja lepas independen, selanjutnya disebut **"FREELANCER"**.

**II. PIHAK KEDUA (Klien)**

{{client_name}}, {{client_legal_form}}, beralamat di {{client_address}}, dalam hal ini diwakili oleh **{{client_representative_name}}** selaku {{client_representative_title}}, pemegang identitas {{client_npwp_or_nik}}, selanjutnya disebut **"KLIEN"**.

FREELANCER dan KLIEN secara bersama-sama disebut **"Para Pihak"** dan secara sendiri-sendiri disebut **"Pihak"**.

Para Pihak sepakat untuk mengikatkan diri dalam Perjanjian ini berdasarkan asas kebebasan berkontrak sebagaimana diatur dalam **Pasal 1338 Kitab Undang-Undang Hukum Perdata (KUHPerdata)** dan memenuhi syarat sah perjanjian sebagaimana diatur dalam **Pasal 1320 KUHPerdata**, dengan syarat dan ketentuan sebagai berikut:

---

## Pasal 1 — Sifat Hubungan

1. Perjanjian ini merupakan **kontrak kerja lepas (freelance)** yang bersifat hubungan kemitraan bisnis antara dua pihak independen, **bukan hubungan kerja** sebagaimana dimaksud dalam Undang-Undang Nomor 6 Tahun 2023 tentang Cipta Kerja jo. Peraturan Pemerintah Nomor 35 Tahun 2021.
2. FREELANCER bertindak sebagai pekerja lepas independen, mengatur sendiri waktu kerja, tempat kerja, dan metode pelaksanaan pekerjaan.
3. KLIEN tidak memiliki kewajiban untuk membayar BPJS Ketenagakerjaan, BPJS Kesehatan, Tunjangan Hari Raya (THR), pesangon, atau benefit ketenagakerjaan lainnya kepada FREELANCER.
4. FREELANCER bertanggung jawab atas perpajakan pribadinya (PPh 21 final atau PPh 25 sesuai status NPWP).

## Pasal 2 — Lingkup Pekerjaan

FREELANCER bersedia mengerjakan proyek berjudul **"{{project_name}}"** untuk KLIEN dengan lingkup sebagai berikut:

{{scope_description}}

Deliverable yang menjadi keluaran Perjanjian ini meliputi:

{{deliverable_list}}

Pekerjaan di luar lingkup di atas dianggap pekerjaan tambahan ("**Scope Creep**") dan ditagihkan terpisah dengan harga yang disepakati ulang secara tertulis.

## Pasal 3 — Tarif dan Pembayaran

1. Tarif pekerjaan disepakati sebagai berikut: **{{rate_type}}** dengan nilai **{{rate_amount_words}} ({{rate_amount_numeric}})**.
2. Estimasi total pekerjaan adalah **{{total_estimated_words}} ({{total_estimated_numeric}})**. Estimasi ini bersifat indikatif dan dapat berubah berdasarkan realisasi jam kerja atau perubahan lingkup yang disepakati tertulis.
3. Jadwal pembayaran: {{payment_schedule}}.
4. Pembayaran dilakukan via transfer bank ke rekening yang ditunjuk oleh FREELANCER. Bukti transfer dikirim ke email {{freelancer_email}}.
5. Keterlambatan pembayaran lebih dari 14 (empat belas) hari kalender memberikan hak kepada FREELANCER untuk menangguhkan pekerjaan tanpa pelanggaran Perjanjian.

## Pasal 4 — Jangka Waktu

Perjanjian ini berlaku mulai **{{project_start_date}}** sampai dengan **{{project_end_date_or_milestone}}**. Perjanjian dapat diperpanjang berdasarkan kesepakatan tertulis Para Pihak. Tidak ada masa kerja minimum — Pihak manapun dapat mengakhiri Perjanjian sesuai mekanisme dalam Pasal 8.

## Pasal 5 — Revisi

1. Fee yang disepakati dalam Pasal 3 sudah termasuk **{{revision_round_count}}** ronde revisi atas setiap deliverable.
2. Revisi tambahan di luar jumlah tersebut dikenakan biaya **{{extra_revision_rate}}**, ditagihkan terpisah.
3. Revisi yang disebabkan oleh kesalahan FREELANCER (mis. salah memahami brief tertulis) tidak dihitung sebagai ronde revisi.

## Pasal 6 — Hak Kekayaan Intelektual

{{ip_default_clause}}

FREELANCER berhak menggunakan hasil pekerjaan (deliverable yang sudah dibayar lunas) sebagai bagian dari portofolio pribadi untuk tujuan promosi, kecuali ditentukan lain secara tertulis dengan klausul Non-Disclosure terpisah.

## Pasal 7 — Kerahasiaan

1. Para Pihak sepakat menjaga kerahasiaan informasi non-publik yang diperoleh selama pelaksanaan Perjanjian, baik selama berlangsungnya Perjanjian maupun selama **2 (dua) tahun** setelah berakhirnya Perjanjian.
2. Kewajiban kerahasiaan tidak berlaku untuk informasi yang: (a) sudah menjadi pengetahuan umum bukan karena pelanggaran Perjanjian; (b) diperoleh secara sah dari pihak ketiga; (c) wajib diungkapkan berdasarkan peraturan perundang-undangan atau perintah pengadilan.

## Pasal 8 — Pengakhiran

1. Pihak manapun dapat mengakhiri Perjanjian sebelum tanggal berakhir dengan pemberitahuan tertulis paling lambat **7 (tujuh) hari kalender** sebelum tanggal pengakhiran yang diinginkan.
2. Apabila Perjanjian diakhiri sebelum selesai, KLIEN tetap wajib membayar fee atas pekerjaan yang sudah diselesaikan sampai tanggal pengakhiran, dihitung secara proporsional berdasarkan deliverable atau jam kerja yang sudah terealisasi.
3. Para Pihak sepakat mengesampingkan berlakunya **Pasal 1266 dan 1267 KUHPerdata** sepanjang berkaitan dengan keharusan adanya putusan pengadilan untuk mengakhiri Perjanjian ini.

## Pasal 9 — Keadaan Kahar (Force Majeure)

1. Tidak ada Pihak yang bertanggung jawab atas keterlambatan atau kegagalan pelaksanaan kewajiban yang disebabkan oleh keadaan kahar, termasuk namun tidak terbatas pada {{force_majeure_examples_id}}.
2. Pihak yang mengalami keadaan kahar wajib memberitahukan Pihak lainnya paling lambat 5 (lima) hari kalender sejak terjadinya keadaan tersebut.
3. Apabila keadaan kahar berlangsung lebih dari 30 (tiga puluh) hari kalender, Para Pihak dapat sepakat untuk mengakhiri atau merevisi Perjanjian.

## Pasal 10 — Penyelesaian Sengketa

1. Setiap perselisihan yang timbul akan diselesaikan secara musyawarah untuk mufakat dalam waktu 30 (tiga puluh) hari kalender.
2. Apabila musyawarah tidak mencapai mufakat, Para Pihak sepakat untuk menyelesaikan perselisihan melalui **Pengadilan Negeri {{dispute_forum_city}}**, dengan tetap menjaga kerahasiaan informasi yang diperoleh selama Perjanjian.

## Pasal 11 — Hukum yang Berlaku

Perjanjian ini tunduk pada dan ditafsirkan berdasarkan hukum negara Republik Indonesia, terutama Buku III KUHPerdata tentang Perikatan.

## Pasal 12 — Ketentuan Lain

1. Setiap perubahan atas Perjanjian ini hanya sah apabila dibuat secara tertulis dan ditandatangani oleh Para Pihak dalam bentuk addendum.
2. Apabila terdapat ketentuan dalam Perjanjian ini yang dinyatakan tidak sah oleh putusan pengadilan, ketentuan tersebut tidak akan mempengaruhi keabsahan ketentuan lainnya.
3. Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai cukup Rp 10.000 sesuai UU Bea Materai Nomor 10 Tahun 2020, dan memiliki kekuatan hukum yang sama.

---

Demikian Perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani serta tanpa adanya paksaan dari pihak manapun.

| **FREELANCER** | **KLIEN** |
| --- | --- |
| {{freelancer_name}} | {{client_name}} |
| `[Materai Rp 10.000]` | `[Materai Rp 10.000]` |
| <br><br><br> | <br><br><br> |
| **{{freelancer_name}}** | **{{client_representative_name}}** |
| Freelancer | {{client_representative_title}} |
| NIK: {{freelancer_nik}} | {{client_npwp_or_nik}} |

---

> **REMINDER — DRAFT REVIEW WAJIB.** Template ini berbasis konvensi umum kontrak freelance di Indonesia (KUHPerdata Pasal 1320 syarat sah perjanjian + Pasal 1338 asas kebebasan berkontrak), namun **TIDAK menggantikan review profesional**. Untuk proyek bernilai tinggi (>Rp 50jt), durasi panjang (>6 bulan), atau hubungan rekuren dengan klien yang sama, perlu evaluasi apakah hubungan ini masuk kategori PKWT sesuai UU Cipta Kerja Nomor 6 Tahun 2023. Klausul HKI, kerahasiaan, dan force majeure perlu disesuaikan per industri.

## Tone guide

Register **legal-formal Bahasa Indonesia**. Pakai kata baku KUHPerdata (Perjanjian, Para Pihak, FREELANCER, KLIEN, wanprestasi, keadaan kahar). Penomoran pasal dan ayat konsisten (Pasal 1, ayat (1), huruf a). Identifikasi pihak kapital sepanjang dokumen. Pakai bahasa terikat ("wajib", "berhak", "tidak diperkenankan") — hindari frasa lentur ("sebaiknya", "diharapkan"). Format Rupiah: `Rp 300.000,-/jam` (titik ribuan, koma desimal, akhiri dengan tanda hubung setelah koma). Tanggal format Indonesia (`22 Mei 2026`). Tidak ada tanda seru. Tidak ada emoji. Tidak ada kontraksi. Tidak ada bahasa gaul.

> _Catatan customer: untuk proyek besar atau klien korporat besar, banyak yang ngirim template kontraknya sendiri — sebaiknya review klausul HKI, non-compete, dan termination clause dengan teliti sebelum tanda tangan. Klausul "work for hire" atau "all rights transferred" perlu konfirmasi tertulis bahwa hak portfolio masih dipertahankan freelancer._
