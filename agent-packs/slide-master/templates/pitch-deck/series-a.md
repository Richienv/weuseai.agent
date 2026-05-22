# Template — Series A Pitch Deck

Audience: institutional VC ronde Series A. Use case: perusahaan dengan revenue jalan, sudah lewat product-market-fit awal, butuh capital untuk skala. Scope: deck 14 slide metrics-led, fokus pada unit economics dan growth path yang defensible.

## Variables

- `{{company_name}}` — nama perusahaan
- `{{tagline}}` — satu kalimat positioning
- `{{founder_name}}` — CEO atau founder yang presentasi
- `{{round_size_idr}}` — ukuran ronde A dalam IDR
- `{{round_size_usd}}` — paralel USD
- `{{arr_current}}` — Annual Recurring Revenue saat ini (atau revenue setahun terakhir)
- `{{arr_growth_yoy}}` — pertumbuhan YoY persen
- `{{customer_count}}` — jumlah customer aktif
- `{{cac_payback_months}}` — payback period CAC dalam bulan
- `{{ltv_cac_ratio}}` — rasio LTV/CAC
- `{{gross_margin_pct}}` — gross margin persen
- `{{net_retention_pct}}` — net revenue retention persen
- `{{logo_list}}` — 6-10 logo customer paling kuat
- `{{market_expansion_geo}}` — geo atau segmen yang ronde ini fund untuk dimasuki
- `{{team_hires_plan}}` — 5-7 role kunci yang akan di-hire pasca ronde
- `{{use_of_funds}}` — alokasi dana (4-5 bucket dengan persentase)
- `{{milestone_to_series_b}}` — milestone ARR atau metrik yang trigger ronde B

## Template

