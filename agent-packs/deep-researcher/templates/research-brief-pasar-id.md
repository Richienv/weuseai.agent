# Template — Research Brief Pasar Indonesia

Brief riset pasar Indonesia yang menuntut grounding di data BPS, regulasi UU/PP/Permen, dan sizing dalam IDR. Bukan template "market study" yang generik — wajib menyebut sumber Indonesia, regulator Indonesia, dan SES Indonesia yang relevan.
Audience: founder yang validasi go/no-go masuk segmen Indonesia, tim strategi yang siapkan board memo dengan grounding data lokal, atau analyst yang harus pertanggungjawabkan asumsi.
Pakai saat customer minta "riset pasar X di Indonesia" dan jawaban generik dari riset global akan menyesatkan. Wajib selesai sebelum playbook `market-research` dijalankan.

## Variables

- `{{market_definition}}` — string. Definisi pasar dalam satu kalimat. Produk/jasa + segmen pelanggan + geografi Indonesia.
- `{{geography_id}}` — string. Geografi Indonesia (mis. "nasional", "Jabodetabek + Bandung + Surabaya", "wilayah Indonesia Timur").
- `{{time_horizon}}` — string. Horison waktu sizing + proyeksi (mis. "baseline 2025, proyeksi 2026-2028").
- `{{ses_targets}}` — string. SES bracket target per Nielsen Indonesia (A1/A2/B/C1/C2/D/E) — pengeluaran rumah tangga bulanan per bracket.
- `{{key_regulators}}` — string. Regulator yang owns sektor ini (mis. "OJK + Bank Indonesia untuk fintech lending", "Kominfo + Bappebti untuk aset kripto").
- `{{primary_data_sources}}` — string. Sumber data resmi yang akan dipakai untuk grounding (mis. "BPS Susenas 2024 + OJK SPI Q4 2025 + Kemenperin Statistik IBS").
- `{{primary_research_question}}` — string. Pertanyaan utama yang harus dijawab brief. Bentuk pertanyaan, bukan pernyataan.
- `{{decision_to_inform}}` — string. Keputusan konkret yang akan diambil setelah riset selesai.
- `{{output_deadline}}` — string. Tanggal + jam laporan harus siap (WIB).

## Template

---
template: research-brief-pasar-id
language: id
register: kamu
purpose: market study Indonesia dengan grounding lokal wajib
---

# Research Brief — Pasar Indonesia

**Pasar:** {{market_definition}}
**Geografi:** {{geography_id}}
**Horison waktu:** {{time_horizon}}
**Target SES (Nielsen):** {{ses_targets}}
**Regulator kunci:** {{key_regulators}}
**Sumber data primer:** {{primary_data_sources}}

---

## Pertanyaan utama

{{primary_research_question}}

## Keputusan yang menunggu hasil

{{decision_to_inform}}

## Deadline

{{output_deadline}}

---

## Struktur laporan akhir

### Bagian 1: Lanskap pasar saat ini

Wajib berisi:

- **Ukuran pasar (IDR)** — sebut angka pasar dalam Rupiah dengan rentang low-mid-high. Konversi USD wajib disertai kurs referensi + tanggal (mis. "kurs JISDOR Bank Indonesia 31 Desember 2025"). Konversi dengan kurs tidak disebut = klaim tidak siap dipakai.
- **Sumber sizing** — minimal satu sumber dari BPS atau kementerian teknis yang relevan; estimasi sektor swasta (Statista, EMIS, riset konsultan) hanya cross-check, bukan primer.
- **Pertumbuhan historis** — CAGR 3-5 tahun terakhir, dengan break-out per segmen kalau data tersedia. Sebut periode COVID (2020-2022) sebagai catatan — banyak sektor punya anomali yang membuat CAGR rolling-period jadi tidak representatif.
- **Distribusi geografis** — share Jabodetabek vs luar Jabodetabek vs Indonesia Timur, sumber BPS PDRB per provinsi.
- **Profil konsumen / pelanggan** — segmentasi by SES bracket Nielsen (A1, A2, B, C1, C2, D, E) untuk konsumen, atau by ukuran usaha (UMK/UMB sesuai Permenkop) untuk B2B. Hindari segmentasi by "middle class" generik.

### Bagian 2: Lanskap regulasi

Wajib berisi:

