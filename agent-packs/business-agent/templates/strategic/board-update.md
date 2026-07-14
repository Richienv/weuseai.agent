# Template — Monthly Board Update

Update bulanan untuk board / investor / advisor. Format 1-2 halaman: highlight, finansial, KPI, risiko, decision sought. Bahasa formal — Anda form sepanjang dokumen.

Audience: board members, lead investor, advisor formal. Konsumsi via email atau Notion link, bukan deck.

## Variables

- `{{period}}` — bulan laporan, misal "Oktober 2026".
- `{{founder_name}}` — penulis update, default founder.
- `{{highlight_1}}` / `{{highlight_2}}` / `{{highlight_3}}` — 3 highlight utama periode berjalan.
- `{{revenue_summary}}` — angka revenue + delta vs target.
- `{{burn_summary}}` — net burn + runway dalam bulan.
- `{{kpi_grid_ref}}` — referensi KPI dashboard (link atau ringkasan 6 baris).
- `{{risk_1}}` / `{{risk_2}}` — 2 risiko teratas, masing-masing dengan mitigation.
- `{{decision_sought}}` — keputusan / input yang Anda minta dari board (boleh kosong jika tidak ada).
- `{{next_milestone}}` — milestone bulan depan.

## Template

```
# Board Update — {{period}}

Dari: {{founder_name}}
Untuk: Board + Advisor
Tanggal kirim: 5 November 2026 (default minggu pertama bulan berikutnya)

---

## Ringkasan eksekutif

Anda menutup {{period}} dengan revenue Rp 218 jt (+9% vs target), runway 14 bulan, dan 9 customer baru (75% target). Tiga hal yang Anda minta perhatian board: (1) channel sales melambat, (2) hire 1 senior engineer Q1 2027, (3) opsi tier baru untuk segmen enterprise.

## Highlight bulan ini

1. {{highlight_1}} — contoh: "Signed retainer pertama di segmen enterprise (BUMN), nilai kontrak Rp 480 jt / tahun, mulai 15 November."
2. {{highlight_2}} — contoh: "Auto-greet flow shipped end-to-end, fresh-customer chain validated dalam 7 menit median."
3. {{highlight_3}} — contoh: "Tim engineering Anda bertambah 1 (mid-level), total headcount sekarang 9."

## Finansial

| Metrik                  | {{period}}      | vs bulan lalu  | vs target  |
|-------------------------|-----------------|----------------|------------|
| Revenue                 | Rp 218 jt       | +12%           | +9%        |
| OpEx                    | Rp 262 jt       | +4%            | sesuai     |
| Net burn                | Rp 44 jt        | −18%           | lebih baik |
| Kas akhir periode       | Rp 600 jt       | −7%            | sesuai     |
| Runway (base scenario)  | 14 bulan        | +1 bulan       | +2 bulan   |

## KPI ringkas

- Customer baru: 9 (target 12) — Red
- Churn rate: 2,4% (target ≤3,0%) — Green
- ARPU: Rp 1,95 jt (target Rp 1,8 jt) — Green
- Gross margin: 67,5% (target 70%) — Amber

Detail di KPI dashboard {{kpi_grid_ref}}.

## Risiko + mitigasi

1. **{{risk_1}}** — contoh: "Pipeline Q4 slow di segmen Pro tier. Tiga deal tertunda kontrak ke November. Mitigasi: tracking weekly + target close 2 dari 3 sebelum 15 November."
2. **{{risk_2}}** — contoh: "Vultr SGP rate naik 8%, gross margin Pro tier turun 2,5pp. Mitigasi: re-price tier Pro di Q1 2027 (+Rp 100 rb/bulan) atau dorong upsell Studio."

## Keputusan / input yang Anda minta

{{decision_sought}}

Contoh: "Anda mempertimbangkan tier Enterprise baru (Rp 24 jt setup, Rp 990 rb/bulan hosting, dedicated SLA). Mohon input board sebelum komit roadmap Q1 2027."

## Bulan depan

{{next_milestone}}

Contoh: "Target November: close 2 dari 3 deal pipeline, ship dashboard customer self-serve restart, dan finalkan pricing tier Enterprise untuk review board berikutnya."

---

_Lampiran: P&L summary, cash runway tracker, KPI dashboard — link di Notion._
```

## Tone guide

Formal exec register — Anda form, kalimat pendek, satu ide per kalimat. Angka rapi (IDR jt/M, persen koma desimal). Risiko harus disertai mitigasi konkret, bukan hanya identifikasi. Decision sought eksplisit — tulis "mohon input" atau "mohon approval", jangan vague. Zero exclamation marks. Hindari kata banned.
