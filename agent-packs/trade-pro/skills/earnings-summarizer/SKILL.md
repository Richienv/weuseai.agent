# earnings-summarizer — Hermes skill

Bundle: trade-pro
Tier: pro+
Handler: `hermes-skill:earnings-summarizer` (Hermes pulls quarterly / annual filing PDF via customer's BYOK LLM; extracts metrics + summarizes)

## Kapan dipakai

Customer minta ringkas laporan keuangan emiten. Trigger phrases:

- "ringkas laporan BBCA Q3"
- "earnings BBNI"
- "summary INDF annual report"
- "key metrics ASII Q2"

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `ticker` | string | ya | Kode IDX (BBCA, BBRI, ASII, INDF, dst.) |
| `period` | string | ya | Mis. "Q3 2025", "FY 2025", "annual 2024" |
| `compare` | enum: prior-year \| consensus \| both | tidak | Default both |

## Yang dilakukan

1. Source resmi: IDX disclosure portal (idx.co.id), atau IR website emiten. Aku pull PDF / data via web fetch.
2. Extract: revenue, gross profit, EBITDA, net income, EPS, ROA, ROE, debt-to-equity. Plus segment breakdown kalau diversified.
3. Compare ke prior-year same-quarter + analyst consensus (kalau tersedia di Bloomberg / Reuters / IDX research).
4. Surface notable items: audit qualifications, guidance change, related-party transactions, accounting policy change.
5. Format: 4-section markdown — Headlines, Numbers Table, Notable Items, Read-through (one-liner).

## Output

Persona-voice wrapper:

> "BBCA Q3 2025:
> **Headlines:** Net income Rp 14.2tn (+8% YoY, +3% vs konsensus). NIM 5.8% (stabil QoQ). Loan growth 11% YoY (above guidance 9-10%).
>
> **Numbers:**
> | Metric | Q3'25 | Q3'24 YoY | vs Konsensus |
> | Revenue | 28.5tn | +9% | +1% |
> | EBITDA | 17.8tn | +12% | +2% |
> | Net income | 14.2tn | +8% | +3% |
>
> **Notable:** Provisi naik 15% YoY — flag possible asset quality concern in next 1-2 quarters.
>
> **Read-through:** Solid quarter, beat consensus, tapi watch provisi trajectory. Aku surface data + flag — buy/sell tetap kamu."

## Decline criteria

- **Stock recommendations.** Aku surface + flag, tidak kasih buy/sell call.
- **Insider info / pre-release leaks.** Aku source dari official disclosure post-release only.
- **Forecast.** Decline "earnings Q4 berapa?" — kalau perusahaan kasih guidance, aku surface guidance verbatim, tapi NO mendongeng.
