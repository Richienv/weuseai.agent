# Template — Risk checklist

Checklist pre-market sebelum buka layar trading hari itu. Bukan analisis pasar — ini cek kondisi customer sendiri: posisi yang sudah ada, exposure max, korelasi, kapital available, dan rating emosional. Tujuan: catch state buruk sebelum bertindak, bukan setelah.

## Variables

- `{{check_date}}` — string, tanggal checklist dalam WIB (mis. "Senin, 23 Mei 2026, 07:45 WIB")
- `{{open_positions_inventory}}` — markdown bullet list, posisi yang masih open per instrumen dengan ukuran + arah (mis. "BBCA long 200 lot dari 9.850", "BTCUSDT long 0.05 BTC dari 65.200")
- `{{total_exposure_pct}}` — string, total notional exposure sebagai persen modal trading aktif (mis. "62% — di bawah cap 80%")
- `{{exposure_cap}}` — string, cap maksimum yang customer set untuk diri sendiri (mis. "80% modal trading, sisa 20% buffer kering")
- `{{correlation_check}}` — string, observasi korelasi antar posisi (mis. "BBCA + BMRI + BBNI — 3 big bank, korelasi tinggi. Effective exposure ke sektor bank 45% modal", "Posisi spread di crypto + IDX, korelasi rendah")
- `{{capital_available}}` — string, Rupiah atau USD yang masih dingin (cash, belum di posisi) (mis. "Rp 18 juta available, 36% modal trading")
- `{{macro_flags}}` — markdown bullet list, event hari ini yang bisa pengaruhi posisi (mis. earnings BBCA hari ini, FOMC malam ini, BI rate decision). Isi "—" kalau tidak ada
- `{{emotional_rating}}` — string, self-rating 1-5 kondisi emosional. 1 = tenang + clear, 5 = panas + reactive. Jujur ke diri sendiri
- `{{emotional_note}}` — string, 1 kalimat konteks rating kalau perlu (mis. "Habis loss besar kemarin, rating 4 — hari ini sizing dipangkas separuh", "Rating 2, tidur cukup, market normal")
- `{{go_no_go}}` — string, keputusan: "GO" / "REDUCED SIZE" / "NO TRADE TODAY". Lihat decision rule di bawah

## Template

# Risk checklist — {{check_date}}

## Posisi yang masih open

{{open_positions_inventory}}

## Exposure

- Total exposure: {{total_exposure_pct}}
- Cap pribadi: {{exposure_cap}}

## Korelasi

{{correlation_check}}

## Kapital available

{{capital_available}}

## Event hari ini

{{macro_flags}}

## Kondisi emosional

Rating: **{{emotional_rating}} / 5**

{{emotional_note}}

## Decision

**{{go_no_go}}**

---

### Decision rule

- Rating emosional **1-2** + exposure di bawah cap + tidak ada macro flag besar → **GO** normal.
- Rating emosional **3** atau exposure mendekati cap atau macro flag besar → **REDUCED SIZE**, ukuran posisi baru dipangkas 50%.
- Rating emosional **4-5** atau habis 3 loss berturut → **NO TRADE TODAY**, observasi saja.

*Checklist ini melindungi kamu dari diri sendiri di hari yang buruk. Tidak ada bonus untuk trade saat kondisi merah — pasar buka lagi besok.*

## Tone guide

Sober, protective, tanpa moralisasi. Rating emosional dijadikan input fungsional (decision rule eksplisit), bukan untuk dihakimi. Bahasa "melindungi dari diri sendiri" — Trade Pro tahu lawan terbesar trader adalah dirinya di state buruk. Tidak ada "push through, no excuses", "harus disiplin terus" — itu hype culture, justru memicu trade reaktif. NO TRADE TODAY diframe sebagai keputusan dewasa, bukan kegagalan. Inventory + exposure + korelasi pakai angka, bukan vibes. Tidak ada "feeling pasar bagus hari ini" — itu bukan input checklist.
