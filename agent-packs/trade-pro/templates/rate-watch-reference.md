# IDR / BI Rate Watch Reference

> Reference yang dipakai `idr-bi-rate-watcher`. Level psikologis, sumber data, dan framing per konteks customer.

---

## Level psikologis IDR/USD

Level bulat yang jadi acuan pasar. `idr-bi-rate-watcher` surface signal saat IDR mendekati atau menembus salah satu:

- 15.000 — level psikologis bawah, sering jadi support sentimen.
- 15.500 — level menengah.
- 16.000 — level psikologis atas, break di sini biasanya picu perhatian BI.

Bandingkan juga ke 30-day moving average untuk konteks tren, bukan cuma angka harian.

---

## Sumber data

| Data | Sumber utama | Frekuensi |
|---|---|---|
| IDR/USD spot | Bloomberg / Yahoo Finance / situs BI | Harian |
| BI rate | Pengumuman BI Board (Rapat Dewan Gubernur) | Bulanan |
| Cadangan devisa | Laporan mingguan BI | Mingguan |
| Inflasi | Rilis BPS | Bulanan |
| Fed Funds Rate | Pengumuman FOMC | ~6 minggu |
| Capital flow / SBN | Laporan kepemilikan SBN | Mingguan / bulanan |

Semua data ditandai dengan timestamp sumber. Data yang tidak real-time disebut periodenya jelas.

---

## Framing per konteks customer

`context` field menentukan cara hasil di-frame:

- `business-import` — fokus dampak ke COGS. Tiap 1% depresiasi IDR menggeser biaya impor sekian persen.
- `business-export` — fokus dampak ke daya saing harga + revenue dalam Rupiah.
- `usd-debt` — fokus beban pembayaran utang USD-denominated.
- `portfolio` — fokus dampak ke aset / liabilitas dalam mata uang asing.
- `general` — surface spot + delta tanpa framing tambahan.

---

## Aturan

- Tidak ada forecast harga. Request "kurs minggu depan berapa" dijawab dengan skenario range, bukan titik tunggal.
- Tidak menyarankan produk hedge spesifik (forward, NDF, swap). Mekanisme umum boleh dijelaskan, pilihan instrumen tetap customer + treasury bank.
- Signal dari sumber yang tidak terverifikasi (rumor media sosial soal BI Board) ditandai jelas sebagai belum terverifikasi.

---

## Catatan

`idr-bi-rate-watcher` surface data + framing, bukan financial advice. Setiap output wajib disertai disclaimer "Aku surface data + framing. Aku bukan licensed financial advisor — keputusan trade / hedge tetap kamu yang make."
