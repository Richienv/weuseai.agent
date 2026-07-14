# Template — Daftar Sumber Data Pemerintah Indonesia

Daftar portal + dataset resmi pemerintah Indonesia untuk riset makro, sektoral, dan regulasi. Setiap sumber dipetakan ke akses (API / portal / publikasi cetak), update cadence, format file, dan kedalaman seri waktu.
Audience: analyst yang butuh angka resmi untuk market sizing, peneliti kebijakan publik, atau founder yang validasi asumsi pasar dengan data primer.
Pakai sebagai grounding sebelum mengutip angka pasar. Estimasi sektor swasta (Statista, EMIS) wajib di-cross-check dengan data BPS/BI/OJK kalau available.

## Variables

- `{{research_topic}}` — string. Topik atau sektor yang sedang dianalisis.
- `{{data_window}}` — string. Periode data yang dibutuhkan.
- `{{required_granularity}}` — string. Granularitas yang dibutuhkan (nasional, provinsi, kabupaten/kota, sektor 2-digit KBLI).
- `{{access_environment}}` — string. Environment customer (mis. "Excel + Python; akses internet umum tanpa kredensial khusus").

## Template

---
template: source-list-id-government-data
language: id
register: kamu
purpose: source-list data pemerintah Indonesia
---

# Daftar Sumber — Data Pemerintah Indonesia

**Topik riset:** {{research_topic}}
**Window data:** {{data_window}}
**Granularitas yang dibutuhkan:** {{required_granularity}}
**Environment akses:** {{access_environment}}

> Data resmi pemerintah Indonesia adalah grounding wajib untuk klaim makro. Angka dari sumber swasta (Statista, EMIS, Euromonitor) yang bertentangan dengan BPS/BI/OJK tetap dicantumkan, tapi dengan catatan eksplisit konflik.

---

## 1. Badan Pusat Statistik (BPS) — bps.go.id

- **Akses:** Portal publikasi (PDF + Excel) di bps.go.id; API resmi via "WebAPI BPS" (perlu registrasi token, free).
- **Dataset kunci:**
  - **Sensus Penduduk** — sepuluh tahunan (terakhir 2020), demografi lengkap. Long-form survei pendamping (Long Form SP) memberi tambahan variabel fertility, mortality, migrasi.
  - **Sakernas (Survei Angkatan Kerja Nasional)** — semesteran (Februari + Agustus). Angka tenaga kerja, pengangguran, sektor pekerjaan, pendidikan. Mikrodata berbayar.
  - **Susenas (Survei Sosial Ekonomi Nasional)** — semesteran. Konsumsi rumah tangga, pengeluaran, akses kesehatan + pendidikan. Mikrodata berbayar.
  - **Statistik Indonesia (Statistical Yearbook)** — tahunan. Kompilasi makro nasional.
  - **PDB / PDRB** — kuartalan (PDB nasional) + tahunan (PDRB provinsi). Klasifikasi 17 lapangan usaha.
- **Update cadence:** PDB rilis kuartalan ~5 Februari / 5 Mei / 5 Agustus / 5 November. Sakernas rilis Mei + November.
- **Format:** PDF, Excel, dynamic table di portal. API output JSON.
- **Catatan riset:** Data agregat nasional + provinsi free. Mikrodata Sakernas + Susenas berbayar via SILASTIK BPS. KBLI (Klasifikasi Baku Lapangan Usaha Indonesia) 2-digit aman, 5-digit kadang konsisten antar publikasi — wajib cek edisi KBLI yang dipakai.

## 2. Bank Indonesia (BI) — bi.go.id

- **Akses:** Portal Statistik (statistik.bi.go.id) — tabel interaktif + download Excel/CSV. Tanpa API publik resmi, tapi data terstruktur dan link permanen.
- **Dataset kunci:**
  - **SEKI (Statistik Ekonomi Keuangan Indonesia)** — bulanan. Indikator moneter, agregat moneter (M1, M2), suku bunga, kurs, neraca pembayaran.
  - **Statistik Sistem Pembayaran Indonesia (SSPI)** — bulanan. Transaksi QRIS, kartu kredit, kartu debit, e-money, transfer dana antar bank.
  - **Statistik Utang Luar Negeri Indonesia (SULNI)** — bulanan. ULN pemerintah + swasta.
  - **Indeks Penjualan Riil (IPR)** — bulanan. Proxy konsumsi retail.
  - **Indeks Keyakinan Konsumen (IKK)** — bulanan. Consumer confidence dari survei BI.
- **Update cadence:** SEKI awal bulan berikutnya. SSPI ~3 minggu lag. IKK ~10 hari kerja setelah bulan tutup.
- **Format:** Excel, PDF.
- **Catatan riset:** Statistik sistem pembayaran adalah satu-satunya sumber resmi volume QRIS Indonesia. Untuk data perbankan detail per bank, lihat OJK (lebih granular).

