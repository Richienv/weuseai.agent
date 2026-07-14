# Template — Deck Launch Produk Indonesia

Audience: tim internal pemasaran, distributor, retailer, atau press. Use case: peluncuran produk baru ke pasar Indonesia — barang konsumsi (FMCG), hardware konsumen, layanan digital, fashion, F&B. Deck membahas GTM (Go-To-Market) yang spesifik Indonesia: marketplace channel mix, payment method mix, pricing regional, dan checklist regulasi.

Beda dari product launch deck global: channel mix yang reflect realitas pasar Indonesia (Tokopedia / Shopee / TikTok Shop / Lazada split), payment method mix dominan QRIS + e-wallet, pricing yang sadar regional difference (Jabodetabek vs Tier-2 cities vs luar Jawa), dan regulasi sektoral yang wajib (BPOM untuk konsumsi, SNI untuk hardware, Komdigi untuk digital service, MUI untuk produk berlabel halal).

## Variables

- `{{nama_produk}}` — nama produk yang diluncurkan
- `{{kategori_produk}}` — kategori (FMCG, hardware, fashion, F&B, digital service, beauty, dll.)
- `{{tanggal_launch}}` — tanggal peluncuran resmi
- `{{harga_idr}}` — harga eceran (HET) dalam IDR
- `{{harga_regional}}` — variasi harga per region (Jabodetabek, Tier-2, luar Jawa) kalau berbeda
- `{{segmen_target}}` — segmen demografis target (umur, kelas SES, lokasi)
- `{{positioning_id}}` — positioning satu kalimat dalam BI
- `{{channel_mix}}` — split channel: offline retail (%), Tokopedia (%), Shopee (%), TikTok Shop (%), Lazada (%), Blibli (%), direct/website (%)
- `{{payment_mix}}` — split payment: QRIS (%), GoPay (%), OVO (%), DANA (%), ShopeePay (%), Virtual Account bank (%), kartu kredit (%), COD (%)
- `{{regulasi_checklist}}` — checklist regulasi: BPOM (konsumsi, kosmetik), SNI (hardware, elektronik), Komdigi (digital service), MUI Halal (produk berlabel halal), KAN (testing), dll.
- `{{influencer_tier}}` — strategi KOL: mega (>1M followers), makro (100K-1M), mikro (10K-100K), nano (<10K)
- `{{marketing_budget_idr}}` — total budget marketing peluncuran dalam IDR
- `{{target_sales_3bulan}}` — target penjualan 3 bulan pertama dalam IDR atau unit

## Template

