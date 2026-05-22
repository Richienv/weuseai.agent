# Template — Competitor Analysis Matrix

Matrix komparasi 5-10 kompetitor di 6-10 axis (pricing, positioning, market share, kekuatan, kelemahan, GTM, distribusi). Disertai narasi ringkas yang menyimpulkan landscape — bukan hanya tabel mentah.
Audience: tim produk yang validasi positioning, founder yang siapkan competitive section di pitch deck, atau analyst yang harus jelaskan "kita di mana di pasar ini".
Pakai untuk landscape-level scan. Untuk satu kompetitor yang dalam, gabungkan dengan `competitor-deep-dive.md`.

## Variables

- `{{market_segment}}` — string. Segmen pasar yang dianalisis (mis. "SaaS HR untuk UMKM Indonesia").
- `{{date_of_scan}}` — string. Tanggal kompilasi data (mis. "Mei 2026").
- `{{competitor_1_name}}` — string. Nama kompetitor #1.
- `{{competitor_1_pricing}}` — string. Struktur harga publik (mis. "Rp 99k/bulan/user, free trial 14 hari").
- `{{competitor_1_positioning}}` — string. Tagline atau positioning klaim (mis. "all-in-one HR untuk perusahaan 50-500 karyawan").
- `{{competitor_1_market_share}}` — string. Estimasi market share + source. Kalau tidak tersedia, tulis "tidak publik — proxy dari [signal]".
- `{{competitor_1_strengths}}` — string. 1-2 kekuatan terbesar.
- `{{competitor_1_weaknesses}}` — string. 1-2 kelemahan / gap yang teridentifikasi.
- `{{competitor_1_gtm}}` — string. GTM channel utama (mis. "outbound sales + partner dengan akuntan publik").
- `{{competitor_1_source}}` — string. Source numbered reference untuk baris ini.
- `{{competitor_2_name}}` — string.
- `{{competitor_2_pricing}}` — string.
- `{{competitor_2_positioning}}` — string.
- `{{competitor_2_market_share}}` — string.
- `{{competitor_2_strengths}}` — string.
- `{{competitor_2_weaknesses}}` — string.
- `{{competitor_2_gtm}}` — string.
- `{{competitor_2_source}}` — string.
- `{{competitor_3_name}}` — string.
- `{{competitor_3_pricing}}` — string.
- `{{competitor_3_positioning}}` — string.
- `{{competitor_3_market_share}}` — string.
- `{{competitor_3_strengths}}` — string.
- `{{competitor_3_weaknesses}}` — string.
- `{{competitor_3_gtm}}` — string.
- `{{competitor_3_source}}` — string.
- `{{competitor_4_name}}` — string. Opsional.
- `{{competitor_4_pricing}}` — string. Opsional.
- `{{competitor_4_positioning}}` — string. Opsional.
- `{{competitor_4_market_share}}` — string. Opsional.
- `{{competitor_4_strengths}}` — string. Opsional.
- `{{competitor_4_weaknesses}}` — string. Opsional.
- `{{competitor_4_gtm}}` — string. Opsional.
- `{{competitor_4_source}}` — string. Opsional.
- `{{competitor_5_name}}` — string. Opsional.
- `{{competitor_5_pricing}}` — string. Opsional.
- `{{competitor_5_positioning}}` — string. Opsional.
- `{{competitor_5_market_share}}` — string. Opsional.
- `{{competitor_5_strengths}}` — string. Opsional.
- `{{competitor_5_weaknesses}}` — string. Opsional.
- `{{competitor_5_gtm}}` — string. Opsional.
- `{{competitor_5_source}}` — string. Opsional.
- `{{landscape_summary}}` — string. Narasi 4-6 kalimat yang ringkas landscape: siapa pemimpin, mana clustering positioning, mana gap yang masih kosong, dan apa tren yang sedang bergerak.
- `{{gaps_in_data}}` — string. Field yang tidak bisa di-verify per kompetitor (mis. "market share semua private — proxy dari traffic estimasi"). Wajib diisi kalau ada.
- `{{full_source_list}}` — string. Daftar source lengkap dengan nomor referensi.

## Template

---
template: competitor-analysis
language: id
register: kamu
purpose: landscape-level competitor matrix + narrative
---

# Competitor Analysis — {{market_segment}}

**Tanggal scan:** {{date_of_scan}}

---

## Matrix

| Kompetitor | Pricing | Positioning | Market share | Kekuatan | Kelemahan | GTM | Source |
|---|---|---|---|---|---|---|---|
| {{competitor_1_name}} | {{competitor_1_pricing}} | {{competitor_1_positioning}} | {{competitor_1_market_share}} | {{competitor_1_strengths}} | {{competitor_1_weaknesses}} | {{competitor_1_gtm}} | {{competitor_1_source}} |
| {{competitor_2_name}} | {{competitor_2_pricing}} | {{competitor_2_positioning}} | {{competitor_2_market_share}} | {{competitor_2_strengths}} | {{competitor_2_weaknesses}} | {{competitor_2_gtm}} | {{competitor_2_source}} |
| {{competitor_3_name}} | {{competitor_3_pricing}} | {{competitor_3_positioning}} | {{competitor_3_market_share}} | {{competitor_3_strengths}} | {{competitor_3_weaknesses}} | {{competitor_3_gtm}} | {{competitor_3_source}} |
| {{competitor_4_name}} | {{competitor_4_pricing}} | {{competitor_4_positioning}} | {{competitor_4_market_share}} | {{competitor_4_strengths}} | {{competitor_4_weaknesses}} | {{competitor_4_gtm}} | {{competitor_4_source}} |
| {{competitor_5_name}} | {{competitor_5_pricing}} | {{competitor_5_positioning}} | {{competitor_5_market_share}} | {{competitor_5_strengths}} | {{competitor_5_weaknesses}} | {{competitor_5_gtm}} | {{competitor_5_source}} |

---

## Landscape summary

{{landscape_summary}}

## Gaps di data

{{gaps_in_data}}

---

## Sumber lengkap

{{full_source_list}}

> Aturan: positioning di tabel ini adalah klaim publik kompetitor — bukan penilaian Deep Researcher. Penilaian "apa kompetitor itu benar-benar deliver positioning-nya" masuk ke kolom kekuatan / kelemahan dengan source, bukan ke kolom positioning.

## Tone guide

Tabel ini adalah snapshot, bukan vonis. Kelemahan harus disandari source — bukan "produk-nya jelek menurut review user" tanpa link ke review tersebut. Market share yang tidak publik wajib ditandai "estimasi" atau "proxy dari [signal]" — tidak menebak angka diam-diam. Landscape summary ditulis seperti analis tetangga yang jujur, bukan deck investor: sebut clustering, gap, dan tren tanpa berlebihan. Tidak ada tanda seru, tidak ada "revolutionary" atau "game-changer" — banned per brand voice.
