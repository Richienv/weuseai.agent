# bitget-readonly — Hermes skill (P1)

Bundle: trade-pro (v2 — NEW)
Tier: pro+
Handler: `external:bitget-readonly` (calls Bitget REST API with customer's read-only API key from VPS env)

## Kapan dipakai

Customer punya akun Bitget dan minta surface portfolio data. Trigger phrases:

- "cek portfolio Bitget"
- "P&L Bitget hari ini"
- "balance Bitget"
- "funding rate [pair]"
- "open positions"
- "Bitget snapshot"

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `view` | enum: balance \| open-positions \| pnl-today \| funding-rate \| order-history-recent | ya | Tanyakan kalau ambigu |
| `pair` | string | hanya untuk funding-rate | Mis. BTCUSDT, ETHUSDT |
| `time_window` | enum: today \| 7d \| 30d | tidak | Default today |

## Yang dilakukan

1. **Validasi env:** Customer harus pasang `BITGET_API_KEY`, `BITGET_API_SECRET`, `BITGET_PASSPHRASE` di .env via dashboard. Read-only scope only — cek via Bitget API permissions endpoint dulu, decline kalau scope writes/withdrawals enabled.
2. **API call** ke Bitget endpoint sesuai `view`:
   - `balance` → `/api/v2/spot/account/assets` + `/api/v2/mix/account/accounts` (futures)
   - `open-positions` → `/api/v2/mix/position/all-position`
   - `pnl-today` → `/api/v2/mix/account/account-bills` (filter by today)
   - `funding-rate` → `/api/v2/mix/market/current-fund-rate`
   - `order-history-recent` → `/api/v2/mix/order/history-orders` (last 50)
3. **Format output** dengan currency formatting (Rp atau USDT depending on pair quote).
4. **Disclaimer ketat:** "Aku read-only. Tidak execute trade. Untuk withdraw / deposit / order placement, kamu langsung di Bitget app."

## Output yang dikembalikan ke customer

Persona-voice wrapper untuk balance:

> "Balance Bitget kamu (per [timestamp]):
> - Spot: BTC 0.123 (~$8,200) | USDT 1,500
> - Futures (USDT-M): equity $9,400 | available margin $4,200
>
> Aku read-only — tidak ada akses trade execution."

Persona-voice wrapper untuk open positions:

> "Open positions Bitget (per [timestamp]):
> - BTCUSDT long 0.05 BTC | entry 92,400 | mark 91,800 | uPnL -$30 (-0.6%)
> - ETHUSDT short 1 ETH | entry 3,500 | mark 3,520 | uPnL -$20 (-0.6%)
>
> Total uPnL: -$50. Margin ratio: 14% (room cukup, tapi watch kalau kena 50%)."

## Decline criteria

- **Trade execution / withdrawal.** Hard decline. Customer harus action di Bitget app sendiri.
- **API key dengan scope writes / withdrawals enabled.** Aku detect via permissions endpoint, kasih warning ke customer + minta regenerate key dengan read-only only.
- **Future Phase 4: OAuth + execute scope.** Sekarang explicit decline.
- **Tax reporting / formal P&L statement.** Aku surface raw P&L data, customer convert ke laporan pajak sendiri (atau pakai accountant).

## Decline kalau missing context

Kalau "Bitget portfolio" — kasih `balance` view default + tawarkan dive deeper.

## Operational

API key configuration runbook (founder prep — Phase 2E-3+):
- Customer login Bitget → Settings → API Management
- Create API key dengan scope: **Read-only** (Trade dan Wallet "View" only; uncheck Execute / Withdraw / Transfer)
- Whitelist IP optional tapi disarankan (pakai customer's VPS IP)
- Customer paste 3 fields di dashboard: API Key, Secret, Passphrase
- Disimpan encrypted di customer's VPS `.env` — tidak ke platform DB
