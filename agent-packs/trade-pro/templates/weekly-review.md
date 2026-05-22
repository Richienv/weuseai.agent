# Template — Weekly review

Review mingguan trading customer — biasanya Jumat sore atau Sabtu pagi WIB. Bukan summary horizontal hasil trading saja; ini refleksi proses: best trade, worst trade, tema minggu, dan adjustment untuk minggu depan.

## Variables

- `{{week_label}}` — string, label minggu (mis. "Minggu 21, 18-22 Mei 2026")
- `{{trades_taken}}` — string, jumlah trade closed minggu ini (mis. "7 trade", "3 trade")
- `{{pnl_summary}}` — string, PnL minggu dalam Rupiah atau USD plus persen vs modal aktif (mis. "+Rp 3.4 juta, +6.8% vs modal trading", "-180 USDT, -2.3%")
- `{{win_rate}}` — string, jumlah trade yang profit dari total (mis. "4 dari 7 trade profit, 57%")
- `{{best_trade_summary}}` — string, 2-3 kalimat: instrumen + apa yang dilakukan benar. Fokus ke proses (entry sesuai plan, sizing disiplin), bukan ke besar profit
- `{{worst_trade_summary}}` — string, 2-3 kalimat: instrumen + apa yang bisa dipelajari. Bukan untuk self-flagellation — yang dievaluasi keputusan dengan info saat itu, bukan dengan hindsight
- `{{theme_of_week}}` — string, 1-2 kalimat tema utama minggu — driver pasar dominan, behavior pattern customer sendiri, atau kondisi macro (mis. "Pasar didorong rotasi dari growth ke value, IHSG sideways dengan volatilitas tinggi di big banks")
- `{{plan_adherence}}` — string, observasi seberapa konsisten plan diikuti minggu ini (mis. "5 dari 7 trade mengikuti exit plan tertulis; 2 trade exit di-improvisasi")
- `{{adjustments}}` — markdown bullet list, perubahan konkret untuk minggu depan. Bukan goal abstrak — adjustments yang bisa diobservasi (mis. "Pre-fill exit plan sebelum entry, no exception", "Skip trade kalau confidence cuma 'low' — minggu ini 2 trade low confidence semua loss")

## Template

# Weekly review — {{week_label}}

## PnL minggu ini

- Trade closed: {{trades_taken}}
- PnL: **{{pnl_summary}}**
- Win rate: {{win_rate}}

## Best trade

{{best_trade_summary}}

## Worst trade

{{worst_trade_summary}}

## Tema minggu

{{theme_of_week}}

## Plan adherence

{{plan_adherence}}

## Adjustment untuk minggu depan

{{adjustments}}

---

*Review ini bukan untuk menghakimi hasil tunggal. Yang dievaluasi proses + keputusan dengan info saat itu — bukan hasil dengan keuntungan hindsight.*

## Tone guide

Reflektif, balanced, tanpa drama. Best trade tidak dirayakan berlebihan ("genius play"), worst trade tidak dijadikan self-flagellation ("aku bodoh"). Bahasa: "yang dilakukan benar", "yang bisa dipelajari" — proses-oriented. Tema minggu surface pola pasar atau pola customer, bukan opini macro. Adjustments harus konkret + observable di minggu berikutnya — bukan "lebih disiplin" yang tidak bisa diukur. Disiplin penutup: hindsight bukan kriteria evaluasi. Tidak ada "rev trade hari ini biar balikin loss" — Trade Pro tidak hype revenge trading.
