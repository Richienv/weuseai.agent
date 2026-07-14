# Template — Daftar Sumber Berita Bisnis Indonesia

Daftar sumber berita bisnis Indonesia yang sudah dikurasi untuk riset korporasi, regulator, dan pasar modal. Bukan daftar generik global. Setiap sumber dipetakan ke cakupan editorial, kedalaman riset, status paywall, kedalaman arsip, dan gaya kutipan.
Audience: analyst yang mau scan landscape IDX, founder yang riset incumbent, atau peneliti yang siapkan brief sebelum playbook `market-research` dijalankan.
Pakai sebagai first-stop sumber sebelum web search lebih luas. Sumber lokal didahulukan karena reporting bisnis Indonesia jarang ter-mirror lengkap di outlet asing.

## Variables

- `{{research_topic}}` — string. Topik yang sedang diriset (mis. "IPO startup digital di IDX 2024-2026", "konsolidasi bank umum digital").
- `{{date_window}}` — string. Periode artikel yang relevan (mis. "Q1 2025 - sekarang").
- `{{access_constraints}}` — string. Akses paywall yang tersedia ke customer (mis. "berlangganan Kontan + Bisnis Indonesia, tanpa DealStreetAsia").
- `{{citation_style}}` — string. Gaya kutipan yang dipakai (mis. "footnote-numbered", "APA 7 Indonesia").
- `{{source_priority_rationale}}` — string. Alasan kenapa subset sumber tertentu didahulukan untuk topik ini.

## Template

---
template: source-list-id-business-news
language: id
register: kamu
purpose: source-list bisnis Indonesia
---

# Daftar Sumber — Berita Bisnis Indonesia

**Topik riset:** {{research_topic}}
**Window tanggal:** {{date_window}}
**Constraint akses:** {{access_constraints}}
**Gaya kutipan:** {{citation_style}}

> Daftar ini adalah first-stop, bukan daftar tertutup. Sumber tambahan boleh masuk setelah graded oleh `source-evaluator`. Sumber asing (Reuters, FT, Nikkei Asia) dipakai sebagai cross-check, bukan sumber primer untuk peristiwa domestik.

---

## 1. Kontan.co.id

- **Penerbit:** PT Grahanusa Mediatama (Kompas Gramedia Group)
- **Cakupan editorial:** Korporasi listed IDX, pasar modal, perbankan, reksa dana, manajemen investasi, industri otomotif. Reporter desk pasar modal punya akses langsung ke RUPS, paparan publik, dan corporate action announcement.
- **Kedalaman:** Reporting daily + rubrik analisis (Kontan Investasi, Industri Kita). Edisi cetak mingguan Tabloid Kontan punya in-depth lebih panjang dari versi online.
- **Paywall:** Sebagian besar artikel free. Edisi premium (Kontan Investasi) di belakang langganan.
- **Arsip:** Online sejak 2008, search engine internal lemah — kombinasi `site:kontan.co.id` di Google lebih efektif.
- **Gaya kutipan:** "Kontan, [tanggal]" untuk daily. "Tabloid Kontan, [edisi]" untuk weekly.
- **Catatan riset:** First-stop untuk corporate action emiten IDX. Cek silang dengan disclosure resmi di IDX (idx.co.id).

## 2. Bisnis Indonesia / Bisnis.com

- **Penerbit:** PT Jurnalindo Aksara Grafika
- **Cakupan editorial:** Bisnis Indonesia daily (cetak) + Bisnis.com (online) cover korporasi, makro, sektor energi, properti, finansial, market. Reporter sektor energi + tambang dianggap senior di Jakarta.
- **Kedalaman:** Daily news + analisis sektoral mingguan. Bisnis Indonesia Riset (BIRD) menerbitkan riset sektor berbayar yang sering dirujuk oleh analyst sekuritas.
- **Paywall:** Bisnis.com Premium di belakang langganan; daily tetap free.
- **Arsip:** Cetak sejak 1985, digital lengkap dari 2010-an. Arsip cetak via Perpustakaan Nasional + langganan institusional.
- **Gaya kutipan:** "Bisnis Indonesia, [tanggal], halaman X" untuk cetak. "Bisnis.com, [tanggal]" untuk online.
- **Catatan riset:** Andalan untuk reporting sektor energi, properti, dan kebijakan ekonomi. Cek penulis — beberapa reporter senior konsisten lebih dalam dari junior.

