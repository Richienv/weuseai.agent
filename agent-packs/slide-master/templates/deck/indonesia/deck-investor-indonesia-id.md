# Template — Pitch Deck VC Indonesia

Audience: VC dan angel investor Indonesia (East Ventures, AC Ventures, Alpha JWC, Northstar Group, Mandiri Capital Indonesia, BRI Ventures, Mandala Capital, Init 6). Use case: founder Indonesia yang fundraising post-seed sampai Series B. Urutan slide disesuaikan pertanyaan khas VC lokal — sizing dalam IDR dengan sumber BPS, unit economics dalam IDR, tesis exit yang sadar IDX vs SGX vs offshore.

Beda dari deck Y-Combinator generik: market data dalam IDR dengan sumber resmi Indonesia (BPS, Bank Indonesia, OJK, Kominfo), unit economics dalam Rupiah penuh (bukan USD), tim slide dengan konvensi pendidikan dan riwayat kerja Indonesia, exit thesis yang membahas pilihan IDX vs SGX vs holding offshore.

## Variables

- `{{company_name}}` — nama perusahaan atau merek
- `{{tagline_id}}` — satu kalimat positioning dalam Bahasa Indonesia (≤12 kata)
- `{{founder_name}}` — nama founder yang presentasi
- `{{founder_credentials}}` — pendidikan dan pengalaman kerja relevan (contoh: "ITB Teknik Industri 2012, ex-Tokopedia Senior PM 2018-2023")
- `{{co_founders}}` — daftar co-founder dengan kredensial format sama
- `{{round_stage}}` — tahap pendanaan ("Pre-seed", "Seed", "Pre-Series A", "Series A", "Series B")
- `{{round_size_idr}}` — ukuran ronde dalam IDR (contoh: "Rp 25.000.000.000,-")
- `{{round_size_usd}}` — paralel dalam USD untuk cross-border investor (contoh: "USD 1.5 juta")
- `{{problem_one_liner_id}}` — satu kalimat masalah dalam Bahasa Indonesia
- `{{customer_segment_id}}` — segmen pelanggan Indonesia spesifik (UMKM Jabodetabek, mahasiswa Tier-2, ibu rumah tangga digital, dll.)
- `{{problem_stat_bps}}` — statistik dari BPS, Bank Indonesia, OJK, atau Kominfo dengan tahun dan link sumber
- `{{solution_one_liner_id}}` — janji solusi dalam satu kalimat
- `{{why_now_indonesia}}` — tren struktural khusus Indonesia (kenaikan smartphone penetration, regulasi OJK baru, demografi bonus, dll.)
- `{{market_tam_idr}}` — TAM dalam IDR dengan sumber BPS atau riset firm Indonesia (Statista ID, DSResearch, Populix)
- `{{market_sam_idr}}` — SAM dalam IDR
- `{{market_som_idr_3yr}}` — SOM target 3 tahun dalam IDR
- `{{traction_idr}}` — revenue atau GMV bulanan dalam IDR (kalau pre-revenue: LOI, MoU, pilot result dengan brand Indonesia)
- `{{unit_economics_idr}}` — CAC, LTV, payback period dalam Rupiah
- `{{competitors_id}}` — kompetitor lokal (Indonesia) dan regional (SEA) — sebutkan eksplisit
- `{{regulatory_context}}` — regulasi yang relevan (OJK untuk fintech, Komdigi untuk digital service, BPOM untuk konsumsi, Kemenkop UKM untuk UMKM, Bank Indonesia untuk payment)
- `{{exit_thesis}}` — IDX listing (cocok kalau target IPO domestik), SGX (kalau struktur holding Singapura), strategic acquisition oleh Tokopedia/GoTo/Grab/Sea (paling likely di SEA), atau US-listed acquirer
- `{{use_of_funds_idr}}` — alokasi dana dalam IDR (3-4 bucket dengan persentase dan angka absolut)
- `{{milestones_18mo}}` — 3 milestone konkret 18 bulan

## Template

