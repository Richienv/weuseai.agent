# Template — Narrative Arc 10-Slide Outline

Audience: founder atau presenter yang mau scaffolding sebelum drafting. Use case: scaffolding kerangka deck 10 slide pakai story arc generik yang fit untuk fundraising, customer pitch, atau internal vision share. Scope: outline saja — judul, arc act, key visual brief. Belum konten slide.

## Variables

- `{{company_name}}` — nama perusahaan atau inisiatif
- `{{audience_type}}` — investor / customer / internal / mixed
- `{{north_star_claim}}` — satu kalimat klaim utama deck ini
- `{{problem_one_liner}}` — masalah inti
- `{{why_now_signal}}` — tren atau perubahan yang bikin sekarang waktunya
- `{{solution_one_liner}}` — janji solusi
- `{{market_size}}` — TAM atau segmen yang dituju
- `{{product_proof_point}}` — bukti produk jalan (screenshot, demo, atau metrik)
- `{{traction_signal}}` — sinyal tarikan (revenue, user, LOI, pilot)
- `{{model_one_liner}}` — bagaimana monetisasi
- `{{competition_axis}}` — sumbu diferensiasi vs kompetitor
- `{{team_credibility}}` — kenapa tim ini yang bisa eksekusi
- `{{ask_one_liner}}` — apa yang diminta dari audience

## Template

```
---
template: narrative-arc-10slide-outline
audience: presenter-author
purpose: scaffolding-before-drafting
slide_count: 10
language: id
---

# Outline: {{company_name}} — Deck untuk {{audience_type}}

Story arc: problem → why now → solution → market → product → traction → model → competition → team → ask.
Setiap slide dapat satu baris brief. Belum tulis konten — outline ini untuk approval struktur sebelum draft.

## Slide 1 — Masalah
**Arc act:** Problem
**Working title:** {{problem_one_liner}}
**Visual brief:** Satu statistik besar atau satu kutipan customer di tengah
**Note untuk draft:** Mulai dari rasa, baru angka. Cerita customer yang spesifik lebih kuat dari general claim.

## Slide 2 — Kenapa Sekarang
**Arc act:** Why Now
**Working title:** Kenapa Sekarang Waktunya
**Visual brief:** Timeline 2-3 perubahan struktural ({{why_now_signal}})
**Note untuk draft:** Tren makro yang bisa diverifikasi, bukan opini. Investor & buyer butuh signal momentum.

## Slide 3 — Solusi
**Arc act:** Solution
**Working title:** {{solution_one_liner}}
**Visual brief:** Satu screenshot produk atau diagram 3-langkah cara kerja
**Note untuk draft:** Janji dalam satu kalimat. Lalu tunjukkan satu hal yang produk ini lakukan beda dari status quo.

## Slide 4 — Pasar
**Arc act:** Market
**Working title:** Pasar yang Dituju
**Visual brief:** TAM/SAM/SOM tiga lingkaran, angka {{market_size}} di yang paling luar
**Note untuk draft:** Sebut source. Akui sisi konservatif estimasi.

## Slide 5 — Produk
**Arc act:** Product
**Working title:** Produk Hari Ini
**Visual brief:** 2-3 screenshot atau short demo placeholder ({{product_proof_point}})
**Note untuk draft:** Pisahkan apa yang live vs roadmap. Tunjukkan bukti produk shipping.

## Slide 6 — Traksi
**Arc act:** Traction
**Working title:** Sinyal Tarikan
**Visual brief:** 3 metrik sejajar atau line chart growth ({{traction_signal}})
**Note untuk draft:** Pilih metrik yang paling relevan ke audience. Investor: ARR/growth. Customer: customer count + logo. Internal: leading indicator.

## Slide 7 — Model
**Arc act:** Model
**Working title:** Cara Monetisasi
**Visual brief:** Diagram revenue model: siapa bayar, untuk apa, berapa ({{model_one_liner}})
**Note untuk draft:** Sebut harga aktual atau pricing tier. Hindari "akan kami tentukan."

## Slide 8 — Kompetisi
**Arc act:** Competition
**Working title:** Posisi Kompetitif
**Visual brief:** 2x2 matrix dengan sumbu {{competition_axis}}, posisi kamu + 3-4 kompetitor
**Note untuk draft:** Pilih sumbu yang menonjolkan moat asli. Hindari sumbu rekayasa yang bikin kamu sendirian di pojok kanan-atas.

## Slide 9 — Tim
**Arc act:** Team
**Working title:** Tim
**Visual brief:** Foto + nama + 1 baris kredensial inti per anggota kunci ({{team_credibility}})
**Note untuk draft:** Untuk seed deck slide ini paling lama. Untuk customer pitch lebih ringkas — buyer lebih peduli case study daripada CV founder.

## Slide 10 — Ask
**Arc act:** Ask
**Working title:** {{ask_one_liner}}
**Visual brief:** Sesuai konteks — investor: pie use-of-funds + milestone; customer: pricing + next step; internal: decision/resource ask
**Note untuk draft:** Eksplisit. Tutup dengan call to action yang konkret dan tenggat.
```

## Tone guide

- Outline ini scaffolding, bukan deck final. Tujuannya supaya presenter approve struktur sebelum invest waktu drafting tiap slide.
- Setiap slide punya tiga elemen wajib: judul kerja, visual brief, dan satu catatan drafting. Tidak ada konten slide aktual.
- Sesuaikan kedalaman slide 9 (tim) dan 10 (ask) ke {{audience_type}} — outline default ini netral, hapus atau tukar slide sesuai konteks.
- Bahasa Indonesia primer; istilah English seperti "arc act", "visual brief", "traction" tetap karena ini scaffolding internal presenter.
- Saat outline ini disetujui, baru tulis konten penuh per slide pakai template deck yang sesuai (seed-round, series-a, customer-facing, dll.).
- Tidak ada exclamation marks. Calm, presisi, scaffolding mode.