```
---
template: deck-launch-produk-indonesia
audience: tim-internal-distributor-press
duration_minutes: 30
slide_count: 14
language: id
---

# Slide 1 — Cover
**Title:** Peluncuran {{nama_produk}}
**Visual:** Hero shot produk + nama lengkap + tagline + tanggal launch {{tanggal_launch}} + kategori {{kategori_produk}}
**Speaker note:** Buka dengan produk shot yang mengesankan. Sebut nama produk, kategori, dan tanggal peluncuran. ~30 detik.

# Slide 2 — Konteks Pasar Indonesia
**Title:** Lanskap Pasar
**Visual:** 3 data utama dengan sumber: ukuran pasar kategori {{kategori_produk}} di Indonesia (sumber: Euromonitor Indonesia, Statista ID, Nielsen Indonesia, atau BPS), pertumbuhan YoY, top 3 pemain existing
**Speaker note:** Sebut ukuran pasar dalam IDR dengan sumber lokal. Sebut top 3 pemain — kalau Lokal vs MNC mix penting untuk positioning. ~75 detik.

# Slide 3 — Segmen Target
**Title:** Untuk Siapa Produk Ini
**Visual:** Profil segmen {{segmen_target}}: umur, kelas SES (A/B/C berdasarkan riset Nielsen Indonesia), lokasi (Jabodetabek vs Tier-2 vs luar Jawa), perilaku konsumsi
**Speaker note:** Spesifik. "Ibu rumah tangga 28-40, SES B, urban Tier-1, aktif di Instagram dan TikTok, belanja mingguan via Shopee" lebih kuat dari "konsumen kelas menengah Indonesia". ~75 detik.

# Slide 4 — Produk
**Title:** Tentang {{nama_produk}}
**Visual:** 3-4 shot produk dari sudut berbeda, packaging tampilan depan + belakang, ukuran/kemasan, USP (Unique Selling Proposition) 3 bullet
**Speaker note:** Tunjukkan produk dari sudut yang menghasilkan packaging shot yang siap pakai untuk marketplace listing. ~90 detik.

# Slide 5 — Positioning
**Title:** Positioning
**Visual:** {{positioning_id}} dalam tipografi besar + positioning map 2x2 vs kompetitor (sumbu yang relevan kategori — premium vs mass, traditional vs innovative, dll.)
**Speaker note:** Positioning satu kalimat. Tunjukkan di mana {{nama_produk}} duduk vs kompetitor lokal dan MNC. ~75 detik.

# Slide 6 — Harga & Strategi Pricing
**Title:** Harga Eceran Tertinggi
**Visual:** Harga HET {{harga_idr}} dalam tipografi besar. Tabel variasi regional kalau ada {{harga_regional}}: Jabodetabek (Rp X), Tier-2 (Rp Y), Luar Jawa (Rp Z). Sertakan margin distributor + retailer + reseller
**Speaker note:** Sebut HET eksplisit. Untuk produk dengan distribusi via reseller (FMCG, kosmetik), sebut margin per layer supaya channel partner langsung kalkulasi profitabilitas. Konfirmasi harga include atau exclude PPN 11%. ~90 detik.

# Slide 7 — Channel Mix
**Title:** Channel Distribusi
**Visual:** Pie chart {{channel_mix}} — split offline retail vs marketplace. Untuk marketplace, breakdown per platform: Tokopedia, Shopee, TikTok Shop, Lazada, Blibli, direct/website. Sertakan timeline rollout per channel
**Speaker note:** Realitas pasar Indonesia 2026: Shopee dan TikTok Shop dominan untuk impulse purchase (fashion, beauty, FMCG kecil), Tokopedia kuat untuk pertimbangan dan elektronik, Lazada kuat di kategori premium dan B2B. Offline tetap penting untuk FMCG (Indomaret, Alfamart) dan F&B. ~90 detik.

# Slide 8 — Payment Method Mix
**Title:** Metode Pembayaran
**Visual:** Pie chart {{payment_mix}} — split QRIS, GoPay, OVO, DANA, ShopeePay, Virtual Account bank, kartu kredit, COD. Sertakan biaya merchant per metode
**Speaker note:** Realitas pasar Indonesia 2026: QRIS jadi backbone digital payment lintas e-wallet, GoPay dan ShopeePay dominan di marketplace masing-masing, OVO dan DANA bertarung di Tier-2 cities. COD masih relevan untuk produk >Rp 200.000,- di luar Jawa. Sebut biaya merchant supaya tim finance hitung net margin. ~75 detik.

# Slide 9 — Marketing Plan
**Title:** Marketing Plan 90 Hari
**Visual:** Timeline 3 fase: Pre-launch (T-30 hari sampai T-1), Launch (T0 sampai T+14), Sustain (T+15 sampai T+90). Per fase: aktivitas digital, aktivitas offline, KOL tier {{influencer_tier}}, PR activation
**Speaker note:** Pre-launch fokus building anticipation via teaser dan KOL seeding. Launch day fokus media kit dan first-week sales push. Sustain fokus retention dan repurchase. ~120 detik.

# Slide 10 — KOL Strategy
**Title:** KOL & Influencer
**Visual:** Per tier {{influencer_tier}}: jumlah KOL, platform utama (TikTok / Instagram / YouTube), estimasi budget per KOL dalam IDR, expected reach dan engagement
**Speaker note:** Strategi KOL Indonesia 2026: mega-KOL untuk awareness blanket (1-2 KOL), makro untuk credibility (5-10 KOL), mikro dan nano untuk authenticity dan conversion (20-50 KOL). UGC seeding via TikTok lebih effective dari paid post untuk produk konsumsi. ~90 detik.

# Slide 11 — Regulatory Checklist
**Title:** Checklist Regulasi
**Visual:** Tabel {{regulasi_checklist}}: regulasi | regulator | status (sudah / dalam proses / belum) | timeline | risiko kalau tidak terpenuhi
**Speaker note:** Sebut regulasi yang wajib per kategori. Konsumsi: BPOM (registrasi MD untuk dalam negeri, ML untuk impor). Kosmetik: BPOM notifikasi. Hardware elektronik: SNI wajib + sertifikat Postel kalau ada komponen radio. Digital service: Pendaftaran PSE Komdigi (PP 71/2019). Produk berlabel halal: sertifikat MUI atau BPJPH (UU JPH 33/2014). ~120 detik.

# Slide 12 — Target Sales
**Title:** Target Penjualan 3 Bulan
**Visual:** {{target_sales_3bulan}} dalam IDR atau unit, breakdown per bulan, breakdown per channel, breakdown per region. Visualisasi: bar chart dengan target dan stretch goal
**Speaker note:** Target realistis lebih kredibel dari target agresif. Sebut asumsi: market share target, distribusi outlet, conversion rate marketplace. ~90 detik.

# Slide 13 — Budget Marketing
**Title:** Budget Marketing Peluncuran
**Visual:** Pie chart {{marketing_budget_idr}} — alokasi: KOL (Rp X), paid ads digital Meta/TikTok/Google (Rp Y), PR (Rp Z), event launch (Rp K), sample & seeding (Rp L), trade marketing offline (Rp M)
**Speaker note:** Sebut budget absolut dalam IDR. Untuk produk konsumsi, alokasi umum: 40-50% paid digital, 20-30% KOL, 10-15% trade marketing, sisanya event dan PR. ~75 detik.

# Slide 14 — Risiko & Kontingensi
**Title:** Risiko & Kontingensi
**Visual:** Per risiko (regulasi tertunda, supply chain disruption, kompetisi launch barengan, KOL crisis, marketplace platform issue): probability, impact, mitigasi, decision trigger
**Speaker note:** Tutup dengan kesadaran risiko. Risiko paling umum di pasar Indonesia: regulasi (BPOM atau Komdigi) tertunda — siapkan plan B launch tanpa channel tertentu. KOL crisis — siapkan kontrak dengan morality clause. ~90 detik.
```

