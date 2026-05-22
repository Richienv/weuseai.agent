# Template — P&L Summary (Monthly / Quarterly)

Ringkasan laba-rugi bulanan atau kuartalan untuk konsumsi exec / founder / board. Bahasa formal (Anda form). Output siap dipakai di board update atau review internal — angka rapi, narasi pendek, fokus pada margin dan tren.

Audience: founder, exec team, board. Bukan untuk filing pajak (SPT 1771 punya format DJP terpisah).

## Variables

- `{{period}}` — periode laporan, misal "Q3 2026" atau "Oktober 2026".
- `{{prior_period}}` — periode pembanding, misal "Q2 2026" atau "September 2026".
- `{{currency}}` — biasanya `IDR`. Tampilkan dalam juta (jt) atau milyar (M) untuk angka besar.
- `{{revenue_total}}` — total pendapatan periode berjalan.
- `{{revenue_prior}}` — total pendapatan periode pembanding.
- `{{cogs_total}}` — total Cost of Goods Sold (atau Cost of Service untuk SaaS).
- `{{opex_marketing}}` / `{{opex_payroll}}` / `{{opex_infra}}` / `{{opex_other}}` — breakdown OpEx.
- `{{gross_margin_pct}}` — (Revenue − COGS) / Revenue × 100%.
- `{{operating_margin_pct}}` — (Revenue − COGS − OpEx) / Revenue × 100%.
- `{{narrative_id}}` — narasi 2-3 kalimat dalam Bahasa Indonesia.

## Template

```
# P&L Summary — {{period}}

## Headline

Anda menutup {{period}} dengan pendapatan {{revenue_total}} dan operating margin {{operating_margin_pct}}.
Pembanding {{prior_period}}: pendapatan {{revenue_prior}}.

## Revenue / COGS / OpEx

| Pos                | {{period}}         | {{prior_period}}   | Δ           |
|--------------------|--------------------|--------------------|-------------|
| Pendapatan         | Rp 1.240 jt        | Rp 980 jt          | +26,5%      |
| COGS               | Rp 372 jt          | Rp 314 jt          | +18,5%      |
| **Gross profit**   | **Rp 868 jt**      | **Rp 666 jt**      | **+30,3%**  |
| Marketing          | Rp 124 jt          | Rp 98 jt           | +26,5%      |
| Payroll            | Rp 380 jt          | Rp 320 jt          | +18,8%      |
| Infra + tooling    | Rp 42 jt           | Rp 38 jt           | +10,5%      |
| Lain-lain          | Rp 28 jt           | Rp 22 jt           | +27,3%      |
| **Operating profit** | **Rp 294 jt**    | **Rp 188 jt**      | **+56,4%**  |

## Margin

- Gross margin: {{gross_margin_pct}} (vs 68,0% di {{prior_period}})
- Operating margin: {{operating_margin_pct}} (vs 19,2% di {{prior_period}})

## Narasi singkat

{{narrative_id}}

Contoh: "Pertumbuhan pendapatan {{period}} didorong oleh dua kontrak retainer baru di segmen B2B (kontribusi 18% revenue). COGS naik proporsional karena biaya provisioning per customer ikut bertambah. OpEx tumbuh lebih lambat dari revenue — operating leverage mulai terasa. Fokus kuartal depan: stabilkan retention dan tahan growth rate payroll di bawah 15% QoQ."

## Catatan

- Angka belum termasuk PPN 11% (dilaporkan terpisah di SPT Masa PPN bila PKP).
- Setoran PPh badan estimasi {{period}}: lihat lampiran tax-filing-cycle.
- Untuk filing SPT Tahunan, gunakan format DJP 1771 — angka di sini bukan binding.
```

## Tone guide

Formal exec register — Anda form sepanjang dokumen. Angka rapi (rupiah dengan separator titik, persen dengan koma desimal). Narasi 2-3 kalimat, fokus penyebab dan implikasi, bukan deskripsi tabel. Hindari kata banned brand voice. Zero exclamation marks.
