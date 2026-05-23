# Template — Research Brief Kompetitor Indonesia

Brief riset kompetitor Indonesia yang menelusuri jejak publik via sumber resmi Indonesia — disclosure IDX (kalau listed), registrasi OJK (kalau fintech), profil PMA di BKPM (kalau asing), kontrak BUMN di LKPP (kalau B2G), funding history di DealStreetAsia (kalau startup), portofolio VC lokal (AC Ventures, East Ventures, Alpha JWC, Intudo). Bukan SWOT generik yang tempelkan logo + harga.
Audience: founder yang siapkan diferensiasi melawan kompetitor Indonesia spesifik, BD lead yang siapkan pitch tender, atau analyst yang harus jawab "siapa pesaing riil di pasar X dan apa moat mereka di konteks Indonesia".
Pakai sebagai brief sebelum playbook competitor analysis dijalankan; output brief ini di-feed ke `competitor-analysis.md` atau `competitor-deep-dive.md`.

## Variables

- `{{market_segment}}` — string. Segmen pasar yang dianalisis (mis. "fintech P2P lending konsumen di Indonesia").
- `{{focal_competitors}}` — string. Daftar awal kompetitor yang masuk scope (mis. "Kredivo, Akulaku, GoPay Later, Indodana, Bayarind").
- `{{competitor_classification}}` — string. Klasifikasi tipe kompetitor (mis. "5 challenger startup + 2 incumbent BUMN + 1 PMA asing").
- `{{key_question}}` — string. Pertanyaan kompetitif utama (mis. "siapa yang punya unit economics positif setelah 5 tahun di pasar ini").
- `{{decision_to_inform}}` — string. Keputusan operasional yang menunggu.
- `{{output_deadline}}` — string.

## Template

---
template: research-brief-kompetitor-id
language: id
register: kamu
purpose: competitor research Indonesia dengan jejak publik resmi
---

# Research Brief — Kompetitor Indonesia

**Segmen pasar:** {{market_segment}}
**Kompetitor scope:** {{focal_competitors}}
**Klasifikasi:** {{competitor_classification}}
**Pertanyaan kunci:** {{key_question}}
**Keputusan yang menunggu:** {{decision_to_inform}}
**Deadline:** {{output_deadline}}

---

## Sumber publik yang wajib dicek per tipe kompetitor

| Tipe kompetitor | Sumber publik wajib |
|---|---|
| Listed di IDX | idx.co.id — laporan keuangan kuartalan + tahunan + disclosure pengumuman + RUPS |
| Startup private | DealStreetAsia (funding rounds + valuasi), Crunchbase, portfolio page VC pendana (AC Ventures, East Ventures, Alpha JWC, Intudo, Openspace, BRI Ventures, Mandiri Capital), press release perusahaan |
| Fintech (P2P / payment / IKD) | OJK Daftar Penyelenggara Fintech Lending Terdaftar / Berizin (statistik.ojk.go.id) + status di sandbox IKD OJK |
| Penyedia jasa keuangan non-fintech | Daftar lembaga jasa keuangan OJK (perbankan, multifinance, asuransi) |
| PMA / anak perusahaan asing | BKPM realisasi investasi PMA per perusahaan (kalau publik) + AHU Kemenkumham (akta pendirian + perubahan) |
| BUMN | Laporan tahunan BUMN di kemenbumn.go.id + IDX kalau listed (mis. BBRI, BMRI, TLKM) |
| Anak BUMN | Annual report BUMN induk + press release Kementerian BUMN |
| Vendor B2G | LKPP SPSE (lpse.go.id per K/L) — riwayat tender + nilai kontrak + pemenang |
| Penyedia jasa terdaftar Bappebti (komoditas + kripto) | bappebti.go.id Daftar Pedagang Aset Kripto + Pialang Berjangka |
| Penyedia layanan kesehatan | Kementerian Kesehatan registrasi fasyankes + BPJS Kesehatan daftar provider |
| Penyedia telekomunikasi | Kominfo izin penyelenggaraan + laporan tahunan |

> Setiap kompetitor minimum di-anchor ke satu sumber publik resmi sebelum analisis kompetitif dimulai. Klaim "kompetitor X tutup" atau "kompetitor Y dapat funding $50M" tanpa sumber resmi = klaim tidak siap dipakai.

---

## Struktur output brief

### Bagian 1: Klasifikasi kompetitor

Untuk tiap kompetitor di scope, kategorikan:

- **Tipe** — listed / startup / fintech terdaftar OJK / BUMN / anak BUMN / PMA / koperasi.
- **Tier** — incumbent / challenger / niche.
- **Status** — aktif / akuisisi / merger / tutup / pivot.
- **Investor / pemegang saham mayoritas** — VC pendana untuk startup, holding untuk anak perusahaan, induk untuk anak BUMN.

