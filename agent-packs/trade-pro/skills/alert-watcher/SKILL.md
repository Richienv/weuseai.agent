# alert-watcher — Hermes skill

Bundle: trade-pro
Tier: pro+
Handler: `hermes-skill:alert-watcher` (Hermes registers customer's threshold rules locally; cron polls market data + fires Telegram alert when triggered)

## Kapan dipakai

Customer set / list / cancel alert rules. Trigger phrases:

- "set alert BBCA di 10.500"
- "alert kalau BTC tembus 95k"
- "list alert aktif"
- "cancel alert ASII"
- "alert volume spike INDF"

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `action` | enum: set \| list \| cancel | ya | Default set kalau ambigu |
| `ticker` | string | ya untuk set / cancel | IDX (BBCA, ASII) atau crypto pair (BTCUSDT) |
| `condition` | enum: price-above \| price-below \| volume-spike \| news-trigger | ya untuk set | |
| `threshold` | number / string | ya untuk set | Angka untuk price; multiplier (mis. 3x) untuk volume |
| `expires_at` | ISO date | tidak | Default 30 hari dari sekarang |

## Yang dilakukan

1. **Set:** Validasi ticker + threshold, simpan rule ke `/var/lib/weuseai/customer-grown/alerts.jsonl` (append-only). Cron job 1-min interval polls market data + fires Telegram one-liner kalau threshold hit.
2. **List:** Read alerts.jsonl, surface aktif rules dalam tabel.
3. **Cancel:** Mark rule status='cancelled' (don't delete — keeps history).

## Output

Persona-voice wrapper untuk alert fire:

> "🔔 Alert BBCA: tembus Rp 10.500 (set kemarin). Spot: 10.520. Volume: 1.2x avg. Harga break above 30-day MA. Aku ngga kasih buy/sell call — kamu yang putuskan."

## Decline criteria

- **Auto-trade trigger.** Aku fire alert, tidak execute trade.
- **High-frequency / latency-sensitive alert.** Aku 1-min polling — kalau customer butuh sub-second, pakai exchange-native alert.
