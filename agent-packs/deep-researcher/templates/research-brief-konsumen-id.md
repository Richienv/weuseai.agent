# Template — Research Brief Konsumen Indonesia

Brief riset konsumen Indonesia dengan segmentasi yang sadar struktur SES Nielsen (A1, A2, B, C1, C2, D, E), grounding di BPS Susenas, dan source mix yang campurkan survei nasional + panel digital + data konsumsi rumah tangga resmi. Bukan template "consumer insights" generik yang pakai "middle class" tanpa definisi operasional.
Audience: founder product/marketing yang validasi segmen konsumen, brand manager FMCG yang siapkan launch plan, atau analyst yang harus jawab "siapa konsumen riil produk X di Indonesia, dan apa daya beli mereka".
Pakai sebelum playbook `market-research` saat fokus utama adalah perilaku + segmen konsumen, bukan ukuran pasar.

## Variables

- `{{product_category}}` — string. Kategori produk/jasa yang diteliti (mis. "asuransi mikro berbasis komunitas", "kopi RTD kemasan harga Rp 5.000-Rp 15.000").
- `{{target_ses_brackets}}` — string. SES bracket Nielsen yang dijadikan target (mis. "C1 + C2 + D, dengan secondary B").
- `{{geography_id}}` — string. Geografi Indonesia (mis. "Jawa-Sumatera kota tier 1 + 2", "Jabodetabek + Bandung + Surabaya + Medan").
- `{{behavioral_question}}` — string. Pertanyaan perilaku utama (mis. "frekuensi pembelian + channel + price sensitivity untuk kategori X").
- `{{decision_to_inform}}` — string. Keputusan operasional yang menunggu.
- `{{primary_research_methods}}` — string. Metode riset yang dipakai (mis. "desk research + 12 IDI + survey N=400 via panel digital").
- `{{output_deadline}}` — string.

## Template

---
template: research-brief-konsumen-id
language: id
register: kamu
purpose: consumer research Indonesia dengan SES + Susenas grounding
---

# Research Brief — Konsumen Indonesia

**Kategori produk:** {{product_category}}
**Target SES (Nielsen):** {{target_ses_brackets}}
**Geografi:** {{geography_id}}
**Pertanyaan perilaku utama:** {{behavioral_question}}
**Keputusan yang menunggu:** {{decision_to_inform}}
**Metode riset:** {{primary_research_methods}}
**Deadline:** {{output_deadline}}

---

## Anchor segmentasi — SES Nielsen Indonesia

Definisi SES Nielsen Indonesia berbasis pengeluaran rutin rumah tangga bulanan (bukan pendapatan, bukan aset). Versi yang paling sering dirujuk:

| Bracket | Pengeluaran rumah tangga bulanan |
|---|---|
| A1 | > Rp 7,5 juta |
| A2 | Rp 5,0 juta - Rp 7,5 juta |
| B | Rp 3,0 juta - Rp 5,0 juta |
| C1 | Rp 2,0 juta - Rp 3,0 juta |
| C2 | Rp 1,5 juta - Rp 2,0 juta |
| D | Rp 1,0 juta - Rp 1,5 juta |
| E | < Rp 1,0 juta |

> Angka di atas adalah rentang umum Nielsen Indonesia versi mid-2020s. Versi paling baru wajib dikonfirmasi ke laporan Nielsen Indonesia atau publikasi mitra Nielsen (mis. Kantar Worldpanel, Snapcart). Brand yang pakai versi internal sendiri (mis. SES Mandala dari Mandala Research) wajib disebut versi yang dipakai.

Brief ini menolak istilah "kelas menengah Indonesia" tanpa definisi operasional. Pakai bracket Nielsen, atau pakai definisi Bank Dunia (USD 2-USD 20/orang/hari PPP 2017) — pilih satu, sebut eksplisit.

---

## Struktur laporan akhir

### Bagian 1: Profil demografi + ekonomi segmen target

Wajib berisi:

- **Ukuran populasi segmen** — sebut jumlah rumah tangga + jumlah individu per SES bracket target, sumber BPS Sakernas / Susenas terbaru.
- **Distribusi geografis** — share Jabodetabek vs kota tier 1 luar Jakarta vs kota tier 2 vs rural. Sumber BPS PDRB + Sakernas per provinsi.
- **Komposisi pengeluaran rumah tangga** — % pengeluaran per kategori (pangan, perumahan, transportasi, pendidikan, kesehatan, komunikasi, hiburan). Sumber BPS Susenas Modul Konsumsi.
- **Akses digital + finansial** — % yang punya smartphone, akses internet, rekening bank, dompet digital. Sumber OJK Survei Literasi Keuangan + BPS Susenas Modul Sosial Budaya + APJII Survei Pengguna Internet.