```
---
template: pitch-deck-series-a
audience: series-a-investor
duration_minutes: 15
slide_count: 14
language: id
---

# Slide 1 — Cover
**Title:** {{company_name}} — {{tagline}}
**Visual:** Logo + ronde A size + tanggal + ARR current sebagai sub-header
**Speaker note:** Pembukaan singkat. Sebut nama, perusahaan, dan satu metrik headline ({{arr_current}} ARR, growth {{arr_growth_yoy}}). ~30 detik.

# Slide 2 — Apa yang Sudah Kami Buktikan
**Title:** Posisi Hari Ini
**Visual:** 4 angka besar sejajar — ARR, growth YoY, customer count, NRR
**Speaker note:** Series A bukan tentang janji, tentang bukti. Lead dengan metrik. Setiap angka satu kalimat konteks. ~75 detik.

# Slide 3 — Masalah & Solusi (ringkas)
**Title:** Masalah yang Kami Selesaikan
**Visual:** Split slide — kiri masalah dengan satu kutipan customer, kanan solusi dengan satu screenshot
**Speaker note:** Sengaja ringkas. Investor Series A tidak butuh penjelasan masalah selama 5 menit kalau kamu sudah punya {{customer_count}} customer yang bayar. ~60 detik.

# Slide 4 — Pertumbuhan
**Title:** Pertumbuhan Revenue
**Visual:** Line chart ARR per bulan, 24 bulan terakhir. Tandai inflection point.
**Speaker note:** Tunjukkan kurva. Jelaskan apa yang trigger akselerasi. Sebut growth rate eksplisit ({{arr_growth_yoy}}). ~75 detik.

# Slide 5 — Unit Economics
**Title:** Unit Economics
**Visual:** Tabel 4 baris — CAC payback ({{cac_payback_months}} bulan), LTV/CAC ({{ltv_cac_ratio}}x), Gross Margin ({{gross_margin_pct}}%), NRR ({{net_retention_pct}}%)
**Speaker note:** Ini slide yang investor stare-in-on. Jelaskan metodologi singkat per metrik. Jangan over-explain — angka harus berbicara sendiri. ~120 detik.

# Slide 6 — Customer Logos & Case
**Title:** Customer Kami
**Visual:** Grid logo {{logo_list}} + 1 case study highlighted (nama, problem, hasil kuantitatif)
**Speaker note:** Logo bangun kredibilitas. Case study tunjukkan dampak. Pilih case yang outcome-nya bisa diukur. ~75 detik.

# Slide 7 — Retention Cohort
**Title:** Cohort Retention
**Visual:** Cohort heatmap atau layer chart 12 bulan
**Speaker note:** Retention adalah lie-detector untuk product-market-fit. Tunjukkan cohort yang nge-flat di bulan 3-6, bukan yang masih turun. Jujur kalau retention awal masih bocor. ~75 detik.

# Slide 8 — Pasar & Ekspansi
**Title:** Pasar yang Belum Tersentuh
**Visual:** Peta {{market_expansion_geo}} + ukuran segmen baru + timeline entry
**Speaker note:** Sebut TAM saat ini vs TAM setelah ekspansi. Jelaskan kenapa sekarang waktunya ekspansi, bukan tahun depan. ~75 detik.

# Slide 9 — Kompetisi
**Title:** Posisi Kompetitif
**Visual:** 2x2 matrix dengan 2 sumbu yang paling diferensiasi, posisi {{company_name}} dan 4-5 kompetitor
**Speaker note:** Pilih sumbu yang menonjolkan moat asli kamu. Jangan rekayasa sumbu yang bikin kamu sendirian di pojok kanan-atas — investor membaca itu. ~60 detik.

# Slide 10 — Produk & Roadmap
**Title:** Produk
**Visual:** 3 screenshot produk + roadmap 12 bulan sebagai swim lane
**Speaker note:** Tunjukkan produk yang shipping hari ini. Roadmap singkat — apa yang ronde ini bangun. ~75 detik.

# Slide 11 — Tim Scale-up
**Title:** Tim & Rencana Hiring
**Visual:** Org chart current + {{team_hires_plan}} sebagai gap chart
**Speaker note:** Series A funds hiring. Sebut role kunci yang akan di-hire dan kenapa role itu critical untuk milestone berikut. ~90 detik.

# Slide 12 — Model & Pricing
**Title:** Model Bisnis & Pricing
**Visual:** Pricing tier + breakdown revenue per segmen
**Speaker note:** Sebut harga aktual. Jelaskan kenapa pricing ini, dan bukti expansion revenue (NRR > 100% kalau ada). ~60 detik.

# Slide 13 — Ask & Use of Funds
**Title:** Ask: {{round_size_idr}} ({{round_size_usd}})
**Visual:** Pie {{use_of_funds}} + milestone {{milestone_to_series_b}} sebagai timeline 18-24 bulan ke ronde B
**Speaker note:** Sebut angka. Sebut alokasi konkret. Tutup dengan milestone metric yang ronde ini deliver — ARR target untuk ronde B. ~90 detik.

# Slide 14 — Kontak & Appendix
**Title:** Terima Kasih
**Visual:** Founder contact + link deck + catatan "appendix tersedia"
**Speaker note:** Buka Q&A. Appendix wajib siap: detail cohort, breakdown CAC per channel, sensitivity analysis pricing, churn analysis. Jangan tunjukkan kecuali ditanya. ~30 detik.
```

## Tone guide

- Metrics-led. Setiap klaim ditopang angka yang bisa diaudit. Vision masih ada tapi tidak dominan.
- Operator-tone, bukan founder-mimpi. Series A investor mau lihat kamu sebagai operator yang sudah punya muscle memory soal angka.
- Akui bottleneck. Investor tahu setiap bisnis Series A punya satu metrik yang belum perfect — sebut duluan sebelum mereka tanya.
- Hindari `game-changer`, `next-level`, `10x`. Sebut growth dalam angka aktual, bukan multiplier marketing-speak.
- Bahasa Indonesia primer; English wajib untuk istilah keuangan SaaS (ARR, NRR, CAC, LTV, cohort, payback).
- Calm-premium. Tidak ada exclamation marks. Tone serius, presisi.
