# Template — Citation Format Chicago (Notes-Bibliography, 17th edition)

Format citation Chicago Notes-Bibliography style — pakai footnote + daftar pustaka. Reference yang dipakai `citation-builder` saat customer minta format Chicago.
Audience: customer humaniora, sejarah, hukum, atau institusi yang require Chicago style. Juga common di publikasi yang prefer narasi mengalir tanpa parenthetical citation memotong teks.
Pakai sebagai pegangan saat menyusun footnote + bibliography Chicago — bukan template yang diisi langsung, tapi contoh format yang Deep Researcher rujuk.

## Variables

- `{{report_title}}` — string. Judul laporan yang menggunakan citation ini.
- `{{author_name_full}}` — string. Nama lengkap penulis untuk contoh footnote pertama.
- `{{author_name_inverted}}` — string. Nama dibalik (Belakang, Depan) untuk contoh bibliography.

## Template

---
template: citation-format-chicago
language: id
register: kamu
purpose: Chicago notes-bibliography 17th ed reference format
---

# Citation Format — Chicago Notes-Bibliography

> Format Chicago Manual of Style edisi ke-17, gaya Notes-Bibliography (NB). Footnote di tiap halaman, bibliography di akhir dokumen. Bukan gaya Author-Date (AD) — kalau customer minta AD, format-nya berbeda dan butuh template terpisah.

---

## Anatomi Notes-Bibliography

Tiga elemen wajib:

1. **Footnote pertama (full note)** — citation lengkap saat sumber pertama kali dirujuk.
2. **Footnote berikutnya (short note)** — bentuk pendek setelah full note pernah muncul.
3. **Bibliography entry** — daftar pustaka di akhir dokumen, alfabetis berdasarkan nama belakang penulis.

Format full note dan bibliography mirip tapi punya perbedaan kunci:
- Full note: nama urutan normal (Depan Belakang), elemen dipisah koma, halaman spesifik di akhir.
- Bibliography: nama dibalik (Belakang, Depan), elemen dipisah titik, rentang halaman lengkap (untuk artikel jurnal).

---

## Contoh per tipe sumber

### Buku

**Full note:**
1. Ulil Abshar Sumarwan, *Perilaku Konsumen: Teori dan Penerapannya dalam Pemasaran*, edisi ke-5 (Jakarta: Ghalia Indonesia, 2022), 145.

**Short note:**
2. Sumarwan, *Perilaku Konsumen*, 167.

**Bibliography:**
Sumarwan, Ulil Abshar. *Perilaku Konsumen: Teori dan Penerapannya dalam Pemasaran*. Edisi ke-5. Jakarta: Ghalia Indonesia, 2022.

### Buku terjemahan

**Full note:**
3. Daniel Kahneman, *Berpikir Cepat dan Lambat*, terj. Zia Lestari (Jakarta: Gramedia Pustaka Utama, 2013), 89.

**Bibliography:**
Kahneman, Daniel. *Berpikir Cepat dan Lambat*. Diterjemahkan oleh Zia Lestari. Jakarta: Gramedia Pustaka Utama, 2013.

### Bab dalam buku editan

**Full note:**
4. Rini Nasution, "Adopsi Fintech UMKM di Pulau Jawa," dalam *Transformasi Digital Ekonomi Indonesia*, ed. Adi Pratama dan Sari Wijayanti (Yogyakarta: UGM Press, 2023), 78-92.

**Bibliography:**
Nasution, Rini. "Adopsi Fintech UMKM di Pulau Jawa." Dalam *Transformasi Digital Ekonomi Indonesia*, diedit oleh Adi Pratama dan Sari Wijayanti, 78-92. Yogyakarta: UGM Press, 2023.

### Artikel jurnal akademik (dengan DOI)

**Full note:**
5. Rini Nasution dan Adi Pratama, "Adopsi Fintech UMKM di Indonesia: Bukti dari Survei Lintas Provinsi," *Jurnal Ekonomi Indonesia* 73, no. 2 (2024): 152, https://doi.org/10.21002/jei.v73i2.1234.

**Short note:**
6. Nasution dan Pratama, "Adopsi Fintech UMKM," 156.

**Bibliography:**
Nasution, Rini, dan Adi Pratama. "Adopsi Fintech UMKM di Indonesia: Bukti dari Survei Lintas Provinsi." *Jurnal Ekonomi Indonesia* 73, no. 2 (2024): 145-168. https://doi.org/10.21002/jei.v73i2.1234.

### Laporan lembaga / pemerintah

**Full note:**
7. Bank Indonesia, *Statistik Sistem Pembayaran dan Infrastruktur Pasar Keuangan Indonesia: Triwulan IV 2024* (Jakarta: Bank Indonesia, 2025), 23, https://www.bi.go.id/id/publikasi/statistik/pembayaran/Pages/SPIP-202412.aspx.

**Bibliography:**
Bank Indonesia. *Statistik Sistem Pembayaran dan Infrastruktur Pasar Keuangan Indonesia: Triwulan IV 2024*. Jakarta: Bank Indonesia, 2025. https://www.bi.go.id/id/publikasi/statistik/pembayaran/Pages/SPIP-202412.aspx.

### Website / halaman online

**Full note:**
8. Budi Setiawan, "Mengapa Adopsi QRIS Lebih Cepat dari Ekspektasi," KataData, 12 Maret 2024, https://katadata.co.id/analisis/2024/03/12/adopsi-qris.

**Bibliography:**
Setiawan, Budi. "Mengapa Adopsi QRIS Lebih Cepat dari Ekspektasi." KataData, 12 Maret 2024. https://katadata.co.id/analisis/2024/03/12/adopsi-qris.

