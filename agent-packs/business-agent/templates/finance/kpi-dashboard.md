# Template — KPI Dashboard

Dashboard KPI bulanan: revenue, new customers, churn, ARPU, gross margin, runway. Target vs actual dengan status RAG (Red / Amber / Green). Format ringkas — satu halaman, scannable dalam 30 detik.

Audience: founder, exec team, head-of-function. Bukan untuk publik atau pitch deck — internal only.

## Variables

- `{{period}}` — periode KPI, misal "Oktober 2026".
- `{{revenue_actual}}` / `{{revenue_target}}` — pendapatan periode berjalan vs target.
- `{{new_customers_actual}}` / `{{new_customers_target}}` — customer baru.
- `{{churn_pct_actual}}` / `{{churn_pct_target}}` — churn rate (logo churn untuk subscription, atau revenue churn).
- `{{arpu_actual}}` / `{{arpu_target}}` — Average Revenue Per User per bulan.
- `{{gross_margin_actual}}` / `{{gross_margin_target}}` — gross margin persen.
- `{{runway_months_actual}}` / `{{runway_months_target}}` — runway dalam bulan.
- `{{rag_revenue}}` / `{{rag_*}}` — status warna per KPI: Green (≥95% target), Amber (80-95%), Red (<80%).

## Template

```
# KPI Dashboard — {{period}}

## Snapshot

Anda menutup {{period}} dengan 4 KPI Green, 1 Amber, 1 Red. Detail di bawah.

## Grid

| KPI                   | Target          | Aktual          | Pencapaian | Status   |
|-----------------------|-----------------|-----------------|------------|----------|
| Revenue bulanan       | Rp 200 jt       | Rp 218 jt       | 109%       | Green    |
| Customer baru         | 12              | 9               | 75%        | Red      |
| Churn rate            | ≤ 3,0%          | 2,4%            | (di bawah target — baik) | Green |
| ARPU                  | Rp 1,8 jt       | Rp 1,95 jt      | 108%       | Green    |
| Gross margin          | 70,0%           | 67,5%           | 96%        | Amber    |
| Runway                | 12 bulan        | 14 bulan        | 117%       | Green    |

## Status RAG

- **Green:** pencapaian ≥ 95% target (atau lebih baik dari target untuk metrik invers seperti churn).
- **Amber:** pencapaian 80-95% target — perhatikan, belum perlu intervensi besar.
- **Red:** pencapaian < 80% target — perlu action plan eksplisit di review bulan depan.

## Catatan per KPI

- **Customer baru (Red):** Anda hanya menutup 9 dari 12 target. Penyebab: pipeline Q3 yang slip ke November (3 deal tertunda kontrak). Action: tracking weekly pipeline ke channel sales, target close 2 dari 3 deal di minggu pertama November.
- **Gross margin (Amber):** turun 2,5pp vs target karena biaya provisioning per customer meningkat (Vultr SGP rate naik). Action: re-evaluasi mix tier Pro vs Studio untuk customer baru — dorong upsell ke Studio yang margin lebih tinggi.
- **Lainnya:** on track, lanjutkan baseline.

## Periode berikutnya

Target {{period}} berikutnya: revenue Rp 235 jt, customer baru 14, churn ≤ 3,0%, gross margin 70%. Update target setiap akhir kuartal.
```

## Tone guide

Formal exec register — Anda form. Angka rapi (IDR, persen dengan koma desimal). Status RAG eksplisit per baris. Catatan per KPI hanya untuk yang Amber/Red — Green dilewat, jangan over-explain. Zero exclamation marks, zero kata banned.
