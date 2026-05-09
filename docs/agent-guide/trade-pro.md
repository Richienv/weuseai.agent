# Trade Pro

Briefing pasar pagi, alert saham + crypto, ringkas laporan keuangan emiten, IDR/BI rate watcher. **Tidak auto-trade** — semua delivery via Telegram dengan one-line context, kamu yang eksekusi order.

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **Market briefing pagi** — jam 8 WIB recap IDX open, US/EU overnight, crypto major moves, event calendar hari ini.
- **Alert watcher** — set threshold saham / crypto (price, volume, news). Delivery via Telegram dengan one-line context.
- **Earnings summarizer** — ringkas laporan keuangan emiten (annual / quarterly): key metrics, surprises vs konsensus, audit notes, guidance change.
- **IDR/BI rate watcher** — track BI 7-day repo rate change + IDR vs USD/EUR/JPY major-currency cross-rates.
- **Bitget read-only (P1)** — view portfolio + open orders, tanpa execute trade.

---

## Sample tasks

- "Briefing pasar pagi aku" — jam 8 WIB, otomatis tanpa request kalau di-schedule.
- "Set alert BBCA jatuh di bawah 8500 atau naik di atas 9200" — alert tersimpan, masuk Telegram saat trigger.
- "Ringkas laporan Q2 ASII" — TL;DR 1 paragraf + 5 key metric + 2 surprise vs estimate.
- "BI rate hari ini berapa, naik atau turun dari minggu lalu?" — instant lookup.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `market-briefing` | Pro+ | Briefing pagi IDX + global + crypto + event |
| `alert-watcher` | Pro+ | Threshold-based alert via Telegram |
| `earnings-summarizer` | Pro+ | Laporan keuangan emiten ringkas |
| `idr-bi-watcher` | Pro+ | BI rate + IDR cross-rate |
| `bitget-readonly` | Studio | View portfolio + open orders Bitget |

---

## Source data

- **IDX:** scraping resmi via approved data feed (Phase 2 wire IDX official feed; Phase 1 scrape dari sumber agregat publik).
- **Crypto:** CoinGecko API.
- **Earnings:** scrape laporan resmi dari halaman emiten + IDX disclosure.
- **BI rate:** Bank Indonesia situs resmi.
- **News:** RSS dari Kontan, Bisnis Indonesia, Investor Daily — bukan recommendation source, hanya headline + lead.

Source diaudit reliable; agent flag claim "[unverified]" kalau source ambigu.

---

## Limitasi

- **Bukan financial advisor** — semua output adalah rangkuman + factual data, **bukan rekomendasi beli/jual**. Decision kamu sendiri.
- **Tidak auto-trade** — alert hanya delivery info. Kamu eksekusi order via broker app kamu sendiri.
- **Bitget integration read-only** — view portfolio, view open orders. Tidak ada API key write-permission.
- **Phase 2 add:** integrasi broker IDX (Mandiri Sekuritas, Stockbit, Ajaib) untuk view portfolio. Saat ini paste manual.

---

## Compliance note

Trade Pro bukan licensed financial advisor. Semua rangkuman adalah educational content. Untuk advice yang bisa kamu basis decision, konsultasi dengan financial planner certified.

---

## Kapan switch ke persona lain

- Kalau kamu butuh **akuntansi bisnis kamu sendiri (bukan saham)** → [Doc Expert](./doc-expert.md) untuk invoice + laporan keuangan basic.
- Kalau kamu butuh **research market mendalam** → [Deep Researcher](./deep-researcher.md).
- Kalau kamu butuh **briefing kerja umum (calendar + email)** → [The Pro](./the-pro.md).
