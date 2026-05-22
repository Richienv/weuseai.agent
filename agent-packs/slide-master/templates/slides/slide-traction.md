# Template — Slide Traction (Single Slide)

Audience: kamu sedang draft satu slide traksi untuk deck yang lebih besar. Use case: slide traction stand-alone — satu chart pertumbuhan, 3 KPI angka, dan satu milestone callout. Scope: satu slide saja, slot ke pitch deck investor atau update internal.

## Variables

- `{{primary_chart_type}}` — jenis chart: "line" / "bar" / "area" / "cohort-heatmap"
- `{{primary_chart_metric}}` — metrik utama yang di-chart (ARR, MAU, GMV, signed contracts, dll.)
- `{{primary_chart_period}}` — rentang waktu chart (contoh: "24 bulan terakhir", "Q1 2025 — Q2 2026")
- `{{primary_chart_data_source}}` — sumber data: customer-internal / data-room / placeholder
- `{{kpi_1_label}}` — KPI 1 label (contoh: "MRR Growth MoM")
- `{{kpi_1_value}}` — KPI 1 nilai aktual
- `{{kpi_2_label}}` — KPI 2 label
- `{{kpi_2_value}}` — KPI 2 nilai
- `{{kpi_3_label}}` — KPI 3 label
- `{{kpi_3_value}}` — KPI 3 nilai
- `{{milestone_callout}}` — satu milestone yang highlight (contoh: "Q3 2025: kontrak enterprise pertama Rp 2 miliar")
- `{{milestone_date}}` — tanggal atau periode milestone

## Template

```
---
template: slide-traction
slide_kind: traction
slide_count: 1
language: id
---

# Slide — Traksi
**Title:** Traksi Sejauh Ini

**Visual layout:**
- Header (atas, ringkas): "Traksi Sejauh Ini" + sub-line dengan periode {{primary_chart_period}}
- Center anchor (65% area): chart {{primary_chart_type}} dari {{primary_chart_metric}}, sumbu Y jujur (tidak truncated), inflection point ditandai
- Bottom strip 3 kolom: KPI 1 ({{kpi_1_label}}: {{kpi_1_value}}) | KPI 2 ({{kpi_2_label}}: {{kpi_2_value}}) | KPI 3 ({{kpi_3_label}}: {{kpi_3_value}})
- Callout (sudut atas chart, panah ke titik di kurva): "{{milestone_date}} — {{milestone_callout}}"

**Body text minimum:** Tidak ada paragraf. Chart + 3 angka + 1 callout. Sisanya whitespace + label sumbu yang jelas.

**Speaker note:**
Buka dengan chart — tunjukkan kurva, sebut metric dan periode. Walk ke inflection point: "Di {{milestone_date}}, kami {{milestone_callout}} — yang trigger akselerasi ini." Lalu sebut 3 KPI sebagai konteks tambahan. Tutup dengan satu kalimat soal apa yang ekstrapolasi ini suggest — tanpa over-promise. Total ~90-120 detik.

**Anti-pola yang dihindari:**
- Sumbu Y truncated untuk bikin kurva terlihat lebih curam — investor membaca ini sebagai red flag
- 8 KPI berjejal di bawah chart — pilih 3 yang paling relevan ke audience
- Chart cherry-picked window — kalau ada 12 bulan data, tunjukkan 12 bulan, bukan 6 bulan terbaik
- Milestone callout yang sifatnya marketing ("featured di TechCrunch") — pilih milestone yang prove demand atau revenue
- Data tanpa source kalau {{primary_chart_data_source}} = placeholder, label slide "[DATA NEEDED]" eksplisit
```

## Tone guide

- Satu chart yang berbicara sendiri lebih kuat dari 4 chart yang saling kanibal. Pilih metric utama, prioritaskan.
- Sumbu Y harus jujur. Truncated axis adalah lie-detector untuk investor sophisticated.
- 3 KPI di-pilih per audience. Investor: ARR, growth rate, NRR. Customer-facing: customer count, retention, NPS. Internal: leading indicators.
- Milestone callout proves momentum. Pilih milestone yang trigger sesuatu, bukan yang sifatnya vanity.
- Kalau data belum ada, jangan karang. Label `[DATA NEEDED]` lebih kredibel dari angka yang nanti harus dikoreksi.
- Bahasa Indonesia primer; English wajib untuk istilah metrik (ARR, MRR, MAU, NRR, cohort, inflection point).
- Tidak ada exclamation marks. Angka harus berbicara sendiri — tidak butuh penegasan emosional.