## 3. Kompas Bisnis / Kompas.id

- **Penerbit:** PT Kompas Media Nusantara (Kompas Gramedia Group)
- **Cakupan editorial:** Kanal Bisnis dari Kompas — fokus makro, kebijakan fiskal, BUMN, pasar modal level overview. Bukan reporting korporasi mendalam, lebih ke editorial + opini ekonom.
- **Kedalaman:** Reporting daily + analisis mingguan (Kompas Minggu). Kolom ekonom rutin (mis. Faisal Basri arsip, Chatib Basri, Sri Mulyani interviews).
- **Paywall:** Kompas.id berbayar penuh sejak 2019. Tanpa langganan tidak bisa baca lengkap.
- **Arsip:** Sejak 1965 di cetak. Digital lengkap dari 2008. Arsip cetak yang lengkap hanya via langganan Kompas.id atau Perpustakaan Nasional.
- **Gaya kutipan:** "Kompas, [tanggal], halaman X" untuk cetak; "Kompas.id, [tanggal]" untuk digital.
- **Catatan riset:** Pakai untuk kontekstualisasi kebijakan makro + opini pakar. Bukan first-stop untuk corporate action.

## 4. Tempo Bisnis / Tempo.co

- **Penerbit:** PT Tempo Inti Media Tbk (TMPO di IDX)
- **Cakupan editorial:** Investigative reporting yang lebih kuat dari outlet bisnis lain. Liputan kasus korupsi BUMN, isu lingkungan industri tambang, dan konflik kepentingan regulator.
- **Kedalaman:** Majalah Tempo mingguan punya in-depth investigative feature. Tempo.co daily lebih ringan.
- **Paywall:** Tempo.co Premium berbayar. Majalah Tempo cetak + digital berlangganan terpisah.
- **Arsip:** Sejak 1971, sempat dibredel dan terbit lagi 1998. Arsip lengkap via langganan Tempo Digital.
- **Gaya kutipan:** "Majalah Tempo, [edisi]" untuk weekly investigative; "Tempo.co, [tanggal]" untuk daily.
- **Catatan riset:** Pakai untuk konteks reputasi + investigative trail. Cross-check dengan source primer (laporan KPK, putusan pengadilan).

## 5. Katadata.co.id

- **Penerbit:** Katadata Indonesia
- **Cakupan editorial:** Bisnis digital, ekonomi data-driven, sektor digital (e-commerce, fintech, edtech), green economy, climate finance. Katadata Insight Center publish riset rutin.
- **Kedalaman:** Reporting daily + databoks (visualisasi data) + riset sektoral. Survei Katadata sering dirujuk untuk consumer behavior digital.
- **Paywall:** Sebagian besar free. Riset KIC premium berbayar.
- **Arsip:** Sejak 2012, search internal cukup baik.
- **Gaya kutipan:** "Katadata, [tanggal]" untuk artikel; "Databoks Katadata, [tanggal]" untuk visualisasi data.
- **Catatan riset:** First-stop untuk topik ekonomi digital + data ekonomi yang sudah dikemas. Cek metodologi survei KIC sebelum dikutip — sample size + metode kadang tidak diuraikan lengkap di artikel.

## 6. DDTC News