### Bagian 2: Perilaku kategori

Wajib berisi:

- **Penetrasi kategori** — % rumah tangga / individu yang membeli kategori dalam 3 bulan terakhir. Sumber: Nielsen Retail Audit / Kantar Worldpanel kalau available, atau Snapcart / Populix survey.
- **Frekuensi pembelian** — pembelian per bulan / per minggu.
- **Channel mix** — share traditional trade (toko kelontong, pasar) vs modern trade (minimarket, supermarket) vs e-commerce vs social commerce. Sumber Nielsen Retail Audit + reporting industri di Katadata + Marketing Magazine Indonesia.
- **Spend per occasion** — Rupiah rata-rata per pembelian, rentang low-mid-high.
- **Brand awareness + brand consideration** — top-of-mind awareness + consideration set untuk kategori. Sumber survei Populix / Snapcart / YouGov Indonesia.

### Bagian 3: Driver + barrier pembelian

Wajib berisi:

- **Driver utama** — alasan beli (harga, kualitas, kebiasaan, ketersediaan, rekomendasi keluarga, iklan, KOL). Per SES bracket — driver SES A berbeda dari SES D.
- **Barrier utama** — alasan tidak beli (harga terlalu tinggi, tidak tersedia di area, tidak tahu produknya, ada substitusi yang lebih murah).
- **Price sensitivity** — uji konsep harga via Van Westendorp PSM atau Gabor-Granger; sebut metode kalau ada survey primer. Tanpa survey primer, tampilkan harga pesaing + posisi produk di shelf.

### Bagian 4: Sumber + metode

Wajib berisi tabel sumber dengan kolom:

| Sumber | Tipe | Sample size / cakupan | Update | Akses |
|---|---|---|---|---|
| BPS Susenas | Survei nasional | ~300.000 RT | Semesteran | Free agregat; mikrodata berbayar SILASTIK |
| BPS Sakernas | Survei nasional | ~200.000 RT | Semesteran | Free agregat |
| Bank Indonesia IKK | Survei consumer confidence | ~4.600 RT, 18 kota | Bulanan | Free |
| Nielsen Retail Audit | Panel toko | ~10.000+ outlet | Bulanan / kuartalan | Berbayar (langganan brand) |
| Kantar Worldpanel | Panel rumah tangga | ~7.000 RT | Mingguan / bulanan | Berbayar |
| Snapcart | Receipt scanning panel | ~500.000 user aktif | Real-time | Subscription |
| Populix | Online panel + survey on demand | Custom per project | On demand | Per project |
| APJII Survei Internet | Survei nasional | ~9.000 responden | Tahunan | Free |
| YouGov Indonesia | Online panel | Custom per project | On demand | Per project |
| OJK Survei Literasi Keuangan | Survei nasional | ~14.000 responden | Per 3 tahun | Free |

> Sebutkan eksplisit sumber mana yang dipakai untuk klaim mana. Klaim "60% konsumen lebih suka brand lokal" wajib di-anchor ke sumber spesifik dengan sample size + tanggal survei.

---

## Anti-pola yang harus dihindari

- Pakai "middle class Indonesia" tanpa definisi operasional (SES Nielsen, atau Bank Dunia definisi).
- Generalisasi "konsumen Indonesia X" tanpa breakdown SES / region — Jakarta SES A berbeda dari Sumut SES D.
- Sample size tidak disebut — claim survey tanpa N + metode = klaim tidak siap dipakai.
- Pakai Statista / eMarketer estimasi sebagai grounding tanpa cross-check ke BPS / OJK / Bank Indonesia.
- Skip mobile-first reality — sebagian besar SES C/D Indonesia akses internet dari mobile only; ignore ini sama dengan ignore segmen utama.
- Asumsikan e-commerce mendominasi — modern trade + traditional trade masih dominan di SES C/D di banyak kategori (FMCG, fresh).
- Pakai data Jabodetabek + Bandung + Surabaya saja dan klaim sebagai "konsumen Indonesia" — itu maksimal 25% populasi.

## Checkpoint review

Customer wajib dipanggil untuk review setelah:

1. Source set + metode disetujui — sebelum survey primer atau IDI dijalankan.
2. Draft segmentasi (SES + behavioral cluster) selesai — sebelum laporan akhir disusun.

## Tone guide

Brief konsumen tidak mengasumsikan. Klaim perilaku wajib di-anchor sample size + tanggal survei + metode. Bahasa Indonesia, kamu form, tanpa tanda seru. Generalisasi yang menyebut "konsumen Indonesia" tanpa segmen ditolak. Stereotip ("milenial Indonesia suka X", "Gen Z malas Y") tanpa data primer juga ditolak. Brief ini siapkan riset konsumen yang berdiri di atas BPS + survei representatif, bukan klise.
