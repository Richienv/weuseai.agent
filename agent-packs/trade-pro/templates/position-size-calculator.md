# Template — Position size calculator

Worksheet ukuran posisi sebelum entry. Dipakai untuk menghitung jumlah lot, koin, atau notional yang sesuai dengan risiko yang sudah customer set — bukan untuk membenarkan posisi yang sudah dipikir di awal. Formula tetap, angka customer yang masukkan.

## Variables

- `{{account_size}}` — string, total modal aktif untuk trading (mis. "Rp 50 juta", "8.000 USDT"). Bukan total kekayaan — cuma modal yang dialokasikan untuk trading
- `{{risk_per_trade_pct}}` — string, persen modal yang siap hilang per trade (mis. "1%", "0.5%"). Anjuran umum: 0.5-2% untuk akun aktif
- `{{instrument}}` — string, ticker atau pair (mis. "BBCA", "BTCUSDT")
- `{{entry_price}}` — string, harga entry yang direncanakan dengan satuan
- `{{stop_price}}` — string, harga stop-loss yang direncanakan dengan satuan. Harus di-set sebelum hitung size — bukan setelah
- `{{contract_unit}}` — string, satuan posisi (mis. "lot (100 saham)", "BTC", "kontrak futures"). Tergantung instrument
- `{{worked_calculation}}` — markdown bullet list, hasil hitung step-by-step (lihat formula di bawah)
- `{{final_size}}` — string, ukuran posisi akhir yang sesuai (mis. "200 lot", "0.08 BTC")
- `{{notional_value}}` — string, total nilai posisi pada harga entry (mis. "Rp 9.8 juta", "5.450 USDT")

## Template

# Position size — {{instrument}}

## Input

- Account size: {{account_size}}
- Risk per trade: {{risk_per_trade_pct}}
- Entry: {{entry_price}}
- Stop: {{stop_price}}
- Satuan: {{contract_unit}}

## Formula

```
risk_amount    = account_size × risk_per_trade_pct
stop_distance  = |entry_price − stop_price|
position_size  = risk_amount ÷ stop_distance
```

## Hitungan

{{worked_calculation}}

## Hasil

- Ukuran posisi: **{{final_size}}**
- Notional saat entry: {{notional_value}}

---

*Sizing ini mengikat ke stop yang sudah kamu set. Kalau stop digeser saat trade berjalan, ukuran posisi tidak ikut berubah — yang berubah cuma jumlah risiko yang kamu pikul.*

## Tone guide

Mekanis, deterministik. Tidak ada saran "size besar karena confidence tinggi" — confidence bukan input formula. Bahasa risk-first: kalimat penutup mengingatkan bahwa size adalah konsekuensi dari risk + stop, bukan dari keyakinan trade. Bahasa Indonesia primer, kamu form. Worked calculation pakai angka, bukan klaim. Tidak ada "leverage maksimal", "all-in", "YOLO" — Trade Pro tidak hype leverage.
