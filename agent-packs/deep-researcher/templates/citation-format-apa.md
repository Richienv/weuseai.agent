# Template — Citation Format APA (7th edition)

Format citation APA 7 dengan contoh per tipe sumber dan catatan konvensi Indonesia. Reference yang dipakai `citation-builder` saat customer minta format APA.
Audience: customer akademik (skripsi, thesis, jurnal), customer di lembaga riset, atau yang submit ke publikasi yang require APA.
Pakai sebagai pegangan saat menyusun daftar pustaka APA — bukan template yang diisi langsung, tapi contoh format yang Deep Researcher rujuk.

## Variables

- `{{report_title}}` — string. Judul laporan yang menggunakan citation ini.
- `{{author_last_name}}` — string. Nama belakang penulis untuk in-text citation example.
- `{{publication_year}}` — string. Tahun publikasi untuk in-text citation example.
- `{{page_reference}}` — string. Halaman atau lokasi untuk in-text citation example (mis. "hlm. 23" atau "para. 4").

## Template

---
template: citation-format-apa
language: id
register: kamu
purpose: APA 7 reference format with Indonesian convention notes
---

# Citation Format — APA 7

> Format APA edisi ke-7 (2020), dengan catatan konvensi Indonesia di akhir. Daftar pustaka diurutkan alfabetis berdasarkan nama belakang penulis pertama.

---

## In-text citation

Format parenthetical: (Nama Belakang, Tahun, hlm. X)

Contoh: ({{author_last_name}}, {{publication_year}}, {{page_reference}})

Format narrative: Nama Belakang (Tahun) menulis bahwa ...

Contoh: {{author_last_name}} ({{publication_year}}) menulis bahwa ...

Dua penulis: (Suryanto & Wijaya, 2024)
Tiga atau lebih: (Suryanto et al., 2024)
Lembaga: (Bank Indonesia, 2025) — disingkat (BI, 2025) di citation berikutnya kalau singkatannya umum.

---

## Reference list — contoh per tipe sumber

### Jurnal akademik (dengan DOI)

Nasution, R., & Pratama, A. (2024). Adopsi fintech UMKM di Indonesia: bukti dari survei lintas provinsi. *Jurnal Ekonomi Indonesia*, *73*(2), 145-168. https://doi.org/10.21002/jei.v73i2.1234

### Jurnal akademik (tanpa DOI, dengan URL)

Wijayanti, S. (2023). Literasi keuangan digital di kalangan mahasiswa: studi kasus Jakarta dan Surabaya. *Jurnal Manajemen dan Bisnis*, *18*(4), 22-41. https://jurnal.example.ac.id/jmb/article/view/567

### Buku

Sumarwan, U. (2022). *Perilaku konsumen: teori dan penerapannya dalam pemasaran* (Edisi ke-5). Ghalia Indonesia.

### Bab dalam buku terjemahan

Kahneman, D. (2013). Berpikir cepat dan lambat (Z. Lestari, Penerj.). Gramedia Pustaka Utama. (Karya asli diterbitkan 2011)

### Laporan lembaga / pemerintah

Bank Indonesia. (2025). *Statistik Sistem Pembayaran dan Infrastruktur Pasar Keuangan Indonesia: Triwulan IV 2024*. https://www.bi.go.id/id/publikasi/statistik/pembayaran/Pages/SPIP-202412.aspx

Otoritas Jasa Keuangan. (2024). *Statistik Perbankan Indonesia: Desember 2024* (Vol. 22, No. 13). OJK. https://www.ojk.go.id/id/kanal/perbankan/data-dan-statistik/statistik-perbankan-indonesia/Default.aspx

### Website / halaman online (dengan penulis)

Setiawan, B. (2024, 12 Maret). Mengapa adopsi QRIS lebih cepat dari ekspektasi. *KataData*. https://katadata.co.id/analisis/2024/03/12/adopsi-qris

### Website / halaman online (tanpa penulis)

Statistik penggunaan internet di Indonesia. (2025, 15 Januari). *Asosiasi Penyelenggara Jasa Internet Indonesia*. https://apjii.or.id/statistik/2025

### Berita media

Hidayat, F. (2024, 20 November). Bank sentral pertahankan suku bunga acuan di level 6%. *Kompas*. https://kompas.id/baca/ekonomi/2024/11/20/suku-bunga-acuan

### Wawancara (komunikasi pribadi)