## 3. Otoritas Jasa Keuangan (OJK) — ojk.go.id

- **Akses:** Portal Statistik OJK (statistik.ojk.go.id) — download Excel/PDF per sektor.
- **Dataset kunci:**
  - **Statistik Perbankan Indonesia (SPI)** — bulanan + tahunan. Aset, kredit, DPK, NPL, CAR per bank. Mikrodata per bank publik di SPI tahunan.
  - **Statistik Asuransi** — kuartalan. Premi, klaim, aset, investasi industri asuransi jiwa + umum.
  - **Statistik Pasar Modal** — bulanan. Kapitalisasi pasar, transaksi, jumlah investor SID, demografi investor (umur, gender, profesi, region).
  - **Statistik Fintech P2P Lending** — bulanan. Penyelenggara terdaftar, akumulasi penyaluran, NPL, jumlah borrower aktif.
  - **Statistik IKNB (Industri Keuangan Non-Bank)** — bulanan. Multifinance, modal ventura, pegadaian.
  - **Daftar Penyelenggara Fintech Lending Terdaftar / Berizin** — direktori publik, dipertahankan up-to-date. Source primer untuk validasi status registrasi pemain fintech.
- **Update cadence:** Bulanan dengan lag 6-8 minggu untuk perbankan, ~3 bulan untuk asuransi.
- **Format:** Excel, PDF.
- **Catatan riset:** OJK wajib untuk klaim apapun soal pemain fintech ("terdaftar OJK" vs "berizin OJK" beda — tag yang tepat di daftar penyelenggara). Untuk pasar modal level transaksi, IDX lebih real-time; OJK lebih cocok untuk demografi investor + aggregate.

## 4. Kementerian Keuangan (Kemenkeu) — kemenkeu.go.id

- **Akses:** Portal kemenkeu.go.id + data.kemenkeu.go.id (open data portal). PDF + Excel + sebagian CSV.
- **Dataset kunci:**
  - **APBN + APBN-P (Anggaran Pendapatan Belanja Negara)** — tahunan + revisi tengah tahun. Postur fiskal, alokasi belanja K/L, transfer ke daerah.
  - **Realisasi APBN bulanan** — bulanan. Aktual penerimaan + belanja, defisit, pembiayaan.
  - **Statistik Penerimaan Perpajakan** — bulanan + tahunan. Dipublikasi via Direktorat Jenderal Pajak (DJP).
  - **Profil Utang Pemerintah Indonesia** — bulanan. Stok utang, komposisi (SBN domestik + valas + loan).
- **Update cadence:** Realisasi APBN bulanan ~minggu ketiga bulan berikutnya. APBN tahunan diumumkan Agustus untuk tahun berikutnya, disetujui DPR Oktober.
- **Format:** PDF utama; data.kemenkeu.go.id mulai expand ke CSV/Excel.
- **Catatan riset:** Conference call Menkeu bulanan "APBN Kita" punya slide deck publik yang lebih ringkas dari laporan lengkap. Untuk realisasi sektoral, silang dengan kementerian teknis (mis. Kemenperin untuk industri).

## 5. Direktorat Jenderal Pajak (DJP) — pajak.go.id

- **Akses:** Portal pajak.go.id; Laporan Tahunan DJP (PDF) sumber utama statistik.
- **Dataset kunci:**
  - **Laporan Tahunan DJP** — tahunan, rilis ~Maret untuk tahun sebelumnya. Penerimaan per jenis pajak (PPh Badan, PPh OP, PPN, PPh Final), tingkat kepatuhan, jumlah WP terdaftar.
  - **Statistik Penerimaan Pajak Bulanan** — bulanan. Penerimaan per jenis pajak, level nasional.
  - **Realisasi PPh Sektoral** — tahunan via Laporan Tahunan + permintaan data khusus.
- **Update cadence:** Tahunan utama Maret. Bulanan ~3 minggu lag.
- **Format:** PDF dominan. Data sektoral kadang hanya tersedia via permohonan PPID.
- **Catatan riset:** PPh Badan per sektor adalah proxy bagus untuk profitabilitas sektoral. Untuk analisis transfer pricing + tax dispute, DDTC News + putusan Pengadilan Pajak (setpp.kemenkeu.go.id) lebih dalam.

## 6. Badan Koordinasi Penanaman Modal (BKPM / Kementerian Investasi) — bkpm.go.id