### Bagian 2: Trail funding + corporate action (startup)

Wajib berisi:

- **Funding history** — round, tanggal, nilai, investor (lead + participating). Sumber DealStreetAsia + press release.
- **Valuasi** — kalau publik (post-money round terakhir). Sumber DealStreetAsia + reporting media.
- **Layoffs / restrukturisasi** — kalau ada, sebut sumber + tanggal.
- **M&A** — akuisisi atau diakuisisi. Sumber press release + DealStreetAsia.

### Bagian 3: Trail finansial (listed di IDX)

Wajib berisi:

- **Revenue + EBITDA + Net Income** — 3-5 tahun terakhir, sumber laporan keuangan IDX.
- **Tren margin** — gross margin, operating margin, net margin per tahun.
- **Pertumbuhan segmen** — kalau perusahaan disclose segmen, breakdown per segmen.
- **Cash position + utang** — dari neraca laporan keuangan.

### Bagian 4: Trail compliance (fintech)

Wajib berisi:

- **Status OJK** — terdaftar / berizin / sandbox IKD / dicabut. Sumber: daftar penyelenggara OJK + press release pencabutan.
- **Riwayat sanksi** — kalau ada sanksi administratif publik (denda, pencabutan izin, peringatan), sebut.
- **Modal disetor** — sesuai laporan ke OJK kalau publik.
- **NPL / kualitas kredit** — kalau available di statistik OJK fintech lending.

### Bagian 5: Trail kontrak (B2G — LKPP)

Wajib berisi:

- **Riwayat tender** — tender yang dimenangkan dalam 24 bulan terakhir, nilai kontrak, K/L pembeli.
- **Tingkat kemenangan tender** — % tender ikut vs menang.
- **Konflik kepentingan** — kalau ada relasi pejabat / mantan pejabat di struktur perusahaan yang publik.

### Bagian 6: Positioning publik

Wajib berisi:

- **One-liner publik** — positioning resmi dari website kompetitor.
- **Pricing publik** — kalau ada di website. Untuk produk yang harga via sales-led, sebut "tidak publik" + rentang dari sinyal sekunder (testimonial customer, kabar tender publik, leak harga di forum).
- **Channel akuisisi yang teridentifikasi** — outbound, content, paid, partnership, KOL, community.

### Bagian 7: Sinyal customer + voice

Wajib berisi:

- **Review publik** — Google Play / App Store rating + jumlah review, Trustpilot, Google Maps (untuk physical), G2/Capterra (untuk B2B SaaS yang international-grade).
- **Forum Indonesia** — Kaskus, Reddit r/indonesia, X/Twitter Indonesia. Sebut sentiment trend + sample threads.
- **Media coverage** — sentiment di Kontan / Bisnis Indonesia / DealStreetAsia / Tempo. Cek apakah kompetitor sering jadi case study positif atau case study negatif.

---

## Anti-pola yang harus dihindari

- Pakai SWOT generik tanpa anchor ke jejak publik Indonesia.
- Klaim funding tanpa sumber DealStreetAsia / press release ("denger-denger Series B" = tidak siap dipakai).
- Sebut kompetitor "ilegal" atau "tidak terdaftar OJK" tanpa cek daftar penyelenggara OJK terbaru.
- Mengabaikan BUMN sebagai kompetitor — di banyak sektor regulated, BUMN adalah pemain dominan + sering jadi gatekeeper.
- Pakai logo + tagline kompetitor sebagai "positioning analysis" tanpa data perilaku / financial.
- Skip M&A history — banyak startup Indonesia hasil merger atau diakuisisi; tanpa konteks ini, analisis kompetitif menyesatkan.
- Pakai data Crunchbase / PitchBook saja untuk startup Indonesia — data Indonesia di platform global sering outdated atau tidak lengkap; DealStreetAsia + reporting lokal lebih akurat.

## Tone guide

Riset kompetitor Indonesia berdiri di atas jejak publik resmi. Disclosure IDX, daftar OJK, realisasi BKPM, kontrak LKPP, dan reporting DealStreetAsia adalah primer. Reporting media adalah sekunder. Rumor dari networking event = bukan sumber yang siap dipakai. Bahasa Indonesia, kamu form, tanpa tanda seru. Klaim soal kompetitor wajib di-anchor sumber + tanggal — kompetitor bisa pivot, dapat funding baru, atau dicabut izinnya di antara dua siklus riset, jadi tanggal sumber wajib eksplisit di setiap claim kunci.
