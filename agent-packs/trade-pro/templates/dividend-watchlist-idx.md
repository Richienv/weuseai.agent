# Template — Dividend watchlist IDX

Watchlist dividen IDX untuk customer yang fokus ke pendapatan pasif dari saham. Sumber data: pengumuman corporate action di idx.co.id (menu "Pengumuman" → "Penggunaan Laba Bersih") dan KSEI. Pakai template ini untuk track timeline ex-date, hitung dividen net setelah pajak, dan jaga disiplin income-investor.

> **NOTE: BUKAN SARAN INVESTASI.** Template ini adalah kerangka analitis. Trade Pro tidak menempatkan trade, tidak memindahkan dana, dan tidak menjamin hasil. Keputusan dan eksekusi tetap di customer + broker masing-masing.

## Variables

- `{{watchlist_date}}` — string, tanggal review watchlist (mis. "Senin, 25 Mei 2026, 09:00 WIB")
- `{{watchlist_rows}}` — markdown table rows. Satu baris per emiten dengan kolom: kode IDX, papan, DPS (Dividend Per Share, IDR), dividend yield indikatif (%), cum-date, ex-date, recording date, payment date, lot yang kamu pegang, total dividen bruto IDR, total dividen net IDR setelah pajak 10%. Format contoh di bagian template
- `{{notes_per_row}}` — markdown bullet list, catatan per baris kalau perlu (mis. "BBCA: dividend interim, expect final di Q4", "TLKM: yield indikatif berdasarkan harga close kemarin — yield aktual tergantung harga saat kamu beli"). Isi "—" kalau tidak ada
- `{{income_summary_idr}}` — string, total dividen net bulan/quarter ini dari watchlist (mis. "Total dividen net Mei 2026 dari watchlist: Rp 4.320.000 — diharapkan masuk RDN antara 6 Juni sampai 28 Juni")
- `{{next_action}}` — string, satu next action konkret (mis. "Senin 1 Juni cek RDN BCA untuk dividen BBCA masuk", "Tidak ada aksi — tinggal tunggu payment date")

## Template

# Dividend watchlist IDX — {{watchlist_date}}

| Kode | Papan | DPS (IDR) | Yield indikatif | Cum-date | Ex-date | Recording date | Payment date | Lot dipegang | Bruto (IDR) | Net setelah pajak 10% (IDR) |
|------|-------|-----------|-----------------|----------|---------|----------------|--------------|--------------|-------------|------------------------------|
{{watchlist_rows}}

## Catatan per emiten

{{notes_per_row}}

## Income summary

{{income_summary_idr}}

## Next action

{{next_action}}

---

### Konsep timeline dividen IDX

- **Cum-date:** hari terakhir kamu bisa beli saham dan tetap berhak atas dividen. Harga biasanya naik mendekati cum-date.
- **Ex-date:** hari pertama saham diperdagangkan tanpa hak dividen. Harga teoritis turun sebesar DPS di pembukaan ex-date.
- **Recording date:** tanggal KSEI mencatat siapa pemegang saham yang berhak dividen. Biasanya 1-2 hari kerja setelah cum-date (mengikuti settlement T+2).
- **Payment date:** dividen masuk ke RDN kamu. Bisa 2-4 minggu setelah recording date, tergantung emiten.

### Pajak dividen IDX

- **Tarif:** 10% Final per Pasal 17 ayat 2c UU PPh atas dividen yang dibagikan dari laba setelah pajak.
- **Pemotongan:** dilakukan oleh emiten / broker — dividen yang masuk ke RDN sudah net.
- **Pengecualian:** dividen yang diinvestasikan kembali di Indonesia dalam jangka waktu tertentu bisa dapat tarif 0% per Pasal 4 ayat 3 UU HPP — cek syarat lengkap di peraturan DJP (Direktorat Jenderal Pajak) terkini sebelum mengajukan.

### Rumus hitung cepat

- Dividen bruto = DPS × jumlah saham. Ingat: 1 lot = 100 saham di IDX.
- Dividen net = dividen bruto × 0.90 (untuk tarif standar 10% Final).
- Dividend yield = (DPS × 4 kalau dividen kuartal, atau DPS langsung kalau annual) / harga saham × 100%.

### Sumber data

- **idx.co.id** — pengumuman corporate action resmi (menu "Pengumuman" → "Penggunaan Laba Bersih").
- **ksei.co.id** — record date + payment date di sisi kustodian.
- **Broker dashboard** — biasanya ada section "Corporate Action" yang menampilkan dividen yang berhak untuk akun kamu.
- **Aggregator gratis:** RTI Business, Stockbit (tab "Dividend"), IDXChannel.

### Catatan akhir

Watchlist ini analitis untuk track timeline dan estimasi income. Trade Pro tidak menempatkan order beli untuk dividend capture, tidak mengakses RDN kamu, tidak menjamin payment date sesuai jadwal (emiten kadang menunda). Semua keputusan akumulasi atau distribusi dilakukan oleh kamu sendiri di platform broker.

## Tone guide

Tenang, terukur, income-focused. Tidak ada "buru dividen sebelum ex-date untuk untung cepat" — itu strategi dividend capture yang sering rugi karena harga turun sebesar DPS di ex-date. Bahasa "income summary" dan "next action" dipresentasikan sebagai catatan administratif, bukan tip. Yield indikatif diberi label "indikatif" eksplisit — yield aktual tergantung harga beli kamu, dan harga bergerak.
