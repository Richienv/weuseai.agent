# idr-bi-rate-watcher — Hermes skill

Bundle: trade-pro (v2 — moved from Macro Strategist)
Tier: pro+
Handler: `hermes-skill:idr-bi-rate-watcher` (Hermes pulls latest IDR/USD + BI rate via customer's BYOK LLM with web access; reasons over recent moves)

## Kapan dipakai

Customer minta update soal nilai tukar IDR atau BI rate. Trigger phrases:

- "rupiah hari ini"
- "IDR break level"
- "BI rate decision"
- "kurs dolar"
- "BI rate prediksi"
- "rupiah melemah / menguat"
- "Fed FOMC vs BI rate"

Juga: ketika customer cerita konteks bisnis import/export atau hutang USD-denominated yang terpapar IDR risk.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `kind` | enum: spot-rate \| level-break \| bi-decision \| explainer | tidak | Default spot-rate kalau pertanyaan singkat |
| `pair` | string | tidak | Default IDR/USD. Bisa custom (IDR/SGD, IDR/JPY, IDR/CNH) |
| `context` | enum: business-import \| business-export \| usd-debt \| portfolio \| general | tidak | Informs recommendation framing |

## Yang dilakukan

1. Pull current IDR/USD dari sumber publik (Bloomberg / Yahoo / BI website — customer's BYOK LLM web-fetch).
2. Compare ke level psikologis (15.000, 15.500, 16.000) + 30-day moving average.
3. Compare BI rate ke Fed Funds Rate spread + last 4 BI Board decisions trajectory.
4. Output structured response:
   - **Spot rate:** Current level + delta vs 1d / 7d / 30d.
   - **Context:** Capital flow data (terakhir tersedia di laporan SBN), cadangan devisa (sumber: BI weekly), inflasi vs target (BPS).
   - **Implication for customer:** Frame berdasarkan `context` field — mis. business-import → cost impact, usd-debt → repayment burden estimate.
5. Disclaimer: "Aku surface data + framing. Aku bukan licensed financial advisor — keputusan trade / hedge tetap kamu yang make."

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "IDR/USD: 15.842 (per [time]). 1d change: +0.32% (depresiasi). 30d MA: 15.730. BI rate stayed at 6.00% per Sept Board, Fed Funds Rate 5.25-5.50%, spread 0.50-0.75bps narrow.
>
> Context buat kamu: business-import. Setiap 1% IDR depresiasi ~ adjusts COGS [estimate]%. Aku surface signal kalau IDR break 15.500 (next psychological level above current MA).
>
> Sumbernya: BI weekly (cadangan devisa $148bn last week, +$2bn). BPS Sept inflation 3.0%. Aku bukan FA — keputusan hedge tetap kamu."

## Decline criteria

- **Forecast harga.** Aku decline kalau request "kurs minggu depan berapa?" — surface scenario range tapi NOT point forecast.
- **Suggest specific hedge product** (forward, NDF, swap). Aku surface mechanic-nya umum, tapi pilih instrumen tetap customer + bank treasury kamu.
- **Insider info.** Kalau ada signal yang sumbernya unverifiable (Twitter rumor about BI Board), aku flag.

## Decline kalau missing context

Kalau cuma "berapa IDR sekarang" — kasih spot + simple delta tanpa framing. Customer bisa ask follow-up.