- **Akses:** Portal bkpm.go.id + NSWI (National Single Window for Investment). Laporan realisasi investasi PDF + tabel.
- **Dataset kunci:**
  - **Realisasi Investasi PMA + PMDN** — kuartalan. Per sektor (KBLI 2-digit) + per provinsi + per negara asal (PMA). Nilai USD untuk PMA, Rp untuk PMDN.
  - **Daftar Proyek Strategis Nasional (PSN)** — tahunan + revisi. List proyek dengan status.
  - **NIB (Nomor Induk Berusaha) statistik** — agregat penerbitan NIB OSS, indikator aktivitas izin usaha baru.
- **Update cadence:** Realisasi investasi rilis ~30 hari setelah kuartal tutup.
- **Format:** PDF + Excel.
- **Catatan riset:** Source primer untuk klaim "investasi asing masuk Indonesia". Cek silang dengan Bank Indonesia neraca pembayaran (FDI flow di rekening modal + finansial) — angka BKPM (komitmen + realisasi izin) vs BI (cash flow neraca pembayaran) bisa beda 20-40%.

## 7. Kementerian Perindustrian (Kemenperin) — kemenperin.go.id

- **Akses:** Portal kemenperin.go.id. Publikasi statistik industri PDF + Excel.
- **Dataset kunci:**
  - **Statistik Industri Manufaktur** — tahunan. Output, tenaga kerja, value added per KBLI 2-digit.
  - **Indeks Kepercayaan Industri (IKI)** — bulanan. Survei sentimen pelaku industri manufaktur.
  - **Peta Jalan Industri 4.0 (Making Indonesia 4.0)** — dokumen kebijakan + roadmap sektoral.
- **Update cadence:** Statistik tahunan; IKI bulanan.
- **Format:** PDF dominan.
- **Catatan riset:** Untuk angka industri pengolahan per subsektor, silang dengan BPS Statistik Industri Manufaktur Besar dan Sedang (IBS) yang lebih granular.

## 8. Bursa Efek Indonesia (IDX) — idx.co.id

- **Akses:** Portal idx.co.id — disclosure perusahaan publik (pengumuman, laporan keuangan, prospektus), data perdagangan harian.
- **Dataset kunci:**
  - **Laporan Keuangan Emiten** — kuartalan + tahunan. PDF audited untuk full-year, unaudited untuk kuartalan.
  - **Disclosure (Pengumuman)** — real-time. Aksi korporasi, perubahan kepemilikan saham, RUPS announcement.
  - **Indeks IDX** — daily. IHSG, LQ45, IDX30, IDX BUMN20, dll.
  - **Statistik Bulanan Pasar Modal** — bulanan. Volume, nilai, frekuensi transaksi per saham.
- **Update cadence:** Disclosure real-time. Laporan keuangan: Q1 ~April, semester ~Juli/Agustus, Q3 ~Oktober, audited ~Maret-April tahun berikutnya.
- **Format:** PDF (laporan keuangan), CSV/Excel (data perdagangan).
- **Catatan riset:** Source primer wajib untuk klaim apapun soal emiten publik. Klaim soal corporate action yang tidak ada di disclosure IDX = tidak terverifikasi.

---

## Cross-check matrix — angka makro

| Indikator | Source primer | Cross-check |
|---|---|---|
| PDB nasional | BPS | BI (perspektif konsumsi/investasi/net export) |
| Inflasi (CPI) | BPS | BI (publikasi rilis pers inflasi) |
| Suku bunga acuan | BI 7-Day Reverse Repo | RDG announcement bulanan |
| Penyaluran kredit perbankan | OJK SPI | BI SEKI |
| Penerimaan pajak | DJP | Kemenkeu realisasi APBN |
| FDI inflow | BKPM realisasi investasi PMA | BI neraca pembayaran |
| Tenaga kerja sektoral | BPS Sakernas | Kemenperin (industri), Kementan (pertanian) |

---

## Catatan akses + lisensi

Sebagian besar data BPS, BI, OJK, Kemenkeu, BKPM, IDX bebas dipakai dengan atribusi. Mikrodata Sakernas + Susenas BPS berbayar dan punya perjanjian penggunaan yang melarang re-distribusi. Cek halaman lisensi tiap portal sebelum redistribute dataset, terutama kalau output riset akan dipublikasi.

## Tone guide

Data pemerintah Indonesia adalah grounding, bukan opini. Kalau ada konflik antara estimasi sektor swasta (Statista, EMIS, McKinsey ID) dan data BPS/BI/OJK, sumber pemerintah didahulukan untuk angka resmi — kecuali ada alasan metodologis spesifik (mis. data sektor swasta lebih granular per kota). Bahasa Indonesia, kamu form, tanpa tanda seru. Jangan tulis "BPS sudah konfirmasi" kalau yang ada cuma artikel news tentang BPS — wajib link langsung ke publikasi BPS resmi.