## Tone guide

- Semua angka uang dalam IDR dengan format titik ribuan: `Rp 25.000.000,-`. Konsisten — jangan campur dengan USD.
- Sumber data pasar: Euromonitor Indonesia, Statista ID, Nielsen Indonesia, Kantar Worldpanel, BPS untuk demografis. Riset asing wajib paralel dengan sumber lokal.
- Channel mix harus reflect realitas pasar Indonesia 2026: Shopee dan TikTok Shop dominan, Tokopedia kuat di consideration, Lazada di premium. Offline tetap penting untuk FMCG (Indomaret, Alfamart) dan F&B.
- Payment mix harus include QRIS sebagai backbone. E-wallet dominan: GoPay, OVO, DANA, ShopeePay. COD masih relevan di luar Jawa untuk produk >Rp 200.000,-.
- Pricing wajib konfirmasi include atau exclude PPN 11% (per UU HPP 2021 — PPN naik dari 10% ke 11% sejak April 2022, ke 12% direncanakan tapi cek status terkini).
- Regulasi sektoral wajib disebut: BPOM (konsumsi, kosmetik per UU 18/2012 dan UU 36/2009), SNI (hardware per UU 20/2014), Komdigi (digital service per PP 71/2019), MUI atau BPJPH (halal per UU JPH 33/2014), Postel (perangkat radio).
- Strategi KOL Indonesia: mix tier. Mega untuk awareness, makro untuk credibility, mikro dan nano untuk authenticity dan conversion. UGC TikTok lebih effective dari paid post untuk produk konsumsi.
- Bahasa Indonesia primer. English untuk istilah marketing standar (KOL, UGC, GTM, CPM, CTR, conversion rate) tapi paralel dengan istilah Indonesia.
- Tidak ada exclamation marks. Tone marketing lead ke tim eksekusi.
