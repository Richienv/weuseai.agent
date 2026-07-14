# Template — Customer-Facing Sales Deck

Audience: prospek yang sedang evaluasi pembelian. Use case: sales meeting first-call atau second-call — bukan internal review, bukan investor. Frame value pertama, bukti kedua, harga ketiga, langkah berikut keempat. Scope: deck 10 slide, tone outcome-first.

## Variables

- `{{company_name}}` — nama perusahaan kamu
- `{{product_name}}` — nama produk yang dijual
- `{{prospect_name}}` — nama perusahaan prospek
- `{{prospect_contact}}` — nama orang yang presentasi ke dia
- `{{prospect_pain}}` — masalah spesifik prospek yang kamu sudah diskon dari diskusi awal
- `{{outcome_promise}}` — outcome konkret yang produk kamu deliver (dalam istilah prospek)
- `{{proof_quantitative}}` — 1-2 angka dari customer sebelumnya yang prove outcome
- `{{customer_logos}}` — 4-6 logo customer yang relevan ke segmen prospek
- `{{case_study_name}}` — 1 case study yang paling mirip dengan prospek
- `{{case_study_result}}` — hasil kuantitatif case study
- `{{how_it_works_3_steps}}` — 3 langkah cara kerja yang dipresent ke prospek (bukan technical detail)
- `{{pricing_options}}` — 2-3 opsi harga atau paket
- `{{next_step}}` — langkah konkret berikut (pilot, trial, kontrak, technical scoping)
- `{{pilot_duration}}` — durasi pilot kalau itu next step
- `{{pilot_cost}}` — biaya pilot kalau berbayar

## Template

```
---
template: pitch-deck-customer-facing
audience: prospect-buyer
duration_minutes: 20
slide_count: 10
language: id
---

# Slide 1 — Cover
**Title:** {{product_name}} — untuk {{prospect_name}}
**Visual:** Logo {{company_name}} + logo {{prospect_name}} + nama {{prospect_contact}} + tanggal
**Speaker note:** Personalisasi sejak cover. Sebut nama prospek di kalimat pertama. "Hari ini saya tunjukkan bagaimana {{product_name}} bisa bantu {{prospect_name}} {{outcome_promise}}." ~30 detik.

# Slide 2 — Masalah yang Kamu Hadapi
**Title:** {{prospect_pain}}
**Visual:** Visualisasi masalah prospek — bisa diagram alur kerja current, atau quote dari diskusi awal
**Speaker note:** Refleksi balik masalah dengan kata-kata prospek. Kalau salah, prospek koreksi dan kamu dapat info lebih dalam. Kalau benar, prospek merasa didengar. ~75 detik.

# Slide 3 — Cost of Inaction
**Title:** Kalau Tidak Diselesaikan
**Visual:** 2-3 implikasi konkret kalau status quo bertahan — bisa dalam revenue lost, waktu, atau risiko operasional
**Speaker note:** Bantu prospek hitung biaya tidak melakukan apa-apa. Buyer butuh ini untuk justify keputusan internal mereka. ~60 detik.

# Slide 4 — Janji Kami
**Title:** {{outcome_promise}}
**Visual:** Satu kalimat besar di tengah slide, latar polos
**Speaker note:** Janji dalam istilah outcome, bukan feature. "Tim sales kamu akan close 30% lebih banyak deal," bukan "produk kami punya pipeline forecasting." ~45 detik.

# Slide 5 — Cara Kerja (3 langkah)
**Title:** Cara Kerjanya
**Visual:** 3-step diagram {{how_it_works_3_steps}} dengan ikon sederhana
**Speaker note:** Tiga langkah, tidak lebih. Pakai bahasa prospek, bukan jargon teknis. Demo singkat per langkah kalau memungkinkan. ~120 detik.

# Slide 6 — Bukti: Hasil Customer Lain
**Title:** Customer Kami Sudah Lihat Hasilnya
**Visual:** 2 angka besar {{proof_quantitative}} + logo grid {{customer_logos}}
**Speaker note:** Lead dengan angka. Logo customer yang relevan ke segmen prospek lebih berharga dari logo random. Jangan dump 30 logo. ~60 detik.

# Slide 7 — Case Study yang Mirip
**Title:** {{case_study_name}}
**Visual:** Before/after kuantitatif — kondisi awal, intervensi, hasil {{case_study_result}}, durasi
**Speaker note:** Pilih case study yang paling mirip dengan {{prospect_name}} — segmen, ukuran, atau use case. Ceritakan dalam 90 detik dengan struktur problem-action-result. ~90 detik.

# Slide 8 — Pricing
**Title:** Investment
**Visual:** Tabel {{pricing_options}} — opsi dengan harga, yang termasuk, dan rekomendasi untuk ukuran {{prospect_name}}
**Speaker note:** Sebut harga eksplisit. Jangan "kontak kami untuk pricing" — itu friction. Highlight opsi yang paling fit untuk prospek dengan reasoning singkat. ~75 detik.

# Slide 9 — Langkah Berikutnya
**Title:** Next Step: {{next_step}}
**Visual:** Timeline 4-6 minggu — kick-off, milestone, evaluation point
**Speaker note:** Sebut next step konkret. Kalau pilot: durasi {{pilot_duration}}, biaya {{pilot_cost}}, success criteria. Kalau kontrak: kapan bisa start, siapa yang perlu approve di sisi prospek. ~60 detik.

# Slide 10 — Q&A & Kontak
**Title:** Pertanyaan
**Visual:** Nama {{prospect_contact}} + email + nomor + kalendly link
**Speaker note:** Buka Q&A. Punya FAQ siap untuk objection umum (keamanan data, integrasi, SLA, kontrak). Tutup dengan komitmen waktu — "Saya kirim follow-up dan kontrak draft besok pagi." ~Q&A 10-15 menit.
```

## Tone guide

- Value-first. Outcome dulu, feature kedua. Buyer tidak peduli arsitektur kamu — mereka peduli hasil di bisnis mereka.
- Personalisasi nyata. Slide 1 dan 2 wajib pakai nama prospek dan masalah prospek dari diskusi awal. Generic deck terbaca seperti spam.
- Bukti kuantitatif. Angka dari customer lain lebih kuat dari klaim sendiri. Pakai logo customer yang relevan ke segmen.
- Harga eksplisit di slide. "Hubungi kami untuk pricing" friction yang membunuh momentum.
- Next step konkret. Setiap meeting harus tutup dengan komitmen langkah berikutnya, deadline, dan owner di kedua sisi.
- Bahasa Indonesia primer; English untuk istilah B2B standar (pilot, SLA, kick-off, success criteria, pipeline).
- Tidak ada exclamation marks. Tidak ada superlatif tipe "best-in-class" tanpa bukti. Calm-premium, sopan, fokus pada bisnis prospek.