Wawancara pribadi tidak masuk daftar pustaka, hanya in-text. Format: (R. Hartono, komunikasi pribadi, 15 Februari 2026)

### Working paper / preprint

Anggraini, M. (2025). *Dampak digital banking terhadap inklusi keuangan pedesaan* (Working Paper No. 2025-03). LPEM FEB UI. https://www.lpem.org/wp/dampak-digital-banking-2025

### Tesis / skripsi (publikasi terbatas)

Putri, A. R. (2023). *Faktor adopsi mobile banking pada generasi Z di Jakarta* [Skripsi sarjana, Universitas Indonesia]. Repositori UI. https://repository.ui.ac.id/handle/123/4567

### Tesis / skripsi (database publik)

Santoso, D. (2024). *Risk management practices in Indonesian Islamic banking* [Disertasi doktoral, Institut Teknologi Bandung]. ProQuest Dissertations and Theses Global.

### Dataset

Badan Pusat Statistik. (2024). *Statistik Indonesia 2024* [Dataset]. BPS. https://www.bps.go.id/publication/2024/02/28/statistik-indonesia-2024

### Podcast / episode

Widyastuti, R. (Host). (2024, 5 Mei). Ekonomi makro Indonesia 2024 (No. 47) [Episode podcast audio]. Dalam *Bicara Ekonomi*. https://anchor.fm/bicara-ekonomi/episode-47

### Konferensi presentasi

Pratiwi, L. (2024, 10-12 Oktober). *Tantangan implementasi central bank digital currency di emerging market* [Presentasi konferensi]. Konferensi Tahunan Ekonomi Indonesia, Jakarta, Indonesia.

---

## Konvensi Indonesia — catatan

- **Nama Indonesia tanpa nama keluarga**: untuk penulis Indonesia yang hanya pakai satu nama (mis. "Soekarno"), tulis utuh tanpa inisial. Untuk nama dengan dua kata yang tidak punya struktur first-last yang jelas, ikut nama yang tertulis di publikasi.
- **Gelar akademik**: dihilangkan dari citation. "Prof. Dr. Sumarwan, M.Sc." ditulis "Sumarwan, U."
- **Penerbit Indonesia**: ditulis lengkap, bukan disingkat. "Gramedia Pustaka Utama", bukan "GPU".
- **Lembaga sebagai penulis**: ditulis lengkap dalam citation pertama, boleh disingkat di citation berikutnya. "Bank Indonesia" → "(BI, 2025)" cukup setelah perkenalan singkatan.
- **Bulan dalam Bahasa Indonesia**: tanggal akses dan tanggal publikasi pakai Bahasa Indonesia (Januari, Februari, dst.), bukan English.
- **Italic untuk judul**: judul jurnal, buku, dan laporan diketik miring (italic). Judul artikel atau bab tidak miring.
- **Hanging indent**: tiap entry daftar pustaka pakai hanging indent — baris pertama rata kiri, baris berikutnya menjorok ~1.27cm (default APA).
- **Spasi**: APA 7 default double-spaced; untuk konteks Indonesia (skripsi pakai 1.5 spasi), ikut ketentuan kampus masing-masing.

---

## Aturan kerja

- Field yang tidak diketahui tidak ditebak. Kalau tahun publikasi tidak tersedia, tulis "(t.t.)" — tanpa tahun.
- URL wajib lengkap, tidak dipotong, tidak disembunyikan di balik shortener.
- DOI lebih disandari dari URL kalau keduanya tersedia.
- Tanggal akses dicantumkan hanya untuk source yang konten-nya bisa berubah (website news, blog post, dataset live). Untuk PDF resmi atau jurnal dengan DOI, tanggal akses tidak perlu.
- Source bahasa Indonesia tidak diterjemahkan judulnya. Source bahasa selain Indonesia atau Inggris boleh diberi terjemahan dalam kurung siku setelah judul asli, contoh: *Le commerce numérique en Asie* [Perdagangan digital di Asia].

## Tone guide

Format APA ini bukan content yang diisi customer — ini reference yang Deep Researcher rujuk saat menyusun daftar pustaka. Tetap pakai Bahasa Indonesia di penjelasan, tapi entry citation ikut kaidah APA 7 yang internasional. Konsistensi adalah segalanya: kalau satu entry pakai "Bank Indonesia", semua entry dari lembaga sama juga harus pakai bentuk yang sama. Tidak ada singkatan tanpa diperkenalkan dulu.
