# Template — Board Update Deck

Audience: board of directors atau investor existing yang berhak update reguler. Use case: update bulanan atau kuartalan ke board — KPIs, ringkasan keuangan, wins, risiko, dan keputusan yang butuh approval board. Scope: deck 10 slide presisi, tone direksi.

## Variables

- `{{company_name}}` — nama perusahaan
- `{{period}}` — periode update (contoh: "Mei 2026" atau "Q1 2026")
- `{{ceo_name}}` — CEO yang presentasi
- `{{north_star_metric}}` — metrik utama perusahaan (ARR, MAU, GMV, dll.)
- `{{north_star_value}}` — nilai aktual metrik utama periode ini
- `{{north_star_delta}}` — delta vs periode sebelumnya (% atau absolute)
- `{{kpi_table}}` — 4-6 KPI sekunder dengan baseline, target, actual, status
- `{{cash_on_hand}}` — saldo kas saat ini
- `{{burn_rate}}` — net burn bulanan
- `{{runway_months}}` — runway dalam bulan
- `{{wins_period}}` — 2-3 wins material
- `{{risks_period}}` — 2-3 risiko yang board perlu tahu
- `{{decisions_for_board}}` — keputusan yang butuh board vote atau input
- `{{appendix_topics}}` — topik appendix yang siap kalau ditanya

## Template

```
---
template: pitch-deck-board-update
audience: board-of-directors
duration_minutes: 30
slide_count: 10
language: id
---

# Slide 1 — Cover
**Title:** {{company_name}} — Board Update {{period}}
**Visual:** Logo + periode + CEO name + tanggal meeting
**Speaker note:** Pembukaan singkat. Sebut periode, agenda 4 bagian (performance, financials, risk, decisions), dan jam estimasi. ~20 detik.

# Slide 2 — North Star
**Title:** {{north_star_metric}}: {{north_star_value}}
**Visual:** Satu angka besar di tengah dengan delta {{north_star_delta}} + sparkline 12 periode terakhir
**Speaker note:** Frame seluruh meeting di sekitar satu angka. Sebut nilai, delta, dan apakah on-track vs board plan. ~45 detik.

# Slide 3 — KPI Dashboard
**Title:** KPI Periode Ini
**Visual:** Tabel {{kpi_table}} — KPI | baseline | target | actual | status (color-coded: green/amber/red)
**Speaker note:** Walk through baris per baris. Untuk yang red atau amber, sebut root cause dalam satu kalimat. Detail di appendix kalau board minta. ~120 detik.

# Slide 4 — Ringkasan Keuangan
**Title:** Posisi Keuangan
**Visual:** 4 angka sejajar — Cash on hand ({{cash_on_hand}}), Net burn bulanan ({{burn_rate}}), Runway ({{runway_months}} bulan), Revenue periode ini
**Speaker note:** Sebut runway dalam bulan eksplisit. Sebut next milestone yang akan diraih dalam window runway — supaya board tahu fundraising urgency. ~75 detik.

# Slide 5 — Wins Material
**Title:** Wins Periode Ini
**Visual:** 2-3 wins {{wins_period}}, masing-masing satu paragraf dengan outcome konkret
**Speaker note:** Material wins, bukan ceremonial. Customer marquee baru, kontrak besar, milestone produk yang shift narrative. Skip wins yang sifatnya BAU. ~75 detik.

# Slide 6 — Risiko & Mitigasi
**Title:** Risiko yang Board Perlu Tahu
**Visual:** Per risk {{risks_period}}: deskripsi, probability, impact, mitigasi, indikator awal
**Speaker note:** Board lebih marah kalau mereka tahu risiko dari sumber lain, bukan dari kamu. Surface lebih awal lebih baik. Untuk risiko yang sudah jadi insiden, sebut dengan jujur. ~120 detik.

# Slide 7 — Customer & Pasar (signal)
**Title:** Sinyal Pasar
**Visual:** 2-3 data point: customer NPS, pipeline coverage, kompetisi update, ekspansi
**Speaker note:** Optional kalau periode ini ada perubahan signifikan di pasar. Skip kalau status quo. ~60 detik.

# Slide 8 — Tim
**Title:** Tim
**Visual:** Headcount current + hires periode ini + departures + open roles kritis
**Speaker note:** Sebut hires senior yang baru join, departures yang material, dan open roles yang masih kosong. Board akan tanya kalau executive role kosong > 60 hari. ~45 detik.

# Slide 9 — Keputusan untuk Board
**Title:** Decisions for Board
**Visual:** Per decision {{decisions_for_board}}: konteks, opsi, rekomendasi management, dampak finansial atau strategis, deadline
**Speaker note:** Eksplisit soal apa yang butuh vote, apa yang butuh input. Sebut rekomendasi management dengan reasoning singkat. ~120 detik.

# Slide 10 — Appendix Index
**Title:** Appendix Tersedia
**Visual:** List {{appendix_topics}} — topik yang siap dibahas detail kalau board minta
**Speaker note:** Buka Q&A. Appendix wajib: cohort detail, P&L line item, sales pipeline detail, customer churn analysis, cap table jika ada perubahan. Jangan tunjukkan kecuali diminta. ~Q&A 10-15 menit.
```

## Tone guide

- Presisi-direksi. Setiap angka dengan source. Setiap klaim bisa diaudit.
- Bukan storytelling, bukan jualan. Board sudah commit modal — mereka mau fiduciary update, bukan pitch ulang.
- Surface risiko proaktif. Board yang ditemukan tahu risiko dari sumber lain hilang trust selamanya.
- Decisions di-frame eksplisit. "Kami butuh vote board untuk X" lebih baik dari "kami pikir X bagus."
- Bahasa Indonesia primer; English wajib untuk istilah board/finance (runway, burn rate, NRR, cap table, pipeline coverage).
- Tidak ada exclamation marks. Tidak ada superlatif. Tone neutral, direktur ke direktur.
