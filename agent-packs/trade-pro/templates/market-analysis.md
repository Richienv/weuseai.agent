# Template — Market analysis

Analisis terstruktur untuk satu instrumen atau satu market — saham IDX, crypto pair, atau index. Bukan briefing harian (itu `market-briefing-format.md`); ini analisis lebih dalam saat customer minta context khusus sebelum ambil keputusan.

## Variables

- `{{instrument}}` — string, nama market atau ticker (mis. "BBCA", "BTCUSDT", "IDX Composite")
- `{{analysis_date}}` — string, tanggal analisis dalam WIB
- `{{timeframe}}` — string, horizon analisis (mis. "1-2 minggu ke depan", "swing 2-4 minggu", "intraday")
- `{{current_price}}` — string, harga terakhir dengan timestamp source
- `{{trend_summary}}` — string, 1-2 kalimat ringkas tren — arah + struktur (mis. "Uptrend di harian, sideways di mingguan. Higher highs masih intact sejak Maret.")
- `{{key_levels}}` — markdown bullet list, level support / resistance utama dengan harga
- `{{catalysts}}` — markdown bullet list, event atau driver dalam horizon analisis (mis. earnings, FOMC, halving, BI rate, dividend ex-date)
- `{{setup_description}}` — string, 2-3 kalimat menjelaskan kondisi pasar saat ini dan setup yang sedang berkembang. Tidak menyebut entry / exit spesifik — itu di exit-plan
- `{{risks}}` — markdown bullet list, hal yang bisa membatalkan thesis (level break, news risk, macro shift)
- `{{confidence}}` — string, "high conviction" / "moderate" / "low" mengikut SOUL.md tag system
- `{{data_sources}}` — markdown bullet list, sumber data + tanggal akses

## Template

# Analisis — {{instrument}}

**Tanggal:** {{analysis_date}}
**Timeframe:** {{timeframe}}
**Harga saat analisis:** {{current_price}}

## Trend

{{trend_summary}}

## Key levels

{{key_levels}}

## Catalysts dalam timeframe

{{catalysts}}

## Setup saat ini

{{setup_description}}

## Risk yang membatalkan thesis

{{risks}}

## Confidence

Tag: **{{confidence}}**

## Sumber data

{{data_sources}}

---

*Ini analisis berbasis data publik, bukan financial advice. Sizing, entry, dan stop kamu yang putuskan — lihat `position-size-calculator.md` dan `exit-plan.md`.*

## Tone guide

Analytical, terstruktur, tidak agitatif. Bahasa "setup yang berkembang" / "level yang dipantau" — bukan "siap meledak" / "target 50% naik". Confidence tag wajib hadir (mengikut SOUL.md). Risk section sama pentingnya dengan thesis — analisis tanpa risk = setengah analisis. Tidak ada price target spesifik di analisis ini; target di exit-plan, dengan methodology yang clear. Disclaimer di akhir wajib — analisis bukan rekomendasi. Tidak ada "moon", "to the moon", "supercycle" — Trade Pro tidak hype narasi.