```
---
template: deck-investor-indonesia-id
audience: vc-indonesia
duration_minutes: 12
slide_count: 14
language: id
---

# Slide 1 — Cover
**Title:** {{company_name}} — {{tagline_id}}
**Visual:** Logo + nama founder + ronde {{round_stage}} {{round_size_idr}} + tanggal
**Speaker note:** Buka dengan nama dan tahap pendanaan. Sebut domisili perusahaan (PT atau Pte Ltd) supaya investor langsung paham struktur korporat. ~30 detik.

# Slide 2 — Masalah
**Title:** {{problem_one_liner_id}}
**Visual:** Satu statistik besar di tengah ({{problem_stat_bps}}) dengan source line di footer ("Sumber: BPS Statistik Indonesia 2025, link/halaman")
**Speaker note:** Mulai dari cerita customer Indonesia yang konkret — bukan abstraksi. Sebut nama kota, profesi, omzet bulanan dalam IDR. VC lokal langsung tahu kalau founder ngarang segmen. ~90 detik.

# Slide 3 — Customer Segment
**Title:** Siapa yang Kena Masalah Ini
**Visual:** Profil segmen {{customer_segment_id}} dengan 4 data: lokasi (Jabodetabek vs Tier-2 vs luar Jawa), profesi, pendapatan bulanan IDR, perilaku digital
**Speaker note:** VC Indonesia tanya "tier kota mana" dalam 5 menit pertama. Antisipasi dengan segmen yang tajam — bukan "semua orang Indonesia". ~60 detik.

# Slide 4 — Kenapa Sekarang (Indonesia Context)
**Title:** Kenapa Sekarang
**Visual:** Timeline 3 perubahan struktural: regulasi (contoh: POJK 13/2023 untuk P2P, UU PDP 2022), demografi (bonus demografi 2020-2035 per BPS), infrastruktur (penetrasi 4G/5G per Kominfo)
**Speaker note:** Sebut {{why_now_indonesia}} dengan referensi regulasi atau data BPS yang bisa diverifikasi. Hindari klaim makro tanpa source. ~75 detik.

# Slide 5 — Solusi
**Title:** {{solution_one_liner_id}}
**Visual:** Screenshot produk dengan UI Bahasa Indonesia + diagram 3-langkah cara kerja
**Speaker note:** Tunjukkan produk dalam BI, bukan English mockup. VC Indonesia ingin lihat localization sudah dipikirkan. ~75 detik.

# Slide 6 — Pasar (IDR, Sumber BPS)
**Title:** Pasar yang Dituju
**Visual:** TAM/SAM/SOM diagram tiga lingkaran dengan angka IDR — TAM {{market_tam_idr}}, SAM {{market_sam_idr}}, SOM {{market_som_idr_3yr}} (3 tahun). Source line: BPS / Bank Indonesia / OJK / Kominfo + tahun + link halaman
**Speaker note:** WAJIB pakai IDR di slide pasar — bukan USD. VC lokal langsung kalkulasi kelipatan terhadap ronde size. Akui sisi konservatif estimasi. Kalau dari riset firm asing (Statista, McKinsey), sebutkan paralel dengan data BPS. ~90 detik.

# Slide 7 — Traction
**Title:** Sinyal Permintaan
**Visual:** Grafik revenue atau GMV bulanan dalam IDR (sumbu Y format Rp 25.000.000,-), 12 bulan terakhir. Kalau pre-revenue: 3 panel sejajar — LOI dari brand Indonesia, MoU resmi, pilot dengan logo customer Indonesia
**Speaker note:** Sebut logo customer Indonesia yang sudah onboard atau LOI. VC lokal lebih percaya nama brand domestik daripada testimoni asing. ~90 detik.

# Slide 8 — Unit Economics (IDR)
**Title:** Unit Economics per Pelanggan
**Visual:** Tabel: CAC (Rp), LTV (Rp), LTV/CAC ratio, payback period (bulan), gross margin (%), contribution margin per transaksi (Rp)
**Speaker note:** Semua angka dalam IDR penuh. CAC Rp 250.000,- per acquired, LTV Rp 2.500.000,- atas 18 bulan, payback 4 bulan. Jangan campur USD/IDR di slide ini — investor lokal lihat campur-aduk sebagai red flag. ~90 detik.

# Slide 9 — Model Bisnis
**Title:** Cara Kami Hasilkan Uang
**Visual:** Diagram pricing dengan tiering IDR, channel mix (langsung vs marketplace), payment method mix (QRIS / e-wallet / VA / kartu)
**Speaker note:** Sebut pricing eksplisit dalam IDR. Sebut payment method — VC tanya kalau pricing exclude PPN 11% atau include. ~75 detik.

# Slide 10 — Kompetisi
**Title:** Lanskap Kompetisi
**Visual:** 2x2 matrix dengan kompetitor lokal Indonesia + regional SEA + global. Sumbu yang relevan untuk kategori. Posisikan {{company_name}} di kuadran differentiated
**Speaker note:** Sebut kompetitor lokal eksplisit ({{competitors_id}}) — Tokopedia, Bukalapak, Mekari, Xendit, BukuWarung, dll. sesuai kategori. Jangan klaim "no competitor" — VC lokal langsung skeptis. ~75 detik.

# Slide 11 — Tim
**Title:** Tim
**Visual:** Per founder: foto + nama + pendidikan (universitas + jurusan + tahun lulus) + riwayat kerja (perusahaan + role + durasi) + 1 baris kenapa relevan
**Speaker note:** Format pendidikan Indonesia: "ITB Teknik Industri 2012", "UI Akuntansi 2015", "Binus Computer Science 2018". Pengalaman kerja sebut nama perusahaan Indonesia atau MNC yang dikenal lokal. {{founder_credentials}}. ~90 detik.

# Slide 12 — Konteks Regulasi
**Title:** Posisi Regulasi
**Visual:** Per regulasi {{regulatory_context}}: nama regulasi, regulator (OJK / Komdigi / BPOM / Kemenkop / BI), status compliance perusahaan
**Speaker note:** VC Indonesia (terutama bank-affiliated VC seperti BRI Ventures, Mandiri Capital) wajib paham posisi regulasi. Sebut izin yang sudah dimiliki (NIB, izin OJK, sertifikasi BPOM) dan timeline pengajuan izin lain. ~75 detik.

# Slide 13 — Exit Thesis
**Title:** Jalur Exit
**Visual:** 3 opsi paralel: (1) IPO IDX dalam 5-7 tahun (kalau struktur PT Indonesia + omzet IPO-ready), (2) acquisition oleh strategic SEA (GoTo / Grab / Sea / Tokopedia / Bukalapak), (3) SGX atau US-listed kalau struktur holding Singapura
**Speaker note:** Sebut {{exit_thesis}} dengan reasoning. VC lokal seperti Mandiri Capital prefer IDX path; Alpha JWC dan East Ventures lebih nyaman dengan SGX atau US exit. Pahami profile LP investor sebelum pitch. ~75 detik.

# Slide 14 — Ask & Use of Funds
**Title:** Ask: {{round_size_idr}} ({{round_size_usd}})
**Visual:** Pie chart {{use_of_funds_idr}} — alokasi 3-4 bucket dengan persentase + angka IDR absolut. Timeline 18 bulan dengan {{milestones_18mo}}
**Speaker note:** Sebut angka ronde dalam IDR dulu, USD setelahnya untuk cross-border investor. Setiap bucket dengan angka absolut: "Tim engineering Rp 8.000.000.000,- (32%)", bukan persentase saja. Tutup: "Dengan capaian ini, ronde berikutnya jadi pricing power, bukan dilution." ~90 detik.
```

