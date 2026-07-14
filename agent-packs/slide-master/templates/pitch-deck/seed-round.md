# Template — Seed Round Pitch Deck

Audience: angel atau seed-stage VC. Use case: pre-revenue atau pra-product-market-fit, fundraising di ronde pertama yang serius. Scope: deck 12 slide lengkap, vision-forward dan team-led karena angka traction belum mature.

## Variables

- `{{company_name}}` — nama perusahaan atau produk
- `{{tagline}}` — satu kalimat positioning (≤12 kata)
- `{{founder_name}}` — nama founder yang presentasi
- `{{round_size_idr}}` — ukuran ronde dalam IDR (contoh: "Rp 8 miliar")
- `{{round_size_usd}}` — paralel dalam USD kalau audience cross-border (contoh: "$500K")
- `{{problem_one_liner}}` — satu kalimat masalah inti
- `{{problem_stat}}` — satu statistik yang ukur skala masalah (sertakan source)
- `{{customer_segment}}` — siapa yang paling kena masalah ini
- `{{solution_one_liner}}` — janji solusi dalam satu kalimat
- `{{vision_5yr}}` — gambaran 5 tahun ke depan kalau perusahaan ini berhasil
- `{{market_tam_idr}}` — TAM dalam IDR (sertakan source)
- `{{why_now}}` — tren atau perubahan struktural yang bikin sekarang waktunya
- `{{traction_proxies}}` — 3 sinyal pengganti revenue (waitlist size, LOI, pilot result, design partner)
- `{{team_strength}}` — 2-3 kalimat kenapa tim ini yang paling kapabel eksekusi
- `{{use_of_funds}}` — alokasi dana ronde (3-4 bucket dengan persentase)
- `{{milestones_18mo}}` — 3 milestone yang ronde ini fund

## Template

```
---
template: pitch-deck-seed-round
audience: seed-investor
duration_minutes: 10
slide_count: 12
language: id
---

# Slide 1 — Cover
**Title:** {{company_name}} — {{tagline}}
**Visual:** Logo perusahaan + nama founder + ronde size + tanggal
**Speaker note:** Bangun ruangan dulu. Sebut nama, perusahaan, dan satu kalimat kenapa kamu di sini hari ini. Jangan terburu-buru ke slide kedua. ~30 detik.

# Slide 2 — Masalah
**Title:** {{problem_one_liner}}
**Visual:** Satu statistik besar di tengah ({{problem_stat}}) + satu kutipan singkat dari {{customer_segment}}
**Speaker note:** Mulai dari rasa, bukan dari angka. Ceritakan satu cerita customer yang spesifik, baru sebut skalanya. ~75 detik.

# Slide 3 — Kenapa Sekarang
**Title:** Kenapa Sekarang
**Visual:** 2-3 perubahan struktural sebagai timeline atau before/after
**Speaker note:** Investor seed taruh taruhan pada momentum. Jelaskan {{why_now}} dengan tren makro yang bisa diverifikasi, bukan opini. ~60 detik.

# Slide 4 — Solusi
**Title:** {{solution_one_liner}}
**Visual:** Satu screenshot produk atau diagram 3-langkah cara kerja
**Speaker note:** Janji solusi dalam satu kalimat. Lalu tunjukkan satu hal yang produk ini lakukan beda. Jangan list semua feature. ~75 detik.

# Slide 5 — Visi 5 Tahun
**Title:** Visi {{company_name}}
**Visual:** Satu kalimat besar {{vision_5yr}} di atas latar polos
**Speaker note:** Di seed, visi jual lebih keras dari produk. Ceritakan dunia yang berbeda kalau ini berhasil. Hindari kata "platform" atau "ecosystem" tanpa bukti. ~60 detik.

# Slide 6 — Pasar
**Title:** Pasar yang Dituju
**Visual:** TAM/SAM/SOM diagram tiga lingkaran, angka {{market_tam_idr}} di yang paling luar
**Speaker note:** Sebut angka dengan source. Akui sisi konservatif estimasi — investor seed apresiasi founder yang kalem soal angka. ~60 detik.

# Slide 7 — Traction Sejauh Ini
**Title:** Sinyal Awal
**Visual:** 3 panel sejajar untuk {{traction_proxies}} — waitlist, LOI, pilot, design partner
**Speaker note:** Frame ini sebagai bukti permintaan, bukan revenue. "Belum ada penjualan, tapi ini yang sudah kami validasi." Jujur soal apa yang belum diukur. ~90 detik.

# Slide 8 — Produk
**Title:** Produk Saat Ini
**Visual:** 2-3 screenshot atau short demo GIF placeholder
**Speaker note:** Tunjukkan apa yang sudah jalan hari ini. Pisahkan dengan jelas mana yang live vs roadmap. ~75 detik.

# Slide 9 — Model Bisnis (ringkas)
**Title:** Cara Kami Akan Hasilkan Uang
**Visual:** Diagram revenue model: siapa bayar, untuk apa, berapa
**Speaker note:** Di seed cukup directional. Sebut pricing yang kamu pertimbangkan dan logika di baliknya. Jangan janji unit economics presisi yang belum kamu uji. ~60 detik.

# Slide 10 — Tim
**Title:** Tim
**Visual:** Foto + nama + 1 baris kredensial inti per founder
**Speaker note:** Ini slide terpenting di pitch seed. Jelaskan {{team_strength}} — kenapa tim ini, kenapa sekarang, kenapa bisa menang. ~90 detik.

# Slide 11 — Ask & Use of Funds
**Title:** Ask: {{round_size_idr}} ({{round_size_usd}})
**Visual:** Pie chart {{use_of_funds}} + 3 milestone {{milestones_18mo}} sebagai timeline 18 bulan
**Speaker note:** Sebut angka. Sebut alokasi. Sebut milestone yang ronde ini fund. Tutup dengan kalimat "Kalau kami capai ini, ronde A jadi obvious." ~75 detik.

# Slide 12 — Kontak
**Title:** Terima Kasih
**Visual:** Nama founder + email + nomor + link deck
**Speaker note:** Buka Q&A. Punya appendix siap untuk pertanyaan teknis, kompetisi, dan unit economics — tapi jangan tunjukkan kecuali ditanya. ~30 detik.
```

## Tone guide

- Vision-forward, bukan metrics-forward. Investor seed beli mimpi yang kredibel; angka mereka tidak akan dapat banyak di tahap ini.
- Tim sebagai bukti utama. Slide 10 dapat porsi waktu lebih banyak dari rata-rata.
- Jujur soal apa yang belum tervalidasi. "Belum kami uji" lebih kuat dari "akan kami uji nanti" yang ambigu.
- Hindari kata `revolutionary`, `disrupt`, `10x`. Hindari menyebut diri "first-mover" tanpa data antitesis.
- Bahasa Indonesia primer, English untuk istilah investor standar (traction, TAM, design partner, LOI).
- Calm-premium. Tidak ada exclamation marks di body deck.
