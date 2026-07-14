# Template — Trading journal entry

Satu trade per entry, append-only. Dipakai customer untuk catat setiap posisi yang sudah closed — bukan untuk rencana, bukan untuk wishlist. Fokusnya: data eksekusi + alasan + pelajaran, supaya pola muncul setelah 20-30 entry.

## Variables

- `{{trade_date}}` — string, tanggal entry trade dalam WIB (mis. "Senin, 23 Mei 2026")
- `{{instrument}}` — string, ticker atau pair (mis. "BBCA", "BTCUSDT", "ETHUSDT")
- `{{direction}}` — string, "long" atau "short"
- `{{entry_price}}` — string, harga masuk dengan satuan (mis. "Rp 9.850", "67.420 USDT")
- `{{exit_price}}` — string, harga keluar dengan satuan
- `{{position_size}}` — string, ukuran posisi (mis. "300 lot", "0.15 BTC", "Rp 12 juta notional")
- `{{risk_amount}}` — string, jumlah Rupiah atau USD yang dirisikokan (mis. "Rp 600 ribu", "120 USDT")
- `{{thesis}}` — string, alasan masuk trade dalam 1-2 kalimat (mis. "Breakout di resistance 9.800 dengan volume 2x rata-rata, tren bulanan masih naik")
- `{{outcome}}` — string, hasil dalam Rupiah atau USD dan persen (mis. "+Rp 1.2 juta, +8.4%", "-180 USDT, -3.1%")
- `{{plan_followed}}` — string, "ya" atau "tidak" — apakah eksekusi sesuai rencana (entry, stop, exit) yang ditulis sebelum masuk
- `{{lesson}}` — string, 1-2 kalimat pelajaran yang bisa dipakai di trade berikutnya. Fokus ke proses, bukan ke hasil

## Template

# Journal — {{trade_date}}

**Instrument:** {{instrument}}
**Arah:** {{direction}}
**Posisi:** {{position_size}}

## Eksekusi

- Entry: {{entry_price}}
- Exit: {{exit_price}}
- Risk yang ditaruh: {{risk_amount}}

## Thesis saat masuk

{{thesis}}

## Hasil

{{outcome}}

Plan diikuti? {{plan_followed}}

## Pelajaran

{{lesson}}

---

*Catatan ini data eksekusi, bukan rekomendasi. Yang dievaluasi proses, bukan hasil tunggal.*

## Tone guide

Datar, faktual, tanpa emosi. Bukan tempat curhat "harusnya aku jual lebih cepat" — itu di lesson, dalam kalimat yang berorientasi proses ("besok aku tunggu konfirmasi candle close sebelum exit", bukan "aku bodoh"). Append-only — entry lama tidak diedit walau hasilnya jelek; review berkala lihat pola di 20-30 entry, bukan revisi satu per satu. Disiplin bahasa: arah dalam "long/short", bukan "naik harapan/buy the dip". Tidak ada "moon", "lambo", "ape in" — Trade Pro persona profesional.
