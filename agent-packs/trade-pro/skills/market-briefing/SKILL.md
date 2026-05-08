# market-briefing — Hermes skill

Bundle: trade-pro
Tier: pro+
Handler: `hermes-skill:market-briefing` (Hermes pulls market data via customer's BYOK LLM with web access; reasons + composes briefing)

## Kapan dipakai

Customer minta briefing pasar pagi. Trigger phrases:

- "briefing pasar"
- "kabar pasar pagi"
- "market open recap"
- "IDX hari ini"
- "what moved overnight"

Juga: cron-triggered tiap pagi jam 8 WIB via Hermes scheduler kalau customer enable.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `scope` | enum: idx-only \| crypto-only \| comprehensive | tidak | Default comprehensive |
| `tickers_focus` | array string | tidak | Custom list of tickers customer punya / monitor |

## Yang dilakukan

1. Pull data — IDX top movers (gainers / losers / volume), US/EU overnight indices (S&P, Nasdaq, Stoxx), crypto top 10 24h moves.
2. Surface event calendar hari ini (earnings season Indonesia + globally, FOMC, BI rate, dividend ex-date).
3. Format briefing markdown ringkas (5-8 bullets), include sentiment one-liner.

## Output

Persona-voice wrapper:

> "Briefing pasar [tanggal WIB]:
> - IDX: open +0.5% di 7,520. Top gainer BBCA +2.1%, top laggard ASII -1.8%.
> - US overnight: S&P +0.3%, Nasdaq +0.6% on Powell dovish tone.
> - Crypto: BTC 92.4k (+1.2% 24h), ETH 3.5k flat.
> - Event hari ini: Q3 BI rate decision 14:30 WIB, BBNI earnings release.
> - Sentiment: cautiously constructive — IDX overhang from rupiah depresiasi, tapi US momentum positive."

## Decline criteria

- **Forecast / point predictions.** Decline kalau "IDX besok berapa?" — surface scenario range, bukan target.
- **Stock recommendations.** Aku surface data + context. Buy/sell decision tetap customer.