### Berita media

**Full note:**
9. Fahmi Hidayat, "Bank Sentral Pertahankan Suku Bunga Acuan di Level 6%," *Kompas*, 20 November 2024, https://kompas.id/baca/ekonomi/2024/11/20/suku-bunga-acuan.

**Bibliography:**
Hidayat, Fahmi. "Bank Sentral Pertahankan Suku Bunga Acuan di Level 6%." *Kompas*, 20 November 2024. https://kompas.id/baca/ekonomi/2024/11/20/suku-bunga-acuan.

### Wawancara

**Full note:**
10. Reza Hartono, wawancara dengan penulis, Jakarta, 15 Februari 2026.

Wawancara tidak masuk bibliography kecuali sudah dipublikasi atau diarsipkan di repositori publik.

### Tesis / disertasi

**Full note:**
11. Aulia Rizki Putri, "Faktor Adopsi Mobile Banking pada Generasi Z di Jakarta" (skripsi sarjana, Universitas Indonesia, 2023), 45, https://repository.ui.ac.id/handle/123/4567.

**Bibliography:**
Putri, Aulia Rizki. "Faktor Adopsi Mobile Banking pada Generasi Z di Jakarta." Skripsi sarjana, Universitas Indonesia, 2023. https://repository.ui.ac.id/handle/123/4567.

### Working paper

**Full note:**
12. Maria Anggraini, *Dampak Digital Banking terhadap Inklusi Keuangan Pedesaan*, Working Paper No. 2025-03 (Jakarta: LPEM FEB UI, 2025), 12, https://www.lpem.org/wp/dampak-digital-banking-2025.

**Bibliography:**
Anggraini, Maria. *Dampak Digital Banking terhadap Inklusi Keuangan Pedesaan*. Working Paper No. 2025-03. Jakarta: LPEM FEB UI, 2025. https://www.lpem.org/wp/dampak-digital-banking-2025.

### Dataset

**Full note:**
13. Badan Pusat Statistik, *Statistik Indonesia 2024*, dataset, BPS, 2024, https://www.bps.go.id/publication/2024/02/28/statistik-indonesia-2024.

**Bibliography:**
Badan Pusat Statistik. *Statistik Indonesia 2024*. Dataset. BPS, 2024. https://www.bps.go.id/publication/2024/02/28/statistik-indonesia-2024.

---

## Aturan short note

Setelah full note muncul sekali, citation berikutnya pakai bentuk pendek: **nama belakang, judul disingkat, halaman**.

- Nama belakang penulis pertama saja.
- Judul disingkat — kata-kata kunci, biasanya 4 kata atau kurang.
- Halaman spesifik.

Contoh: Sumarwan, *Perilaku Konsumen*, 167.

Kalau citation berurutan langsung dari sumber sama dengan halaman sama, sebagian penerbit izinkan "Ibid." — tapi Chicago 17 sudah tidak menganjurkan. Pakai short note konsisten.

---

## Konvensi Indonesia — catatan

- **Nama dengan satu kata**: di bibliography, tulis utuh tanpa pembalikan. Contoh: "Soekarno. *Indonesia Menggugat*. ..."
- **Gelar akademik**: dihilangkan. "Prof. Dr. Sumarwan, M.Sc." jadi "Sumarwan, Ulil Abshar" (kalau nama lengkapnya tersedia).
- **Penerbit Indonesia**: ditulis lengkap. "Gramedia Pustaka Utama", bukan "GPU".
- **Kota penerbit**: untuk penerbit Indonesia, sebut kotanya (Jakarta, Yogyakarta, Bandung). Konsisten — jangan kadang sebut kadang tidak.
- **Bulan**: pakai Bahasa Indonesia di entry yang sumbernya Indonesia. Untuk source Inggris, ikut Bahasa Inggris.
- **Italic untuk judul**: judul buku, jurnal, laporan, dan dataset diketik miring. Judul artikel atau bab dikutip dengan tanda kutip ganda, tidak miring.
- **Hanging indent**: bibliography pakai hanging indent. Baris pertama rata kiri, baris berikutnya menjorok ~1.27cm.
- **Footnote vs endnote**: Chicago izinkan keduanya. Default di publikasi akademik Indonesia adalah footnote per halaman. Ikut ketentuan publikasi.

---

## Aturan kerja

- Field yang tidak diketahui tidak ditebak. Kalau tahun publikasi tidak tersedia, tulis "n.d." (no date).
- URL wajib lengkap. Tanggal akses dicantumkan hanya untuk source yang konten-nya bisa berubah — Chicago 17 izinkan tidak menyebut tanggal akses untuk publikasi resmi.
- DOI lebih disandari dari URL kalau keduanya tersedia.
- Source bahasa Indonesia tidak diterjemahkan judulnya di citation. Source bahasa lain boleh diberi terjemahan dalam kurung siku setelah judul asli.
- Wawancara tidak terpublikasi hanya masuk footnote, tidak masuk bibliography.

## Tone guide

Format Chicago Notes-Bibliography lebih bertele-tele dari APA tapi lebih ramah untuk narasi sejarah dan humaniora — pembaca tidak terganggu parenthetical citation di tengah kalimat. Konsistensi adalah segalanya: kalau full note pertama pakai format tertentu (mis. tanda titik koma sebelum URL), semua entry sejenis juga harus konsisten. Short note tidak boleh muncul sebelum full note pertama untuk sumber yang sama. Bibliography di akhir wajib lengkap — kalau ada source yang hanya di footnote tanpa masuk bibliography, itu inkonsisten Chicago kecuali memang wawancara/komunikasi pribadi.