- **Penerbit:** Danny Darussalam Tax Center
- **Cakupan editorial:** Perpajakan + regulasi fiskal Indonesia. Coverage UU Pajak, Peraturan Menteri Keuangan, Peraturan Direktorat Jenderal Pajak, putusan Pengadilan Pajak.
- **Kedalaman:** Daily news + analisis regulasi + working paper akademik via DDTC Fiscal Research. Beberapa research paper di-cite oleh akademisi pajak.
- **Paywall:** News free; jurnal + working paper berbayar atau by request.
- **Arsip:** Sejak 2014, search internal kuat, terorganisir per kategori regulasi.
- **Gaya kutipan:** "DDTCNews, [tanggal]" untuk artikel; "DDTC Fiscal Research, [judul WP], [tahun]" untuk working paper.
- **Catatan riset:** Wajib untuk riset perpajakan + fiscal policy. Lebih mendalam daripada kanal pajak di outlet umum.

## 7. DealStreetAsia (Indonesia bureau)

- **Penerbit:** DealStreetAsia (Nikkei Group)
- **Cakupan editorial:** Funding rounds, M&A, VC/PE activity, IPO startup Indonesia. Reporter Jakarta + Singapore cover regional Asia Tenggara.
- **Kedalaman:** Reporting + DATA VANTAGE (database deal berbayar). Quarterly report "SE Asia Deal Review" sering dirujuk untuk landscape funding.
- **Paywall:** Sebagian besar artikel berbayar (DealStreetAsia Pro). Tanpa langganan hanya 3-4 paragraf pertama.
- **Arsip:** Sejak 2014, search internal terbatas — kombinasikan dengan Google site search.
- **Gaya kutipan:** "DealStreetAsia, [tanggal]" untuk artikel; "DealStreetAsia DATA VANTAGE, [report title], [tahun]" untuk database report.
- **Catatan riset:** First-stop untuk angka funding startup Indonesia. Cek silang dengan press release startup + Crunchbase + announcement BKPM kalau ada PMA.

## 8. Bareksa

- **Penerbit:** PT Bareksa Portal Investasi
- **Cakupan editorial:** Reksa dana, obligasi ritel, SBN ritel, asset management. Berita seputar fund manager + kinerja produk reksa dana.
- **Kedalaman:** Daily news + data NAB harian + komparasi fund + ulasan produk SBN. Bareksa juga marketplace reksa dana, jadi sebagian content punya commercial layer — wajib disebut saat dikutip.
- **Paywall:** Free untuk artikel; data komparasi reksa dana free untuk user terdaftar.
- **Arsip:** Sejak 2013.
- **Gaya kutipan:** "Bareksa, [tanggal]" — sebut "Bareksa juga marketplace reksa dana" kalau topik soal produk yang mereka jual.
- **Catatan riset:** Pakai untuk data kinerja fund + edukasi pasar SBN. Untuk angka resmi, silang dengan statistik OJK reksa dana.

---

## Source priority rationale

{{source_priority_rationale}}

## Cross-check matrix

| Klaim tipe | Source primer | Cross-check minimal |
|---|---|---|
| Corporate action emiten IDX | Disclosure IDX (idx.co.id) | Kontan + Bisnis Indonesia |
| Funding round startup | Press release perusahaan | DealStreetAsia + Crunchbase |
| Kebijakan fiskal / pajak | Peraturan Menteri Keuangan (jdih.kemenkeu.go.id) | DDTC News + Kompas Bisnis |
| Data ekonomi digital | BPS / asosiasi sektor | Katadata Databoks + Bisnis Indonesia |
| Investigasi korupsi BUMN | Putusan pengadilan + rilis KPK | Majalah Tempo |
| Kinerja reksa dana | Statistik OJK reksa dana | Bareksa + Infovesta |

---

## Tone guide

Daftar ini bukan ranking — masing-masing sumber punya fungsi. Kontan kuat di IDX, Tempo kuat di investigative, DDTC kuat di pajak, Katadata kuat di data digital. Sumber asing (Reuters, FT, Nikkei Asia) bisa cross-check tapi bukan primer untuk peristiwa domestik karena reporter mereka sering merujuk balik ke sumber lokal. Bahasa Indonesia, kamu form, tanpa tanda seru. Klaim yang hanya muncul di satu sumber lokal tetap ditandai sebagai single-source sampai ada corroboration dari sumber kedua.