- **UU (Undang-Undang) yang berlaku** — sebut nomor + tahun + judul lengkap. Kalau ada perubahan UU (mis. UU Cipta Kerja yang mengubah UU sektor), sebut perubahannya eksplisit.
- **Peraturan Pemerintah (PP) turunan** — nomor + tahun + pasal kunci yang relevan ke topik.
- **Peraturan Menteri (Permen)** — sebut kementerian + nomor + tahun. Untuk sektor finansial, sebut juga Peraturan OJK (POJK) atau Peraturan Bank Indonesia (PBI).
- **Surat Edaran (SE)** — kalau ada SE OJK / SE BI / SE Dirjen yang memberi guidance teknis.
- **Pengawas + sanksi** — regulator mana yang owns enforcement, dan rentang sanksi yang pernah dijatuhkan (rujuk press release regulator atau putusan).
- **Tren regulasi 12-24 bulan ke depan** — RUU di Prolegnas + draft Permen yang sedang dibahas. Sumber: laman jdih.go.id kementerian terkait + reporting DDTC News / Hukumonline.

> Setiap layer regulasi (UU → PP → Permen → SE) harus di-anchor dengan pasal spesifik, bukan parafrase. "Permen Kominfo 5/2020 mengatur X" tanpa pasal = tidak siap dipakai.

### Bagian 3: Pemain utama

Wajib berisi:

- **Incumbent** — 3-5 pemain besar dengan market share estimasi + sumber.
- **Challenger** — 3-5 pemain baru/digital + funding stage + sumber (DealStreetAsia untuk startup, IDX disclosure untuk listed).
- **BUMN kalau relevan** — peran BUMN di sektor ini (regulator de facto, market maker, kompetitor langsung).
- **Foreign player** — PMA yang aktif, ditelusuri via BKPM realisasi investasi + IDX kalau listed.

Untuk tiap pemain, sebut minimal: nama legal, status (publik / private / BUMN / koperasi), tier (incumbent / challenger), revenue terakhir kalau publik, dan sumber yang dipakai.

### Bagian 4: Proyeksi 3-5 tahun

Wajib berisi:

- **Skenario base** — asumsi makro (PDB Indonesia growth, inflasi, kurs USD/IDR) di-anchor ke proyeksi Bank Indonesia atau Kemenkeu Nota Keuangan. Sebut sumber + tanggal proyeksi.
- **Skenario optimis + pesimis** — sebut driver yang berubah di tiap skenario (mis. "skenario pesimis: kurs USD/IDR menyentuh Rp 17.500 + suku bunga acuan BI naik ke 6,5%").
- **Asumsi eksplisit per skenario** — semua dalam tabel dengan kolom: variabel, nilai, sumber, tingkat ketidakpastian.
- **Tidak ada single point estimate** — selalu rentang. Single number = anti-pola.

---

## Catatan metodologi wajib

- Kurs konversi USD ke IDR — disclose kurs referensi + tanggal di setiap angka konversi.
- Periode COVID — flag 2020-2022 sebagai potensi anomali kalau dipakai dalam baseline.
- SES bracket — kalau pakai segmentasi konsumen, pakai definisi Nielsen Indonesia (A1, A2, B, C1, C2, D, E) — bukan "kelas menengah" generik.
- KBLI — kalau pakai data BPS per sektor, sebut edisi KBLI (2009 / 2015 / 2020) — beda edisi beda agregasi.
- UMK vs UMB — kalau riset B2B, ikut definisi Permenkop yang berlaku, bukan definisi sektor swasta.

## Checkpoint review

Customer wajib dipanggil untuk review setelah:

1. Source set terkumpul + di-grade `source-evaluator` — sebelum sintesis dimulai.
2. Sizing rentang TAM/SAM/SOM draft pertama selesai — sebelum proyeksi 3-5 tahun dibuat.

## Anti-pola yang harus dihindari

- Menyalin estimasi McKinsey / Statista / EMIS sebagai angka primer tanpa cross-check ke BPS/BI/OJK.
- Memakai "Indonesia is the 4th largest population country" sebagai TAM proxy — itu bukan TAM.
- Konversi USD ke IDR dengan kurs tetap (mis. Rp 15.000/USD) tanpa tanggal kurs.
- Klaim "kelas menengah tumbuh" tanpa sumber BPS atau Bank Dunia + definisi kelas menengah yang dipakai.
- Sebut regulator "tidak ada regulasi yang mengatur" tanpa cek jdih.go.id terlebih dulu — sering ada Permen yang relevan tapi terlewat.
- Skip lanskap regulasi karena "topiknya bukan finansial" — sektor apapun di Indonesia ada layer regulasi minimal Permen sektoral.

## Tone guide

Brief ini lock sebelum riset dimulai. Bahasa Indonesia, kamu form, tanpa tanda seru. Setiap field dijawab dengan satu kalimat atau list pendek; "fleksibel" wajib di-push balik. Sizing yang tidak menyebut sumber primer Indonesia (BPS, BI, OJK, Kemenkeu, BKPM, kementerian teknis) ditolak sebelum laporan dianggap selesai. Estimasi sektor swasta boleh disebut sebagai konteks atau cross-check, tapi tidak menjadi grounding.