## Tone guide

- Semua angka uang dalam IDR dengan format titik ribuan dan koma desimal Indonesia: `Rp 25.000.000,-`. USD sebagai paralel untuk cross-border investor, bukan primer.
- Source line wajib untuk setiap statistik pasar: BPS, Bank Indonesia, OJK, Kominfo, atau riset firm Indonesia (DSResearch, Populix, Snapcart). Riset asing (McKinsey, Bain, Statista) boleh dipakai tapi paralel dengan sumber lokal.
- Tim slide: pendidikan format Indonesia (universitas + jurusan + tahun lulus). Pengalaman kerja sebut nama perusahaan yang dikenal lokal.
- Kompetisi slide: sebut kompetitor lokal eksplisit. Klaim "no competitor" otomatis red flag.
- Regulasi slide WAJIB untuk fintech, healthtech, agritech, edutech, payment, dan kategori berregulasi. Sebut regulator dan status izin.
- Exit thesis: paham profile LP setiap VC. Mandiri Capital dan BRI Ventures prefer IDX; East Ventures, AC Ventures, Alpha JWC, Northstar lebih fleksibel SGX/US.
- Bahasa Indonesia primer, English untuk istilah investor standar (TAM, SAM, SOM, CAC, LTV, payback period, gross margin, exit thesis, LP).
- Tidak ada exclamation marks. Tone direktur ke direktur, bukan founder excited.
